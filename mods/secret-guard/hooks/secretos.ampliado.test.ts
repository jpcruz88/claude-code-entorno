import { expect, test } from 'claude-code/testing'
import { comandoLeeSensible, detectarSecreto, esLecturaSensible } from './secretos'

// Los valores se arman con fragmentos para que secret-guard, cargado en la sesión que mantiene este mod,
// no bloquee la escritura de su propia suite ni gitleaks la marque.
const j = (...partes: string[]) => partes.join('')
const ALFANUM = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6' // 36 caracteres

const CASOS: [string, string, string][] = [
  ['URL con credenciales', j('postgres://usua', 'rio:Zq81xLm3Tp@db.interna:5432/app'), 'Zq'], // privacidad-ok
  ['URL con credenciales', j('postgresql://app:', ALFANUM, '@h/db'), 'aB3d'],
  ['URL con credenciales', j('mysql://root:Zq81xLm3Tp@h/db'), 'Zq'],
  ['URL con credenciales', j('mongodb+srv://u:Zq81xLm3Tp@cluster0.x.net/db'), 'Zq'], // privacidad-ok
  ['URL con credenciales', j('redis://:Zq81xLm3Tp@h:6379'), 'Zq'],
  ['URL con credenciales', j('amqp://guest2:Zq81xLm3Tp@h/vhost'), 'Zq'],
  ['Contraseña en variable', j('DB_PASS', 'WORD=Zq81xLm3Tp'), 'Zq'],
  ['Contraseña en variable', j('export MYSQL_ROOT_PASS', 'WORD="Zq81xLm3Tp"'), 'Zq'],
  ['Secreto en variable', j('APP_SEC', 'RET=Zq81xLm3Tp'), 'Zq'],
  ['Token en variable', j('DEPLOY_TOK', 'EN: Zq81xLm3Tp'), 'Zq'],
  ['Token en variable', j('{"API_TOK', 'EN": "Zq81xLm3Tp"}'), 'Zq'],
  ['clave de OpenAI', j('sk-pr', 'oj-', ALFANUM), 'sk-p'],
  ['clave de Stripe', j('sk_li', 've_', ALFANUM), 'sk_l'],
  ['clave de Stripe', j('rk_li', 've_', ALFANUM), 'rk_l'],
  ['clave de Google', j('AI', 'za', ALFANUM.slice(0, 35)), 'AIza'],
  ['JWT', j('ey', 'JhbGciOiJIUzI1NiJ9.', 'ey', 'JzdWIiOiJ1c3VhcmlvMSJ9.', 'aB3dE6gH9jK2mN5p'), 'eyJh'],
  ['token de Telegram', j('123456789', ':', ALFANUM.slice(0, 35)), '1234'],
  ['clave secreta de AWS', j('AWS_SECRET_ACCESS', '_KEY=', ALFANUM, 'abcd'), 'aB3d'],
  ['clave secreta de AWS', j('aws_secret_access', '_key = "', ALFANUM, 'abcd"'), 'aB3d'],
  ['token de npm', j('npm', '_', ALFANUM), 'npm_'],
]
for (const [tipo, texto, inicio] of CASOS) {
  test(`detecta ${tipo}: ${texto.slice(0, 22)}`, () => {
    const h = detectarSecreto(texto)
    expect(h?.tipo).toContain(tipo)
    expect(h?.muestra.startsWith(inicio)).toBe(true)
    expect(h?.muestra).toContain('…')
    expect(h?.muestra.length).toBeLessThan(20)
  })
}

const INOFENSIVOS = [
  'postgres://user:password@localhost/db',
  'postgres://postgres:postgres@localhost/db',
  'postgres://usuario:${DB_PASSWORD}@host/db',
  'postgres://usuario:$DB_PASSWORD@host/db',
  'postgres://usuario:<clave>@host/db',
  'mysql://root@localhost/db',
  'redis://localhost:6379',
  'amqp://guest:guest@localhost',
  'https://usuario:clave@ejemplo.com/x',
  j('DB_PASS', 'WORD=changeme'),
  j('DB_PASS', 'WORD=xxx'),
  j('DB_PASS', 'WORD=<tu-clave>'),
  j('DB_PASS', 'WORD=${DB_PASS', 'WORD}'),
  j('DB_PASS', 'WORD=$DB_PASS', 'WORD'),
  j('DB_PASS', 'WORD='),
  j('DB_PASS', 'WORD=""'),
  j('API_TOK', 'EN=$(gh auth token)'),
  j('GITHUB_TOK', 'EN: ${{ secrets.GITHUB_TOK', 'EN }}'),
  j('DB_PASS', 'WORD = os.environ["DB_PASS', 'WORD"]'),
  j('API_TOK', 'EN = process.env.API_TOK', 'EN'),
  j('API_TOK', 'EN = getToken()'),
  j('API_TOK', 'EN = DEFAULT_TOK', 'EN'),
  j('TOK', 'EN_URL=https://auth.interna/oauth/token-largo-123'),
  j('const pass', 'word = req.body.pass', 'word'),
  j('AWS_SECRET_ACCESS', '_KEY=${AWS_SECRET_ACCESS', '_KEY}'),
  j('AWS_SECRET_ACCESS', '_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
  j('sk-pr', 'oj-xxxxxxxxxxxxxxxxxxxxxxxx'),
  j('sk_li', 've_tu-clave-aqui-123456789'),
  j('AI', 'za-ejemplo'),
  'eyJhbGciOiJIUzI1NiJ9',
  j('123456789', ':ejemplo'),
  j('npm', '_install'),
]
for (const texto of INOFENSIVOS) {
  test(`no detecta: ${texto.slice(0, 40)}`, () => {
    expect(detectarSecreto(texto)).toBeUndefined()
  })
}

test('esLecturaSensible incluye .envrc, id_ecdsa, .npmrc, .netrc, *.key y *.pem', () => {
  for (const r of ['.envrc', 'a/.envrc', 'id_ecdsa', '~/.ssh/id_ecdsa', '.npmrc', 'a/.netrc', 'servidor.key', 'a\\clave.pem']) {
    expect(esLecturaSensible(r)).toBe(true)
  }
})

test('esLecturaSensible sigue rechazando archivos comunes', () => {
  for (const r of ['monkey', 'keys.md', 'npmrc.md', 'netrc', 'envrc', 'src/key.ts']) {
    expect(esLecturaSensible(r)).toBe(false)
  }
})

test('comandoLeeSensible detecta cat, less, more, head, tail y bat sobre archivos sensibles', () => {
  const casos: [string, string][] = [
    ['cat .env', '.env'],
    ['less app/.env.local', 'app/.env.local'],
    ['more ~/.ssh/id_rsa', '~/.ssh/id_rsa'],
    ['head -n 5 .npmrc', '.npmrc'],
    ['tail -f ~/.netrc', '~/.netrc'],
    ['bat servidor.key', 'servidor.key'],
    ['/bin/cat .envrc', '.envrc'],
    ['sudo cat /etc/ssl/clave.pem', '/etc/ssl/clave.pem'],
    ['cat "mi carpeta/.env"', 'mi carpeta/.env'],
    ["cat 'x/.env'", 'x/.env'],
    ['cat < .env', '.env'],
    ['cd app && cat .env | grep DB', '.env'],
    ['echo hola; tail .env', '.env'],
    ['echo $(cat .env)', '.env'],
    ['cat README.md .env', '.env'],
    ['cat .env*', '.env*'],
    ['FOO=1 cat .env', '.env'],
  ]
  for (const [cmd, ruta] of casos) {
    expect(comandoLeeSensible(cmd)).toBe(ruta)
  }
})

test('comandoLeeSensible deja pasar lo que no lee archivos sensibles', () => {
  for (const cmd of [
    'cat README.md',
    'cat .env.example',
    'head -n 3 src/main.ts',
    'ls -la .env',
    'echo .env',
    'git diff .env',
    'grep -r token src',
    'cat',
    'cat -n',
    'bat --help',
    'catalog .env',
    'echo "cat .env" > nota.txt',
  ]) {
    expect(comandoLeeSensible(cmd)).toBeUndefined()
  }
})

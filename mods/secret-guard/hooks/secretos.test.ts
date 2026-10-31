import { expect, test } from 'claude-code/testing'
import { detectarSecreto, esLecturaSensible } from './secretos'

// Valores armados en la prueba: parecen secretos pero no lo son.
const ALFANUM = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6'
const CASOS: [string, string, string][] = [
  ['AWS', 'clave AKIAIOSFODNN7EXAMPL2 en config', 'AKIA'], // privacidad-ok gitleaks:allow
  ['GitHub', `token ghp_${ALFANUM}`, 'ghp_'],
  ['GitHub', `github_pat_${'aB3dE6gH9jK2mN5pQ8sT1v'}_x`, 'gith'],
  ['Anthropic', 'sk-ant-api03-aB3dE6gH9jK2mN5pQ8sT1vW4', 'sk-a'], // privacidad-ok gitleaks:allow
  ['Slack', 'xoxb-1234567890-abcdefghij', 'xoxb'], // privacidad-ok gitleaks:allow
  ['Clave privada', '-----BEGIN RSA PRIVATE ' + 'KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn', '----'],
  ['Contraseña', 'Server=a;Pass' + 'word=Zq81xLm3;Db=b', 'Zq'],
  ['Bearer', 'curl -H "Authorization: Bearer aB3dE6gH9jK2mN5pQ8sT1vW4yZ"', 'aB3d'], // privacidad-ok gitleaks:allow
]

for (const [tipo, texto, inicio] of CASOS) {
  test(`detecta ${tipo} y enmascara la muestra`, () => {
    const h = detectarSecreto(texto)
    expect(h?.tipo).toContain(tipo)
    expect(h?.muestra.startsWith(inicio)).toBe(true)
    expect(h?.muestra).toContain('…')
    // La muestra nunca es el valor completo.
    expect(h?.muestra.length).toBeLessThan(20)
  })
}

const INOFENSIVOS = [
  'sha256 ' + 'a'.repeat(32) + 'b'.repeat(32),
  'id 123e4567-e89b-12d3-a456-426614174000',
  'password=changeme',
  'password=<token>',
  'pwd=your-password-here',
  'password=xxxxxxxx',
  'ghp_EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE', // privacidad-ok gitleaks:allow
  'const x = 1',
]
for (const texto of INOFENSIVOS) {
  test(`no detecta: ${texto.slice(0, 30)}`, () => {
    expect(detectarSecreto(texto)).toBeUndefined()
  })
}

test('esLecturaSensible acepta archivos sensibles con / y \\', () => {
  for (const r of ['C:\\a\\.env', 'a/.env.local', 'id_rsa', 'a/id_ed25519', 'credentials.json', 'a\\credentials', 'x.pem', 'x.pfx']) {
    expect(esLecturaSensible(r)).toBe(true)
  }
})

test('esLecturaSensible rechaza archivos comunes y plantillas', () => {
  for (const r of ['.env.example', 'a/.env.sample', '.env.template', 'credentials.md', 'envoy.ts', 'src/main.ts']) {
    expect(esLecturaSensible(r)).toBe(false)
  }
})

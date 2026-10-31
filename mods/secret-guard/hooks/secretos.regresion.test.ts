import { expect, test } from 'claude-code/testing'
import { detectarSecreto } from './secretos'

// Los valores se arman con fragmentos para que secret-guard, cargado en la sesión que mantiene este mod,
// no bloquee la escritura de su propia suite.
const j = (...partes: string[]) => partes.join('')

const CODIGO_NORMAL = [
  j('user.Pass', 'word = hash;'),
  j('p', 'wd = os.getcwd()'),
  j('pass', 'word = os.environ["DB_PASS', 'WORD"]'),
  j('const pass', 'word = req.body.pass', 'word'),
  j('pass', 'word=${DB_PASS', 'WORD}'),
  j('P', 'WD=/tmp/x make'),
  j('pass', 'word=$REPLY'),
  j('Server=a;Pass', 'word=${DB_PASS', 'WORD};'),
]
for (const texto of CODIGO_NORMAL) {
  test(`código normal no se toma por contraseña: ${texto.slice(0, 30)}`, () => {
    expect(detectarSecreto(texto)).toBeUndefined()
  })
}

test('una contraseña en cadena de conexión corta se detecta sin revelar el valor', () => {
  const h = detectarSecreto(j('Server=a;Pass', 'word=Zq81xLm3;Db=b'))

  expect(h?.tipo).toContain('Contraseña')
  expect(h?.muestra).not.toContain('Zq81xLm3')
  expect(h?.muestra.length).toBeLessThan('Zq81xLm3'.length + 1)
})

test('una contraseña muy corta tampoco se muestra completa', () => {
  const h = detectarSecreto(j('Server=a;Pass', 'word=abc123;'))

  expect(h).toBeDefined()
  expect(h?.muestra).not.toContain('abc123')
})

test('Pwd en cadena de conexión con Data Source se detecta', () => {
  const h = detectarSecreto(j('Data Source=x;User Id=u;P', 'wd=Zq81xLm3'))

  expect(h?.tipo).toContain('Contraseña')
})

test('un token marcado como falso o de prueba no bloquea', () => {
  expect(detectarSecreto(j('gh', 'p_fakeTokenForTestsOnly1234567890abcdefghijk'))).toBeUndefined()
  expect(detectarSecreto(j('gh', 'p_dummyTokenValue1234567890abcdefghijklmnopq'))).toBeUndefined()
})

test('la cabecera de clave privada sola (en una frase o doc) no bloquea', () => {
  expect(detectarSecreto(j('-----BEGIN RSA PRIVATE ', 'KEY-----'))).toBeUndefined()
  expect(detectarSecreto(j('la cabecera PEM es -----BEGIN PRIVATE ', 'KEY----- y termina con END'))).toBeUndefined()
})

test('una clave privada con cuerpo sí bloquea', () => {
  const h = detectarSecreto(j('-----BEGIN RSA PRIVATE ', 'KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn'))

  expect(h?.tipo).toContain('Clave privada')
})

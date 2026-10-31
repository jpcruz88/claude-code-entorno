import { expect, test } from 'claude-code/testing'
import { dentroDe, esCodigoDeProduccion } from './rutas'

const CARPETA_EJEMPLO = 'C:\\Users\\usuario\\OneDrive - Área de prueba\\Escritorio\\p' // privacidad-ok gitleaks:allow

test('esCodigoDeProduccion acepta código fuente, también en rutas de Windows con espacios y acentos', () => {
  for (const r of ['a/src/x.ts', 'C:\\p\\src\\main.py', `${CARPETA_EJEMPLO}\\hooks\\register.ts`, 'a/b.sh', 'a/q.sql']) {
    expect(esCodigoDeProduccion(r)).toBe(true)
  }
})

test('esCodigoDeProduccion rechaza pruebas, docs, config y manifiestos', () => {
  for (const r of [
    'a/x.test.ts', 'a/tests/x.ts', 'a/test/x.ts', 'a/__tests__/x.js', 'a/docs/x.ts', 'a/spec/x.ts',
    'a/x.spec.ts', 'a/test_x.py', 'a/x_test.go', 'README.md', 'plugin.json', 'a/.claude-plugin/x.ts',
    'C:\\p\\Tests\\x.ts',
  ]) {
    expect(esCodigoDeProduccion(r)).toBe(false)
  }
})

test('dentroDe ignora barras y mayúsculas', () => {
  expect(dentroDe(`${CARPETA_EJEMPLO}\\src\\x.ts`, CARPETA_EJEMPLO)).toBe(true)
  expect(dentroDe('c:/p/src/x.ts', 'C:\\P')).toBe(true)
  expect(dentroDe('C:\\p\\x.ts', 'C:\\p\\')).toBe(true)
})

test('dentroDe rechaza carpetas hermanas con prefijo parecido y rutas fuera', () => {
  expect(dentroDe('C:\\p2\\x.ts', 'C:\\p')).toBe(false)
  expect(dentroDe('D:\\otro\\x.ts', 'C:\\p')).toBe(false)
})

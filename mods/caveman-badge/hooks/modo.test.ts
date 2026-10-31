import { expect, test } from 'claude-code/testing'
import { etiqueta, siguienteModo } from './modo'

test('/caveman lite pasa a lite', () => {
  expect(siguienteModo('full', '/caveman lite')).toBe('lite')
})

test('/caveman con espacios y mayúsculas pasa a ultra', () => {
  expect(siguienteModo('full', '/caveman  ULTRA')).toBe('ultra')
})

test('/caveman full pasa a full', () => {
  expect(siguienteModo('lite', '/caveman full')).toBe('full')
})

test('stop caveman y Modo Normal pasan a normal', () => {
  expect(siguienteModo('full', 'stop caveman')).toBe('normal')
  expect(siguienteModo('ultra', 'Modo Normal')).toBe('normal')
  expect(siguienteModo('full', 'Stop  Caveman')).toBe('normal')
})

test('/caveman sin nivel no cambia el modo', () => {
  expect(siguienteModo('lite', '/caveman')).toBe('lite')
})

test('un texto cualquiera no cambia el modo', () => {
  expect(siguienteModo('ultra', 'arregla el bug de login')).toBe('ultra')
})

test('«modo normal» dentro de una frase más larga no apaga el badge', () => {
  expect(siguienteModo('full', 'revisa por qué la app no sale en modo normal')).toBe('full')
  expect(siguienteModo('full', 'el stop caveman del README es un ejemplo')).toBe('full')
})

test('la etiqueta lleva el modo', () => {
  expect(etiqueta('full')).toBe('caveman: full')
})

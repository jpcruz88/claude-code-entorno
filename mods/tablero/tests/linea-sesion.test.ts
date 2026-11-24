import { expect, test } from 'claude-code/testing'
import { leerLinea } from '../hooks/linea-sesion'

const AHORA = 1_900_000_000

const texto = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    actualizado: AHORA - 5,
    session_id: 'abc',
    session_name: 'Nuevo mod de prueba',
    thinking: true,
    prompt_cache: { warm: true, ttl: '5m', expires_at: AHORA + 192, hit_ratio: 0.91 },
    pr: { number: 41, url: 'https://x/pull/41', review_state: 'pending' },
    ...extra,
  })

test('lee lo que escribe la statusline', () => {
  const l = leerLinea(texto(), AHORA)
  expect(l?.session_name).toBe('Nuevo mod de prueba')
  expect(l?.thinking).toBe(true)
  expect(l?.prompt_cache?.expires_at).toBe(AHORA + 192)
  expect(l?.pr?.number).toBe(41)
})

test('un archivo de hace más de 24 h no vale', () => {
  expect(leerLinea('{"session_id":"a","actualizado":1}', 1 + 86_401)).toBeNull()
})

test('JSON roto, sin session_id o sin actualizado no vale', () => {
  expect(leerLinea('{"session_id":', AHORA)).toBeNull()
  expect(leerLinea(JSON.stringify({ actualizado: AHORA }), AHORA)).toBeNull()
  expect(leerLinea(JSON.stringify({ session_id: 'a' }), AHORA)).toBeNull()
})

test('campos con otro tipo quedan en null en vez de romper', () => {
  const l = leerLinea(texto({ session_name: 7, thinking: 'sí', prompt_cache: 'x', pr: { number: 'cuarenta' } }), AHORA)
  expect(l?.session_name).toBeNull()
  expect(l?.thinking).toBeNull()
  expect(l?.prompt_cache).toBeNull()
  expect(l?.pr).toBeNull()
})

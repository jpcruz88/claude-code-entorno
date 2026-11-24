import { expect, test } from 'claude-code/testing'
import { textoCache } from '../hooks/cache'

test('caliente: cuenta atrás m:ss y aciertos en %', () => {
  expect(textoCache({ warm: true, ttl: '5m', expires_at: 1000 + 192, hit_ratio: 0.91 }, 1000)).toEqual({
    caliente: true,
    queda: '3:12',
    aviso: false,
    aciertos: 91,
  })
})

test('menos de 60 s: aviso', () => {
  expect(textoCache({ warm: true, ttl: '5m', expires_at: 1000 + 45, hit_ratio: 0.9 }, 1000).aviso).toBe(true)
})

test('fría: sin cuenta atrás', () => {
  const c = textoCache({ warm: false, ttl: '5m', expires_at: null, hit_ratio: 0.5 }, 1000)
  expect(c.caliente).toBe(false)
  expect(c.queda).toBeNull()
  expect(c.aciertos).toBe(50)
})

test('caliente pero ya pasó su hora de caducar: fría', () => {
  const c = textoCache({ warm: true, ttl: '1h', expires_at: 999, hit_ratio: 0.9 }, 1000)
  expect(c.caliente).toBe(false)
  expect(c.queda).toBeNull()
})

test('una hora de TTL se cuenta con horas', () => {
  expect(textoCache({ warm: true, ttl: '1h', expires_at: 1000 + 3599, hit_ratio: 1 }, 1000).queda).toBe('59:59')
})

test('sin datos de cache: nada', () => {
  expect(textoCache(null, 1000)).toEqual({ caliente: false, queda: null, aviso: false, aciertos: null })
})

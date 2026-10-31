import { expect, test } from 'claude-code/testing'

import { avanzar, necesitaRedibujo, pulso } from '../hooks/animacion'

test('avanzar acerca el valor mostrado al objetivo en pasos', () => {
  expect(avanzar(0, 100)).toBe(25)
  const medio = avanzar(25, 100)
  expect(medio).toBeGreaterThan(25)
  expect(medio).toBeLessThan(100)
  expect(avanzar(99.8, 100)).toBe(100)
  expect(avanzar(50, 50)).toBe(50)
})

test('avanzar también baja y no se rompe con un objetivo inválido', () => {
  expect(avanzar(80, 20)).toBeLessThan(80)
  expect(avanzar(0, NaN)).toBe(0)
})

test('pulso alterna cada 5 fases', () => {
  expect(pulso(0)).toBe('encendido')
  expect(pulso(4)).toBe('encendido')
  expect(pulso(5)).toBe('apagado')
  expect(pulso(10)).toBe('encendido')
})

test('necesitaRedibujo solo cuando el texto cambió', () => {
  expect(necesitaRedibujo('a', 'a')).toBe(false)
  expect(necesitaRedibujo('a', 'b')).toBe(true)
})

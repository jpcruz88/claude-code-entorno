import { expect, test } from 'claude-code/testing'

import { PASO_AGENTE_MS, fotogramaDeMarcha, glifoAgente } from '../hooks/agentes-anim'

test('con la animación apagada, un agente en marcha muestra siempre el mismo cuadro', () => {
  expect(glifoAgente(0, 'running', false)).toBe('◐')
  expect(glifoAgente(3 * PASO_AGENTE_MS, 'running', false)).toBe('◐')
})

test('el fotograma de marcha cambia cada paso solo si hay agentes caminando', () => {
  expect(fotogramaDeMarcha(0, 1)).not.toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 1))
  expect(fotogramaDeMarcha(0, 0)).toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 0))
})

test('un agente en marcha cambia de cuadro cada PASO_AGENTE_MS', () => {
  expect(PASO_AGENTE_MS).toBe(250)
  expect(glifoAgente(0, 'running')).not.toBe(glifoAgente(PASO_AGENTE_MS, 'running'))
})

test('el ciclo de marcha son cuatro cuadros distintos y se repite', () => {
  const cuadros = [0, 1, 2, 3].map(i => glifoAgente(i * PASO_AGENTE_MS, 'running'))
  expect(new Set(cuadros).size).toBe(4)
  expect(glifoAgente(4 * PASO_AGENTE_MS, 'running')).toBe(cuadros[0])
})

test('los agentes terminados quedan fijos, sin importar el momento', () => {
  expect(glifoAgente(0, 'done')).toBe('✓')
  expect(glifoAgente(999_999, 'done')).toBe('✓')
  expect(glifoAgente(0, 'failed')).toBe('✗')
  expect(glifoAgente(777, 'failed')).toBe('✗')
  expect(glifoAgente(0, 'other')).toBe('■')
})

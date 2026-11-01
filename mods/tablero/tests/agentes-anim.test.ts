import { expect, test } from 'claude-code/testing'

import { PASO_AGENTE_MS, glifoAgente } from '../hooks/agentes-anim'

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

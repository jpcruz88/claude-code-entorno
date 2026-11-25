import { expect, test } from 'claude-code/testing'

import { cuadroConectorH } from '../hooks/conector-h'

test('en reposo el conector horizontal es una línea de ─ que acaba en ▶', () => {
  expect(cuadroConectorH(5, 0, false)).toBe('────▶')
})

test('siempre ocupa el ancho pedido y termina en la flecha', () => {
  for (let fase = 0; fase < 30; fase++) {
    const cuadro = cuadroConectorH(6, fase, true)
    expect([...cuadro]).toHaveLength(6)
    expect(cuadro.endsWith('▶')).toBe(true)
  }
})

test('con trabajo en curso hay un paquete ● con su cola que avanza por la línea', () => {
  // Fase 1: el paquete acaba de entrar por la izquierda, con cola a su izquierda.
  expect(cuadroConectorH(5, 1, true)).toBe('●───▶')
  expect(cuadroConectorH(5, 2, true)).toBe('•●──▶')
  expect(cuadroConectorH(5, 3, true)).toBe('·•●─▶')
})

test('ningún cuadro tiene más de un paquete ●', () => {
  for (let fase = 0; fase < 40; fase++) {
    expect(cuadroConectorH(4, fase, true).split('●').length - 1).toBeLessThanOrEqual(1)
  }
})

test('el paquete avanza de un cuadro al siguiente y el ciclo se repite', () => {
  expect(cuadroConectorH(8, 1, true)).not.toBe(cuadroConectorH(8, 2, true))
  const ciclo = 8 - 1 + 4
  expect(cuadroConectorH(8, 2, true)).toBe(cuadroConectorH(8, 2 + ciclo, true))
})

test('un ancho de 1 o menos no dibuja nada raro', () => {
  expect(cuadroConectorH(1, 0, true)).toBe('▶')
  expect(cuadroConectorH(0, 0, false)).toBe('')
})

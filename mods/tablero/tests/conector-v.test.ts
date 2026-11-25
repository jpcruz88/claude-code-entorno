import { expect, test } from 'claude-code/testing'

import { cuadroConectorV } from '../hooks/conector-v'

test('en reposo el conector vertical es una línea de │ de su alto', () => {
  expect(cuadroConectorV(4, 0, false)).toEqual(['│', '│', '│', '│'])
})

test('con trabajo en curso hay un paquete ● con su cola • que baja por el conector', () => {
  // A la fase 0 el paquete todavía no ha entrado por arriba: por eso se mira una fase ya dentro.
  const cuadro = cuadroConectorV(6, 2, true)
  expect(cuadro).toHaveLength(6)
  expect(cuadro).toContain('●')
  expect(cuadro).toContain('•')
})

test('el paquete avanza de un cuadro al siguiente', () => {
  const a = cuadroConectorV(8, 0, true)
  const b = cuadroConectorV(8, 1, true)
  expect(a.join('')).not.toBe(b.join(''))
})

test('el paquete vuelve al inicio y el ciclo se repite', () => {
  const alto = 5
  const ciclo = alto + 2
  expect(cuadroConectorV(alto, 0, true)).toEqual(cuadroConectorV(alto, ciclo, true))
})

test('ningún cuadro tiene más de un paquete ●, aunque el alto sea pequeño', () => {
  for (let fase = 0; fase < 40; fase++) {
    const cuadro = cuadroConectorV(3, fase, true)
    expect(cuadro.filter(c => c === '●').length).toBeLessThanOrEqual(1)
    expect(cuadro).toHaveLength(3)
  }
})

test('alto 0 o negativo no dibuja filas', () => {
  expect(cuadroConectorV(0, 0, true)).toEqual([])
  expect(cuadroConectorV(-2, 3, false)).toEqual([])
})

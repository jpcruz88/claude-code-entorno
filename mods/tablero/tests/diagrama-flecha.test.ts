import { expect, test } from 'claude-code/testing'

import { ANCHO_FLECHA, anchosDiagrama } from '../hooks/diagrama'

test('la flecha entre el asesor y el lead ocupa su ancho: asesor + flecha + lead suman el panel', () => {
  for (const ancho of [66, 80, 100, 120]) {
    const { aw, rw } = anchosDiagrama(ancho, true)
    expect(aw + ANCHO_FLECHA + rw).toBe(ancho)
  }
})

test('la flecha tiene celdas suficientes para que el paquete cruce (más de dos)', () => {
  expect(ANCHO_FLECHA).toBeGreaterThanOrEqual(5)
})

test('sin asesor no hay flecha y el lead ocupa todo el panel', () => {
  expect(anchosDiagrama(66, false)).toEqual({ aw: 0, rw: 66 })
})

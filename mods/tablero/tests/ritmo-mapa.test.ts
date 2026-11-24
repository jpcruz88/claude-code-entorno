import { expect, test } from 'claude-code/testing'

import { textoRitmoMapa } from '../hooks/jev-modelo'

// 1.1.0: la línea de ritmo de ESTADO en el mapa usa ⇡/⇣, como el cupo del panel, no «+61 pts».
test('el ritmo del mapa va con ⇡ cuando se gasta más rápido', () => {
  expect(textoRitmoMapa(61, 'rojo')).toBe('rojo ⇡61%')
  expect(textoRitmoMapa(3, 'ambar')).toBe('ámbar ⇡3%')
})

test('el ritmo del mapa va con ⇣ cuando hay margen, y nombra el nivel en español', () => {
  expect(textoRitmoMapa(-12, 'verde')).toBe('verde ⇣12%')
  expect(textoRitmoMapa(-0.4, 'verde')).toBe('verde ⇣0%')
})

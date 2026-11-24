import { expect, test } from 'claude-code/testing'

import { celdasUso, ritmoCupo, tonoUso } from '../hooks/uso'

// Umbrales de uso frente a un límite: aviso desde 65 %, alerta desde 85 %.
test('el tono del uso: normal por debajo de 65, aviso desde 65 y alerta desde 85', () => {
  expect(tonoUso(64.9)).toBe('normal')
  expect(tonoUso(65)).toBe('aviso')
  expect(tonoUso(84.9)).toBe('aviso')
  expect(tonoUso(85)).toBe('alerta')
  expect(tonoUso(100)).toBe('alerta')
})

// El ritmo compara el uso con el tiempo transcurrido de la ventana: ⇡ si se gasta más rápido, ⇣ si hay margen.
test('el ritmo del cupo: ⇡ cuando va por delante del tiempo, ⇣ cuando va por detrás', () => {
  expect(ritmoCupo(58, 0.5)).toBe('⇡8%')
  expect(ritmoCupo(40, 0.5)).toBe('⇣10%')
})

test('el ritmo en el mismo punto es = 0%, y sin tiempo transcurrido no hay ritmo', () => {
  expect(ritmoCupo(50, 0.5)).toBe('=0%')
  expect(ritmoCupo(50, null)).toBe('')
})

// La barra de celdas: las llenas son el uso redondeado sobre el ancho, acotado a 0..ancho.
test('la barra llena tantas celdas como indica el uso y se acota a su ancho', () => {
  expect(celdasUso(41, 20)).toBe(8)
  expect(celdasUso(-5, 20)).toBe(0)
  expect(celdasUso(150, 20)).toBe(20)
  expect(celdasUso(NaN, 20)).toBe(0)
})

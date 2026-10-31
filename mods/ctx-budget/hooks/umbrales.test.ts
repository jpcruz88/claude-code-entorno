import { expect, test } from 'claude-code/testing'
import { evaluar } from './umbrales'

test('cruzar 70 avisa una sola vez', () => {
  const primera = evaluar(72, {})
  expect(primera.avisar).toEqual([70])
  const segunda = evaluar(73, primera.armado)
  expect(segunda.avisar).toEqual([])
})

test('cruzar 85 de golpe avisa 70 y 85 en orden', () => {
  expect(evaluar(86, {}).avisar).toEqual([70, 85])
})

test('bajar de 70 rearma el umbral', () => {
  const abajo = evaluar(60, { 70: true })
  expect(abajo.armado[70]).toBe(false)
  expect(evaluar(75, abajo.armado).avisar).toEqual([70])
})

test('percent ausente no avisa ni cambia el armado', () => {
  const armado = { 70: true, 85: false }
  const r = evaluar(undefined, armado)
  expect(r.avisar).toEqual([])
  expect(r.armado).toEqual(armado)
})

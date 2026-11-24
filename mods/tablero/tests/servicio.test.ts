import { expect, test } from 'claude-code/testing'
import { leerServicio } from '../hooks/servicio'

test('sin incidencias', () => {
  expect(leerServicio(200, '{"status":{"indicator":"none","description":"All Systems Operational"}}')).toEqual({ ok: true, texto: 'Claude sin incidencias' })
})

test('cada indicador con su texto en español', () => {
  expect(leerServicio(200, '{"status":{"indicator":"minor"}}')).toEqual({ ok: false, texto: 'Claude con fallos menores' })
  expect(leerServicio(200, '{"status":{"indicator":"major"}}')).toEqual({ ok: false, texto: 'Claude con fallos graves' })
  expect(leerServicio(200, '{"status":{"indicator":"critical"}}')).toEqual({ ok: false, texto: 'Claude caído' })
  expect(leerServicio(200, '{"status":{"indicator":"maintenance"}}')).toEqual({ ok: false, texto: 'Claude en mantenimiento' })
})

test('un error del servidor, HTML o un indicador desconocido no dicen nada', () => {
  expect(leerServicio(502, '<html>')).toBeNull()
  expect(leerServicio(200, '<html>')).toBeNull()
  expect(leerServicio(200, '{"status":{"indicator":"raro"}}')).toBeNull()
  expect(leerServicio(200, '{}')).toBeNull()
})

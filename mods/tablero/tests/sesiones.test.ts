import { expect, test } from 'claude-code/testing'
import { abiertas, estadoSesion, leerSesiones } from '../hooks/sesiones'

const AHORA = Date.parse('2026-11-24T12:00:00Z')
const reg = (id: string, estado: string, actualizado = AHORA - 1000) =>
  JSON.stringify({ id, nombre: id, carpeta: '/x', estado, desde: AHORA - 60_000, costo: 1, base: 0, dia: '2026-11-24', actualizado })

test('esperar a la persona gana a estar trabajando', () => {
  expect(estadoSesion({ trabajando: true, permisosPendientes: 1, planEspera: false })).toBe('espera')
  expect(estadoSesion({ trabajando: false, permisosPendientes: 0, planEspera: true })).toBe('espera')
  expect(estadoSesion({ trabajando: true, permisosPendientes: 0, planEspera: false })).toBe('trabajando')
  expect(estadoSesion({ trabajando: false, permisosPendientes: 0, planEspera: false })).toBe('inactiva')
})

test('un archivo cortado o de hace más de 24 h no aparece', () => {
  expect(leerSesiones([{ nombre: 'a.json', texto: '{"id":' }, { nombre: 'b.json', texto: reg('b', 'inactiva', AHORA - 25 * 3_600_000) }], 'yo', AHORA)).toEqual([])
})

test('la propia no sale y el orden es te espera, trabajando, inactiva', () => {
  const r = leerSesiones(
    [
      { nombre: 'c.json', texto: reg('c', 'inactiva') },
      { nombre: 'yo.json', texto: reg('yo', 'espera') },
      { nombre: 'a.json', texto: reg('a', 'trabajando') },
      { nombre: 'b.json', texto: reg('b', 'espera') },
    ],
    'yo',
    AHORA,
  )
  expect(r.map(s => s.id)).toEqual(['b', 'a', 'c'])
})

test('un estado desconocido o campos con otro tipo invalidan el registro', () => {
  expect(leerSesiones([{ nombre: 'a.json', texto: reg('a', 'bailando') }], 'yo', AHORA)).toEqual([])
  expect(leerSesiones([{ nombre: 'a.json', texto: JSON.stringify({ id: 'a', estado: 'espera', costo: 'mucho', actualizado: AHORA }) }], 'yo', AHORA)).toEqual([])
})

test('una sesión que dejó de escribir hace más de 30 s cuenta como inactiva, aunque dijera que esperaba', () => {
  const r = leerSesiones([{ nombre: 'a.json', texto: reg('a', 'espera', AHORA - 31_000) }, { nombre: 'b.json', texto: reg('b', 'trabajando', AHORA - 10_000) }], 'yo', AHORA)
  expect(r.map(s => [s.id, s.estado])).toEqual([
    ['b', 'trabajando'],
    ['a', 'inactiva'],
  ])
})

test('abiertas son solo las que escribieron en los últimos 30 s: una cerrada no cuenta, aunque siga en el registro', () => {
  const r = leerSesiones(
    [
      { nombre: 'viva.json', texto: reg('viva', 'inactiva', AHORA - 5_000) },
      { nombre: 'cerrada.json', texto: reg('cerrada', 'trabajando', AHORA - 24 * 60_000) },
    ],
    'yo',
    AHORA,
  )
  expect(r).toHaveLength(2)
  expect(abiertas(r, AHORA).map(s => s.id)).toEqual(['viva'])
})

test('turnoFin es opcional: con número se conserva, sin él vale, con otro tipo invalida', () => {
  const con = JSON.stringify({ ...JSON.parse(reg('a', 'inactiva')), turnoFin: AHORA - 1000 })
  const malo = JSON.stringify({ ...JSON.parse(reg('b', 'inactiva')), turnoFin: 'x' })
  const r = leerSesiones([{ nombre: 'a.json', texto: con }, { nombre: 'b.json', texto: malo }, { nombre: 'c.json', texto: reg('c', 'inactiva') }], 'yo', AHORA)
  expect(r.map(s => [s.id, s.turnoFin])).toEqual([
    ['a', AHORA - 1000],
    ['c', undefined],
  ])
})

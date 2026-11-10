import { expect, test } from 'claude-code/testing'

import { leerAlDia } from '../hooks/al-dia-modelo'

// El resultado de la revisión «Al día» como filas para la caja: orden, textos y caducidad.

const AHORA = new Date(2026, 10, 9, 9, 0).getTime()
const seg = (d: Date) => Math.floor(d.getTime() / 1000)
const json = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    ts: seg(new Date(2026, 10, 9, 8, 5)),
    cambios: [],
    fallos: [],
    pendientes: [],
    al_dia: 0,
    ...extra,
  })

test('ordena fallos, cambios con aviso, otros cambios y pendientes', () => {
  const r = leerAlDia(
    json({
      cambios: [
        { nombre: 'a', tipo: 'skill', antes: '1.0', despues: '1.1', cambio_texto: false, diff: null },
        { nombre: 'b', tipo: 'plugin', antes: '2.0', despues: '3.0', cambio_texto: true, diff: 'x' },
      ],
      fallos: [{ nombre: 'f', tipo: 'skill', error: 'red' }],
      pendientes: [{ nombre: 'p', tipo: 'herramienta', motivo: 'x' }],
      al_dia: 5,
    }),
    AHORA,
  )
  expect(r).not.toBe(null)
  expect(r!.filas.map(f => f.nombre)).toEqual(['f', 'b', 'a', 'p'])
  expect(r!.filas.map(f => f.marca)).toEqual(['✗', '↑', '↑', '…'])
  expect(r!.filas[0]!.detalle).toBe('no se pudo bajar · sigue la anterior')
  expect(r!.filas[1]!.detalle).toBe('2.0 → 3.0')
  expect(r!.filas[1]!.aviso).toBe(true)
  expect(r!.filas[2]!.aviso).toBe(false)
  expect(r!.filas[3]!.detalle).toBe('pendiente · se reintenta en la próxima sesión')
  expect(r!.alDia).toBe(5)
  expect(r!.cuando).toBe('hoy 08:05')
})

test('ts de hace 25 h da null', () => {
  const ts = seg(new Date(AHORA - 25 * 3600 * 1000))
  expect(leerAlDia(json({ ts, fallos: [{ nombre: 'f', tipo: 'skill', error: 'e' }] }), AHORA)).toBe(null)
})

test('JSON roto o null da null', () => {
  expect(leerAlDia('{"ts":', AHORA)).toBe(null)
  expect(leerAlDia(null, AHORA)).toBe(null)
})

test('sin nada que contar da null', () => {
  expect(leerAlDia(json({ al_dia: 3 }), AHORA)).toBe(null)
})

test('ts de ayer 21:40 dice ayer 21:40', () => {
  const ts = seg(new Date(2026, 10, 8, 21, 40))
  const r = leerAlDia(json({ ts, fallos: [{ nombre: 'f', tipo: 'skill', error: 'e' }] }), AHORA)
  expect(r!.cuando).toBe('ayer 21:40')
})

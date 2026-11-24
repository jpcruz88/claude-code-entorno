import { expect, test } from 'claude-code/testing'

import { componerMapa, type Celda, type DatosMapa } from '../hooks/mapa'
import { datos } from './datos-mapa'

// `panels` decide qué cajas dibuja el mapa: jev (la caja JEV y su REGISTRO), agents (las tarjetas, el bus y la
// variante compacta) y gate (los datos de permisos de ESTADO). `main` (cabecera, franja, ESTADO y LEAD) siempre se dibuja,
// y ningún conector queda colgando hacia una caja oculta.

const texto = (g: Celda[][]) => g.map(r => r.map(c => c.c).join('')).join('\n')
const con = (d: DatosMapa, ocultas: NonNullable<DatosMapa['ocultas']>): DatosMapa => ({ ...d, ocultas })

test('sin cajas ocultas, el mapa es el de siempre', () => {
  for (const w of [60, 100]) expect(texto(componerMapa(con(datos(3), []), 0.4, w))).toBe(texto(componerMapa(datos(3), 0.4, w)))
})

test('jev oculta: no se dibujan la caja JEV ni el REGISTRO, y el LEAD queda', () => {
  for (const w of [60, 100]) {
    for (const n of [0, 3]) {
      const s = texto(componerMapa(con(datos(n), ['jev']), 0.4, w))
      expect(s).not.toContain('JEV · decisiones')
      expect(s).not.toContain('REGISTRO')
      expect(s).not.toContain('umbral')
      expect(s).toContain('LEAD')
    }
  }
})

test('jev oculta a 100 columnas: sin conector lead → JEV; con tareas, el bus baja desde el lead', () => {
  const sin = componerMapa(con(datos(0), ['jev']), 0.4, 100)
  for (const y of [19, 20, 21]) expect(sin[y][75].c).toBe(' ')
  const con3 = componerMapa(con(datos(3), ['jev']), 0.4, 100)
  for (const y of [19, 20, 25, 29]) expect(con3[y][75].c).toMatch(/[│·•●]/)
})

test('agents oculta: sin tarjetas, sin bus y con la variante compacta de 32 filas', () => {
  const g = componerMapa(con(datos(3), ['agents']), 0.4, 100)
  expect(g.length).toBe(32)
  const s = texto(g)
  for (const parte of ['tarea 1', 'AGENTES', 'de vuelta al lead', 'SIN TAREAS', 'tareas', 'subagentes']) expect(s).not.toContain(parte)
  expect(s).toContain('LEAD')
  const angosto = texto(componerMapa(con(datos(3), ['agents']), 0.4, 60))
  for (const parte of ['tarea 1', 'AGENTES', 'subagentes']) expect(angosto).not.toContain(parte)
})

test('gate oculta: no se dibujan los datos de permisos de ESTADO', () => {
  for (const w of [60, 100]) {
    const s = texto(componerMapa(con(datos(3), ['gate']), 0.4, w))
    for (const parte of ['permisos', 'pend.', 'den.', 'acceptEdits']) expect(s).not.toContain(parte)
    expect(s).toContain('ESTADO')
  }
})

test('main siempre: con las tres ocultas siguen la cabecera, la franja, ESTADO y LEAD', () => {
  for (const w of [60, 100]) {
    const g = componerMapa(con(datos(3), ['jev', 'agents', 'gate']), 0.4, w)
    for (const r of g) expect(r.length).toBe(w)
    const s = texto(g)
    for (const parte of ['TABLERO', 'ESTADO', 'LEAD', 'costo', 'contexto']) expect(s).toContain(parte)
  }
})

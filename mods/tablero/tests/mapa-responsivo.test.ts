import { expect, test } from 'claude-code/testing'

import { MAPA_ANCHO, MAPA_MIN, componerMapa, type Celda } from '../hooks/mapa'
import { datos } from './datos-mapa'

// El mapa se adapta al ancho del panel: desde 100 columnas, el diseño de dos columnas; entre MAPA_MIN y 99,
// todo apilado a ancho completo, sin cortar texto contra los bordes de las cajas.

const texto = (g: Celda[][]) => g.map(r => r.map(c => c.c).join('')).join('\n')
const ANCHOS = [40, 52, 66, 80, 99]

test('el mapa se dibuja desde 40 columnas', () => {
  expect(MAPA_MIN).toBe(40)
})

test('entre 40 y 99 columnas cada fila mide el ancho pedido', () => {
  for (const w of ANCHOS) for (const n of [0, 1, 3, 9]) for (const r of componerMapa(datos(n), 0.4, w)) expect(r.length).toBe(w)
})

test('desde 100 columnas se mantiene el diseño de dos columnas de 100', () => {
  const g = componerMapa(datos(3), 0.4, 140)
  for (const r of g) expect(r.length).toBe(MAPA_ANCHO)
  expect(texto(g)).toBe(texto(componerMapa(datos(3), 0.4)))
})

test('angosto: trae cabecera, franja, ESTADO, LEAD, JEV, ASESOR, REGISTRO y el pie con la versión', () => {
  for (const w of ANCHOS) {
    const s = texto(componerMapa(datos(0), 0, w))
    for (const parte of ['TABLERO', 'ESTADO', 'LEAD', 'JEV', 'ASESOR', 'REGISTRO', 'v0.4.0', 'costo', 'contexto']) expect(s).toContain(parte)
  }
})

test('angosto: la franja ocupa 3 filas de ancho completo con fondo', () => {
  const g = componerMapa(datos(0), 0, 60)
  for (const y of [1, 2, 3]) for (const c of g[y]) expect(c.bg).toBe('lead')
})

test('angosto: con tareas aparece la lista AGENTES con cada nombre', () => {
  for (const w of ANCHOS) {
    const s = texto(componerMapa(datos(3), 0, w))
    expect(s).toContain('AGENTES 3')
    for (const n of ['tarea 1', 'tarea 2', 'tarea 3']) expect(s).toContain(n)
  }
})

test('angosto: con más de 8 tareas muestra 7 y «+N más»', () => {
  const s = texto(componerMapa(datos(9), 0, 60))
  expect(s).toContain('tarea 7')
  expect(s).not.toContain('tarea 8')
  expect(s).toContain('+2 más')
})

test('angosto: ninguna fila de caja pisa su borde derecho', () => {
  for (const w of ANCHOS)
    for (const n of [0, 1, 3, 9]) {
      const g = componerMapa(datos(n), 0.4, w)
      for (const r of g) {
        const fila = r.map(c => c.c).join('')
        if (fila.startsWith('│')) expect(r[w - 1].c).toBe('│')
        if (fila.startsWith('┌')) expect(r[w - 1].c).toBe('┐')
        if (fila.startsWith('└')) expect(r[w - 1].c).toBe('┘')
      }
    }
})

test('angosto: no deja filas vacías al final', () => {
  const g = componerMapa(datos(0), 0, 60)
  expect(g.at(-1)!.some(c => c.c.trim() !== '')).toBe(true)
})

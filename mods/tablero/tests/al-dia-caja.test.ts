import { expect, test } from 'claude-code/testing'

import { componerMapa, MAPA_ALTO_COMPACTO, type Celda, type DatosMapa } from '../hooks/mapa'
import type { AlDia, FilaAlDia } from '../hooks/al-dia-modelo'
import { PANELS_DEFECTO } from '../hooks/core'
import { datos } from './datos-mapa'

// La caja AL DÍA: lo que se actualizó, justo bajo la franja de situación (filas 1 a 3), con todo lo demás más abajo.

const texto = (g: Celda[][]) => g.map(r => r.map(c => c.c).join('')).join('\n')
const fila = (g: Celda[][], y: number) => g[y].map(c => c.c).join('')
const color = (g: Celda[][], y: number, sub: string) => {
  const i = fila(g, y).indexOf(sub)
  return i < 0 ? undefined : g[y][i].k
}

const cambio = (nombre: string, aviso = false): FilaAlDia => ({ marca: '↑', nombre, detalle: '1.0.0 → 1.1.0', tipo: 'plugin', aviso })
const alDia = (filas: FilaAlDia[], n = 61): AlDia => ({ cuando: 'hoy 09:12', filas, alDia: n })
const conAlDia = (a: AlDia | null, cards = 0): DatosMapa => ({ ...datos(cards), alDia: a })
const MUESTRA = alDia([
  { marca: '✗', nombre: 'skill-que-falla', detalle: 'no se pudo bajar · sigue la anterior', tipo: 'skill', aviso: false },
  cambio('superpowers', true),
  cambio('caveman'),
  { marca: '…', nombre: 'pendiente-uno', detalle: 'pendiente · se reintenta en la próxima sesión', tipo: 'MCP', aviso: false },
])

test('a 100 columnas la caja empieza en la fila 5 y ESTADO baja', () => {
  const g = componerMapa(conAlDia(MUESTRA), 0)
  expect(fila(g, 5).startsWith('┌─ AL DÍA · hoy 09:12 ')).toBe(true)
  expect(fila(g, 4).trim()).toBe('')
  // Las 4 filas + resumen + 2 bordes = 7 filas de caja y 1 en blanco.
  expect(fila(g, 5 + 7 - 1).startsWith('└')).toBe(true)
  expect(fila(g, 5 + 7).trim()).toBe('')
  const yEstado = g.findIndex(r => r.map(c => c.c).join('').includes('ESTADO'))
  expect(yEstado).toBeGreaterThan(5 + 7)
  expect(g.length).toBe(MAPA_ALTO_COMPACTO + 8)
})

test('sin alDia el mapa sale idéntico al de siempre', () => {
  const { alDia: _omitido, ...sinCampo } = conAlDia(null)
  for (const w of [40, 66, 99, 100]) {
    expect(texto(componerMapa(conAlDia(null), 0, w))).toBe(texto(componerMapa(sinCampo as DatosMapa, 0, w)))
    expect(texto(componerMapa(conAlDia(null), 0, w))).not.toContain('AL DÍA')
  }
})

test('los colores: borde y título magenta, marcas, nombre, antes, flecha, después, tipo, aviso y resumen', () => {
  const g = componerMapa(conAlDia(MUESTRA), 0)
  expect(g[5][0].k).toBe('enj')
  expect(color(g, 5, 'AL DÍA')).toBe('enj')
  // Filas: 6 ✗, 7 ↑ con aviso, 8 ↑, 9 …, 10 resumen.
  expect(color(g, 6, '✗')).toBe('warn')
  expect(color(g, 7, '↑')).toBe('jev')
  expect(color(g, 9, '…')).toBe('amb')
  expect(color(g, 7, 'superpowers')).toBe('fg')
  expect(color(g, 7, '1.0.0')).toBe('box')
  expect(color(g, 7, '→')).toBe('fg')
  expect(color(g, 7, '1.1.0')).toBe('fg')
  expect(color(g, 7, 'plugin')).toBe('box')
  expect(color(g, 7, '⚠ cambió texto')).toBe('amb')
  expect(color(g, 8, '⚠')).toBeUndefined()
  expect(fila(g, 10)).toContain('61 al día · reinicia Claude para usar lo nuevo')
  expect(color(g, 10, '61 al día')).toBe('box')
})

test('el nombre se recorta a 18 columnas', () => {
  const g = componerMapa(conAlDia(alDia([cambio('un-nombre-larguisimo-de-plugin')])), 0)
  expect(fila(g, 6)).toContain('un-nombre-larguisi ')
  expect(fila(g, 6)).not.toContain('un-nombre-larguisim')
})

test('con 9 cambios salen 5 filas y «+4 más»', () => {
  const nueve = alDia(Array.from({ length: 9 }, (_, i) => cambio(`cosa-${i + 1}`)))
  const g = componerMapa(conAlDia(nueve), 0)
  const s = texto(g)
  expect(s).toContain('cosa-5')
  expect(s).not.toContain('cosa-6')
  expect(fila(g, 11)).toContain('+4 más')
  expect(fila(g, 12)).toContain('61 al día')
  expect(fila(g, 13).startsWith('└')).toBe(true)
})

test('con 6 cosas salen las 6, sin «+N más»', () => {
  const seis = alDia(Array.from({ length: 6 }, (_, i) => cambio(`cosa-${i + 1}`)))
  const s = texto(componerMapa(conAlDia(seis), 0))
  expect(s).toContain('cosa-6')
  expect(s).not.toContain('más')
})

test('a 40, 66 y 100 columnas cada fila mide el ancho y salen ⚠ y «61 al día»', () => {
  for (const w of [40, 66, 100]) for (const n of [0, 3]) {
    const g = componerMapa(conAlDia(MUESTRA, n), 0.4, w)
    for (const r of g) expect(r.length).toBe(w)
    const s = texto(g)
    expect(s).toContain('⚠')
    expect(s).toContain('61 al día')
    expect(fila(g, 5).startsWith('┌─ AL DÍA · hoy 09:12 ')).toBe(true)
    expect(s).toContain('ESTADO')
  }
})

test('por debajo de 66 columnas el tipo y «cambió texto» se acortan a ⚠ y el nombre sigue entero', () => {
  const g = componerMapa(conAlDia(alDia([cambio('superpowers', true)])), 0, 50)
  expect(fila(g, 6)).toContain('superpowers')
  expect(fila(g, 6)).toContain('⚠')
  expect(fila(g, 6)).not.toContain('cambió texto')
  expect(fila(g, 6)).not.toContain('plugin')
  const ancho = componerMapa(conAlDia(alDia([cambio('superpowers', true)])), 0, 66)
  expect(fila(ancho, 6)).toContain('plugin')
  expect(fila(ancho, 6)).toContain('⚠ cambió texto')
})

test('«aldia» está entre los paneles por defecto', () => {
  expect(PANELS_DEFECTO).toContain('aldia')
})

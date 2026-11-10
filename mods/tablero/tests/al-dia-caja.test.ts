import { expect, test } from 'claude-code/testing'

import { componerMapa, MAPA_ALTO_COMPACTO, type Celda, type DatosMapa } from '../hooks/mapa'
import type { AlDia, FilaAlDia } from '../hooks/al-dia-modelo'
import { PANELS_DEFECTO } from '../hooks/core'
import { datos } from './datos-mapa'
import { INSTANTANEAS_MAPA } from './instantaneas-mapa'

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

test('sin alDia el mapa es idéntico al de antes de la rama (instantánea de 2281d5e)', () => {
  const claves = Object.keys(INSTANTANEAS_MAPA)
  expect(claves.length).toBe(6)
  for (const n of [0, 1, 3]) for (const w of [66, 100]) {
    expect(texto(componerMapa(conAlDia(null, n), 0, w))).toBe(INSTANTANEAS_MAPA[`${n}@${w}`])
  }
})

test('sin ninguna fila ↑ el pie es solo «N al día», sin «reinicia Claude»', () => {
  const sinCambios = alDia([
    { marca: '✗', nombre: 'skill-que-falla', detalle: 'no se pudo bajar · sigue la anterior', tipo: 'skill', aviso: false },
    { marca: '…', nombre: 'pendiente-uno', detalle: 'pendiente · se reintenta en la próxima sesión', tipo: 'MCP', aviso: false },
  ])
  for (const w of [40, 66, 100]) {
    const g = componerMapa(conAlDia(sinCambios), 0, w)
    expect(fila(g, 8).slice(1, -1).trim()).toBe('61 al día')
    // «reinicia» también sale en el cupo de ESTADO: se mira solo la caja AL DÍA (filas 5 a 9).
    expect(g.slice(5, 10).map(r => r.map(c => c.c).join('')).join('\n')).not.toContain('reinicia')
  }
})

test('con al menos una fila ↑ el pie sigue pidiendo reiniciar Claude', () => {
  const g = componerMapa(conAlDia(alDia([cambio('caveman'), { marca: '✗', nombre: 'x', detalle: 'falló', tipo: 'skill', aviso: false }])), 0)
  expect(texto(g)).toContain('61 al día · reinicia Claude para usar lo nuevo')
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

test('el nombre se recorta a 18 columnas y el recorte termina en «…»', () => {
  const g = componerMapa(conAlDia(alDia([cambio('un-nombre-larguisimo-de-plugin')])), 0)
  expect(fila(g, 6)).toContain('un-nombre-larguis… ')
  expect(fila(g, 6)).not.toContain('un-nombre-larguisi')
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

// ---- Textos enteros y ⚠ de una columna ----

const FALLO = ['no se pudo bajar · sigue la anterior', 'no se pudo bajar', 'falló']
const PENDIENTE = ['pendiente · se reintenta en la próxima sesión', 'pendiente · reintento luego', 'pendiente']
const PIE = ['61 al día · reinicia Claude para usar lo nuevo', '61 al día · reinicia Claude', '61 al día']
const RESTOS = /sigue|pudo|bajar|pendiente|reintent|pr[oó]xima|sesi[oó]n|reinicia|nuevo|al d[ií]a/
const variantesDe = (v: string[]) => [...v].sort((a, b) => b.length - a.length)

test('a 40, 50, 66 y 100 columnas los detalles, las versiones y el pie salen enteros', () => {
  const larga = alDia([
    { marca: '✗', nombre: 'frontend-design', detalle: 'no se pudo bajar · sigue la anterior', tipo: 'skill', aviso: false },
    cambio('un-nombre-larguisimo-de-plugin', true),
    { ...cambio('otro'), detalle: '10.12.3 → 10.13.0' },
    { marca: '…', nombre: 'opencode', detalle: 'pendiente · se reintenta en la próxima sesión', tipo: 'programa', aviso: false },
  ])
  for (const w of [40, 50, 66, 100]) {
    const g = componerMapa(conAlDia(larga), 0.4, w)
    for (const r of g) expect(r.length).toBe(w)
    const medio = (y: number) => fila(g, y).slice(1, -1)
    // Fallo: exactamente uno de sus tramos completos.
    const fallo = medio(6)
    const tramoF = variantesDe(FALLO).find(v => fallo.includes(v))
    expect(tramoF).toBeDefined()
    expect(fallo.replace(tramoF as string, '')).not.toMatch(RESTOS)
    // Versiones enteras en las dos filas de cambios.
    expect(medio(7)).toContain('1.0.0 → 1.1.0')
    expect(medio(8)).toContain('10.12.3 → 10.13.0')
    // Pendiente.
    const pend = medio(9)
    const tramoP = variantesDe(PENDIENTE).find(v => pend.includes(v))
    expect(tramoP).toBeDefined()
    expect(pend.replace(tramoP as string, '')).not.toMatch(RESTOS)
    // Pie: una de las tres variantes, entera.
    const pie = medio(10)
    const tramoPie = variantesDe(PIE).find(v => pie.includes(v))
    expect(tramoPie).toBeDefined()
    expect(pie.replace(tramoPie as string, '').trim()).toBe('')
    // Un nombre recortado termina en «…».
    if (!fila(g, 7).includes('un-nombre-larguisimo-de-plugin')) expect(fila(g, 7)).toMatch(/un-nombre-[a-z-]*…/)
  }
})

test('con sitio de sobra salen los textos más largos; con poco, los tramos cortos', () => {
  const fallos = alDia([
    { marca: '✗', nombre: 'a', detalle: 'no se pudo bajar · sigue la anterior', tipo: 'skill', aviso: false },
    { marca: '…', nombre: 'b', detalle: 'pendiente · se reintenta en la próxima sesión', tipo: 'skill', aviso: false },
    cambio('c'),   // con una fila ↑ el pie pide reiniciar
  ])
  const ancho = texto(componerMapa(conAlDia(fallos), 0, 100))
  expect(ancho).toContain('no se pudo bajar · sigue la anterior')
  expect(ancho).toContain('pendiente · se reintenta en la próxima sesión')
  const corto = componerMapa(conAlDia(fallos), 0, 40)
  expect(fila(corto, 6)).toContain('falló')
  expect(fila(corto, 7)).toContain('pendiente')
  expect(fila(corto, 9)).toContain('61 al día · reinicia Claude')
  expect(fila(corto, 9)).not.toContain('lo nuevo')
})

test('⚠ ocupa una columna: la fila mide W celdas visibles y ninguna es la mitad de un emoji', () => {
  for (const w of [40, 66, 100]) {
    const g = componerMapa(conAlDia(alDia([cambio('superpowers', true)])), 0, w)
    expect(fila(g, 6)).toContain('⚠')
    expect(g[6].length).toBe(w)
    expect(g[6].some(c => c.e)).toBe(false)
    expect(Array.from(fila(g, 6)).length).toBe(w)
    // El borde derecho queda en su sitio.
    expect(g[6][w - 1].c).toBe('│')
  }
})

test('«aldia» está entre los paneles por defecto', () => {
  expect(PANELS_DEFECTO).toContain('aldia')
})

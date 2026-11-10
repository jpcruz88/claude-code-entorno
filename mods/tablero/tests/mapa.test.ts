import { expect, test } from 'claude-code/testing'

import { MAPA_ALTO, MAPA_ALTO_COMPACTO, MAPA_ANCHO, componerMapa, filasDeMapa, type DatosMapa } from '../hooks/mapa'

// La disposición de la propuesta a 100 columnas: asesor y estado a la izquierda, lead, JEV y tarjetas a la derecha.

const datos = (cards: number): DatosMapa => ({
  tiempo: '04:12',
  reloj: '21:40',
  asesor: ['de guardia', 'consultas   2', 'tokens   213k', 'cierra permisos', 'antes de delegar'],
  estado: ['costo  $0.00', 'permisos 0', 'bucles   0', '7d ▱▱▱ 3%', '↻ vie 06:00'],
  lead: { modelo: 'Sonnet 5.5 · high', turno: 'turno 14 · ctx 38%', delegando: true },
  jev: {
    filas: [
      { etiqueta: 'qué modelo', valor: 0.94, texto: '0.94 sharp', color: 'jev' },
      { etiqueta: 'qué esfuerzo', valor: 0.86, texto: '0.86 sharp', color: 'jev' },
      { etiqueta: 'reintentar', valor: 0.64, texto: '0.64 split', color: 'warn' },
    ],
    decisiones: 1382,
  },
  tarjetas: Array.from({ length: cards }, (_, i) => ({
    nombre: `tarea ${i + 1}`,
    modelo: 'haiku · low',
    hechos: 2,
    total: 4,
    estado: i % 2 === 0 ? ('R' as const) : ('D' as const),
  })),
  registro: ['21:52 jev haiku   ·91', '21:54 jev sonnet  ·94'],
  asesorActivo: false,
  barra: { hechos: 1, total: cards },
})

const fila = (g: { c: string }[][], y: number) => g[y].map(c => c.c).join('')

test('la rejilla mide 100 columnas por 42 filas', () => {
  const g = componerMapa(datos(3), 0)
  expect(g.length).toBe(MAPA_ALTO)
  expect(MAPA_ANCHO).toBe(100)
  for (const r of g) expect(r.length).toBe(MAPA_ANCHO)
})

test('el asesor va en la columna 2 con su título', () => {
  const g = componerMapa(datos(3), 0)
  expect(g[2][2].c).toBe('┌')
  expect(fila(g, 2)).toContain('ASESOR')
})

test('la flecha asesor → lead cruza la fila 4 hasta el ▶ en la columna 33', () => {
  const g = componerMapa(datos(3), 0)
  expect(g[4][33].c).toBe('▶')
  expect(g[4][28].c).toBe('─')
})

test('el lead, la caja JEV y el conector ▼ van en la columna 50', () => {
  const g = componerMapa(datos(3), 0)
  expect(fila(g, 2)).toContain('LEAD · principal')
  expect(fila(g, 11)).toContain('JEV · decisiones')
  expect(g[10][50].c).toBe('▼')
})

test('el REGISTRO abajo a la izquierda muestra las últimas decisiones', () => {
  const g = componerMapa(datos(3), 0)
  expect(fila(g, 33)).toContain('REGISTRO')
  expect(fila(g, 34)).toContain('21:52 jev haiku')
})

test('con tres tarjetas se dibujan en tres columnas con su bajada ▼', () => {
  const g = componerMapa(datos(3), 0)
  expect(g[23][14].c).toBe('▼')
  expect(g[23][50].c).toBe('▼')
  expect(g[23][85].c).toBe('▼')
})

test('con seis tarjetas aparece la lista AGENTES 6', () => {
  const g = componerMapa(datos(6), 0)
  expect(fila(g, 22)).toContain('AGENTES 6')
})

test('la barra de estado al pie muestra subagentes y jev', () => {
  const g = componerMapa(datos(3), 0)
  expect(fila(g, 40)).toContain('subagentes [1/3]')
  expect(fila(g, 40)).toContain('[1382]')
})

test('filasDeMapa junta celdas del mismo color y deja fuera la mitad de un emoji', () => {
  const g = componerMapa(datos(3), 0)
  const filas = filasDeMapa(g)
  expect(filas.length).toBe(MAPA_ALTO)
  // Cada fila, al unir sus tramos, es el texto de la rejilla sin las mitades de emoji.
  const texto = filas[0].map(t => t.c).join('')
  expect(texto.trimStart().startsWith('TABLERO')).toBe(true)
  expect(filas[0].every(t => t.c.length > 0)).toBe(true)
  const tramo = filas[2].find(t => t.c.includes('LEAD · principal'))
  expect(tramo?.k).toBe('lead')
})

test('el movimiento cambia la rejilla: los paquetes avanzan con t', () => {
  const a = componerMapa(datos(3), 0)
  const b = componerMapa(datos(3), 0.5)
  expect(filasDeMapa(a)).not.toEqual(filasDeMapa(b))
})

test('un texto largo de ESTADO o ASESOR se corta antes del borde de su caja', () => {
  const d = datos(3)
  d.estado = ['costo  $0.00', 'permisos 3 ok · 0 pend. de más', 'bucles   0', 'ctx      38%', 'turno    04:12', 'x']
  const g = componerMapa(d, 0)
  // La caja ESTADO va de la columna 2 a la 25: su borde derecho sigue en la 25 en la fila 14.
  expect(g[14][25].c).toBe('│')
})

test('ESTADO muestra las barras de 5 h y 7 d bajo las cuatro líneas de estado', () => {
  const d: DatosMapa = {
    ...datos(3),
    estado: ['costo  $0.00', 'permisos 0', 'bucles   0', 'ctx      38%'],
    limites: [
      { etiqueta: '5 h', valor: 0.42, texto: '42%' },
      { etiqueta: '7 d', valor: 0.03, texto: '3%' },
    ],
  }
  const g = componerMapa(d, 0)
  const cajaEstado = (y: number) => g[y].slice(2, 26).map(c => c.c).join('')
  expect(cajaEstado(16)).toContain('ctx      38%')
  expect(cajaEstado(17)).toContain('5 h')
  expect(cajaEstado(17)).toContain('█')
  expect(cajaEstado(17)).toContain('42%')
  expect(cajaEstado(18)).toContain('7 d')
  expect(cajaEstado(18)).toContain('3%')
})

test('en reposo (sin agentes en curso ni asesor activo) el punto del lead no pulsa', () => {
  const reposo = { ...datos(0), lead: { ...datos(0).lead, delegando: false } }
  const g0 = componerMapa(reposo, 0)
  const g1 = componerMapa(reposo, 0.6)
  expect(g0[3][70].c).toBe('○')
  expect(filasDeMapa(g0)).toEqual(filasDeMapa(g1))
})

test('con trabajo en curso, el punto del lead sigue pulsando', () => {
  const activo = datos(3)
  expect(componerMapa(activo, 0)[3][70].c).toBe('●')
  expect(componerMapa(activo, 0.6)[3][70].c).toBe('○')
})

// Con 0 o 1 tarea el mapa es compacto: 28 filas, la tarjeta ocupa la mitad derecha y no sale «de vuelta al lead» sin tareas.

const conTareas = (cards: number, estado: 'R' | 'D' = 'R'): DatosMapa => {
  const d = datos(cards)
  return { ...d, tarjetas: d.tarjetas.map(t => ({ ...t, estado })) }
}

test('con 0 o 1 tarea la rejilla es compacta: 28 filas; con 2 o más sigue en 42', () => {
  expect(MAPA_ALTO_COMPACTO).toBe(28)
  expect(componerMapa(datos(0), 0).length).toBe(MAPA_ALTO_COMPACTO)
  expect(componerMapa(datos(1), 0).length).toBe(MAPA_ALTO_COMPACTO)
  expect(componerMapa(datos(2), 0).length).toBe(MAPA_ALTO)
})

test('con 0 tareas no aparece «de vuelta al lead»', () => {
  const g = componerMapa(datos(0), 0)
  const texto = g.map(r => r.map(c => c.c).join('')).join('\n')
  expect(texto).not.toContain('de vuelta al lead')
})

test('con 0 tareas la tarjeta dice que no hay tareas', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 21)).toContain('SIN TAREAS')
})

test('con 1 tarea la tarjeta va bajo el lead, en la mitad derecha, con su flujo de vuelta', () => {
  const g = componerMapa(conTareas(1, 'R'), 0)
  expect(g[21][34].c).toBe('┌')
  expect(g[21][73].c).toBe('┐')
  expect(fila(g, 22)).toContain('tarea 1')
  expect(fila(g, 26)).toContain('de vuelta al lead')
})

test('la barra de estado queda en la última fila de la rejilla compacta', () => {
  const g = componerMapa(datos(1), 0)
  expect(fila(g, MAPA_ALTO_COMPACTO - 1)).toContain('subagentes')
})

test('ninguna fila compacta se sale de las 100 columnas', () => {
  for (const n of [0, 1]) for (const r of componerMapa(conTareas(n, 'D'), 0.4)) expect(r.length).toBe(MAPA_ANCHO)
})

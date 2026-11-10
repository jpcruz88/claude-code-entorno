import { expect, test } from 'claude-code/testing'

import { componerMapa, sparkCosto, type Celda } from '../hooks/mapa'
import { datos } from './datos-mapa'

// El mapa de 100 columnas se dibuja igual que la maqueta aprobada (docs/tablero-maquetas/tablero-terminal.html):
// mismas cajas, mismos textos, mismas columnas y los mismos glifos de barra.

const fila = (g: Celda[][], y: number) => g[y].map(c => c.c).join('')
const en = (g: Celda[][], x: number, y: number, s: string) => g[y].slice(x, x + Array.from(s).length).map(c => c.c).join('')

test('cabecera: TABLERO en la columna 0, la rama en la 22 y el tiempo en la 80', () => {
  const g = componerMapa(datos(0), 0)
  expect(en(g, 0, 0, 'TABLERO')).toBe('TABLERO')
  expect(en(g, 22, 0, 'rama feat/tablero')).toBe('rama feat/tablero')
  expect(en(g, 80, 0, 't 04:12  21:40')).toBe('t 04:12  21:40')
})

test('ESTADO, fila 1: costo, cupos con barra ▓░ y permisos en las columnas de la maqueta', () => {
  const g = componerMapa(datos(0), 0)
  expect(en(g, 2, 6, 'costo')).toBe('costo')
  expect(en(g, 12, 6, '$1.42')).toBe('$1.42')
  expect(en(g, 26, 6, 'cupo 5h')).toBe('cupo 5h')
  expect(en(g, 34, 6, '▓▓░░░░░░ 31%')).toBe('▓▓░░░░░░ 31%')
  expect(en(g, 52, 6, 'cupo 7d')).toBe('cupo 7d')
  expect(en(g, 60, 6, '▓▓▓▓▓░░░ 62%')).toBe('▓▓▓▓▓░░░ 62%')
  expect(en(g, 78, 6, 'permisos')).toBe('permisos')
  expect(en(g, 87, 6, '2 pend.')).toBe('2 pend.')
  expect(g[6][34].k).toBe('enj')
})

test('ESTADO, fila 2: último turno, reinicia, ritmo y permisos denegados', () => {
  const g = componerMapa(datos(0), 0)
  expect(en(g, 2, 7, 'último turno')).toBe('último turno')
  expect(en(g, 15, 7, '$0.08')).toBe('$0.08')
  expect(en(g, 26, 7, 'reinicia')).toBe('reinicia')
  expect(en(g, 35, 7, '3h10m')).toBe('3h10m')
  expect(en(g, 52, 7, 'ritmo')).toBe('ritmo')
  expect(en(g, 58, 7, 'ámbar +9 pts')).toBe('ámbar +9 pts')
  expect(en(g, 78, 7, '1 den.')).toBe('1 den.')
  expect(en(g, 85, 7, 'acceptEdits')).toBe('acceptEdits')
})

test('ESTADO, fila 3: bucles (también en 0), racha, ediciones y la gráfica costo/min', () => {
  const g = componerMapa(datos(0), 0)
  expect(en(g, 2, 8, 'bucles')).toBe('bucles')
  expect(en(g, 9, 8, '0')).toBe('0')
  expect(en(g, 14, 8, 'racha errores')).toBe('racha errores')
  expect(en(g, 28, 8, '1')).toBe('1')
  expect(en(g, 33, 8, 'ediciones turno')).toBe('ediciones turno')
  expect(en(g, 49, 8, '4')).toBe('4')
  expect(en(g, 56, 8, 'costo/min')).toBe('costo/min')
  expect(en(g, 66, 8, sparkCosto(datos(0).estado.costoMin))).toBe(sparkCosto(datos(0).estado.costoMin))
})

test('ESTADO, fila 4: skills y mcp', () => {
  const g = componerMapa(datos(0), 0)
  expect(en(g, 2, 9, 'skills')).toBe('skills')
  expect(en(g, 9, 9, 'tdd×2 caveman×1')).toBe('tdd×2 caveman×1')
  expect(en(g, 40, 9, 'mcp')).toBe('mcp')
  expect(en(g, 44, 9, 'codebase×3 ctx7×1')).toBe('codebase×3 ctx7×1')
})

test('costo/min: 24 celdas ▁..█ escaladas al minuto más caro; sin gasto, todo ▁', () => {
  expect(sparkCosto([])).toBe('▁'.repeat(24))
  const s = sparkCosto([0, 0.04, 0.08])
  expect(Array.from(s).length).toBe(24)
  expect(s.endsWith('▁▅█')).toBe(true)
  expect(sparkCosto(Array(30).fill(0.01))).toBe('█'.repeat(24))
})

test('LEAD: contexto con barra ▓░ magenta y el conector baja a ▾', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 15)).toContain('▓▓▓░░░░░ 38%')
  expect(fila(g, 15)).not.toContain('█')
  // En reposo el conector queda quieto: │ │ ▾.
  const reposo = componerMapa({ ...datos(0), situacion: 'inactivo', lead: { ...datos(0).lead, delegando: false }, asesorActivo: false }, 0)
  expect([reposo[19][75].c, reposo[20][75].c, reposo[21][75].c]).toEqual(['│', '│', '▾'])
})

test('JEV · decisiones: umbral, una fila por decisión con hora, texto, ▮▯ y confianza, y el tope', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 22)).toContain('┌─ JEV · decisiones ')
  expect(en(g, 53, 23, 'umbral')).toBe('umbral')
  expect(en(g, 94, 23, '0.80')).toBe('0.80')
  expect(en(g, 53, 24, '21:54')).toBe('21:54')
  expect(en(g, 59, 24, 'esfuerzo → medio')).toBe('esfuerzo → medio')
  expect(en(g, 76, 24, '▮▮▮▮▮▮▮▮▯▯ 0.84')).toBe('▮▮▮▮▮▮▮▮▯▯ 0.84')
  expect(en(g, 76, 25, '▮▮▮▮▮▮▮▮▮▯ 0.91')).toBe('▮▮▮▮▮▮▮▮▮▯ 0.91')
  expect(g[24][76].k).toBe('jev')
  expect(g[24][84].k).toBe('jevd')
  expect(en(g, 53, 27, 'tope semana +12 pts → sonnet')).toBe('tope semana +12 pts → sonnet')
  expect(g[27][53].k).toBe('amb')
  const s = g.map(r => r.map(c => c.c).join('')).join('\n')
  expect(s).not.toContain('seguro')
  expect(s).not.toContain('1382 decisiones')
})

test('REGISTRO: hora, rol de color y texto', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 17)).toContain('┌─ REGISTRO ─')
  expect(en(g, 2, 18, '21:54')).toBe('21:54')
  expect(en(g, 8, 18, 'jev')).toBe('jev')
  expect(g[18][8].k).toBe('jev')
  expect(en(g, 15, 18, 'esfuerzo → medio (0.84)')).toBe('esfuerzo → medio (0.84)')
})

test('pie: «SIN TAREAS · el lead espera trabajo · subagentes 0/0» y, con tareas, «N tareas · subagentes h/t»', () => {
  const g0 = componerMapa(datos(0), 0)
  expect(fila(g0, g0.length - 1).startsWith('SIN TAREAS · el lead espera trabajo · subagentes 0/0')).toBe(true)
  const g3 = componerMapa(datos(3), 0)
  expect(fila(g3, g3.length - 1).startsWith('3 tareas · subagentes 1/3')).toBe(true)
  expect(fila(g0, g0.length - 1).endsWith('tablero v0.4.0 · desarrollado por JP')).toBe(true)
})

test('angosto: los mismos textos de la maqueta (último turno, costo/min, umbral, ▮▯, ▓░)', () => {
  for (const w of [40, 66, 99]) {
    const s = componerMapa(datos(0), 0, w).map(r => r.map(c => c.c).join('')).join('\n')
    for (const parte of ['último turno', 'costo/min', 'bucles', 'umbral', '0.80', '▮', '▓', 'JEV · decisiones', 'REGISTRO', 'subagentes 0/0']) expect(s).toContain(parte)
    // █ solo en la gráfica costo/min (el minuto más caro); las barras son ▓░.
    expect(s.split('\n').filter(l => !l.includes('costo/min')).join('\n')).not.toContain('█')
    expect(s).not.toContain('seguro')
  }
})

import { expect, test } from 'claude-code/testing'

import { MAPA_ALTO, MAPA_ALTO_COMPACTO, MAPA_ANCHO, componerMapa, filasDeMapa, type DatosMapa } from '../hooks/mapa'
import { datos } from './datos-mapa'

// La disposición a 100 columnas: franja de situación arriba, ESTADO a todo lo ancho, asesor y registro a la
// izquierda, lead y JEV a la derecha, y las tarjetas de tareas debajo.

const fila = (g: { c: string }[][], y: number) => g[y].map(c => c.c).join('')

test('la rejilla mide 100 columnas; con 2 o más tareas 49 filas y compacta 32', () => {
  expect(MAPA_ANCHO).toBe(100)
  expect(MAPA_ALTO).toBe(49)
  expect(MAPA_ALTO_COMPACTO).toBe(32)
  expect(componerMapa(datos(3), 0).length).toBe(MAPA_ALTO)
  expect(componerMapa(datos(0), 0).length).toBe(MAPA_ALTO_COMPACTO)
  expect(componerMapa(datos(1), 0).length).toBe(MAPA_ALTO_COMPACTO)
  for (const n of [0, 1, 3, 6]) for (const r of componerMapa(datos(n), 0.4)) expect(r.length).toBe(MAPA_ANCHO)
})

test('la cabecera trae TABLERO, la rama y el reloj; ya no dice EN CURSO', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 0)).toContain('TABLERO')
  expect(fila(g, 0)).toContain('rama feat/tablero')
  expect(fila(g, 0)).toContain('21:40')
  expect(fila(g, 0)).not.toContain('EN CURSO')
})

// ---- La franja de situación ----

test('la franja ocupa las filas 1 a 3 de ancho completo, con fondo del color de la situación', () => {
  const g = componerMapa(datos(0), 0)
  for (const y of [1, 2, 3]) for (const c of g[y]) expect(c.bg).toBe('lead')
  expect(g[0].every(c => c.bg === undefined)).toBe(true)
})

test('trabajando: rótulo en letras espaciadas, spinner y el turno en la fila de abajo', () => {
  const g = componerMapa(datos(0), 0)
  expect(fila(g, 2)).toContain('T R A B A J A N D O')
  expect(fila(g, 2)).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(fila(g, 3)).toContain('turno 0:42')
})

test('el texto de la franja va en tinta oscura sobre el fondo de color', () => {
  const g = componerMapa(datos(0), 0)
  const c = g[2].find(x => x.c === 'T')
  expect(c?.k).toBe('osc')
})

test('te espera: fondo ámbar, rótulo y detalle con los permisos pendientes', () => {
  const g = componerMapa({ ...datos(0), situacion: 'espera', detalle: { permisos: 2 } }, 0)
  expect(g[2][0].bg).toBe('amb')
  expect(fila(g, 2)).toContain('T E   E S P E R A')
  expect(fila(g, 3)).toContain('2 permisos pendientes · responde para seguir')
})

test('detenido: fondo rojo (warn) con los errores seguidos', () => {
  const g = componerMapa({ ...datos(0), situacion: 'detenido', detalle: { errores: 3 } }, 0)
  expect(g[2][0].bg).toBe('warn')
  expect(fila(g, 2)).toContain('D E T E N I D O')
  expect(fila(g, 3)).toContain('3 errores seguidos')
})

test('en espera: fondo gris (mut) y el latido alterna ○ y ●', () => {
  const a = componerMapa({ ...datos(0), situacion: 'inactivo', detalle: {} }, 0)
  // Late una vez por segundo: en reposo el panel se redibuja como mucho cada segundo.
  const b = componerMapa({ ...datos(0), situacion: 'inactivo', detalle: {} }, 1.2)
  expect(a[2][0].bg).toBe('mut')
  expect(fila(a, 2)).toContain('E N   E S P E R A')
  expect(fila(a, 2)).not.toBe(fila(b, 2))
})

test('te espera y detenido parpadean: el bloque se apaga y el fondo desaparece', () => {
  const d: DatosMapa = { ...datos(0), situacion: 'espera', detalle: { permisos: 1 } }
  const encendido = componerMapa(d, 0)
  const apagado = componerMapa(d, 0.8)
  expect(encendido[2][0].bg).toBe('amb')
  expect(apagado[2][0].bg).toBeUndefined()
  expect(apagado[2].find(x => x.c === 'T')?.k).toBe('amb')
})

// ---- ESTADO a todo lo ancho ----

test('ESTADO va bajo la franja, de la columna 0 a la 99', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[5][0].c).toBe('┌')
  expect(g[5][99].c).toBe('┐')
  expect(fila(g, 5)).toContain('ESTADO')
  expect(g[10][0].c).toBe('└')
  expect(g[10][99].c).toBe('┘')
})

test('ESTADO junta costo, cupos, permisos, errores, ediciones, skills y MCP', () => {
  const g = componerMapa(datos(0), 0)
  const todo = [6, 7, 8, 9].map(y => fila(g, y)).join('\n')
  for (const s of ['$1.42', 'último turno', '$0.08', 'cupo 5h', '31%', 'reinicia', '3h10m', 'cupo 7d', '62%', '2 pend.', '1 den.', 'acceptEdits', 'racha errores', 'ediciones turno', 'tdd×2 caveman×1', 'codebase×3 ctx7×1'])
    expect(todo).toContain(s)
  expect(fila(g, 6)).toContain('▓')
})

test('la barra de un cupo va en magenta (▓) aunque pase del 80 %, como en la maqueta', () => {
  const d = datos(0)
  d.estado.limites = [{ etiqueta: '5h', valor: 0.85, texto: '85%', reinicio: '1h' }]
  const g = componerMapa(d, 0)
  expect(g[6].find(c => c.c === '▓')?.k).toBe('enj')
})

test('sin skills ni MCP la fila los rotula igual, con —, como en la maqueta', () => {
  const d = datos(0)
  d.estado.skills = ''
  d.estado.mcp = ''
  const g = componerMapa(d, 0)
  expect(fila(g, 9)).toMatch(/skills —/)
  expect(fila(g, 9)).toMatch(/mcp —/)
})

// ---- Asesor, lead, JEV y registro ----

test('el asesor va a la izquierda, bajo ESTADO, con su estado en el título', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[12][0].c).toBe('┌')
  expect(fila(g, 12)).toContain('ASESOR · 2 consultas')
  expect(fila(g, 13)).toContain('consultas')
  expect(fila(g, 14)).toContain('última consulta hace 2m')
})

test('la flecha asesor → lead cruza la fila 14 hasta el ▶ en la columna 50', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[14][50].c).toBe('▶')
  expect(g[14][46].c).toBe('─')
})

test('el lead va a la derecha con modelo, contexto, líneas y respuestas', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[12][51].c).toBe('┌')
  expect(fila(g, 12)).toContain('LEAD · principal')
  const lead = [13, 14, 15, 16, 17].map(y => g[y].slice(51).map(c => c.c).join('')).join('\n')
  for (const s of ['Sonnet 5.5 · high', '38%', '+128', '−34', '17']) expect(lead).toContain(s)
})

test('el spinner del lead gira con trabajo; en reposo queda ○ fijo', () => {
  expect(componerMapa(datos(0), 0)[12][70].c).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(componerMapa(datos(0), 0.1)[12][70].c).not.toBe(componerMapa(datos(0), 0)[12][70].c)
  const reposo: DatosMapa = { ...datos(0), situacion: 'inactivo', lead: { ...datos(0).lead, delegando: false } }
  expect(componerMapa(reposo, 0)[12][70].c).toBe('○')
  expect(componerMapa(reposo, 0.7)[12][70].c).toBe('○')
})

test('el borde del lead respira con trabajo: alterna entre vivo y tenue', () => {
  const a = componerMapa(datos(0), 0)
  const b = componerMapa(datos(0), 0.6)
  expect(a[12][51].k).toBe('lead')
  expect(b[12][51].k).toBe('box')
})

test('en reposo el borde del lead no respira', () => {
  const reposo: DatosMapa = { ...datos(0), situacion: 'inactivo', lead: { ...datos(0).lead, delegando: false } }
  expect(componerMapa(reposo, 0)[12][51].k).toBe(componerMapa(reposo, 0.6)[12][51].k)
})

test('el conector lead → JEV baja por la columna 75 hasta la ▾ de la fila 21', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[19][75].c).toMatch(/[│●•·]/)
  expect(g[21][75].c).toMatch(/[▾●•·]/)
})

test('JEV va bajo el lead: siete filas, de la 22 a la 28, como en la maqueta', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[22][51].c).toBe('┌')
  expect(g[28][51].c).toBe('└')
})


test('el REGISTRO va a la izquierda bajo el asesor y se ajusta a sus líneas', () => {
  const g = componerMapa(datos(0), 0)
  expect(g[17][0].c).toBe('┌')
  expect(fila(g, 17)).toContain('REGISTRO')
  expect(fila(g, 18)).toContain('21:54 jev    esfuerzo → medio (0.84)')
  expect(g[23][0].c).toBe('└')
})

test('un texto largo del asesor o del registro se corta antes del borde de su caja', () => {
  const d = datos(0)
  d.registro = [{ hora: '21:52', rol: 'jev', txt: 'una línea larguísima que no cabe en la caja del registro' }]
  d.asesor = { ...d.asesor!, ultima: 'hace un rato larguísimo sin fin' }
  const g = componerMapa(d, 0)
  expect(g[18][43].c).toBe('│')
  expect(g[14][43].c).toBe('│')
})

test('los paquetes avanzan con t entre el asesor y el lead cuando hay trabajo', () => {
  const trabajo: DatosMapa = { ...datos(0), asesorActivo: true }
  expect(filasDeMapa(componerMapa(trabajo, 0))).not.toEqual(filasDeMapa(componerMapa(trabajo, 0.2)))
})

// ---- Pie ----

test('el pie lleva el estado de tareas a la izquierda y «tablero vX · desarrollado por JP» a la derecha', () => {
  const g = componerMapa(datos(0), 0)
  const pie = fila(g, MAPA_ALTO_COMPACTO - 1)
  expect(pie).toContain('SIN TAREAS · el lead espera trabajo')
  expect(pie.trimEnd().endsWith('tablero v0.4.0 · desarrollado por JP')).toBe(true)
  expect(g[MAPA_ALTO_COMPACTO - 1].filter(c => c.k === 'lead').map(c => c.c).join('')).toContain('JP')
})

test('con tareas el pie cuenta las tareas y los subagentes, como en la maqueta', () => {
  const g = componerMapa(datos(3), 0)
  expect(fila(g, MAPA_ALTO - 1)).toContain('3 tareas · subagentes 1/3')
})

// ---- Tarjetas de tareas ----

test('con 0 tareas no hay tarjetas ni «de vuelta al lead»', () => {
  const texto = componerMapa(datos(0), 0).map(r => r.map(c => c.c).join('')).join('\n')
  expect(texto).not.toContain('de vuelta al lead')
  expect(texto).not.toContain('tarea 1')
})

test('con 1 tarea la tarjeta va a la izquierda, bajo el registro', () => {
  const g = componerMapa(datos(1), 0)
  expect(g[25][0].c).toBe('┌')
  expect(fila(g, 25)).toContain('tarea 1')
  expect(fila(g, 29)).toContain('de vuelta al lead')
})

test('con tres tarjetas se dibujan en tres columnas con su bajada ▼ bajo la caja JEV', () => {
  const g = componerMapa(datos(3), 0)
  expect(g[30][75].c).toMatch(/[│●•·]/)
  expect(g[33][14].c).toBe('▼')
  expect(g[33][50].c).toBe('▼')
  expect(g[33][85].c).toBe('▼')
  expect(fila(g, 34)).toContain('tarea 1')
})

test('con seis tarjetas aparece la lista AGENTES 6', () => {
  const g = componerMapa(datos(6), 0)
  expect(fila(g, 32)).toContain('AGENTES 6')
})

test('con 2 o más tareas «de vuelta al lead» queda al fondo, sin línea hasta el lead', () => {
  const g = componerMapa(datos(3), 0)
  expect(fila(g, 44)).toContain('de vuelta al lead')
  expect(g[4][99].c).toBe(' ')
})

// ---- Colores ----

test('filasDeMapa junta celdas del mismo color y fondo, y deja fuera la mitad de un emoji', () => {
  const filas = filasDeMapa(componerMapa(datos(3), 0))
  expect(filas.length).toBe(MAPA_ALTO)
  const texto = filas[0].map(t => t.c).join('')
  expect(texto.trimStart().startsWith('TABLERO')).toBe(true)
  const tramo = filas[12].find(t => t.c.includes('LEAD · principal'))
  expect(tramo?.k).toBe('lead')
  const franja = filas[2].filter(t => t.bg === 'lead')
  expect(franja.map(t => t.c).join('')).toContain('T R A B A J A N D O')
})

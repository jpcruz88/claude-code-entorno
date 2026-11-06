import { expect, test } from 'claude-code/testing'

import { leerDecisiones, lineaLog, marcaTarjeta, resumenJev } from '../hooks/jev-modelo'
import type { DecisionJev } from '../hooks/jev-modelo'

const SESION = 'sesion-a'
const HORA = '2026-11-06T10:00:00+01:00'
const HORA_MS = Date.parse(HORA)

// Una línea tal como la escriben guard-subagentes.py y jev-reintento.py.
const linea = (extra: Record<string, unknown>, sesion: string = SESION): string =>
  JSON.stringify({ hora: HORA, session_id: sesion, tipo: 'modelo', claude: 'haiku', descripcion: 'buscar', ...extra })

const decision = (extra: Partial<DecisionJev> = {}): DecisionJev => ({
  hora: HORA_MS,
  sessionId: SESION,
  tipo: 'modelo',
  opcion: 'sonnet',
  confianza: 0.91,
  sharp: true,
  claude: 'haiku',
  aplicada: true,
  descripcion: 'buscar',
  ...extra,
})

const sinRespuesta = (extra: Partial<DecisionJev> = {}): DecisionJev =>
  decision({ opcion: null, confianza: null, sharp: false, aplicada: false, ...extra })

test('leerDecisiones filtra por sesión', () => {
  const texto = [linea({ opcion: 'sonnet', confianza: 0.9, sharp: true, aplicada: true }), linea({ opcion: 'opus' }, 'otra')].join('\n')
  const ds = leerDecisiones(texto, SESION)
  expect(ds.length).toBe(1)
  expect(ds[0]?.sessionId).toBe(SESION)
  expect(ds[0]?.opcion).toBe('sonnet')
  expect(leerDecisiones(texto, 'otra').length).toBe(1)
  expect(leerDecisiones(texto, 'ninguna').length).toBe(0)
})

test('ignora líneas rotas, sin session_id o sin hora válida', () => {
  const texto = [
    linea({ opcion: 'sonnet', confianza: 0.9 }),
    '{"hora": "2026-11-06T10:0',
    '',
    '   ',
    'no es json',
    '[1, 2]',
    'null',
    JSON.stringify({ hora: HORA, tipo: 'modelo', opcion: 'opus' }),
    linea({ hora: 'no es una fecha', opcion: 'opus' }),
    linea({ opcion: 'opus', confianza: 0.9 }),
  ].join('\n')
  const ds = leerDecisiones(texto, SESION)
  expect(ds.length).toBe(2)
  expect(ds.every(d => typeof d.hora === 'number' && Number.isFinite(d.hora))).toBe(true)
})

test('convierte la hora ISO y la numérica a milisegundos', () => {
  const texto = [linea({ hora: HORA }), linea({ hora: 1_700_000_000_000 })].join('\n')
  const ds = leerDecisiones(texto, SESION)
  expect(ds[0]?.hora).toBe(HORA_MS)
  expect(ds[1]?.hora).toBe(1_700_000_000_000)
})

test('mapea session_id a sessionId y los campos snake_case a su forma', () => {
  const texto = linea({ tipo: 'reintento', opcion: null, confianza: null, sharp: false, aplicada: false, motivo: 'sin respuesta' })
  const [d] = leerDecisiones(texto, SESION)
  expect(d).toEqual({
    hora: HORA_MS,
    sessionId: SESION,
    tipo: 'reintento',
    opcion: null,
    confianza: null,
    sharp: false,
    claude: 'haiku',
    aplicada: false,
    descripcion: 'buscar',
  })
})

test('resumenJev da las tres filas en orden, con el total de todas las decisiones', () => {
  const r = resumenJev([decision(), decision({ tipo: 'esfuerzo', claude: 'medium', opcion: 'high', aplicada: true }), sinRespuesta({ tipo: 'reintento' })])
  expect(r.total).toBe(3)
  expect(r.filas.map(f => f.tipo)).toEqual(['modelo', 'esfuerzo', 'reintento'])
  expect(r.filas.map(f => f.etiqueta)).toEqual(['qué modelo', 'qué esfuerzo', 'reintentar o parar'])
  expect(r.filas[0]).toEqual({ tipo: 'modelo', etiqueta: 'qué modelo', confianza: 0.91, sharp: true })
  expect(r.filas[2]).toEqual({ tipo: 'reintento', etiqueta: 'reintentar o parar', confianza: null, sharp: false })
})

test('resumenJev sin decisiones deja filas vacías con null', () => {
  const r = resumenJev([])
  expect(r.total).toBe(0)
  expect(r.filas.every(f => f.confianza === null && f.sharp === null)).toBe(true)
})

test('media de las últimas 20 con respuesta por tipo', () => {
  const viejas = Array.from({ length: 5 }, () => decision({ confianza: 0 }))
  const recientes = Array.from({ length: 20 }, () => decision({ confianza: 0.5 }))
  const r = resumenJev([...viejas, ...recientes])
  expect(r.filas[0]?.confianza).toBe(0.5)
})

test('sin respuesta no entra en la media pero sí en el total', () => {
  const ds = [decision({ confianza: 0.5 }), sinRespuesta(), sinRespuesta(), decision({ confianza: 0.75 })]
  const r = resumenJev(ds)
  expect(r.total).toBe(4)
  expect(r.filas[0]?.confianza).toBe(0.625)
  expect(resumenJev([sinRespuesta()]).filas[0]?.confianza).toBe(null)
})

test('sharp es el de la última decisión de ese tipo', () => {
  const r = resumenJev([decision({ sharp: true }), decision({ sharp: false, confianza: 0.3 })])
  expect(r.filas[0]?.sharp).toBe(false)
})

test('línea de log sharp y split', () => {
  expect(lineaLog(decision({ opcion: 'sonnet', confianza: 0.91, sharp: true }))).toBe('qué modelo → sonnet   p=0.91 sharp → código')
  expect(lineaLog(decision({ opcion: 'sonnet', confianza: 0.62, sharp: false, aplicada: false, claude: 'sonnet' }))).toBe('qué modelo → sonnet   p=0.62 split → claude')
  expect(lineaLog(decision({ tipo: 'esfuerzo', opcion: 'low', confianza: 0.85, sharp: true, claude: 'high' }))).toBe('qué esfuerzo → low   p=0.85 sharp → código')
  expect(lineaLog(sinRespuesta())).toBe('qué modelo → sin respuesta')
})

test('marca solo si se aplicó: jev ↑ o ↓ según haiku < sonnet < opus', () => {
  expect(marcaTarjeta(decision({ claude: 'haiku', opcion: 'sonnet', aplicada: true }))).toBe('jev ↑ sonnet')
  expect(marcaTarjeta(decision({ claude: 'opus', opcion: 'haiku', aplicada: true }))).toBe('jev ↓ haiku')
  expect(marcaTarjeta(decision({ claude: 'sonnet', opcion: 'opus', aplicada: true }))).toBe('jev ↑ opus')
  expect(marcaTarjeta(decision({ claude: 'haiku', opcion: 'sonnet', aplicada: false }))).toBe(null)
  expect(marcaTarjeta(undefined)).toBe(null)
})

test('misma elección sin marca', () => {
  expect(marcaTarjeta(decision({ claude: 'sonnet', opcion: 'sonnet', aplicada: false }))).toBe(null)
  expect(marcaTarjeta(decision({ claude: 'sonnet', opcion: 'sonnet', aplicada: true }))).toBe(null)
})

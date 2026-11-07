import { expect, test } from 'claude-code/testing'

import { filaRitmo, leerDecisiones, leerLimites, lineaLog, marcaTarjeta, resumenJev, ritmoSemana } from '../hooks/jev-modelo'
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
  motivo: '',
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
    motivo: 'sin respuesta',
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

test('marca con ids completos de modelo: claude-sonnet-5-5 cuenta como sonnet', () => {
  expect(marcaTarjeta(decision({ claude: 'claude-sonnet-5-5', opcion: 'opus', aplicada: true }))).toBe('jev ↑ opus')
  expect(marcaTarjeta(decision({ claude: 'claude-haiku-5-5', opcion: 'sonnet', aplicada: true }))).toBe('jev ↑ sonnet')
  expect(marcaTarjeta(decision({ claude: 'claude-opus-5-1', opcion: 'haiku', aplicada: true }))).toBe('jev ↓ haiku')
  expect(marcaTarjeta(decision({ claude: 'claude-sonnet-5-5', opcion: 'sonnet', aplicada: true }))).toBe(null)
})

// ---------------------------------------------------------------- topes y ritmo semanal

const tope = (extra: Partial<DecisionJev> = {}): DecisionJev =>
  decision({ tipo: 'tope', opcion: 'sonnet', confianza: null, sharp: false, claude: 'opus', aplicada: true, descripcion: '', motivo: 'tope semana +12 pts → sonnet', ...extra })

test('línea de log de un tope: modelo final y causa', () => {
  expect(lineaLog(tope())).toBe('tope → sonnet · semana +12 pts')
  expect(lineaLog(tope({ opcion: 'haiku', motivo: 'tope 5h 90% → haiku' }))).toBe('tope → haiku · 5h 90%')
  expect(lineaLog(tope({ opcion: 'opus', motivo: 'tope semana +6 pts → esfuerzo medium' }))).toBe('tope → opus · semana +6 pts · esfuerzo medium')
  expect(lineaLog(tope({ opcion: 'opus', motivo: 'tope 5h 65% → esfuerzo medium' }))).toBe('tope → opus · 5h 65% · esfuerzo medium')
  expect(lineaLog(tope({ motivo: '' }))).toBe('tope → sonnet')
  expect(lineaLog(tope({ motivo: 'tope' }))).toBe('tope → sonnet')
})

test('línea de log de un tope que solo baja el esfuerzo o baja modelo y esfuerzo', () => {
  expect(lineaLog(tope({ opcion: 'opus', motivo: 'tope; esfuerzo xhigh → high' }))).toBe('tope → opus · esfuerzo high')
  expect(lineaLog(tope({ opcion: 'sonnet', motivo: 'tope semana +12 pts → sonnet; esfuerzo high → medium' }))).toBe('tope → sonnet · semana +12 pts · esfuerzo medium')
})

test('leerDecisiones acepta tipo tope y guarda el motivo', () => {
  const [d] = leerDecisiones(linea({ tipo: 'tope', opcion: 'sonnet', claude: 'opus', aplicada: true, motivo: 'tope semana +12 pts → sonnet' }), SESION)
  expect(d?.tipo).toBe('tope')
  expect(d?.motivo).toBe('tope semana +12 pts → sonnet')
})

test('los topes no entran en las filas de confianza ni en el total', () => {
  const r = resumenJev([decision({ confianza: 0.8 }), tope(), tope()])
  expect(r.total).toBe(1)
  expect(r.filas.map(f => f.tipo)).toEqual(['modelo', 'esfuerzo', 'reintento'])
  expect(r.filas[0]?.confianza).toBe(0.8)
})

test('xhigh va después de high en la marca de tarjeta', () => {
  expect(marcaTarjeta(decision({ tipo: 'esfuerzo', claude: 'high', opcion: 'xhigh' }))).toBe('jev ↑ xhigh')
  expect(marcaTarjeta(decision({ tipo: 'esfuerzo', claude: 'xhigh', opcion: 'high' }))).toBe('jev ↓ high')
})

// Los valores esperados salen de claude/hooks/jev_limites.py (_tope_semana) con tz = UTC+1 fijo.
const UTC1 = () => 60
const ep = (iso: string) => Date.parse(iso) / 1000
const semana = (usado: number, reinicio: string) => ({ actualizado: ep('2026-11-09T11:59:00+01:00'), seven_day: { usado, reinicio: ep(reinicio) } })
/** Dos números iguales salvo el redondeo de coma flotante. */
const cerca = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9
const AHORA = ep('2026-11-09T12:00:00+01:00')

test('ritmo: reinicio justo el jueves a las 23:00 (igual que Python)', () => {
  const r = ritmoSemana(semana(52, '2026-11-12T23:00:00+01:00'), AHORA, undefined, UTC1)
  expect(r?.usado).toBe(52)
  expect(cerca(r?.ritmo, 45.535714285714285)).toBe(true)
  expect(cerca(r?.exceso, 6.464285714285715)).toBe(true)
})

test('ritmo: reinicio el viernes 00:30, el corte sigue siendo el jueves 23:00 (igual que Python)', () => {
  const r = ritmoSemana(semana(52, '2026-11-13T00:30:00+01:00'), AHORA, undefined, UTC1)
  expect(cerca(r?.ritmo, 45.13513513513514)).toBe(true)
  expect(cerca(r?.exceso, 6.864864864864863)).toBe(true)
})

test('ritmo: pasado el corte vale 90 (igual que Python)', () => {
  const l = { actualizado: ep('2026-11-13T00:00:00+01:00'), seven_day: { usado: 52, reinicio: ep('2026-11-13T00:30:00+01:00') } }
  const r = ritmoSemana(l, ep('2026-11-13T00:00:00+01:00'), undefined, UTC1)
  expect(r?.ritmo).toBe(90)
  expect(r?.exceso).toBe(-38)
})

test('ritmo: el corte depende de la zona horaria', () => {
  const l = semana(52, '2026-11-13T00:30:00+01:00')
  // En UTC el viernes 00:30+01:00 es el jueves 23:30 UTC: el corte es el jueves 23:00 UTC (22:00+01:00).
  const r = ritmoSemana(l, AHORA, undefined, () => 0)
  expect(cerca(r?.ritmo, 90 * (AHORA - (ep('2026-11-13T00:30:00+01:00') - 7 * 86400)) / (ep('2026-11-12T23:00:00Z') - (ep('2026-11-13T00:30:00+01:00') - 7 * 86400)))).toBe(true)
})

test('ritmo: sin dato, dato viejo, reinicio vencido o JSON roto no dan nada', () => {
  const l = semana(52, '2026-11-12T23:00:00+01:00')
  expect(ritmoSemana(null, AHORA, undefined, UTC1)).toBe(null)
  expect(ritmoSemana({ actualizado: AHORA - 6 * 3600 - 1, seven_day: l.seven_day }, AHORA, undefined, UTC1)).toBe(null)
  expect(ritmoSemana({ actualizado: AHORA - 6 * 3600, seven_day: l.seven_day }, AHORA, undefined, UTC1)).not.toBe(null)
  expect(ritmoSemana({ actualizado: AHORA, seven_day: { usado: 52, reinicio: AHORA } }, AHORA, undefined, UTC1)).toBe(null)
  expect(ritmoSemana({ actualizado: AHORA }, AHORA, undefined, UTC1)).toBe(null)
  expect(leerLimites('{"actualizado": 17')).toBe(null)
  expect(leerLimites('[1]')).toBe(null)
  expect(leerLimites('{"actualizado":"x"}')).toBe(null)
  expect(leerLimites(JSON.stringify(l))?.seven_day?.usado).toBe(52)
})

// Los literales son RitmoSemana; `h5` es la ventana de 5 h con 3 h para reiniciar (salvo que se diga otra cosa).
const rs = (usado: number, ritmo: number, despuesDelCorte = false) => ({ usado, ritmo, exceso: usado - ritmo, despuesDelCorte })
const h5 = (usado: number, falta = 3 * 3600) => ({ usado, reinicio: AHORA + falta })

test('fila de ritmo: texto y color por exceso (verde ≤ 5, ámbar 5 a 15, rojo > 15)', () => {
  expect(filaRitmo(rs(52, 40), h5(40), AHORA)).toEqual({ texto: 'semana 52% · ritmo 40% · +12', nivel: 'ambar' })
  expect(filaRitmo(rs(45, 40), h5(40), AHORA)).toEqual({ texto: 'semana 45% · ritmo 40% · +5', nivel: 'verde' })
  expect(filaRitmo(rs(55, 40), h5(40), AHORA)).toEqual({ texto: 'semana 55% · ritmo 40% · +15', nivel: 'ambar' })
  expect(filaRitmo(rs(55.4, 40), h5(40), AHORA)?.nivel).toBe('rojo')
  expect(filaRitmo(rs(70, 40), h5(40), AHORA)).toEqual({ texto: 'semana 70% · ritmo 40% · +30', nivel: 'rojo' })
  expect(filaRitmo(rs(25, 40), h5(40), AHORA)).toEqual({ texto: 'semana 25% · ritmo 40% · −15 · xhigh ok', nivel: 'verde' })
  expect(filaRitmo(null, h5(40), AHORA)).toBe(null)
})

test('xhigh ok: antes del corte pide exceso ≤ −10 (borde −10 sí, −9 no)', () => {
  expect(filaRitmo(rs(30, 40), h5(40), AHORA)?.texto).toBe('semana 30% · ritmo 40% · −10 · xhigh ok')
  expect(filaRitmo(rs(31, 40), h5(40), AHORA)?.texto).toBe('semana 31% · ritmo 40% · −9')
})

test('xhigh ok: semana −12 con 5 h al 70 % no lo muestra (manda la regla de 5 h)', () => {
  expect(filaRitmo(rs(28, 40), h5(70), AHORA)?.texto).toBe('semana 28% · ritmo 40% · −12')
  expect(filaRitmo(rs(28, 40), h5(60), AHORA)?.texto).toBe('semana 28% · ritmo 40% · −12')
  expect(filaRitmo(rs(28, 40), h5(59), AHORA)?.texto).toBe('semana 28% · ritmo 40% · −12 · xhigh ok')
})

test('xhigh ok: después del corte con 85 % y 5 h al 30 % sí lo muestra', () => {
  expect(filaRitmo(rs(85, 90, true), h5(30), AHORA)?.texto).toBe('semana 85% · ritmo 90% · −5 · xhigh ok')
})

test('xhigh ok: después del corte se apaga desde 97 % y con la 5 h alta', () => {
  expect(filaRitmo(rs(96, 90, true), h5(30), AHORA)?.texto).toContain('xhigh ok')
  expect(filaRitmo(rs(97, 90, true), h5(30), AHORA)?.texto).not.toContain('xhigh ok')
  expect(filaRitmo(rs(85, 90, true), h5(70), AHORA)?.texto).not.toContain('xhigh ok')
})

test('xhigh ok: sin la ventana de 5 h o con la 5 h vencida no lo muestra', () => {
  expect(filaRitmo(rs(25, 40), undefined, AHORA)?.texto).toBe('semana 25% · ritmo 40% · −15')
  expect(filaRitmo(rs(85, 90, true), undefined, AHORA)?.texto).not.toContain('xhigh ok')
  expect(filaRitmo(rs(25, 40), { usado: 10, reinicio: AHORA }, AHORA)?.texto).not.toContain('xhigh ok')
  expect(filaRitmo(rs(25, 40), { usado: 10, reinicio: AHORA - 60 }, AHORA)?.texto).not.toContain('xhigh ok')
})

test('xhigh ok: la 5 h alta en gracia (reinicio en menos de 15 min) no lo impide', () => {
  expect(filaRitmo(rs(25, 40), h5(90, 14 * 60), AHORA)?.texto).toContain('xhigh ok')
  expect(filaRitmo(rs(25, 40), h5(90, 15 * 60), AHORA)?.texto).not.toContain('xhigh ok')
})

test('ritmo: despuesDelCorte marca si ya pasó el corte del jueves', () => {
  expect(ritmoSemana(semana(52, '2026-11-12T23:00:00+01:00'), AHORA, undefined, UTC1)?.despuesDelCorte).toBe(false)
  const l = { actualizado: ep('2026-11-13T00:00:00+01:00'), seven_day: { usado: 52, reinicio: ep('2026-11-13T00:30:00+01:00') } }
  expect(ritmoSemana(l, ep('2026-11-13T00:00:00+01:00'), undefined, UTC1)?.despuesDelCorte).toBe(true)
})

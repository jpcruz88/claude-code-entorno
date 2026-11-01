import { expect, test } from 'claude-code/testing'

import { COSTUMES, CRAB_CSS, PANE_CSS, agentSvg, barraTexto, compactSvg, crab, ctxBarra, gridTiles, headerSvg, plannedSvg, rowSvg } from '../hooks/savvy-dibujo'
import { type AgenteRun, type Flujo, nuevoFlujo } from '../hooks/savvy-core'

const flujo = (over: Partial<Flujo> = {}): Flujo => ({ ...nuevoFlujo(), title: 'migrar', total: 4, done: 1, running: 2, phase: 'delegate', tasks: [], ...over })

const agente = (over: Partial<AgenteRun> = {}): AgenteRun => ({
  id: 'r1',
  agentId: 'a1',
  type: 'savvy-heavy',
  description: 'revisar auth',
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: 0,
  contextTokens: 250_000,
  contextMax: 1_000_000,
  tokens: 300_000,
  costUsd: 1.5,
  steps: 3,
  round: 1,
  ...over,
})

// --- la barra del flujo

test('la fila del flujo lleva el título, el porcentaje y la etiqueta', () => {
  const s = rowSvg(flujo(), 400, true)
  expect(s.includes('migrar')).toBe(true)
  expect(s.includes('25%')).toBe(true)
  expect(s.includes('Tareas 1/4')).toBe(true)
})

test('un flujo terminado usa el verde y dice Listo', () => {
  const s = rowSvg(flujo({ isFinished: true }), 400, false)
  expect(s.includes('#5fbf8f')).toBe(true)
  expect(s.includes('Listo')).toBe(true)
  expect(s.includes('100%')).toBe(true)
})

test('sin total la barra no dibuja NaN', () => {
  const s = rowSvg(flujo({ total: 0, done: 0, running: 0 }), 400, false)
  expect(s.includes('NaN')).toBe(false)
  expect(s.includes('undefined')).toBe(false)
})

test('el título con marcas HTML sale escapado', () => {
  const s = rowSvg(flujo({ title: '<b>x</b>' }), 400, false)
  expect(s.includes('<b>x</b>')).toBe(false)
  expect(s.includes('&lt;b&gt;')).toBe(true)
})

test('la barra del flujo respeta reducir movimiento', () => {
  expect(rowSvg(flujo(), 400, true).includes('prefers-reduced-motion')).toBe(true)
})

// --- filas de agente

test('la fila de un agente muestra la descripción, el nivel en español y el modelo', () => {
  const s = agentSvg(400, agente(), 10_000)
  expect(s.includes('revisar auth')).toBe(true)
  expect(s.includes('pesado')).toBe(true)
  expect(s.includes('Opus 5.5')).toBe(true)
})

test('sin pasos reportados la barra usa el contexto en gris', () => {
  const s = agentSvg(400, agente({ stepTotal: undefined }), 10_000)
  expect(s.includes('class="m"')).toBe(true)
})

test('con pasos reportados la barra sigue el avance y muestra la nota', () => {
  const s = agentSvg(400, agente({ stepTotal: 4, stepDone: 2, stepNote: 'leyendo' }), 10_000)
  expect(s.includes('2/4 · leyendo')).toBe(true)
})

test('un agente terminado muestra la marca de hecho y su barra llena', () => {
  const s = agentSvg(400, agente({ status: 'done', endedAt: 5000 }), 10_000)
  expect(s.includes('M')).toBe(true)
  expect(s.includes('class="m"')).toBe(false)
})

test('un agente fallido lleva la palabra error', () => {
  expect(agentSvg(400, agente({ status: 'failed', endedAt: 5000 }), 10_000).includes('error')).toBe(true)
})

// --- planificados

test('una tarea planificada muestra su número, título y nivel', () => {
  const s = plannedSvg(400, { title: 'docs', tier: 'light', after: [1], n: 2 })
  expect(s.includes('2. docs')).toBe(true)
  expect(s.includes('ligero')).toBe(true)
  expect(s.includes('después de 1')).toBe(true)
})

// --- cabecera y compacto

test('la cabecera muestra costo, tokens y tiempo', () => {
  const s = headerSvg(400, 'migrar', { cost: 1.25, tokens: 12_000, time: 65_000 })
  expect(s.includes('Costo')).toBe(true)
  expect(s.includes('≈$1.25')).toBe(true)
  expect(s.includes('12k')).toBe(true)
  expect(s.includes('1:05')).toBe(true)
})

test('el resumen compacto cuenta lo que no cabe', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => agente({ id: `r${i}`, agentId: `a${i}` }))
  const s = compactSvg(200, muchos, [], { cost: 0, tokens: 0, time: 0 })
  expect(s.includes('+')).toBe(true)
})

// --- rejilla y dibujos de cangrejo

test('la rejilla se parte en teselas de 4096 como mucho', () => {
  expect(gridTiles(5000)).toEqual([4096, 904])
  expect(gridTiles(100)).toEqual([100])
})

test('un nivel desconocido dibuja el cangrejo base', () => {
  expect(crab(0, 0, 'nivel-raro').includes('c-nivel-raro')).toBe(true)
})

test('un cangrejo en marcha lleva la clase run y su disfraz', () => {
  const s = crab(0, 0, 'careful', false, true)
  expect(s.includes('c-careful run')).toBe(true)
})

test('no hay disfraz astronauta: el nivel fable no existe', () => {
  expect(Object.keys(COSTUMES)).not.toContain('fable')
})

test('el CSS de los cangrejos y del panel respeta reducir movimiento', () => {
  expect(CRAB_CSS.includes('prefers-reduced-motion')).toBe(true)
  expect(PANE_CSS.includes('prefers-reduced-motion')).toBe(true)
})

test('la barra de texto llena las celdas que corresponden', () => {
  expect(barraTexto(flujo({ total: 4, done: 2 }), 10)).toBe('█████░░░░░')
  expect(ctxBarra(50, 10)).toBe('█████░░░░░')
})

test('no hay dibujo de derecha a izquierda: el mod solo va en español', () => {
  expect(rowSvg(flujo(), 400, false).includes('direction="rtl"')).toBe(false)
  expect(agentSvg(400, agente(), 1000).includes('direction="rtl"')).toBe(false)
})

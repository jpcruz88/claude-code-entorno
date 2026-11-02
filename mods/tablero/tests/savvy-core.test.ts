import { expect, test } from 'claude-code/testing'

import {
  STEP_BRIEF,
  STEP_TOOL,
  TIER_COLOR,
  agregarRun,
  cargarFlujo,
  modoAbrir,
  cleanTasks,
  costOf,
  ctxOf,
  debeInstruirse,
  etiquetaFlujo,
  finRun,
  fitText,
  fmtCost,
  fmtTime,
  fmtTokens,
  instruccion,
  modelName,
  nivelDe,
  plannedOf,
  progresoRun,
  ratio,
  reportarPaso,
  totales,
  windowOf,
  nuevoFlujo,
  fusionarFlujo,
  esFlujoNuevo,
  ajustarUso,
  type AgentRun,
  type Flow,
} from '../hooks/savvy-core'

const cerca = (a: number, b: number) => expect(Math.abs(a - b) < 1e-6).toBe(true)

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: 'r1',
  agentId: 'a1',
  type: 'savvy-careful',
  description: 'revisar auth',
  model: 'claude-opus-5-5',
  status: 'running',
  startedAt: 0,
  contextTokens: 0,
  contextMax: 1_000_000,
  tokens: 0,
  costUsd: 0,
  steps: 0,
  round: 1,
  ...over,
})

const flujo = (over: Partial<Flow> = {}): Flow => ({
  title: 'migrar',
  total: 4,
  done: 1,
  running: 2,
  phase: 'delegate',
  isFinished: false,
  tasks: [],
  ...over,
})

// --- niveles y modelos

test('el nivel sale del nombre savvy-<nivel>; un nombre ajeno cuenta como otro', () => {
  expect(nivelDe('savvy-careful')).toBe('careful')
  expect(nivelDe('savvy-flow:savvy-heavy')).toBe('heavy')
  expect(nivelDe('Explore')).toBe('other')
  expect(nivelDe('savvy-fable')).toBe('other')
})

test('el nivel fable ya no existe: no tiene color propio', () => {
  expect(Object.keys(TIER_COLOR)).not.toContain('fable')
})

test('el nombre del modelo se lee en forma corta', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-5-5[1m]')).toBe('Haiku 5.5')
  expect(modelName('algo-raro')).toBe('algo-raro')
})

test('la ventana de contexto es 200k para Haiku 4 y Claude 3, 1M para el resto', () => {
  expect(windowOf('claude-haiku-4-5')).toBe(200_000)
  expect(windowOf('claude-3-opus')).toBe(200_000)
  expect(windowOf('claude-haiku-5-5')).toBe(1_000_000)
})

// --- costo

test('el costo usa la tarifa del modelo por millón de tokens', () => {
  // Opus 5.5: 4 USD entrada, 20 salida por millón.
  cerca(costOf('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 500_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, false), 14)
})

test('Haiku 5.5 con prompt de más de 100k tokens paga la tarifa larga', () => {
  const u = { input_tokens: 150_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  // 0,5 USD por millón de entrada en la tarifa larga, no 0,1.
  cerca(costOf('claude-haiku-5-5', u, true), 0.075)
  cerca(costOf('claude-haiku-5-5', u, false), 0.015)
})

test('un modelo sin tarifa conocida usa la tarifa por omisión', () => {
  cerca(costOf('modelo-nuevo', { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, false), 4)
})

test('los modelos fable y mythos no tienen tarifa propia en el mod', () => {
  const u = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  cerca(costOf('claude-fable-5-1', u, false), 4)
})

// --- formato

test('tokens, costo y tiempo se muestran en formato corto', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12_400)).toBe('12k')
  expect(fmtTokens(2_500_000)).toBe('2.5M')
  expect(fmtCost(0.256)).toBe('$0.26')
  expect(fmtCost(12.34)).toBe('$12.3')
  expect(fmtTime(65_000)).toBe('1:05')
  expect(fmtTime(3_725_000)).toBe('1:02:05')
  expect(fmtTime(-5)).toBe('0:00')
})

// --- flujo

test('un título nuevo empieza un flujo nuevo sin arrastrar contadores', () => {
  const previo = flujo({ title: 'viejo', done: 3 })
  expect(esFlujoNuevo(previo, { title: 'nuevo' })).toBe(true)
  const nuevo = fusionarFlujo(previo, { title: 'nuevo' })
  expect(nuevo.title).toBe('nuevo')
  expect(nuevo.done).toBe(0)
})

test('un flujo terminado se reemplaza al reportar otro', () => {
  expect(esFlujoNuevo(flujo({ isFinished: true }), {})).toBe(true)
})

test('los campos que no vienen conservan su valor previo', () => {
  const previo = flujo({ done: 2, total: 5 })
  const f = fusionarFlujo(previo, { done: 3 })
  expect(f.done).toBe(3)
  expect(f.total).toBe(5)
  expect(f.title).toBe('migrar')
})

test('finished: true cierra el flujo y lo lleva a la fase de cierre', () => {
  const f = fusionarFlujo(flujo(), { finished: true })
  expect(f.isFinished).toBe(true)
  expect(f.phase).toBe('close')
})

test('done no pasa del total', () => {
  expect(fusionarFlujo(flujo(), { total: 3, done: 9 }).done).toBe(3)
})

test('la fase desconocida se ignora', () => {
  expect(fusionarFlujo(flujo({ phase: 'design' }), { phase: 'raro' as never }).phase).toBe('design')
})

test('la etiqueta muestra la fase o el conteo de tareas', () => {
  expect(etiquetaFlujo(flujo({ phase: 'plan' }))).toBe('Plan')
  expect(etiquetaFlujo(flujo({ phase: 'design' }))).toBe('Diseño')
  expect(etiquetaFlujo(flujo({ phase: 'delegate', done: 1, total: 4 }))).toBe('Tareas 1/4')
  expect(etiquetaFlujo(flujo({ phase: 'review', done: 2, total: 4 }))).toBe('Revisión 2/4')
  expect(etiquetaFlujo(flujo({ phase: 'delegate', total: 0, running: 2 }))).toBe('Tareas 2 en marcha')
  expect(etiquetaFlujo(flujo({ isFinished: true }))).toBe('Listo')
})

test('la proporción es 1 cuando el flujo está terminado y done/total si no', () => {
  expect(ratio(flujo({ isFinished: true }))).toBe(1)
  expect(ratio(flujo({ done: 1, total: 4 }))).toBe(0.25)
  expect(ratio(flujo({ total: 0 }))).toBe(0)
})

test('las tareas se limpian: sin título fuera, nivel desconocido vacío, después solo enteros positivos', () => {
  const t = cleanTasks([
    { title: '  uno ', tier: 'savvy-light', after: [1, -1, 2.5, 3] },
    { title: '   ', tier: 'medium' },
    { title: 'dos', tier: 'savvy-fable' },
  ])
  expect(t).toEqual([
    { title: 'uno', tier: 'light', after: [1, 3] },
    { title: 'dos', tier: '', after: [] },
  ])
})

test('la lista de tareas tiene un máximo de 200', () => {
  const muchas = Array.from({ length: 250 }, (_, i) => ({ title: `t${i}`, tier: 'light' }))
  expect(cleanTasks(muchas)?.length).toBe(200)
})

test('un progreso sin tareas deja la lista como estaba', () => {
  const previo = flujo({ tasks: [{ title: 'a', tier: '', after: [] }] })
  expect(fusionarFlujo(previo, { done: 1 }).tasks).toEqual(previo.tasks)
})

test('nuevoFlujo parte de cero', () => {
  expect(nuevoFlujo()).toEqual({ title: 'savvy-flow', total: 0, done: 0, running: 0, phase: 'plan', isFinished: false, tasks: [] })
})

test('cargarFlujo tolera un estado sin tareas', () => {
  expect(cargarFlujo(null)).toBeNull()
  expect(cargarFlujo({ title: 'x' } as never)).toEqual({ title: 'x', tasks: [] })
})

// --- agentes

test('las tareas planificadas que ya tienen un agente no salen en la lista', () => {
  const f = flujo({ tasks: [{ title: 'revisar auth', tier: 'careful', after: [] }, { title: 'docs', tier: 'light', after: [] }] })
  const lista = [run({ description: 'Revisar  Auth' })]
  expect(plannedOf(f, lista).map(p => p.title)).toEqual(['docs'])
  expect(plannedOf(f, lista)[0]?.n).toBe(2)
})

test('un flujo terminado no tiene tareas planificadas', () => {
  expect(plannedOf(flujo({ isFinished: true, tasks: [{ title: 'a', tier: '', after: [] }] }), [])).toEqual([])
})

test('agregarRun guarda como mucho 200 agentes, los más nuevos', () => {
  let lista: AgentRun[] = []
  for (let i = 0; i < 205; i++) lista = agregarRun(lista, run({ id: `r${i}` }))
  expect(lista.length).toBe(200)
  expect(lista[199]?.id).toBe('r204')
})

test('agregarRun no duplica un id', () => {
  const lista = agregarRun([run({ id: 'x', description: 'viejo' })], run({ id: 'x', description: 'nuevo' }))
  expect(lista.length).toBe(1)
  expect(lista[0]?.description).toBe('nuevo')
})

test('finRun marca el agente como terminado o fallido según la razón', () => {
  const lista = [run({ agentId: 'a1' })]
  expect(finRun(lista, 'a1', 'answer', 900, undefined).find(a => a.agentId === 'a1')?.status).toBe('done')
  expect(finRun(lista, 'a1', 'error', 900, undefined).find(a => a.agentId === 'a1')?.status).toBe('failed')
})

test('finRun sin pasos vistos toma la suma del turno', () => {
  const uso = { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const a = finRun([run({ agentId: 'a1', steps: 0 })], 'a1', 'answer', 1200, uso)[0]
  expect(a?.tokens).toBe(1500)
  expect(a?.endedAt).toBe(1200)
  expect(a?.costUsd).toBeGreaterThan(0)
})

test('ajustarUso suma tokens y costo de cada paso y cuenta el paso', () => {
  const uso = { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 }
  const a = ajustarUso(run({ contextMax: 1_000_000 }), uso, 'claude-opus-5-5', 'high')
  expect(a.contextTokens).toBe(3600)
  expect(a.tokens).toBe(3600)
  expect(a.steps).toBe(1)
  expect(a.effort).toBe('high')
  expect(a.costUsd).toBeGreaterThan(0)
})

test('reportarPaso fija total y hechos, y devuelve si encontró al agente', () => {
  const r = reportarPaso([run({ agentId: 'a1' })], 'a1', { total: 4, done: 9, note: '  leyendo  ' })
  expect(r.encontrado).toBe(true)
  expect(r.lista[0]?.stepTotal).toBe(4)
  expect(r.lista[0]?.stepDone).toBe(4)
  expect(r.lista[0]?.stepNote).toBe('leyendo')
  expect(reportarPaso([run({ agentId: 'a1' })], 'otro', { done: 1 }).encontrado).toBe(false)
})

test('el progreso del agente: terminado lleno, con pasos la proporción, si no null', () => {
  expect(progresoRun(run({ status: 'done' }))).toBe(1)
  expect(progresoRun(run({ stepTotal: 4, stepDone: 1 }))).toBe(0.25)
  expect(progresoRun(run())).toBeNull()
})

test('el contexto del agente es un porcentaje de la ventana, acotado a 100', () => {
  expect(ctxOf(run({ contextTokens: 250_000, contextMax: 1_000_000 }))).toBe(25)
  expect(ctxOf(run({ contextTokens: 2_000_000, contextMax: 1_000_000 }))).toBe(100)
  expect(ctxOf(run({ contextMax: 0 }))).toBe(0)
})

test('totales suma costo y tokens y mide desde el primer inicio hasta el último fin', () => {
  const t = totales(
    [run({ startedAt: 1000, endedAt: 3000, costUsd: 0.5, tokens: 100 }), run({ id: 'b', startedAt: 2000, costUsd: 0.25, tokens: 50 })],
    5000,
  )
  cerca(t.cost, 0.75)
  expect(t.tokens).toBe(150)
  expect(t.time).toBe(4000)
  expect(totales([], 0)).toEqual({ cost: 0, tokens: 0, time: 0 })
})

// --- instrucción a los trabajadores

test('solo los subagentes savvy-* reciben la instrucción de reportar pasos', () => {
  expect(debeInstruirse('savvy-careful', 'hola')).toBe(true)
  expect(debeInstruirse('Explore', 'hola')).toBe(false)
  expect(debeInstruirse('savvy-careful', `hola ${STEP_TOOL}`)).toBe(false)
})

test('la instrucción nombra la herramienta de pasos y empieza con un salto de línea', () => {
  expect(STEP_BRIEF.startsWith('\n')).toBe(true)
  expect(instruccion('x')).toBe('x' + STEP_BRIEF)
  expect(STEP_BRIEF).toContain(STEP_TOOL)
})

// --- pasos del flujo desde la herramienta progress

test('cleanTasks devuelve undefined si no hay lista', () => {
  expect(cleanTasks(undefined)).toBeUndefined()
})

test('modoAbrir acepta solo savvy, any u off; cualquier otro valor cae en any', () => {
  expect(modoAbrir('any')).toBe('any')
  expect(modoAbrir('off')).toBe('off')
  expect(modoAbrir('savvy')).toBe('savvy')
  expect(modoAbrir('Any')).toBe('any')
  expect(modoAbrir(undefined)).toBe('any')
  expect(modoAbrir(42)).toBe('any')
})

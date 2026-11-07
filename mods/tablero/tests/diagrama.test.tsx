import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// La vista en diagrama: lead, asesor, caja JEV, tarjetas en abanico y vuelta al lead. Se mide con el árbol dibujado.

const SESION = 'sesion-diagrama'
const BASE = Date.parse('2026-11-06T10:00:00+01:00')

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

// Una línea de decisión tal como la escribe guard-subagentes.py.
const decision = (i: number, tipo: string, opcion: string, confianza: number, sharp: boolean): string =>
  JSON.stringify({
    hora: new Date(BASE + i * 1000).toISOString(),
    session_id: SESION,
    tipo,
    opcion,
    confianza,
    sharp,
    claude: 'haiku',
    aplicada: true,
    descripcion: 'buscar',
  })

const motor = (on: On, decisiones: string | null) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: SESION }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', () => {
    if (decisiones === null) throw new Error('ENOENT')
    return { value: decisiones }
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id ?? 'a' }))
}

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }, descripcion: string, id: string) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: descripcion,
    subagentType: 'general-purpose',
    tool_use_id: id,
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

const terminar = ($: { turn: { complete: (e: never) => Promise<unknown> } }, agentId: string) =>
  $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: `T-${agentId}`, agentId, reason: 'answer' } as never)

// ---------------------------------------------------------------- medida del ancho (como en heredadas.test.ts)

type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isDrawn = (n: unknown): n is Drawn => typeof n === 'object' && n !== null && typeof (n as Drawn).type === 'string'
const cellsOf = (s: string) => [...s].length
const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : isDrawn(n) ? (n.children ?? []).map(textOf).join('') : ''
const spaceOf = (v: unknown) => (typeof v === 'number' ? v : v === undefined ? 0 : 1)
const longestWord = (s: string) => Math.max(0, ...s.split(/\s+/).map(cellsOf))
const needs = (n: unknown, out: string[], path: string): number => {
  if (typeof n === 'string') return longestWord(n)
  if (!isDrawn(n)) return 0
  const p = n.props ?? {}
  const here = `${path}/${String(p.key ?? n.type)}`
  if (n.type === 'Text') return p.wrap === undefined ? cellsOf(textOf(n)) : p.wrap === 'wrap' ? longestWord(textOf(n)) : 1
  if (n.type === 'Button') return cellsOf(String(p.label ?? '')) + (p.plain ? (p.hotkey ? 3 : 0) : 4)
  if (n.type === 'Client') return typeof p.width === 'number' ? p.width : 5
  if (n.type !== 'Box') return 0
  const kids = (n.children ?? []).filter(c => c !== null && c !== undefined && c !== false && c !== '')
  const inner = kids.map((c, i) => needs(c, out, `${here}[${i}]`))
  const isColumn = p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
  const content =
    isColumn || p.flexWrap === 'wrap'
      ? Math.max(0, ...inner)
      : inner.reduce((a, b) => a + b, 0) + spaceOf(p.columnGap ?? p.gap) * Math.max(0, inner.length - 1)
  const need = content + (p.borderStyle ? 2 : 0) + 2 * spaceOf(p.paddingX ?? p.padding)
  const margin = spaceOf(p.marginLeft) + spaceOf(p.marginRight) + 2 * spaceOf(p.marginX)
  if (typeof p.width === 'number') {
    if (need > p.width) out.push(`${here}: needs ${need} in ${p.width}`)
    return p.width + margin
  }
  return (p.overflow === 'hidden' ? 0 : need) + margin
}
const spillsOf = (tree: unknown, columns: number) => {
  const out: string[] = []
  const need = needs(tree, out, '')
  if (need > columns) out.push(`root: needs ${need} in ${columns}`)
  return out
}

// ---------------------------------------------------------------- pruebas

test('auto con 66 columnas usa diagrama', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D1' })
  await lanzar($, 'revisar auth', 'd1')
  const ui = await $.ui.mount(pane(66) as never)
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeDefined()
  await ui.unmount()
})

test('auto con 65 usa la disposición apilada', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D2' })
  await lanzar($, 'revisar auth', 'd2')
  const ui = await $.ui.mount(pane(65) as never)
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeUndefined()
  expect(await ui.find({ text: /agentes ·/ })).toBeDefined()
  await ui.unmount()
})

test('caja JEV con tres filas y total 1,382', async ($, on) => {
  const lineas = [
    ...Array.from({ length: 1000 }, (_, i) => decision(i, 'modelo', 'sonnet', 0.94, true)),
    ...Array.from({ length: 300 }, (_, i) => decision(1000 + i, 'esfuerzo', 'high', 0.86, true)),
    ...Array.from({ length: 82 }, (_, i) => decision(1300 + i, 'reintento', 'reintentar', 0.64, false)),
  ]
  motor(on, lineas.join('\n'))
  await lanzar($, 'revisar auth', 'd2')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /^JEV/ })).toBeDefined()
  expect(await ui.find({ text: /^1,382$/ })).toBeDefined()
  expect(await ui.find({ text: /qué modelo/ })).toBeDefined()
  expect(await ui.find({ text: /qué esfuerzo/ })).toBeDefined()
  expect(await ui.find({ text: /reintentar o parar/ })).toBeDefined()
  expect(await ui.find({ text: /^0\.94$/ })).toBeDefined()
  expect(await ui.find({ text: /^0\.86$/ })).toBeDefined()
  expect(await ui.find({ text: /^0\.64$/ })).toBeDefined()
  expect(await ui.find({ text: /^split$/ })).toBeDefined()
  expect(await ui.find({ text: /sharp → se aplica en código · split → decide Claude/ })).toBeDefined()
  await ui.unmount()
})

test('sin decisiones aún', async ($, on) => {
  motor(on, null)
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /^JEV/ })).toBeDefined()
  expect(await ui.find({ text: /sin decisiones aún/ })).toBeDefined()
  expect(await ui.find({ text: /qué modelo/ })).toBeUndefined()
  await ui.unmount()
})

test('vuelta al lead solo con todas las tarjetas terminadas', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'V1' })
  await lanzar($, 'primera', 'v1')
  await lanzar($, 'segunda', 'v2')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /de vuelta al lead/ })).toBeUndefined()
  await terminar($, 'v1')
  await ui.unmount()
  const medio = await $.ui.mount(pane(100) as never)
  expect(await medio.find({ text: /de vuelta al lead/ })).toBeUndefined()
  await medio.unmount()
  await terminar($, 'v2')
  const listo = await $.ui.mount(pane(100) as never)
  expect(await listo.find({ text: /de vuelta al lead · revisar y verificar/ })).toBeDefined()
  await listo.unmount()
})

test('con 66 columnas ninguna línea pasa del ancho', async ($, on) => {
  motor(on, [decision(0, 'modelo', 'sonnet', 0.94, true), decision(1, 'reintento', 'parar', 0.64, false)].join('\n'))
  await $.turn.start({ text: 'go', turnId: 'W1' })
  await lanzar($, 'Escribir las pruebas de regresión del cargador de configuración', 'w1')
  await lanzar($, 'Mapear cada llamada a la forma anterior', 'w2')
  await lanzar($, 'Revisar el camino de migración del estado guardado', 'w3')
  await terminar($, 'w1')
  const failures: string[] = []
  for (const cols of [66, 90]) {
    const ui = await $.ui.mount(pane(cols) as never)
    for (const s of spillsOf(await ui.drawn(), cols)) failures.push(`${cols}: ${s}`)
    await ui.unmount()
  }
  expect(failures).toEqual([])
})

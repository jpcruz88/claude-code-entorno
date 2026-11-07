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

// ---------------------------------------------------------------- medida (estimador, no render real)
// El arnés no trae un render de texto: `ui.drawn()` es el árbol. Aquí se estima el ancho y el alto de ese árbol.
// Un Text con `truncate` ocupa lo que le deje su caja (cap); un Text sin `wrap` ocupa su texto entero.

type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isDrawn = (n: unknown): n is Drawn => typeof n === 'object' && n !== null && typeof (n as Drawn).type === 'string'
const cellsOf = (s: string) => [...s].length
const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : isDrawn(n) ? (n.children ?? []).map(textOf).join('') : ''
const spaceOf = (v: unknown) => (typeof v === 'number' ? v : v === undefined ? 0 : 1)
const longestWord = (s: string) => Math.max(0, ...s.split(/\s+/).map(cellsOf))
const kidsOf = (n: Drawn) => (n.children ?? []).filter(c => c !== null && c !== undefined && c !== false && c !== '')
const isTruncado = (p: Record<string, unknown>) => typeof p.wrap === 'string' && p.wrap.startsWith('truncate')

/** Ancho que pide `n` dentro de una caja de `cap` columnas; empuja a `out` lo que no cabe en una caja con ancho fijo. */
const needs = (n: unknown, out: string[], path: string, cap: number): number => {
  if (typeof n === 'string') return Math.min(cellsOf(n), cap)
  if (!isDrawn(n)) return 0
  const p = n.props ?? {}
  const here = `${path}/${String(p.key ?? n.type)}`
  if (n.type === 'Text') {
    if (p.wrap === undefined) return cellsOf(textOf(n))
    if (p.wrap === 'wrap') return longestWord(textOf(n))
    return Math.min(cellsOf(textOf(n)), cap)
  }
  if (n.type === 'Button') return cellsOf(String(p.label ?? '')) + (p.plain ? (p.hotkey ? 3 : 0) : 4)
  if (n.type === 'Client') return typeof p.width === 'number' ? p.width : 5
  if (n.type !== 'Box') return 0
  const margin = spaceOf(p.marginLeft) + spaceOf(p.marginRight) + 2 * spaceOf(p.marginX)
  const bordes = (p.borderStyle ? 2 : 0) + 2 * spaceOf(p.paddingX ?? p.padding)
  const dentro = Math.max(0, (typeof p.width === 'number' ? p.width : cap) - bordes - margin)
  const kids = kidsOf(n)
  const isColumn = p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
  const gap = spaceOf(p.columnGap ?? p.gap)
  let content: number
  if (isColumn || p.flexWrap === 'wrap') {
    content = Math.max(0, ...kids.map((c, i) => needs(c, out, `${here}[${i}]`, dentro)))
  } else {
    // Lo que no se trunca va primero; los Text truncados ocupan lo que sobre.
    const fijos = kids.map((c, i) => (isDrawn(c) && c.type === 'Text' && isTruncado(c.props ?? {}) ? null : needs(c, out, `${here}[${i}]`, dentro)))
    const sumaFijos = fijos.reduce<number>((a, b) => a + (b ?? 0), 0) + gap * Math.max(0, kids.length - 1)
    const resto = Math.max(0, dentro - sumaFijos)
    content = kids.reduce<number>((a, c, i) => a + (fijos[i] ?? needs(c, out, `${here}[${i}]`, resto)), 0) + gap * Math.max(0, kids.length - 1)
  }
  const need = content + bordes
  if (typeof p.width === 'number') {
    if (need > p.width) out.push(`${here}: needs ${need} in ${p.width}`)
    return p.width + margin
  }
  // Sin ancho fijo, la caja ocupa lo que pide su contenido (no todo lo disponible).
  return (p.overflow === 'hidden' ? 0 : need) + margin
}

/** Alto que ocupa `n` en una caja de `cap` columnas (Text con wrap="wrap" puede ocupar varias filas). */
const heightOf = (n: unknown, cap: number): number => {
  if (typeof n === 'string') return 1
  if (!isDrawn(n)) return 0
  const p = n.props ?? {}
  if (n.type === 'Text') {
    if (p.wrap === 'wrap') return Math.max(1, Math.ceil(cellsOf(textOf(n)) / Math.max(1, cap)))
    return 1
  }
  if (n.type === 'Client') return typeof p.height === 'number' ? p.height : 1
  if (n.type !== 'Box') return 1
  const margenV = (typeof p.marginTop === 'number' ? p.marginTop : 0) + (typeof p.marginBottom === 'number' ? p.marginBottom : 0)
  const bordes = (p.borderStyle ? 2 : 0)
  const ancho = (typeof p.width === 'number' ? p.width : cap) - (p.borderStyle ? 2 : 0) - 2 * spaceOf(p.paddingX ?? p.padding)
  const kids = kidsOf(n)
  const isColumn = p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
  const alturas = kids.map(c => heightOf(c, Math.max(1, ancho)))
  const alto = kids.length === 0 ? 0 : isColumn ? alturas.reduce((a, b) => a + b, 0) : Math.max(...alturas)
  return alto + bordes + margenV
}

const spillsOf = (tree: unknown, columns: number) => {
  const out: string[] = []
  const need = needs(tree, out, '', columns)
  if (need > columns) out.push(`root: needs ${need} in ${columns}`)
  return out
}

/** La caja del registro de sesión: su título y, debajo, una fila por línea mostrada. */
const registroDe = (n: unknown): Drawn | null => {
  if (!isDrawn(n)) return null
  const kids = kidsOf(n)
  if (kids.length > 0 && textOf(kids[0]) === 'registro de sesión') return n
  for (const c of kids) {
    const hallada = registroDe(c)
    if (hallada) return hallada
  }
  return null
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

const paneCon = (bodyColumns: number, bodyRows = 70) => ({
  ...pane(bodyColumns),
  props: { ...pane(bodyColumns).props, scroll: { offset: 0, bodyRows } },
})

const decisionesLlenas = [
  ...Array.from({ length: 1000 }, (_, i) => decision(i, 'modelo', 'sonnet', 0.94, true)),
  ...Array.from({ length: 300 }, (_, i) => decision(1000 + i, 'esfuerzo', 'high', 0.86, true)),
  ...Array.from({ length: 82 }, (_, i) => decision(1300 + i, 'reintento', 'reintentar', 0.64, false)),
].join('\n')

const TITULOS = ['Escribir las pruebas de regresión del cargador de configuración', 'Mapear cada llamada a la forma anterior', 'Revisar el camino de migración del estado guardado']

test('asesor de guardia visible en el diagrama aunque no haya consultas', async ($, on) => {
  motor(on, null)
  const ui = await $.ui.mount(pane(66) as never)
  expect(await ui.find({ text: /^ASESOR · de guardia$/ })).toBeDefined()
  expect(await ui.find({ text: /aún sin consultas/ })).toBeDefined()
  await ui.unmount()
})

test('sin el panel architect en panels no hay asesor en el diagrama', { options: { panels: 'main,jev,agents,log' } }, async ($, on) => {
  motor(on, null)
  const ui = await $.ui.mount(pane(66) as never)
  expect(await ui.find({ text: /^ASESOR/ })).toBeUndefined()
  await ui.unmount()
})

test('con 66 y 90 columnas ninguna línea pasa del ancho, con títulos largos y la caja JEV llena', async ($, on) => {
  motor(on, decisionesLlenas)
  await $.turn.start({ text: 'go', turnId: 'W1' })
  for (const [i, t] of TITULOS.entries()) await lanzar($, t, `w${i + 1}`)
  await terminar($, 'w1')
  const failures: string[] = []
  for (const cols of [66, 90]) {
    const ui = await $.ui.mount(paneCon(cols) as never)
    for (const s of spillsOf(await ui.drawn(), cols)) failures.push(`${cols}: ${s}`)
    await ui.unmount()
  }
  expect(failures).toEqual([])
})

test('el diagrama cabe en la altura del panel: conectores y vuelta cuentan en el presupuesto del registro', async ($, on) => {
  motor(on, decisionesLlenas)
  await $.turn.start({ text: 'go', turnId: 'H1' })
  for (const [i, t] of TITULOS.entries()) await lanzar($, t, `h${i + 1}`)
  for (const i of [1, 2, 3]) await terminar($, `h${i}`)
  const fallos: string[] = []
  for (let filas = 24; filas <= 60; filas += 1) {
    const ui = await $.ui.mount(paneCon(66, filas) as never)
    const arbol = await ui.drawn()
    const registro = registroDe(arbol)
    const lineas = registro ? kidsOf(registro).length - 1 : 0
    const alto = heightOf(arbol, 66)
    // Si el registro ya está en su mínimo (4 líneas) no hay presupuesto que recortar.
    if (alto > filas && lineas > 4) fallos.push(`${filas} filas: alto ${alto} con ${lineas} líneas de registro`)
    await ui.unmount()
  }
  expect(fallos).toEqual([])
})

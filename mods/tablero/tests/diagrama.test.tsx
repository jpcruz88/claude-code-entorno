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

const motor = (on: On, decisiones: string | null, limites: string | null = null, ahoraMs: number = BASE) => {
  const reloj = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: SESION }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', (_$, e) => {
    const texto = String((e as { path?: string }).path ?? '').endsWith('limites.json') ? limites : decisiones
    if (texto === null) throw new Error('ENOENT')
    return { value: texto }
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id ?? 'a' }))
  return () => reloj.set(ahoraMs)
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


// ---------------------------------------------------------------- pruebas

test('layout diagrama con 66 columnas usa diagrama', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D1' })
  await lanzar($, 'revisar auth', 'd1')
  const ui = await $.ui.mount(pane(66) as never)
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeDefined()
  await ui.unmount()
})

test('auto en panel inline con 80 columnas usa diagrama (no el resumen)', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D0' })
  await lanzar($, 'revisar auth', 'd0')
  const ui = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement: 'inline' as const } } as never)
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeDefined()
  await ui.unmount()
})

test('con 100 columnas o más se dibuja la rejilla de la propuesta: con REGISTRO y sin la línea antigua', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D100' })
  await lanzar($, 'revisar auth', 'd100')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /REGISTRO/ })).toBeDefined()
  expect(await ui.find({ text: /de vuelta al lead/ })).toBeDefined()
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeUndefined()
  await ui.unmount()
})

test('con 100 columnas y sin trabajo la franja grande dice EN ESPERA y el pie lleva versión y autor', async ($, on) => {
  motor(on, null)
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /E N   E S P E R A/ })).toBeDefined()
  expect(await ui.find({ text: /sin trabajo · el lead espera/ })).toBeDefined()
  expect(await ui.find({ text: /tablero v\d+\.\d+\.\d+ · desarrollado por/ })).toBeDefined()
  expect(await ui.find({ text: /SIN TAREAS/ })).toBeDefined()
  await ui.unmount()
})

test('con 100 columnas y un agente en curso la franja grande dice TRABAJANDO', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'F1' })
  await lanzar($, 'revisar auth', 'f1')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /T R A B A J A N D O/ })).toBeDefined()
  expect(await ui.find({ text: /E N   E S P E R A/ })).toBeUndefined()
  await ui.unmount()
})

test('auto acoplado entre 40 y 99 columnas dibuja el mapa apilado al ancho del panel', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D4' })
  await lanzar($, 'revisar auth', 'd4')
  for (const cols of [40, 66, 99]) {
    const ui = await $.ui.mount(pane(cols) as never)
    expect(await ui.find({ text: /REGISTRO/ })).toBeDefined()
    expect(await ui.find({ text: /AGENTES 1/ })).toBeDefined()
    expect(await ui.find({ text: /delegar a subagentes/ })).toBeUndefined()
    for (const s of spillsOf(await ui.drawn(), cols)) throw new Error(`${cols}: ${s}`)
    await ui.unmount()
  }
})

test('auto con menos de 40 columnas usa la disposición apilada de siempre', async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D2' })
  await lanzar($, 'revisar auth', 'd2')
  const ui = await $.ui.mount(pane(39) as never)
  expect(await ui.find({ text: /delegar a subagentes/ })).toBeUndefined()
  expect(await ui.find({ text: /agentes ·/ })).toBeDefined()
  await ui.unmount()
})

test('caja JEV con tres filas y total 1,382', { options: { layout: 'diagrama' } }, async ($, on) => {
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

// ---------------------------------------------------------------- fila de ritmo en la caja JEV
// El reinicio cae el próximo jueves a las 23:00 (hora local del sistema) y ahora es justo a mitad de la semana: el corte
// coincide con el reinicio, así que el ritmo es 45 % en cualquier zona horaria y los colores no dependen de dónde corra.
const seg = (ms: number) => Math.floor(ms / 1000)
const reinicioSemana = () => {
  const d = new Date(BASE)
  d.setHours(23, 0, 0, 0)
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7))
  return seg(d.getTime())
}
const MITAD_SEMANA_S = 3.5 * 86400
const AHORA_RITMO = reinicioSemana() * 1000 - MITAD_SEMANA_S * 1000
const limitesJson = (usado: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ actualizado: seg(AHORA_RITMO) - 60, five_hour: { usado: 10, reinicio: seg(AHORA_RITMO) + 3600 }, seven_day: { usado, reinicio: reinicioSemana() }, ...extra })
const unaDecision = () => decision(0, 'modelo', 'sonnet', 0.94, true)

test('la caja JEV muestra la fila de ritmo con el exceso', { options: { layout: 'diagrama' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(52), AHORA_RITMO)
  await fijar()
  await lanzar($, 'revisar auth', 'r1')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /^semana 52% · ritmo 45% · \+7$/ })).toBeDefined()
  await ui.unmount()
})

const colorDeFila = async ($: Parameters<Parameters<typeof test>[1]>[0], usado: number) => {
  await lanzar($, 'revisar auth', `c${usado}`)
  const ui = await $.ui.mount(pane(100) as never)
  const nodo = (await ui.find({ text: new RegExp(`^semana ${usado}% `) })) as { props?: { color?: string } } | undefined
  await ui.unmount()
  return nodo?.props?.color
}

// Ritmo 45 %: 1 % queda 44 puntos por debajo, 55 % está 10 por encima y 70 % está 25 por encima.
test('la fila de ritmo va en verde con el uso por debajo del ritmo', { options: { layout: 'diagrama', palette: 'theme' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(1), AHORA_RITMO)
  await fijar()
  expect(await colorDeFila($, 1)).toBe('success')
})

test('la fila de ritmo va en ámbar de 5 a 15 puntos por encima', { options: { layout: 'diagrama', palette: 'theme' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(55), AHORA_RITMO)
  await fijar()
  expect(await colorDeFila($, 55)).toBe('warning')
})

test('la fila de ritmo va en rojo con más de 15 puntos por encima', { options: { layout: 'diagrama', palette: 'theme' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(70), AHORA_RITMO)
  await fijar()
  expect(await colorDeFila($, 70)).toBe('error')
})

const sinFila = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  await lanzar($, 'revisar auth', 'n1')
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /^semana \d+%/ })).toBeUndefined()
  expect(await ui.find({ text: /^JEV/ })).toBeDefined()
  await ui.unmount()
}

test('sin limites.json no hay fila de ritmo', { options: { layout: 'diagrama' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), null, AHORA_RITMO)
  await fijar()
  await sinFila($)
})

test('con limites.json roto no hay fila de ritmo', { options: { layout: 'diagrama' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), '{"actualizado": 17', AHORA_RITMO)
  await fijar()
  await sinFila($)
})

test('con un dato de más de 6 h no hay fila de ritmo', { options: { layout: 'diagrama' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(52, { actualizado: seg(AHORA_RITMO) - 6 * 3600 - 5 }), AHORA_RITMO)
  await fijar()
  await sinFila($)
})

test('con el reinicio de la semana vencido no hay fila de ritmo', { options: { layout: 'diagrama' } }, async ($, on) => {
  const fijar = motor(on, unaDecision(), limitesJson(52, { seven_day: { usado: 52, reinicio: seg(AHORA_RITMO) } }), AHORA_RITMO)
  await fijar()
  await sinFila($)
})

test('sin decisiones aún', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on, null)
  const ui = await $.ui.mount(pane(100) as never)
  expect(await ui.find({ text: /^JEV/ })).toBeDefined()
  expect(await ui.find({ text: /sin decisiones aún/ })).toBeDefined()
  expect(await ui.find({ text: /qué modelo/ })).toBeUndefined()
  await ui.unmount()
})

test('vuelta al lead solo con todas las tarjetas terminadas', { options: { layout: 'diagrama' } }, async ($, on) => {
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

test('asesor de guardia visible en el diagrama aunque no haya consultas', { options: { layout: 'diagrama' } }, async ($, on) => {
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

test('con motion off el conector de la columna es texto │, sin módulo animado', { options: { motion: 'off', layout: 'diagrama' } }, async ($, on) => {
  motor(on, null)
  await $.turn.start({ text: 'go', turnId: 'D3' })
  await lanzar($, 'revisar auth', 'd3')
  const ui = await $.ui.mount(pane(66) as never)
  expect(await ui.find({ text: /^│$/ })).toBeDefined()
  await ui.unmount()
})

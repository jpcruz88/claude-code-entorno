import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: {
    title: 'Flightdeck',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

const engine = (on: On) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ag1' }))
  return reloj
}

const encargo = {
  prompt: 'Write the parser tests',
  description: 'Write the parser tests',
  subagentType: 'general-purpose',
  tool_use_id: 'tu1',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

// Texto plano de un nodo del árbol que dibuja el motor (Box/Text con children anidados).
const texto = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map(texto).join('')
  if (n && typeof n === 'object' && 'children' in n) return texto((n as { children: unknown }).children)
  return ''
}

// La luna del agente: el nodo más pequeño que contiene una luna (el emoji de estado de su fila).
const LUNA = /[🌑🌒🌓🌔🌕🌖🌗🌘]/u
const lunaDe = (arbol: unknown): string | undefined => {
  const hijos = (n: unknown): unknown[] =>
    n && typeof n === 'object' && Array.isArray((n as { children?: unknown }).children) ? (n as { children: unknown[] }).children : []
  const busca = (n: unknown): string | undefined => {
    if (!LUNA.test(texto(n))) return undefined
    for (const h of hijos(n)) {
      const r = busca(h)
      if (r !== undefined) return r
    }
    return texto(n)
  }
  return busca(arbol)
}

test('con animación apagada, la luna del agente no cambia mientras trabaja', { options: { banda: true, animacion: false } }, async ($, on) => {
  const reloj = engine(on)
  await $.turn.start({ text: 'go', turnId: 'P1' })
  await $.agent.spawn(encargo as never)
  let ui = await $.ui.mount(pane(64) as never)
  const primera = lunaDe(await ui.drawn())
  expect(primera).toBeDefined()
  // Ocho pasos de 250 ms; se vuelve a montar para que el panel se dibuje con la hora nueva.
  for (let k = 0; k < 8; k += 1) await reloj.advance(250)
  await ui.unmount()
  ui = await $.ui.mount(pane(64) as never)
  expect(lunaDe(await ui.drawn())).toBe(primera)
  await ui.unmount()
})

test('control: con animación encendida, la luna sí gira', { options: { banda: true } }, async ($, on) => {
  const reloj = engine(on)
  await $.turn.start({ text: 'go', turnId: 'P2' })
  await $.agent.spawn(encargo as never)
  let ui = await $.ui.mount(pane(64) as never)
  const primera = lunaDe(await ui.drawn())
  // Un paso de 250 ms: la luna avanza a la siguiente fase.
  await reloj.advance(250)
  await ui.unmount()
  ui = await $.ui.mount(pane(64) as never)
  expect(lunaDe(await ui.drawn())).not.toBe(primera)
  await ui.unmount()
})

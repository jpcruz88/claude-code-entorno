import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { PANE_AGENTES } from '../hooks/savvy-core'

const PANEL = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: PANE_AGENTES,
  surface: 'terminal' as const,
  props: {
    title: 'Agentes',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
}

const encargo = {
  prompt: 'haz el trabajo',
  description: 'revisar auth',
  subagentType: 'general-purpose',
  tool_use_id: 'tu1',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

const motor = (on: On) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>motor</Text>
  })
  return reloj
}

// Texto del resumen del panel: incluye el tiempo total, que depende de la hora que guarda el reloj.
const texto = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map(texto).join('')
  if (n && typeof n === 'object' && 'children' in n) return texto((n as { children: unknown }).children)
  return ''
}
// El tiempo total del resumen («… tokens · 0:05»): el dato que cambia cuando el reloj guarda una hora nueva.
const resumenDe = async (ui: { drawn: () => Promise<unknown> }) => /tokens · (\d+:\d\d)/.exec(texto(await ui.drawn()))?.[1] ?? ''

test('con un agente en marcha, el tiempo del panel avanza con el reloj', async ($, on) => {
  const reloj = motor(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(encargo as never)
  let ui = await $.ui.mount(PANEL as never)
  const antes = await resumenDe(ui)
  await ui.unmount()
  await reloj.advance(5_000)
  ui = await $.ui.mount(PANEL as never)
  expect(await resumenDe(ui)).not.toBe(antes)
  await ui.unmount()
})

test('al terminar la sesión, el tiempo del panel deja de avanzar', async ($, on) => {
  const reloj = motor(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(encargo as never)
  await reloj.advance(1_000)
  await $.session.end({ reason: 'exit', sessionId: 's' } as never)
  let ui = await $.ui.mount(PANEL as never)
  const tras = await resumenDe(ui)
  await ui.unmount()
  await reloj.advance(10_000)
  ui = await $.ui.mount(PANEL as never)
  expect(await resumenDe(ui)).toBe(tras)
  await ui.unmount()
})

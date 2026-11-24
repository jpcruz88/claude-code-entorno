import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Conexión con el motor de agent.offer y SubagentHandback: la lógica está probada en manejadores-puros.test.ts;
// aquí se prueba que register.tsx la engancha a cada evento. ui.fault no tiene prueba de conexión: el kit no expone
// `$.ui.fault` (su `$.ui` trae render, scroll, focus, press, input, select y mount) y un Client que falla hace que
// `mount` rechace en vez de lanzar el evento. Su lógica (anotarFallo) sí está probada.

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

const engine = (on: On) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/srv/demo' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  return clock
}

const spawn = (subagentType: string, description: string, id: string) => ({
  prompt: description,
  description,
  subagentType,
  tool_use_id: id,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

const ofrecer = (agent: string, description: string) => ({
  agent,
  description,
  source: 'plugin',
  provider: { plugin: 'engine', tier: 'core' as const },
})

test(
  'agent.offer: un tipo cuya descripción coincide con el patrón cuenta como asesor al lanzarse',
  { options: { layout: 'diagrama', matchDescriptions: true } },
  async ($, on) => {
    engine(on)
    on('agent.offer', () => ({ isOffered: true }))
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'rev1' }))
    await $.agent.offer(ofrecer('revisor', 'architect que revisa el plan') as never)
    await $.turn.start({ text: 'plan', turnId: 'O1' })
    await $.agent.spawn(spawn('revisor', 'revisa el plan', 'o1') as never)
    const ui = await $.ui.mount({ ...pane(100) })
    expect(await ui.find({ text: /asesorando/ })).toBeDefined()
    await ui.unmount()
  },
)

test(
  'agent.offer: sin la oferta, el mismo tipo no es asesor',
  { options: { layout: 'diagrama', matchDescriptions: true } },
  async ($, on) => {
    engine(on)
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'rev2' }))
    await $.turn.start({ text: 'plan', turnId: 'O2' })
    await $.agent.spawn(spawn('revisor', 'revisa el plan', 'o2') as never)
    const ui = await $.ui.mount({ ...pane(100) })
    expect(await ui.find({ text: /asesorando/ })).toBeUndefined()
    await ui.unmount()
  },
)

test('SubagentHandback: el informe de un asesor en segundo plano queda como su consejo', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'adv9' }))
  await $.turn.start({ text: 'plan', turnId: 'H1' })
  await $.agent.spawn(spawn('advisor', 'revisa el plan', 'h0') as never)
  await $.tool.call({ tool: 'SubagentHandback', agentId: 'adv9', message: 'Recomiendo separar el parser', tool_use_id: 'h1' } as never)
  const ui = await $.ui.mount({ ...pane(100) })
  expect(await ui.find({ text: /separar el parser/ })).toBeDefined()
  await ui.unmount()
})

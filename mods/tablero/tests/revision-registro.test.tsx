import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Revisión: lo que pasa en `register` (asesor, paneles, tarjetas, permisos automáticos, ui.fault). Se prueba con el
// motor de pruebas: cada prueba habla con los hooks como lo haría Claude Code.

const pane = (bodyColumns: number, surface: 'terminal' | 'desktop' = 'terminal', placement: 'dock' | 'inline' = 'dock') => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns, placement, scroll: { offset: 0, bodyRows: 70 }, view: {} },
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

let spawnN = 0
const spawn = (subagentType: string, description: string, id?: string) => ({
  prompt: description,
  description,
  subagentType,
  tool_use_id: id ?? `tu${++spawnN}`,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

test('al terminar el turno del lead, un asesor interrumpido deja de figurar «asesorando»', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'adv1' }))
  await $.turn.start({ text: 'plan', turnId: 'V1' })
  await $.agent.spawn(spawn('advisor', 'revisa el plan'))
  const antes = await $.ui.mount({ ...pane(100) })
  expect(await antes.find({ text: /asesorando/ })).toBeDefined()
  await antes.unmount()
  // Esc: el turno del lead termina sin que llegue la respuesta del asesor.
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 'V1', reason: 'aborted' } as never)
  const ui = await $.ui.mount({ ...pane(100) })
  expect(await ui.find({ text: /asesorando/ })).toBeUndefined()
  await ui.unmount()
})

test('al reiniciar la sesión, una consulta a medias no sigue «asesorando»', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'adv2' }))
  await $.session.start({ cwd: '/srv/demo', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ text: 'plan', turnId: 'V2' })
  await $.agent.spawn(spawn('advisor', 'revisa el plan'))
  await $.session.start({ cwd: '/srv/demo', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...pane(100) })
  expect(await ui.find({ text: /asesorando/ })).toBeUndefined()
  await ui.unmount()
})

test('un asesor reanudado vuelve a «asesorando» y su consulta se reabre', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'adv3' }))
  await $.turn.start({ text: 'plan', turnId: 'V3' })
  await $.agent.spawn(spawn('advisor', 'revisa el plan', 'adv3'))
  await $.turn.complete({ answer: 'listo', durationMs: 5, isAborted: false, turnId: 'V3', reason: 'answer', agentId: 'adv3' } as never)
  await $.agent.spawn(spawn('advisor', 'revisa otra vez', 'adv3'))
  const ui = await $.ui.mount({ ...pane(100) })
  expect(await ui.find({ text: /asesorando/ })).toBeDefined()
  await ui.unmount()
})

test('una tarea que falló sin dar ningún paso dice «fallido», no «iniciando»', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'f1' }))
  await $.turn.start({ text: 'go', turnId: 'F1' })
  await $.agent.spawn(spawn('general-purpose', 'tarea rota', 'f1'))
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 'F1', reason: 'error', agentId: 'f1' } as never)
  const ui = await $.ui.mount({ ...pane(100) })
  expect(await ui.find({ text: /iniciando/ })).toBeUndefined()
  expect(await ui.find({ text: /fallido/ })).toBeDefined()
  await ui.unmount()
})

test('panels sin agents: la vista mini no dibuja las tarjetas ni su línea de más', { options: { layout: 'mini', panels: 'main,gate' } }, async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `p${++n}` }))
  await $.turn.start({ text: 'go', turnId: 'P1' })
  for (const d of ['uno', 'dos', 'tres', 'cuatro']) await $.agent.spawn(spawn('general-purpose', `tarea ${d}`))
  const ui = await $.ui.mount({ ...pane(80, 'terminal', 'inline') })
  expect(await ui.find({ text: /tarea uno/ })).toBeUndefined()
  expect(await ui.find({ text: /agentes más/ })).toBeUndefined()
  await ui.unmount()
})

test('panels sin architect: la vista mini no nombra al asesor', { options: { layout: 'mini', panels: 'main,agents' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'mx' }))
  await $.turn.start({ text: 'plan', turnId: 'M2' })
  await $.agent.spawn(spawn('advisor', 'revisa', 'mx'))
  const ui = await $.ui.mount({ ...pane(80, 'terminal', 'inline') })
  expect(await ui.find({ text: /· asesor/ })).toBeUndefined()
  await ui.unmount()
})

test('la línea de tiempo del escritorio se dibuja con agentes, y no sin el panel agents', { options: { layout: 'diagrama' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 's1' }))
  await $.turn.start({ text: 'go', turnId: 'S1' })
  await $.agent.spawn(spawn('general-purpose', 'tarea uno', 's1'))
  const con = await $.ui.mount({ ...pane(100, 'desktop') })
  expect(await con.find({ type: 'Svg' })).toBeDefined()
  await con.unmount()
})

test('panels sin agents: la línea de tiempo del escritorio no se dibuja', { options: { layout: 'diagrama', panels: 'main,gate,jev' } }, async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 's2' }))
  await $.turn.start({ text: 'go', turnId: 'S2' })
  await $.agent.spawn(spawn('general-purpose', 'tarea uno', 's2'))
  const ui = await $.ui.mount({ ...pane(100, 'desktop') })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('en modo automático, un ask decidido por el clasificador no aparece en la franja mientras su llamada no termina', async ($, on) => {
  engine(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'auto1' }))
  await $.agent.spawn({ ...spawn('general-purpose', 'revisar'), permissionMode: 'auto' } as never)
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k2' } as never)
  const ui = await $.ui.mount({ ...pane(80, 'terminal', 'inline'), props: { ...pane(80, 'terminal', 'inline').props, view: {} } })
  expect(await ui.find({ text: /pendiente/ })).toBeUndefined()
  expect(await ui.find({ text: /TE ESPERA|T E   E S P E R A/ })).toBeUndefined()
  await ui.unmount()
})

test('un compacto de la sesión suma a la vista mini', { options: { layout: 'mini' } }, async ($, on) => {
  engine(on)
  on('session.compact', (_$, e) => ({ ...e, value: undefined }))
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hola', toolUses: [] }] } as never)
  const ui = await $.ui.mount({ ...pane(80, 'terminal', 'inline') })
  expect(await ui.find({ text: /⟲1/ })).toBeDefined()
  await ui.unmount()
})


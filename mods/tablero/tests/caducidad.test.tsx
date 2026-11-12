import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Estados que deben caducar: un turno o un agente «en curso» de un proceso que ya no existe, y un permiso
// pendiente que nadie va a responder.

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
}

const motor = (on: On) => {
  const reloj = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: 's' }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id ?? 'a' }))
  return reloj
}

const iniciar = ($: { session: { start: (e: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }, id: string) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: 'revisar auth',
    subagentType: 'general-purpose',
    tool_use_id: id,
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

/** El texto de un árbol dibujado, sin colores. */
const plano = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : n && typeof n === 'object' && Array.isArray((n as { children?: unknown[] }).children)
      ? (n as { children: unknown[] }).children.map(plano).join('')
      : ''

const texto = async ($: { ui: { mount: (p: never) => Promise<{ drawn: () => Promise<unknown>; unmount: () => Promise<void> }> } }) => {
  const ui = await $.ui.mount(pane as never)
  const s = plano(await ui.drawn())
  await ui.unmount()
  return s
}

test('un nuevo session.start apaga el turno y los agentes «en curso» del proceso anterior', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await lanzar($, 'a1')
  const antes = await texto($)
  expect(antes).toContain('en curso')
  expect(antes).toContain('T R A B A J A N D O')
  // Cierre brusco: no hubo turn.complete. El siguiente proceso arranca con lo guardado.
  await iniciar($)
  const despues = await texto($)
  expect(despues).not.toContain('en curso')
  expect(despues).not.toContain('T R A B A J A N D O')
  expect(despues).toContain('detenido')
})

test('un permiso pendiente se retira cuando termina el turno del lead', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1' } as never)
  expect(await texto($)).toContain('T E   E S P E R A')
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 'T1', reason: 'aborted' } as never)
  const s = await texto($)
  expect(s).not.toContain('T E   E S P E R A')
  expect(s).toMatch(/0 pend\./)
})

test('un permiso pendiente se retira con un nuevo session.start', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1' } as never)
  await iniciar($)
  const s = await texto($)
  expect(s).not.toContain('T E   E S P E R A')
  expect(s).toMatch(/0 pend\./)
})

test('con tres fallos seguidos y el lead aún en su turno, la franja no dice DETENIDO', async ($, on) => {
  const reloj = motor(on)
  on('tool.call', () => ({ result: {}, text: 'falló', isError: true }))
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  for (const id of ['c1', 'c2', 'c3']) await $.tool.call({ tool: 'Bash', input: { command: 'false' }, tool_use_id: id } as never)
  const s = await texto($)
  expect(s).toContain('T R A B A J A N D O')
  expect(s).not.toContain('D E T E N I D O')
})

// En modo automático un `ask` lo responde el clasificador, no la persona: no hay diálogo que contestar.

/** Deja el modo de permisos en automático: lo trae el lanzamiento de un agente del lead. */
const modoAuto = ($: { agent: { spawn: (e: never) => Promise<unknown> } }) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: 'revisar auth',
    subagentType: 'general-purpose',
    tool_use_id: 'auto1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    permissionMode: 'auto',
  } as never)

test('en modo automático un ask no deja la franja en TE ESPERA ni cuenta como pendiente', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await modoAuto($)
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1' } as never)
  const s = await texto($)
  expect(s).not.toContain('T E   E S P E R A')
  expect(s).toMatch(/0 pend\./)
})

test('en modo automático, la llamada con ask entra al recuento cuando termina', { options: { layout: 'mini' } }, async ($, on) => {
  const reloj = motor(on)
  on('tool.call', () => ({ result: {} }))
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await modoAuto($)
  await $.tool.call({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1' } as never)
  const s = await texto($)
  expect(s).toContain('1 auto')
  expect(s).not.toContain('pendiente')
})

test('el permiso pendiente de un subagente se retira cuando ese subagente termina', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await lanzar($, 'a1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1', agentId: 'a1' } as never)
  expect(await texto($)).toContain('T E   E S P E R A')
  await $.turn.complete({ answer: 'listo', durationMs: 10, isAborted: false, turnId: 'T2', reason: 'answer', agentId: 'a1' } as never)
  const s = await texto($)
  expect(s).not.toContain('T E   E S P E R A')
  expect(s).toMatch(/0 pend\./)
})

test('el permiso pendiente de un subagente no se retira cuando termina otro subagente', async ($, on) => {
  const reloj = motor(on)
  await reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await lanzar($, 'a1')
  await lanzar($, 'a2')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1', agentId: 'a1' } as never)
  await $.turn.complete({ answer: 'listo', durationMs: 10, isAborted: false, turnId: 'T2', reason: 'answer', agentId: 'a2' } as never)
  expect(await texto($)).toContain('T E   E S P E R A')
})

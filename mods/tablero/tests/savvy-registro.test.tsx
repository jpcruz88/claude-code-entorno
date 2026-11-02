import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { PANE_AGENTES, PROGRESS_TOOL, STEP_TOOL } from '../hooks/savvy-core'

const BARRA = (overrides: Record<string, unknown> = {}) => ({
  plugin: 'tablero',
  component: 'AbovePrompt' as const,
  surface: 'terminal' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
    ...overrides,
  },
})

const PANEL = (bodyColumns = 100) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: PANE_AGENTES,
  surface: 'terminal' as const,
  props: {
    title: 'Agentes',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

const motor = (on: On, prompts: string[] = []) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('agent.spawn', (_$, e) => {
    prompts.push(e.prompt)
    return { model: 'claude-opus-5-5', agentId: 'a1' }
  })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>motor</Text>
  })
}

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }, tipo: string, descripcion: string) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: descripcion,
    subagentType: tipo,
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

// --- instrucción a los subagentes

test('un subagente savvy-* recibe la instrucción de reportar pasos al final de su encargo', async ($, on) => {
  const prompts: string[] = []
  motor(on, prompts)
  await lanzar($, 'savvy-careful', 'revisar auth')
  expect(prompts[0]?.includes(STEP_TOOL)).toBe(true)
  expect(prompts[0]?.startsWith('haz el trabajo')).toBe(true)
})

test('un subagente ajeno a savvy no cambia su encargo', async ($, on) => {
  const prompts: string[] = []
  motor(on, prompts)
  await lanzar($, 'Explore', 'mirar el repo')
  expect(prompts[0]).toBe('haz el trabajo')
})

// --- progreso sobre el prompt

test('el progreso que reporta la sesión principal aparece sobre el prompt', async ($, on) => {
  motor(on)
  await $.tool.call({ tool: PROGRESS_TOOL, title: 'migrar base', total: 4, done: 1, phase: 'delegate' } as never)
  const ui = await $.ui.mount(BARRA())
  expect(await ui.find({ text: /migrar base/ })).toBeDefined()
  expect(await ui.find({ text: /Tareas 1\/4/ })).toBeDefined()
  await ui.unmount()
})

test('un subagente no puede cambiar el progreso de la sesión principal', async ($, on) => {
  motor(on)
  const r = await $.tool.call({ tool: PROGRESS_TOOL, agentId: 'a1', title: 'otro título' } as never)
  expect(JSON.stringify(r).includes('ignored')).toBe(true)
  const ui = await $.ui.mount(BARRA())
  expect(await ui.find({ text: /otro título/ })).toBeUndefined()
  await ui.unmount()
})

// --- agentes: pasos del trabajador y panel

test('el paso que reporta un trabajador aparece en su fila del panel', async ($, on) => {
  motor(on)
  await lanzar($, 'savvy-careful', 'revisar auth')
  await $.tool.call({ tool: STEP_TOOL, agentId: 'a1', done: 2, total: 4, note: 'leyendo' } as never)
  const ui = await $.ui.mount(PANEL())
  expect(await ui.find({ text: /2\/4/ })).toBeDefined()
  expect(await ui.find({ text: /leyendo/ })).toBeDefined()
  await ui.unmount()
})

test('el panel lista el agente en marcha y, al terminar, en terminados', async ($, on) => {
  motor(on)
  await lanzar($, 'savvy-careful', 'revisar auth')
  let ui = await $.ui.mount(PANEL())
  expect(await ui.find({ text: /En marcha · 1/ })).toBeDefined()
  expect(await ui.find({ text: /revisar auth/ })).toBeDefined()
  await ui.unmount()

  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', agentId: 'a1', reason: 'answer' } as never)
  ui = await $.ui.mount(PANEL())
  expect(await ui.find({ text: /Terminados · 1/ })).toBeDefined()
  expect(await ui.find({ text: /En marcha/ })).toBeUndefined()
  await ui.unmount()
})

test('el panel muestra el nivel en español, no en inglés', async ($, on) => {
  motor(on)
  await lanzar($, 'savvy-heavy', 'auditar')
  const ui = await $.ui.mount(PANEL())
  expect(await ui.find({ text: /pesado/ })).toBeDefined()
  await ui.unmount()
})

// --- la opción de abrir el panel solo

test('por defecto, lanzar un trabajador savvy-* abre el panel solo', async ($, on) => {
  motor(on)
  let abiertos = 0
  on('ui.open', () => {
    abiertos += 1
    return { value: { isPlaced: true as const } }
  })
  await lanzar($, 'savvy-careful', 'revisar auth')
  expect(abiertos).toBe(1)
})

test('por defecto, lanzar cualquier subagente abre el panel solo', async ($, on) => {
  motor(on)
  let abiertos = 0
  on('ui.open', () => {
    abiertos += 1
    return { value: { isPlaced: true as const } }
  })
  await lanzar($, 'general-purpose', 'revisar auth')
  expect(abiertos).toBe(1)
})

test('con agentesAbrir apagado, lanzar un trabajador no abre el panel solo', { options: { agentesAbrir: 'off' } }, async ($, on) => {
  motor(on)
  let abiertos = 0
  on('ui.open', () => {
    abiertos += 1
    return { value: { isPlaced: true as const } }
  })
  await lanzar($, 'savvy-careful', 'revisar auth')
  await $.tool.call({ tool: PROGRESS_TOOL, title: 'migrar', total: 2, done: 0, tasks: [{ title: 'uno', tier: 'light' }] } as never)
  expect(abiertos).toBe(0)
})

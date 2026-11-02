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

test('lanzar un trabajador savvy-* no abre ninguna pestaña de agentes', async ($, on) => {
  motor(on)
  const abiertos: string[] = []
  on('ui.open', (_$, e) => {
    abiertos.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  await lanzar($, 'savvy-careful', 'revisar auth')
  expect(abiertos.filter(id => id === PANE_AGENTES)).toEqual([])
})

test('lanzar cualquier subagente no abre ninguna pestaña de agentes', async ($, on) => {
  motor(on)
  const abiertos: string[] = []
  on('ui.open', (_$, e) => {
    abiertos.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  await lanzar($, 'general-purpose', 'revisar auth')
  expect(abiertos.filter(id => id === PANE_AGENTES)).toEqual([])
})


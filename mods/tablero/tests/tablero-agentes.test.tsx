import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { nombreDeTipo } from '../hooks/nombres'

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
}

const motor = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
}

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: 'revisar auth',
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

test('un subagente terminado sigue en Tablero', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await lanzar($)
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', agentId: 'a1', reason: 'answer' } as never)
  const ui = await $.ui.mount(pane as never)
  expect(await ui.find({ text: /revisar auth/ })).toBeDefined()
  await ui.unmount()
})

test('los tipos de Claude Code se nombran en español; uno desconocido queda igual', () => {
  expect(nombreDeTipo('general-purpose')).toBe('propósito general')
  expect(nombreDeTipo('Explore')).toBe('explorar')
  expect(nombreDeTipo('mi-agente')).toBe('mi-agente')
})

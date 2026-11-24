import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Lo que entra de fuera (la descripción de un subagente, la revisión «Al día») llega a la pantalla
// sin controles de terminal ni secretos, y un archivo demasiado grande no se toma como dato.

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
}

const motor = (on: On, archivos: Record<string, string | null> = {}) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: 's' }))
  on('env.get', () => ({ value: '/srv/demo' }))
  on('fs.read', (_$, e) => {
    const texto = archivos[String(e.path).split('/').pop() ?? '']
    if (texto === null || texto === undefined) throw new Error('ENOENT')
    return { value: texto }
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  return reloj
}

const visible = async ($: { ui: { mount: (p: never) => Promise<{ find: (q: never) => Promise<unknown>; unmount: () => Promise<void> }> } }, re: RegExp) => {
  const ui = await $.ui.mount(pane as never)
  const hallado = await ui.find({ text: re } as never)
  await ui.unmount()
  return hallado
}

test('la descripción de un subagente sale sin controles ni secretos', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await $.agent.spawn({
    prompt: 'haz el trabajo',
    description: 'revisar\x1b[2J auth con password=hunter2',
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)
  expect(await visible($, /revisar/)).toBeDefined()
  expect(await visible($, /\x1b/)).toBeUndefined()
  expect(await visible($, /hunter2/)).toBeUndefined()
})

test('una revisión «Al día» mayor que el tope no se muestra; una normal sí', async ($, on) => {
  const archivos: Record<string, string | null> = {}
  motor(on, archivos)
  const ahora = Date.now()
  const fila = { version: 1, ts: Math.floor(ahora / 1000), cambios: [], fallos: [{ nombre: 'skill-x', tipo: 'skill', error: 'e' }], pendientes: [], al_dia: 0 }
  archivos['resultado.json'] = JSON.stringify(fila)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  expect(await visible($, /skill-x/)).toBeDefined()
  archivos['resultado.json'] = JSON.stringify({ ...fila, relleno: 'a'.repeat(2_000_000) })
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', reason: 'answer' } as never)
  expect(await visible($, /skill-x/)).toBeUndefined()
})

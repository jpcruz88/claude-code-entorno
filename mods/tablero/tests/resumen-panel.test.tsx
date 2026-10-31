import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: {
    title: 'Tablero',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

const motor = (on: On, cwd = 'C:\\Proyectos\\mods\\mi-carpeta') => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
}

const medir = ($: { session: { measure: (x: never) => Promise<unknown> } }) =>
  $.session.measure({
    context: { window: 200_000, tokens: 100_000, percent: 50 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 19, resetsAt: new Date(3 * 3_600_000 + 10 * 60_000).toISOString() }],
    cost: { usd: 1.2 },
    changed: ['context', 'rateLimits'],
  } as never)

test('la franja al pie del panel muestra carpeta, contexto, costo y uso como el footer', async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /^tablero: \$1\.20 · ctx 50% · uso 19% \(3 h 10 min\)$/ })).toBeDefined()
  expect(await ui.find({ text: /📁 mi-carpeta · ctx 50% · \$1\.20 · sesión 19% ↻ 3h10m/ })).toBeDefined()
  await ui.unmount()
})

test('la franja muestra el modo de permisos que registró el mod', async ($, on) => {
  motor(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'p1' }))
  await $.agent.spawn({
    prompt: 'x',
    description: 'tarea',
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    permissionMode: 'bypassPermissions',
  } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /⏵⏵ bypass permissions on/ })).toBeDefined()
  await ui.unmount()
})

test('las ediciones de la sesión suman las líneas +/− de la franja', async ($, on) => {
  motor(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b\nc' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/y.ts', content: 'uno\ndos\n' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /\+4 −1/ })).toBeDefined()
  await ui.unmount()
})

test('una llamada que no edita no suma líneas', async ($, on) => {
  motor(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.tool.call({ tool: 'Read', file_path: '/x.ts' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /\+\d+ −\d+/ })).toBeUndefined()
  await ui.unmount()
})

test('/clear reinicia las líneas +/−', async ($, on) => {
  motor(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b\nc' } as never)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /\+\d+ −\d+/ })).toBeUndefined()
  await ui.unmount()
})

// ---------------------------------------------------------------- panel SESIÓN

const sesionStart = (on: On) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', () => ({ value: 'ref: refs/heads/main\n' }))
}

test('el panel SESIÓN cuenta herramientas, archivos y servidores MCP de la sesión', async ($, on) => {
  motor(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/b.ts' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/p/hecho.ts', old_string: 'a', new_string: 'b' } as never)
  await $.tool.call({ tool: 'mcp__context7__query-docs' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /^sesión$/ })).toBeDefined()
  expect(await ui.find({ text: /Read 2 · Edit 1/ })).toBeDefined()
  expect(await ui.find({ text: /hecho\.ts/ })).toBeDefined()
  expect(await ui.find({ text: /context7 1/ })).toBeDefined()
  await ui.unmount()
})

test('el panel SESIÓN no ocupa lugar mientras no hay nada que contar', async ($, on) => {
  motor(on)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /^sesión$/ })).toBeUndefined()
  await ui.unmount()
})

test('un skill usado queda en el panel SESIÓN', async ($, on) => {
  motor(on)
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  await $.skill.prompt({ skill: 'caveman', text: 'x', frontmatter: {}, source: 'built-in' } as never)
  await $.skill.prompt({ skill: 'caveman', text: 'x', frontmatter: {}, source: 'built-in' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /caveman ×2/ })).toBeDefined()
  await ui.unmount()
})

test('al iniciar, la rama se lee de .git/HEAD y el panel no muestra hooks', async ($, on) => {
  motor(on)
  sesionStart(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await medir($)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /⎇ main/ })).toBeDefined()
  expect(await ui.find({ text: /disparados|SessionStart ×/ })).toBeUndefined()
  await ui.unmount()
})

test('sin repositorio la rama no sale y no rompe el inicio', async ($, on) => {
  motor(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await medir($)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /⎇/ })).toBeUndefined()
  await ui.unmount()
})

test('/clear reinicia el panel SESIÓN', async ($, on) => {
  motor(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /^sesión$/ })).toBeUndefined()
  await ui.unmount()
})

test('con el panel angosto las líneas de la franja se parten en vez de cortarse', async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(pane(40))
  expect(await ui.find({ text: /^tablero: / })).toBeDefined()
  expect(await ui.find({ text: /3 h 10 min\)/ })).toBeDefined()
  expect(await ui.find({ text: /…/ })).toBeUndefined()
  await ui.unmount()
})

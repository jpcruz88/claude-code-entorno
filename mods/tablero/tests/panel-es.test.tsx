import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { carpetaDe, limitLabel, momentLabel, parseConfig, plural, statusLabel } from '../hooks/core'

// ---------------------------------------------------------------- piezas puras

test('openOnStart es true por defecto y se puede apagar', () => {
  expect(parseConfig({}).openOnStart).toBe(true)
  expect(parseConfig({ openOnStart: false }).openOnStart).toBe(false)
})

test('carpetaDe devuelve solo el nombre final, sin importar el separador, y lo trunca', () => {
  expect(carpetaDe('C:\\Proyectos\\mods\\tablero', 20)).toBe('tablero')
  expect(carpetaDe('/home/ana/proyecto/', 20)).toBe('proyecto') // privacidad-ok gitleaks:allow
  expect(carpetaDe('C:\\', 20)).toBe('C:')
  expect(carpetaDe('', 20)).toBe('')
  expect(carpetaDe('/x/una-carpeta-con-un-nombre-muy-largo', 12)).toBe('una-carpeta…')
  expect(carpetaDe('/x/abc', 0)).toBe('')
})

test('los textos auxiliares salen en español', () => {
  expect(plural(1, 'edición', 'ediciones')).toBe('1 edición')
  expect(plural(2, 'edición', 'ediciones')).toBe('2 ediciones')
  expect(plural(0, 'error', 'errores')).toBe('0 errores')
  expect(momentLabel('before a plan')).toBe('antes de un plan')
  expect(momentLabel('error repeats')).toBe('errores repetidos')
  expect(momentLabel('before done')).toBe('antes de terminar')
  expect(statusLabel('running')).toBe('en curso')
  expect(statusLabel('done')).toBe('listo')
  expect(statusLabel('failed')).toBe('fallido')
  expect(statusLabel('stopped')).toBe('detenido')
  expect(limitLabel('spend_limit')).toBe('gasto')
})

// ---------------------------------------------------------------- panel completo

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

const motor = (on: On, cwd: string | Promise<string> = 'C:\\Proyectos\\mods\\mi-carpeta') => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: cwd as string }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  return reloj
}

test('el panel principal muestra la carpeta actual, solo el nombre final', async ($, on) => {
  motor(on)
  for (const cols of [40, 64, 120]) {
    const ui = await $.ui.mount(pane(cols))
    expect(await ui.find({ text: /carpeta/ })).toBeDefined()
    expect(await ui.find({ text: /mi-carpeta/ })).toBeDefined()
    expect(await ui.find({ text: /Proyectos/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('una carpeta de nombre largo se trunca y no rompe el ancho del panel', async ($, on) => {
  motor(on, 'C:\\p\\una-carpeta-con-un-nombre-larguisimo-que-no-cabe')
  const ui = await $.ui.mount(pane(40))
  expect(await ui.find({ text: /una-carpeta-con-un-nombre-larguisimo-que-no-cabe/ })).toBeUndefined()
  expect(await ui.find({ text: /una-carpeta/ })).toBeDefined()
  await ui.unmount()
})

test('sin carpeta conocida el panel se dibuja igual', async ($, on) => {
  const reloj = mock.clock(on)
  void reloj
  on('ui.status', () => ({ value: undefined }))
  const ui = await $.ui.mount(pane(64))
  expect(await ui.find({ text: /principal$/ })).toBeDefined()
  await ui.unmount()
})

test('el panel principal junta costo, contexto, subagentes, permisos y uso con su reseteo', async ($, on) => {
  motor(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'p1' }))
  on('tool.check', () => ({ decision: 'ask' }))
  await $.session.measure({
    context: { window: 200_000, tokens: 100_000, percent: 50 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 19, resetsAt: new Date(3 * 3_600_000 + 10 * 60_000).toISOString() }],
    cost: { usd: 1.2 },
    changed: ['context', 'rateLimits'],
  } as never)
  await $.agent.spawn({
    prompt: 'x',
    description: 'tarea',
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'k1' })
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /costo/ })).toBeDefined()
  expect(await ui.find({ text: /\$1\.20/ })).toBeDefined()
  expect(await ui.find({ text: /contexto/ })).toBeDefined()
  expect(await ui.find({ text: /agentes 1\/1/ })).toBeDefined()
  expect(await ui.find({ text: /permisos 1/ })).toBeDefined()
  expect(await ui.find({ text: /19% ↻3h10m/ })).toBeDefined()
  await ui.unmount()
})

test('las etiquetas del panel principal están en español', async ($, on) => {
  motor(on)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /esfuerzo/ })).toBeDefined()
  expect(await ui.find({ text: /○ en espera/ })).toBeDefined()
  expect(await ui.find({ text: /0 respuestas/ })).toBeDefined()
  expect(await ui.find({ text: /\bsol\./ })).toBeUndefined()
  expect(await ui.find({ text: /\beffort\b/ })).toBeUndefined()
  expect(await ui.find({ text: /\bidle\b/ })).toBeUndefined()
  await ui.unmount()
})

// ---------------------------------------------------------------- abrir al iniciar

test('con las opciones por defecto el panel se abre al iniciar', async ($, on) => {
  motor(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  let abiertos = 0
  on('ui.open', () => (abiertos += 1, { value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(abiertos).toBe(1)
})

test('con openOnStart apagado el panel no se abre solo', { options: { openOnStart: false } }, async ($, on) => {
  motor(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  let abiertos = 0
  on('ui.open', () => (abiertos += 1, { value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(abiertos).toBe(0)
})

test('si el panel no se colocó al iniciar (terminal angosta), se abre al primer prompt, que cuenta como pedido', async ($, on) => {
  motor(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  let abiertos = 0
  on('ui.open', () => (abiertos += 1, { value: { isPlaced: false as const, reason: 'terminal angosta' } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(abiertos).toBe(1)
  await $.prompt.submit({ text: 'hola' })
  expect(abiertos).toBe(2)
  await $.prompt.submit({ text: 'otra vez' })
  expect(abiertos).toBe(2)
})

test('con openOnStart apagado el primer prompt no abre el panel', { options: { openOnStart: false } }, async ($, on) => {
  motor(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  let abiertos = 0
  on('ui.open', () => (abiertos += 1, { value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hola' })
  expect(abiertos).toBe(0)
})

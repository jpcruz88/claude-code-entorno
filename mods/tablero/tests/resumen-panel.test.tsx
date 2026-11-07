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

test('el pie del panel ya no muestra franja con carpeta ni costo', async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /📁 mi-carpeta/ })).toBeUndefined()
  expect(await ui.find({ text: /^tablero: / })).toBeUndefined()
  await ui.unmount()
})

test('la mascota vive en la tarjeta principal, con su vida según el contexto, y no hay panel SESIÓN', async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(pane(120))
  expect(await ui.find({ text: /^sesión$/ })).toBeUndefined()
  expect(await ui.find({ text: /vida 50%/ })).toBeDefined()
  await ui.unmount()
})

// ---------------------------------------------------------------- rama

const sesionStart = (on: On) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', () => ({ value: 'ref: refs/heads/main\n' }))
}

test('al iniciar, la rama se lee de .git/HEAD y se muestra bajo la carpeta, sin hooks', async ($, on) => {
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

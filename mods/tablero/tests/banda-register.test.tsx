import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { PASO_MS } from '../hooks/mascota'

const BANDA = (overrides: Record<string, unknown> = {}) => ({
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

const motor = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: 'C:\\Proyectos\\mods' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
}

// Lo que dibuja el motor cuando el mod cede: un texto reconocible.
const motorDibuja = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>motor</Text>
  })

const medir = ($: { session: { measure: (e: never) => Promise<unknown> } }) =>
  $.session.measure({
    context: { window: 1_000_000, tokens: 420_000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 63, resetsAt: new Date(2 * 3_600_000 + 10 * 60_000).toISOString() }],
    cost: { usd: 1.2 },
    changed: ['context'],
  } as never)

test('nada sale sobre el prompt: la banda de abajo ya no existe', { options: { banda: true } }, async ($, on) => {
  motor(on)
  motorDibuja(on)
  await medir($)
  const ui = await $.ui.mount(BANDA())
  expect(await ui.find({ text: /Carpeta/ })).toBeUndefined()
  expect(await ui.find({ text: /vida \d+%/ })).toBeUndefined()
  expect(await ui.find({ text: /motor/ })).toBeDefined()
  await ui.unmount()
})

test('el footer nativo no muestra datos aunque la opción statusLine esté encendida', { options: { statusLine: true } }, async ($, on) => {
  mock.clock(on)
  const estados: string[] = []
  on('ui.status', (_$, e) => {
    estados.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: 'C:\\Proyectos\\mods' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await medir($)
  expect(estados.some(s => /ctx|\$1\.20/.test(s))).toBe(false)
})

test('con la opción banda apagada no dibuja nada', { options: { banda: false } }, async ($, on) => {
  motor(on)
  motorDibuja(on)
  const ui = await $.ui.mount(BANDA())
  expect(await ui.find({ text: /Carpeta/ })).toBeUndefined()
  expect(await ui.find({ text: /motor/ })).toBeDefined()
  await ui.unmount()
})

test('cede el lugar a una encuesta', { options: { banda: true } }, async ($, on) => {
  motor(on)
  motorDibuja(on)
  const ui = await $.ui.mount(BANDA({ hasSurvey: true }))
  expect(await ui.find({ text: /Carpeta/ })).toBeUndefined()
  expect(await ui.find({ text: /motor/ })).toBeDefined()
  await ui.unmount()
})

test('con animación apagada no pide redibujar cada segundo', { options: { banda: true, animacion: false } }, async ($, on) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let invalidaciones = 0
  on('ui.invalidate', () => {
    invalidaciones += 1
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await reloj.advance(5_000)
  expect(invalidaciones).toBe(0)
})

test('con la mascota viva redibuja a su paso, no a cada cuadro', { options: { banda: true } }, async ($, on) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let invalidaciones = 0
  on('ui.invalidate', () => {
    invalidaciones += 1
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await reloj.advance(1_000)
  const quieto = invalidaciones
  await medir($)
  await reloj.advance(3_000)
  expect(invalidaciones).toBeGreaterThan(quieto)
  const tras = invalidaciones
  await reloj.advance(5_000)
  // La mascota camina con contexto medido: un redibujo por paso (PASO_MS), no uno por cuadro de 120 ms.
  expect(invalidaciones - tras).toBeGreaterThan(0)
  expect(invalidaciones - tras).toBeLessThanOrEqual(Math.ceil(5_000 / PASO_MS) + 1)
})

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const panel = (surface: 'terminal' | 'desktop') => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface,
  props: {
    title: 'Tablero',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

const motor = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: 'C:\\Proyectos\\mods' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>motor</Text>
  })
}

const medir = ($: { session: { measure: (e: never) => Promise<unknown> } }) =>
  $.session.measure({
    context: { window: 200_000, tokens: 100_000, percent: 50 },
    rateLimits: [],
    cost: { usd: 1.2 },
    changed: ['context'],
  } as never)

test('en escritorio la barra de vida se dibuja como SVG con su degradado', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(panel('desktop'))
  const svg = await ui.find({ type: 'Svg', alt: 'vida 50%' })
  expect(svg).toBeDefined()
  await ui.unmount()
})

test('en terminal la barra de vida sigue siendo texto, sin SVG', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(panel('terminal'))
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ text: /vida 50%/ })).toBeDefined()
  await ui.unmount()
})

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseConfig } from '../hooks/core'

// 1.2.0: la vista por defecto es una lista de secciones con título y sin cajas. El mapa de cajas y el diagrama
// con conectores siguen disponibles como `layout: mapa` y `layout: diagrama`.

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

const motor = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/x/mi-carpeta' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
}

const medir = ($: Parameters<Parameters<typeof test>[2]>[0]) =>
  $.session.measure({
    context: { window: 200_000, tokens: 82_000, percent: 41 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 34, resetsAt: new Date(2 * 3_600_000).toISOString() },
      { kind: 'seven_day', percentUsed: 16, resetsAt: new Date(4 * 86_400_000).toISOString() },
    ],
    cost: { usd: 1.37 },
    changed: ['context', 'rateLimits'],
  } as never)

test('layout acepta mapa; por defecto sigue siendo auto', () => {
  expect(parseConfig({ layout: 'mapa' }).layout).toBe('mapa')
  expect(parseConfig({}).layout).toBe('auto')
})

test('por defecto, acoplado y ancho, el panel es la lista: sin el mapa de cajas', async ($, on) => {
  motor(on)
  for (const cols of [140, 100, 60]) {
    const ui = await $.ui.mount(pane(cols))
    expect(await ui.find({ text: /^Sesión/ })).toBeDefined()
    expect(await ui.find({ text: /ESTADO/ })).toBeUndefined()
    expect(await ui.find({ text: /[┌└╭╰]/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('con layout mapa se dibuja el mapa de siempre', { options: { layout: 'mapa' } }, async ($, on) => {
  motor(on)
  const ui = await $.ui.mount(pane(140))
  expect(await ui.find({ text: /ESTADO/ })).toBeDefined()
  await ui.unmount()
})

test('la sección Sesión pone modelo, contexto, costo y cada cupo en su propia fila', async ($, on) => {
  motor(on)
  await medir($)
  const ui = await $.ui.mount(pane(100))
  expect(await ui.find({ text: /^modelo +\S/ })).toBeDefined()
  expect(await ui.find({ text: /^contexto +█+░* +41 %/ })).toBeDefined()
  expect(await ui.find({ text: /^costo +\$1\.37/ })).toBeDefined()
  expect(await ui.find({ text: /^cupo 5 h +█+░* +34 %/ })).toBeDefined()
  expect(await ui.find({ text: /^cupo 7 d +█+░* +16 %/ })).toBeDefined()
  await ui.unmount()
})

test('en la lista, la cabecera es una línea sobria: sin emoji ni leyenda de colores', async ($, on) => {
  motor(on)
  const ui = await $.ui.mount(pane(100))
  expect(await ui.find({ text: /^TABLERO · .*en espera/ })).toBeDefined()
  expect(await ui.find({ text: /v\d+\.\d+\.\d+/ })).toBeDefined()
  expect(await ui.find({ text: /\d\d:\d\d|--:--/ })).toBeDefined()
  expect(await ui.find({ text: /[⏱🕐■]/ })).toBeUndefined()
  await ui.unmount()
})

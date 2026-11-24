import { expect, test } from 'claude-code/testing'

// Sin git, sin gh y sin red el panel se dibuja igual: las filas de esas fuentes simplemente no salen.
const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

test('sin git ni red el panel se dibuja sin la fila Git ni el servicio', async ($, on) => {
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => {
    throw new Error('ENOENT: git')
  })
  on('http.fetch', () => {
    throw new Error('sin red')
  })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount(pane(108) as never)
  expect(await ui.find({ text: /TABLERO/ })).toBeDefined()
  expect(await ui.find({ text: /CI corriendo|CI pasa|sin incidencias/ })).toBeUndefined()
  await ui.unmount()
})

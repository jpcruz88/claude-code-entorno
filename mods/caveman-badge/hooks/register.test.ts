import { expect, test } from 'claude-code/testing'

const INICIO = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('al iniciar muestra caveman: full', async ($, on) => {
  const lineas: (string | undefined)[] = []
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start(INICIO)

  expect(lineas).toEqual(['caveman: full'])
})

test('/caveman ultra cambia la línea y no toca el prompt', async ($, on) => {
  const lineas: (string | undefined)[] = []
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(INICIO)
  const r = await $.prompt.submit({ text: '/caveman ultra', wait: false, origin: { kind: 'composer' } })

  expect(lineas.at(-1)).toBe('caveman: ultra')
  expect(r).toEqual({ text: '/caveman ultra' })
})

test('stop caveman muestra normal', async ($, on) => {
  const lineas: (string | undefined)[] = []
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.session.start(INICIO)
  await $.prompt.submit({ text: 'stop caveman', wait: false, origin: { kind: 'composer' } })

  expect(lineas.at(-1)).toBe('caveman: normal')
})

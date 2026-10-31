import { expect, mock, test } from 'claude-code/testing'

test('Bash con pkill -f: toast, marca en la línea de estado y sin bloqueo', async ($, on) => {
  mock.clock(on)
  const toasts: string[] = []
  const lineas: (string | undefined)[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Bash', command: 'pkill -f cat' })

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('guard-kill')
  expect(toasts[0]).toContain('pkill')
  expect(lineas.at(-1)).toContain('guard-kill')
  expect(r.deny).toBeUndefined()
})

test('PowerShell con Stop-Process -Name también avisa', async ($, on) => {
  mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'PowerShell', command: 'Stop-Process -Name node' })

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Stop-Process -Name')
})

test('un comando normal no avisa', async ($, on) => {
  mock.clock(on)
  const toasts: string[] = []
  const lineas: (string | undefined)[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(toasts).toEqual([])
  expect(lineas).toEqual([])
})

test('la marca de la línea de estado se limpia a los pocos segundos', async ($, on) => {
  const reloj = mock.clock(on)
  const lineas: (string | undefined)[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', (_, e) => (lineas.push(e.text), { value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'killall node' })
  expect(lineas.at(-1)).toContain('guard-kill')

  await reloj.advance(10_000)

  expect(lineas.at(-1)).toBeUndefined()
})

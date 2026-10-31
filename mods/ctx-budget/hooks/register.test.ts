import { expect, test } from 'claude-code/testing'

const medida = (percent: number | undefined) => ({
  context: { window: 200000, percent },
  rateLimits: [],
  changed: ['context' as const],
})

test('al cruzar 70 % sale un toast con el porcentaje', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure(medida(71))

  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('70 %')
})

test('al cruzar 85 % muestra toast y además notifica, una vez', async ($, on) => {
  const notificaciones: string[] = []
  const toasts: string[] = []
  on('ui.notify', (_, e) => (
    notificaciones.push(e.text),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure(medida(86))
  await $.session.measure(medida(87))

  expect(notificaciones).toHaveLength(1)
  expect(notificaciones[0]).toContain('85 %')
  expect(toasts.filter(t => t.includes('85 %'))).toHaveLength(1)
})

test('si notify no se envía, el toast del 85 % sale una sola vez', async ($, on) => {
  const toasts: string[] = []
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure(medida(86))

  expect(toasts.filter(t => t.includes('85 %'))).toHaveLength(1)
})

test('rearma tras compactar: 71, sin lectura, 40 y 72 avisan dos veces el 70 %', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  for (const p of [71, undefined, 40, 72]) await $.session.measure(medida(p))

  expect(toasts.filter(t => t.includes('70 %'))).toHaveLength(2)
})

test('sin percent no avisa ni falla', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure(medida(undefined))

  expect(toasts).toEqual([])
})

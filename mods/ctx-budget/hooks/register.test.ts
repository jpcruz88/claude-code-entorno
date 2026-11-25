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

const nucleo = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
}

test('antes de cruzar el 70 % el mensaje entra sin nota', async ($, on) => {
  nucleo(on)

  await $.session.measure(medida(40))
  const r = await $.prompt.submit({ text: 'hola' })

  expect(r.context ?? []).toEqual([])
})

test('tras cruzar el 70 % el siguiente mensaje lleva la nota de handoff, una sola vez', async ($, on) => {
  nucleo(on)

  await $.session.measure(medida(71))
  const primero = await $.prompt.submit({ text: 'sigue' })
  const segundo = await $.prompt.submit({ text: 'y ahora esto' })

  expect(primero.text).toBe('sigue')
  expect(primero.context).toHaveLength(1)
  expect(primero.context?.[0]).toContain('70 %')
  expect(primero.context?.[0]).toContain('handoff.md')
  expect(segundo.context ?? []).toEqual([])
})

test('al cruzar el 85 % la nota vuelve a ir, con el 85 %', async ($, on) => {
  nucleo(on)

  await $.session.measure(medida(71))
  await $.prompt.submit({ text: 'uno' })
  await $.session.measure(medida(86))
  const r = await $.prompt.submit({ text: 'dos' })

  expect(r.context).toHaveLength(1)
  expect(r.context?.[0]).toContain('85 %')
})

test('si cruza 70 % y 85 % antes del siguiente mensaje, va una sola nota con el más alto', async ($, on) => {
  nucleo(on)

  await $.session.measure(medida(71))
  await $.session.measure(medida(86))
  const r = await $.prompt.submit({ text: 'sigue' })

  expect(r.context).toHaveLength(1)
  expect(r.context?.[0]).toContain('85 %')
})

test('tras compactar no queda nota pendiente', async ($, on) => {
  nucleo(on)

  await $.session.measure(medida(71))
  await $.session.measure(medida(30))
  const r = await $.prompt.submit({ text: 'sigue' })

  expect(r.context ?? []).toEqual([])
})

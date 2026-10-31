import { expect, test } from 'claude-code/testing'

type Aviso = { text: string; title?: string }

const turno = (durationMs: number) => ({
  answer: 'listo',
  durationMs,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
})

test('un turno de 31 s notifica con el título del mod', async ($, on) => {
  const avisos: Aviso[] = []
  on('ui.notify', (_, e) => (
    avisos.push({ text: e.text, title: e.title }),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete(turno(31_000))

  expect(avisos).toEqual([{ text: 'Turno terminado (31 s)', title: 'sound-notify' }])
})

test('un turno corto no notifica', async ($, on) => {
  const avisos: Aviso[] = []
  on('ui.notify', (_, e) => (
    avisos.push({ text: e.text }),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete(turno(5_000))

  expect(avisos).toEqual([])
})

test('si notify no se envía, cae a toast', async ($, on) => {
  const toasts: string[] = []
  on('ui.notify', () => ({ value: { isSent: false, reason: 'no-channel' } }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.turn.complete(turno(31_000))

  expect(toasts).toEqual(['Turno terminado (31 s)'])
})

test('una consulta de otro plugin (sin tool_use_id) no notifica', async ($, on) => {
  const avisos: string[] = []
  on('ui.notify', (_, e) => (
    avisos.push(e.text),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('tool.check', () => ({ decision: 'ask' }))

  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })

  expect(avisos).toEqual([])
})

test('una llamada real con permiso pendiente (ask) notifica', async ($, on) => {
  const avisos: string[] = []
  on('ui.notify', (_, e) => (
    avisos.push(e.text),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(avisos).toEqual(['Claude espera un permiso'])
})

test('una llamada real permitida (allow) no notifica', async ($, on) => {
  const avisos: string[] = []
  on('ui.notify', (_, e) => (
    avisos.push(e.text),
    { value: { isSent: true, channel: 'terminal_bell' } }
  ))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(avisos).toEqual([])
})

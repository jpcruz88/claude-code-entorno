import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Las decisiones de Jev llegan al tablero: log, barra y tarjeta. El archivo y la sesión se simulan.

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

const SESION = 'sesion-a'

// Una línea tal como la escribe guard-subagentes.py.
const linea = (extra: Record<string, unknown>, sesion: string = SESION): string =>
  JSON.stringify({
    hora: '2026-11-06T10:00:00+01:00',
    session_id: sesion,
    tipo: 'modelo',
    opcion: 'sonnet',
    confianza: 0.91,
    sharp: true,
    claude: 'haiku',
    aplicada: true,
    descripcion: 'buscar',
    ...extra,
  })

type Archivo = { texto: string | null }

const motor = (on: On, archivo: Archivo, sesion: string | null = SESION) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: sesion }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', () => {
    if (archivo.texto === null) throw new Error('ENOENT')
    return { value: archivo.texto }
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
}

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }, descripcion: string) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: descripcion,
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

const terminar = ($: { turn: { complete: (e: never) => Promise<unknown> } }) =>
  $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', agentId: null, reason: 'answer' } as never)

const cuentaEnLog = async ($: { ui: { mount: (p: never) => Promise<{ findAll: (q: object) => Promise<unknown[]>; unmount: () => Promise<void> }> } }, re: RegExp) => {
  const ui = await $.ui.mount(pane(120) as never)
  const n = (await ui.findAll({ text: re })).length
  await ui.unmount()
  return n
}

test('log recibe solo decisiones nuevas', async ($, on) => {
  const archivo: Archivo = { texto: linea({}) }
  motor(on, archivo)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  expect(await cuentaEnLog($, /^qué modelo → sonnet +p=0\.91 sharp → código$/)).toBe(1)
  archivo.texto = [linea({}), linea({ tipo: 'esfuerzo', opcion: 'high', claude: 'medium', descripcion: 'buscar' })].join('\n')
  await terminar($)
  expect(await cuentaEnLog($, /^qué modelo → sonnet +p=0\.91 sharp → código$/)).toBe(1)
  expect(await cuentaEnLog($, /^qué esfuerzo → high +p=0\.91 sharp → código$/)).toBe(1)
})

test('sin archivo no falla ni muestra nada', async ($, on) => {
  motor(on, { texto: null })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  await terminar($)
  expect(await cuentaEnLog($, /qué modelo/)).toBe(0)
  expect(await cuentaEnLog($, /jev \[/)).toBe(0)
})

test('sin id de sesión no muestra decisiones de Jev', async ($, on) => {
  motor(on, { texto: linea({}) }, null)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  await terminar($)
  expect(await cuentaEnLog($, /qué modelo/)).toBe(0)
})

test('las decisiones de otra sesión no entran al log', async ($, on) => {
  motor(on, { texto: linea({}, 'otra') })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  await terminar($)
  expect(await cuentaEnLog($, /qué modelo/)).toBe(0)
})

test('barra muestra jev [3 decisiones]', { options: { layout: 'mini' } }, async ($, on) => {
  motor(on, { texto: [linea({}), linea({ tipo: 'esfuerzo', opcion: 'high', claude: 'medium' }), linea({ tipo: 'reintento', opcion: 'parar', claude: null })].join('\n') })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  await terminar($)
  const ui = await $.ui.mount(pane(120) as never)
  expect(await ui.find({ text: /jev \[3 decisiones\]/ })).toBeDefined()
  await ui.unmount()
})

test('tarjeta lleva jev ↑ sonnet', async ($, on) => {
  motor(on, { texto: linea({ descripcion: 'revisar auth' }) })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'revisar auth')
  const ui = await $.ui.mount(pane(120) as never)
  expect(await ui.find({ text: /jev ↑ sonnet/ })).toBeDefined()
  await ui.unmount()
})

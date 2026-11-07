import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Las decisiones de Jev llegan al tablero: log, barra y tarjeta. El archivo, la sesión y las herramientas se simulan.

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

const SESION = 'sesion-a'
const BASE = Date.parse('2026-11-06T10:00:00+01:00')
const enSegundos = (n: number) => new Date(BASE + n * 1000).toISOString()

// Una línea tal como la escribe guard-subagentes.py.
const linea = (extra: Record<string, unknown>, sesion: string = SESION): string =>
  JSON.stringify({
    hora: enSegundos(0),
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
type Herramienta = { error: boolean }

const motor = (on: On, archivo: Archivo, sesion: string | null = SESION, herramienta: Herramienta = { error: false }) => {
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
  on('tool.call', () => ({ result: {}, text: 'ok', isError: herramienta.error }))
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

// La línea de log de una decisión de modelo sonnet con confianza `p`.
const logModelo = (p: string) => new RegExp(`^qué modelo → sonnet +p=${p} sharp → código$`)

test('log recibe solo decisiones nuevas', async ($, on) => {
  const archivo: Archivo = { texto: linea({}) }
  motor(on, archivo)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  expect(await cuentaEnLog($, logModelo('0\\.91'))).toBe(1)
  archivo.texto = [linea({}), linea({ tipo: 'esfuerzo', opcion: 'high', claude: 'medium', descripcion: 'buscar' })].join('\n')
  await terminar($)
  expect(await cuentaEnLog($, logModelo('0\\.91'))).toBe(1)
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

// --- ronda de arreglos 1: cursor por clave, sin pérdidas ni duplicados

test('un archivo recortado no pierde la decisión nueva', async ($, on) => {
  // Cinco vistas (p=0.81 a 0.85); el archivo pasa a las tres últimas más una nueva (p=0.86).
  const archivo: Archivo = { texto: [1, 2, 3, 4, 5].map(n => linea({ hora: enSegundos(n), confianza: 0.8 + n / 100 })).join('\n') }
  motor(on, archivo)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  expect(await cuentaEnLog($, /^qué modelo → sonnet +p=0\.8\d sharp → código$/)).toBe(5)
  archivo.texto = [3, 4, 5, 6].map(n => linea({ hora: enSegundos(n), confianza: 0.8 + n / 100 })).join('\n')
  await terminar($)
  expect(await cuentaEnLog($, logModelo('0\\.86'))).toBe(1)
  expect(await cuentaEnLog($, /^qué modelo → sonnet +p=0\.8\d sharp → código$/)).toBe(6)
})

test('dos lecturas en paralelo no repiten ninguna decisión', async ($, on) => {
  const archivo: Archivo = { texto: [linea({ hora: enSegundos(1), confianza: 0.81 }), linea({ hora: enSegundos(2), confianza: 0.82 })].join('\n') }
  motor(on, archivo)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await Promise.all([lanzar($, 'buscar'), terminar($)])
  expect(await cuentaEnLog($, logModelo('0\\.81'))).toBe(1)
  expect(await cuentaEnLog($, logModelo('0\\.82'))).toBe(1)
})

test('dos decisiones con la misma hora se loguean una vez cada una', async ($, on) => {
  const archivo: Archivo = { texto: linea({ hora: enSegundos(1), confianza: 0.81 }) }
  motor(on, archivo)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  await lanzar($, 'buscar')
  archivo.texto = [archivo.texto, linea({ hora: enSegundos(1), tipo: 'esfuerzo', opcion: 'high', claude: 'medium', confianza: 0.82 })].join('\n')
  await terminar($)
  await terminar($)
  expect(await cuentaEnLog($, logModelo('0\\.81'))).toBe(1)
  expect(await cuentaEnLog($, /^qué esfuerzo → high +p=0\.82 sharp → código$/)).toBe(1)
})

test('un error de herramienta relee el archivo y loguea la decisión nueva', async ($, on) => {
  const archivo: Archivo = { texto: null }
  const herramienta: Herramienta = { error: false }
  motor(on, archivo, SESION, herramienta)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  archivo.texto = linea({ hora: enSegundos(1), confianza: 0.83 })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tb1' } as never)
  expect(await cuentaEnLog($, logModelo('0\\.83'))).toBe(0)
  herramienta.error = true
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tb2' } as never)
  expect(await cuentaEnLog($, logModelo('0\\.83'))).toBe(1)
})

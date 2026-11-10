import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { componerMapa, filasDeMapa, type DatosMapa } from '../hooks/mapa'
import { datos } from './datos-mapa'

// 0.6.0: el tablero deja de mostrar lo que nunca recibe datos y corrige los valores que salían mal.

const texto = (d: DatosMapa, ancho: number) =>
  filasDeMapa(componerMapa(d, 0, ancho))
    .map(f => f.map(t => t.c).join(''))
    .join('\n')

const sinAsesor = (cards = 0): DatosMapa => ({ ...datos(cards), asesor: null, asesorActivo: false })

for (const ancho of [66, 100]) {
  test(`${ancho} col: sin consultas al asesor no hay caja ASESOR ni «asesor» en el pie`, () => {
    for (const n of [0, 1, 3]) {
      const s = texto(sinAsesor(n), ancho)
      expect(s).not.toContain('ASESOR')
      expect(s).not.toContain('de guardia')
    }
  })

  test(`${ancho} col: con consultas la caja ASESOR sale, sin repetir los permisos de ESTADO`, () => {
    const s = texto(datos(0), ancho)
    expect(s).toContain('ASESOR')
    expect(s).toContain('consultas')
    expect(s.match(/pend\./g)?.length).toBe(1)
  })

  test(`${ancho} col: «bucles» sale siempre, también en 0, como en la maqueta`, () => {
    expect(texto(datos(0), ancho)).toMatch(/bucles\s+0/)
    const d = datos(0)
    expect(texto({ ...d, estado: { ...d.estado, bucles: 2 } }, ancho)).toMatch(/bucles\s+2/)
  })

  test(`${ancho} col: el costo del último turno se rotula «último turno», como en la maqueta`, () => {
    const s = texto(datos(0), ancho)
    expect(s).not.toContain('costo turno')
    expect(s).toMatch(/último turno\s+\$0\.08/)
  })

  test(`${ancho} col: una tarea sin total de pasos no dibuja barra ni n/n, solo los pasos dados`, () => {
    const d = datos(2)
    const s = texto({ ...d, tarjetas: d.tarjetas.map(t => ({ ...t, hechos: 3, total: null })) }, ancho)
    // El pie cuenta los subagentes (`subagentes 1/2`): eso no es una tarea.
    const tareas = s.split('\n').filter(l => !l.includes('subagentes')).join('\n')
    expect(tareas).not.toMatch(/\d+\/\d+ /)
    expect(s).toContain('3 pasos')
  })

  test(`${ancho} col: con total reportado sí hay barra y n/n`, () => {
    const d = datos(2)
    expect(texto(d, ancho)).toContain('2/4')
  })

  test(`${ancho} col: una tarea detenida dice «detenido» y una fallida «falló»`, () => {
    const d = datos(2)
    const s = texto({ ...d, tarjetas: [{ ...d.tarjetas[0], estado: 'S' }, { ...d.tarjetas[1], estado: 'F' }] }, ancho)
    expect(s).toContain('detenido')
    expect(s).toContain('falló')
    expect(s).not.toContain('🔁')
    expect(s).not.toContain('⏳')
  })
}

// ---------------------------------------------------------------- con el mod montado

const SESION = 'sesion-limpieza'

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
})

const motor = (on: On) => {
  const reloj = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: SESION }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id ?? 'a' }))
  return reloj
}

const lanzar = ($: { agent: { spawn: (e: never) => Promise<unknown> } }, descripcion: string, id: string) =>
  $.agent.spawn({
    prompt: 'haz el trabajo',
    description: descripcion,
    subagentType: 'general-purpose',
    tool_use_id: id,
    provider: { plugin: 'engine', tier: 'core' as const },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  } as never)

const terminar = ($: { turn: { complete: (e: never) => Promise<unknown> } }, agentId: string | undefined, reason: string) =>
  $.turn.complete({ answer: '', durationMs: 10, isAborted: reason === 'aborted', turnId: `T-${agentId ?? 'main'}`, agentId, reason } as never)

const dibujado = async (ui: { drawn: () => Promise<unknown> }) => {
  const plano = (n: unknown): string =>
    typeof n === 'string' || typeof n === 'number'
      ? String(n)
      : n && typeof n === 'object' && Array.isArray((n as { children?: unknown[] }).children)
        ? (n as { children: unknown[] }).children.map(plano).join('')
        : ''
  return plano(await ui.drawn())
}

test('el costo de ESTADO sale del costo medido, no de $0.00', async ($, on) => {
  motor(on)
  await $.session.measure({ context: { window: 1_000_000, tokens: 1000, percent: 1 }, rateLimits: [], cost: { usd: 1.2 }, changed: ['cost'] } as never)
  const ui = await $.ui.mount(pane(66) as never)
  const s = await dibujado(ui)
  expect(s).toMatch(/costo\s*\$1\.20/)
  await ui.unmount()
})

test('al terminar el turno, el LEAD deja de contar «turno»', async ($, on) => {
  const reloj = motor(on)
  // El reloj simulado empieza en 0, que el mod lee como «sin turno»: arranca un poco después.
  await reloj.advance(1_000)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await reloj.advance(5_000)
  let ui = await $.ui.mount(pane(66) as never)
  expect(await dibujado(ui)).toMatch(/turno \d+:\d/)
  await ui.unmount()
  await terminar($, undefined, 'answer')
  await reloj.advance(5_000)
  ui = await $.ui.mount(pane(66) as never)
  expect(await dibujado(ui)).not.toMatch(/turno \d+:\d/)
  await ui.unmount()
})

test('un subagente detenido dice «detenido» y uno fallido «falló»', async ($, on) => {
  motor(on)
  await $.turn.start({ text: 'go', turnId: 'T2' })
  await lanzar($, 'uno', 'a1')
  await lanzar($, 'dos', 'a2')
  await terminar($, 'a1', 'aborted')
  await terminar($, 'a2', 'error')
  const ui = await $.ui.mount(pane(66) as never)
  const s = await dibujado(ui)
  expect(s).toContain('detenido')
  expect(s).toContain('falló')
  expect(s).not.toContain('🔁')
  expect(s).not.toContain('⏳')
  await ui.unmount()
})

test('sin consultas, el panel acoplado no muestra el asesor', async ($, on) => {
  motor(on)
  await $.turn.start({ text: 'go', turnId: 'T3' })
  await lanzar($, 'uno', 'a3')
  const ui = await $.ui.mount(pane(66) as never)
  const s = await dibujado(ui)
  expect(s).not.toContain('ASESOR')
  expect(s).not.toContain('de guardia')
  await ui.unmount()
})

test('sin consultas, el diagrama tampoco muestra la caja del asesor', { options: { layout: 'diagrama' } }, async ($, on) => {
  motor(on)
  await $.turn.start({ text: 'go', turnId: 'T4' })
  await lanzar($, 'uno', 'a4')
  const ui = await $.ui.mount(pane(100) as never)
  const s = await dibujado(ui)
  expect(s).not.toContain('ASESOR')
  expect(s).not.toContain('(inferido)')
  expect(s).not.toContain('de guardia')
  await ui.unmount()
})

test('el reloj del panel corre siempre: redibuja mientras el lead trabaja', async ($, on) => {
  const reloj = motor(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let invalidaciones = 0
  on('ui.invalidate', () => {
    invalidaciones += 1
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 'T5' })
  const antes = invalidaciones
  await reloj.advance(3_000)
  expect(invalidaciones).toBeGreaterThan(antes)
})

test('el tablero ya no registra las herramientas progreso y paso (las da savvy-progress)', async ($, on) => {
  const nombres: string[] = []
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', (_$, e) => {
    nombres.push(String((e as { name?: string }).name))
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(nombres).not.toContain('paso')
  expect(nombres).not.toContain('progreso')
})

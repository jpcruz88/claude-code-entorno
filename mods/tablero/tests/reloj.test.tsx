import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { componerMapa, filasDeMapa, type DatosMapa } from '../hooks/mapa'
import { datos } from './datos-mapa'

// El reloj del panel: rápido solo con trabajo en curso, como mucho un redibujo por segundo en reposo, y parado
// mientras el panel no se ve. Con la animación apagada, el mapa se dibuja quieto y los relojes avanzan despacio.

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
}

type Cuenta = { invalidaciones: number; escriturasJev: number }

const motor = (on: On) => {
  const reloj = mock.clock(on)
  const cuenta: Cuenta = { invalidaciones: 0, escriturasJev: 0 }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: 's' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', (_$, e) => {
    if (String(e.path).endsWith('decisiones.jsonl')) return { value: '' }
    throw new Error('ENOENT')
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.invalidate', () => {
    cuenta.invalidaciones += 1
    return { value: undefined }
  })
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'jev') cuenta.escriturasJev += 1
    return next(e)
  })
  return { reloj, cuenta }
}

const iniciar = ($: { session: { start: (e: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)

const terminarTurno = ($: { turn: { complete: (e: never) => Promise<unknown> } }) =>
  $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', reason: 'answer' } as never)

/** Invalidaciones pedidas mientras corre `ms` de reloj. */
const durante = async (m: { reloj: { advance: (ms: number) => Promise<unknown> }; cuenta: Cuenta }, ms: number) => {
  const antes = m.cuenta.invalidaciones
  await m.reloj.advance(ms)
  return m.cuenta.invalidaciones - antes
}

test('con el panel sin abrir (openOnStart apagado), el reloj no pide redibujos', { options: { openOnStart: false } }, async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  expect(await durante(m, 10_000)).toBe(0)
})

test('en reposo con el mapa a la vista, como mucho un redibujo por segundo', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount(pane as never)
  await m.reloj.advance(2_000)
  expect(await durante(m, 5_000)).toBeLessThanOrEqual(5)
  await ui.unmount()
})

test('con el lead trabajando y la animación encendida, el mapa se anima rápido', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount(pane as never)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await m.reloj.advance(1_500)
  expect(await durante(m, 1_000)).toBeGreaterThanOrEqual(5)
  await ui.unmount()
})

test('al cerrar el panel con /tablero cerrar, el reloj se para aunque haya trabajo', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount(pane as never)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await m.reloj.advance(1_000)
  await $.command.run({ command: 'tablero', args: 'cerrar' } as never)
  await m.reloj.advance(200)
  expect(await durante(m, 5_000)).toBe(0)
  await ui.unmount()
})

test('con la animación apagada y trabajo en curso, los relojes avanzan con un refresco lento', { options: { animacion: false } }, async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount(pane as never)
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await m.reloj.advance(1_500)
  const n = await durante(m, 4_000)
  expect(n).toBeGreaterThanOrEqual(2)
  expect(n).toBeLessThanOrEqual(4)
  await ui.unmount()
})

test('al terminar la sesión, el reloj deja de pedir redibujos', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount(pane as never)
  await m.reloj.advance(1_000)
  await $.session.end({ reason: 'exit', sessionId: 's' } as never)
  expect(await durante(m, 120_000)).toBe(0)
  await ui.unmount()
})

test('en reposo y sin mapa (panel angosto), solo redibuja cuando algo cambia', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount({ ...pane, props: { ...pane.props, bodyColumns: 30 } } as never)
  await m.reloj.advance(2_000)
  expect(await durante(m, 5_000)).toBe(0)
  await $.session.measure({ context: { window: 1_000_000, tokens: 420_000, percent: 42 }, rateLimits: [], cost: { usd: 1.2 }, changed: ['context'] } as never)
  expect(await durante(m, 2_000)).toBeGreaterThan(0)
  await ui.unmount()
})

test('releer a Jev sin cambios en disco no vuelve a escribir su estado', async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  await terminarTurno($)
  const antes = m.cuenta.escriturasJev
  await terminarTurno($)
  await terminarTurno($)
  expect(m.cuenta.escriturasJev).toBe(antes)
})

// ---------------------------------------------------------------- el mapa sin animación

const texto = (d: DatosMapa, t: number, ancho: number, animado: boolean) =>
  filasDeMapa(componerMapa(d, t, ancho, animado))
    .map(f => f.map(x => x.c).join(''))
    .join('\n')

for (const ancho of [66, 100]) {
  test(`${ancho} col: sin animación el mapa es el mismo en cualquier instante`, () => {
    for (const n of [0, 1, 3, 9]) {
      const d = datos(n)
      const quieto = texto(d, 0, ancho, false)
      for (const t of [0.13, 0.5, 1.7, 3.3, 12.9]) expect(texto(d, t, ancho, false)).toBe(quieto)
    }
  })

  test(`${ancho} col: sin animación no hay paquetes en las líneas y los bordes van encendidos`, () => {
    const d = datos(3)
    for (const t of [0, 0.4, 0.9]) {
      const s = texto(d, t, ancho, false)
      expect(s).not.toContain('●')
      expect(s).not.toContain('•')
    }
    // El lead con trabajo respira (borde tenue la mitad del tiempo); quieto, siempre en su color.
    const celdas = componerMapa(d, 0.9, ancho, false).flat()
    expect(celdas.some(c => c.c === 'L' && c.k === 'lead')).toBe(true)
  })
}

test('el resumen sobre el prompt (inline) también arranca el reloj', { options: { layout: 'mini' } }, async ($, on) => {
  const m = motor(on)
  await m.reloj.advance(1_000)
  await iniciar($)
  const ui = await $.ui.mount({ ...pane, props: { ...pane.props, placement: 'inline' as const } } as never)
  await $.session.measure({ context: { window: 1_000_000, tokens: 420_000, percent: 42 }, rateLimits: [], cost: { usd: 1.2 }, changed: ['context'] } as never)
  expect(await durante(m, 2_000)).toBeGreaterThan(0)
  await ui.unmount()
})

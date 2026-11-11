import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { leerAlDia } from '../hooks/al-dia-modelo'

// Arreglos menores de 0.10.0: la hora de AL DÍA, el último limites.json válido y el texto de /tablero.

const AHORA = new Date(2026, 10, 9, 9, 0).getTime()
const seg = (d: Date) => Math.floor(d.getTime() / 1000)
const resultado = (ts: Date) =>
  JSON.stringify({ version: 1, ts: seg(ts), cambios: [{ nombre: 'a', tipo: 'skill', antes: '1.0', despues: '1.1', cambio_texto: false }], fallos: [], pendientes: [], al_dia: 1 })

test('AL DÍA: una hora un poco adelantada del mismo día dice «hoy», no «ayer»', () => {
  expect(leerAlDia(resultado(new Date(2026, 10, 9, 9, 30)), AHORA)?.cuando).toBe('hoy 09:30')
})

test('AL DÍA: una hora de otro día por delante no dice «ayer»', () => {
  const r = leerAlDia(resultado(new Date(2026, 10, 10, 8, 0)), AHORA)
  expect(r?.cuando ?? '').not.toContain('ayer')
  expect(r?.cuando ?? '').not.toContain('hoy')
})

test('AL DÍA: ayer sigue siendo «ayer»', () => {
  expect(leerAlDia(resultado(new Date(2026, 10, 8, 22, 15)), AHORA)?.cuando).toBe('ayer 22:15')
})

// ---------------------------------------------------------------- con el mod montado

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
}

const motor = (on: On, archivos: Record<string, string | null>) => {
  const reloj = mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.id', () => ({ value: 's' }))
  on('env.get', () => ({ value: '/casa' }))
  on('fs.read', (_$, e) => {
    const nombre = String(e.path).split('/').pop() ?? ''
    const texto = archivos[nombre]
    if (texto === null || texto === undefined) throw new Error('ENOENT')
    return { value: texto }
  })
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return reloj
}

const encontrar = async ($: { ui: { mount: (p: never) => Promise<{ find: (q: never) => Promise<unknown>; unmount: () => Promise<void> }> } }, re: RegExp) => {
  const ui = await $.ui.mount(pane as never)
  const hallado = await ui.find({ text: re } as never)
  await ui.unmount()
  return hallado
}

test('un limites.json roto (a medio escribir) no borra el último válido', async ($, on) => {
  const archivos: Record<string, string | null> = { 'limites.json': JSON.stringify({ actualizado: 0, five_hour: { usado: 80, reinicio: 10_000 } }) }
  const reloj = motor(on, archivos)
  await reloj.advance(1_000)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  expect(await encontrar($, /tope ahora: sonnet medium · 5h 80%/)).toBeDefined()
  archivos['limites.json'] = '{"actualizado": 1'
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', reason: 'answer' } as never)
  expect(await encontrar($, /tope ahora: sonnet medium · 5h 80%/)).toBeDefined()
  // Sin archivo ya no hay dato.
  archivos['limites.json'] = null
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T2', reason: 'answer' } as never)
  expect(await encontrar($, /tope ahora: opus high · sin dato de uso/)).toBeDefined()
})

test('/tablero no promete teclas que el mapa no tiene', async ($, on) => {
  const reloj = motor(on, {})
  await reloj.advance(1_000)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  const r = (await $.command.run({ command: 'tablero', args: '' } as never)) as { text?: string }
  expect(r.text ?? '').toContain('Tablero abierto')
  expect(r.text ?? '').not.toMatch(/1-6|a\/s\/o/)
})

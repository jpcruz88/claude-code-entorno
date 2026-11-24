import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_ARCHITECT,
  DEFAULT_ROSTER,
  anotarFallo,
  anotarTipoAsesor,
  consejoNuevo,
  esTipoAsesor,
  llamadaConAutomatica,
} from '../hooks/core'
import type { Check } from '../types'

// Las decisiones que tomaban los manejadores de register.tsx (ui.fault, agent.offer, SubagentHandback y la `ask`
// automática de tool.call), como funciones puras que el motor de pruebas no puede disparar.

const asesor = { ...DEFAULT_ARCHITECT, ids: ['a1'], lastAdvice: '' }

test('ui.fault: el primer fallo de un módulo en el panel pide redibujo; los siguientes, no', () => {
  const fallados = new Set<string>()
  const e = { requestId: 'tablero', surface: 'desktop', module: 'hooks/rail.tsx' }
  expect(anotarFallo(fallados, 'tablero', e)).toBe(true)
  expect(anotarFallo(fallados, 'tablero', e)).toBe(false)
  expect(fallados.has('desktop:rail.tsx')).toBe(true)
})

test('ui.fault: un fallo de otro dibujo no cuenta ni se anota', () => {
  const fallados = new Set<string>()
  expect(anotarFallo(fallados, 'tablero', { requestId: 'otro', surface: 'desktop', module: 'rail.tsx' })).toBe(false)
  expect(fallados.size).toBe(0)
})

test('ui.fault: la misma pieza en otra superficie es otro fallo', () => {
  const fallados = new Set<string>()
  expect(anotarFallo(fallados, 'tablero', { requestId: 'tablero', surface: 'desktop', module: 'rail.tsx' })).toBe(true)
  expect(anotarFallo(fallados, 'tablero', { requestId: 'tablero', surface: 'terminal', module: 'rail.tsx' })).toBe(true)
})

test('agent.offer: un tipo es asesor por su nombre; por la descripción, solo si matchDescriptions', () => {
  const patron = /advisor|architect/i
  expect(esTipoAsesor(patron, false, { agent: 'advisor', description: '' })).toBe(true)
  expect(esTipoAsesor(patron, false, { agent: 'Explore', description: 'un architect de sistemas' })).toBe(false)
  expect(esTipoAsesor(patron, true, { agent: 'Explore', description: 'un architect de sistemas' })).toBe(true)
})

test('agent.offer: el tipo se anota una vez, y la lista se queda con los 20 más nuevos', () => {
  const con = anotarTipoAsesor(DEFAULT_ROSTER, 'advisor')
  expect(con.architectTypes).toEqual(['advisor'])
  expect(anotarTipoAsesor(con, 'advisor')).toBe(con)
  const lleno = { architectTypes: Array.from({ length: 20 }, (_, i) => `t${i}`) }
  const tras = anotarTipoAsesor(lleno, 'nuevo')
  expect(tras.architectTypes.length).toBe(20)
  expect(tras.architectTypes.at(-1)).toBe('nuevo')
  expect(tras.architectTypes[0]).toBe('t1')
})

test('SubagentHandback: el consejo de un asesor conocido sale, sin markdown y sin repetir el último', () => {
  expect(consejoNuevo(asesor, 'a1', '**Plan**\nusa caché')).toBe('Plan')
  expect(consejoNuevo({ ...asesor, lastAdvice: 'Plan' }, 'a1', '**Plan**\nusa caché')).toBeNull()
})

test('SubagentHandback: sin asesor, sin agente, sin texto o de otro agente no hay consejo', () => {
  expect(consejoNuevo(null, 'a1', 'Plan')).toBeNull()
  expect(consejoNuevo(asesor, undefined, 'Plan')).toBeNull()
  expect(consejoNuevo(asesor, 'otro', 'Plan')).toBeNull()
  expect(consejoNuevo(asesor, 'a1', 42)).toBeNull()
})

const check: Check = { id: 'T1', tool: 'Bash', bucket: 'shell', verdict: 'ask', inSubagent: false, detail: 'ls', at: 1 } as Check

test('tool.call: la ask automática se toma al terminar la llamada y sale de autoAsks', async () => {
  const autoAsks = new Map<string, Check>([['T1', check]])
  const { ran, auto } = await llamadaConAutomatica(autoAsks, 'T1', async () => 'ok')
  expect(ran).toBe('ok')
  expect(auto).toBe(check)
  expect(autoAsks.has('T1')).toBe(false)
})

test('tool.call: si la llamada lanza, la ask automática sale igual de autoAsks y el error sigue', async () => {
  const autoAsks = new Map<string, Check>([['T1', check]])
  const falla = llamadaConAutomatica(autoAsks, 'T1', async () => {
    throw new Error('boom')
  })
  await expect(falla).rejects.toThrow('boom')
  expect(autoAsks.has('T1')).toBe(false)
})

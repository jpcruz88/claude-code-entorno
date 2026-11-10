import { expect, test } from 'claude-code/testing'

import { costoPorMinuto } from '../hooks/costo-min'
import { lineaRegistroJev, recientesJev, type DecisionJev } from '../hooks/jev-modelo'

// Los datos que el mapa necesita para verse como la maqueta: las decisiones recientes de Jev en filas
// `modelo → sonnet`, las líneas del registro y el gasto de cada minuto para la gráfica costo/min.

const decision = (extra: Partial<DecisionJev> = {}): DecisionJev => ({
  hora: new Date(2026, 10, 9, 21, 52).getTime(),
  sessionId: 's',
  tipo: 'modelo',
  opcion: 'claude-sonnet-5-5',
  confianza: 0.91,
  sharp: true,
  claude: 'haiku',
  aplicada: true,
  descripcion: 'buscar',
  motivo: '',
  ...extra,
})

test('recientes: la más nueva primero, hasta tres, con hora local, «tipo → opción» y la confianza', () => {
  const ds = [
    decision(),
    decision({ hora: new Date(2026, 10, 9, 21, 54).getTime(), tipo: 'esfuerzo', opcion: 'medium', confianza: 0.84 }),
  ]
  expect(recientesJev(ds)).toEqual([
    { hora: '21:54', txt: 'esfuerzo → medio', conf: 0.84 },
    { hora: '21:52', txt: 'modelo → sonnet', conf: 0.91 },
  ])
})

test('recientes: los esfuerzos se dicen en español y los topes y las decisiones sin confianza no entran', () => {
  const ds = [
    decision({ tipo: 'esfuerzo', opcion: 'low' }),
    decision({ tipo: 'esfuerzo', opcion: 'high' }),
    decision({ tipo: 'esfuerzo', opcion: 'xhigh' }),
    decision({ tipo: 'tope', opcion: 'sonnet', confianza: null, motivo: 'tope semana +12 pts → sonnet' }),
    decision({ confianza: null }),
  ]
  expect(recientesJev(ds).map(r => r.txt)).toEqual(['esfuerzo → extra', 'esfuerzo → alto', 'esfuerzo → bajo'])
  expect(recientesJev([...ds, decision(), decision(), decision()]).length).toBe(3)
})

test('registro de Jev: rol jev, la hora y «tipo → opción (0.91)»; el tope con su motivo', () => {
  expect(lineaRegistroJev(decision())).toEqual({ hora: '21:52', rol: 'jev', txt: 'modelo → sonnet (0.91)' })
  expect(lineaRegistroJev(decision({ confianza: null })).txt).toBe('modelo → sonnet')
  expect(lineaRegistroJev(decision({ tipo: 'tope', opcion: 'sonnet', confianza: null, motivo: 'semana +12 pts' })).txt).toContain('tope')
})

test('costo por minuto: lo que subió el costo dentro de cada uno de los últimos n minutos', () => {
  const m = 60_000
  const ahora = 10 * m
  const muestras = [
    { t: 0, usd: 0 },
    { t: 7 * m + 1, usd: 0.1 },
    { t: 8 * m + 5, usd: 0.25 },
    { t: 9 * m + 30_000, usd: 0.25 },
  ]
  // Minutos 6..9 (n = 4): el 7 subió 0.10, el 8 subió 0.15, el 6 y el 9 nada.
  const v = costoPorMinuto(muestras, ahora, 4)
  expect(v.length).toBe(4)
  expect(v[0]).toBe(0)
  expect(Math.abs(v[1] - 0.1) < 1e-9).toBe(true)
  expect(Math.abs(v[2] - 0.15) < 1e-9).toBe(true)
  expect(v[3]).toBe(0)
  expect(costoPorMinuto([], ahora, 4)).toEqual([0, 0, 0, 0])
})

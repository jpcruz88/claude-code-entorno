import { expect, test } from 'claude-code/testing'

import { footerTexto } from '../hooks/banda-modelo'

const MIN = 60_000
const AHORA = 1_000_000

const completo = {
  costoUsd: 1.2,
  contextoPct: 42,
  agentesActivos: 2,
  agentesTotal: 3,
  permisosPendientes: 1,
  limites: [{ kind: 'five_hour', pct: 63, resetsAt: AHORA + 130 * MIN }],
  ahora: AHORA,
}

test('el footer resume los datos en español', () => {
  expect(footerTexto(completo)).toBe('$1.20 · ctx 42% · agentes 2 · permisos 1 · uso 63% (2 h 10 min)')
})

test('sin ningún dato no hay texto de footer', () => {
  expect(footerTexto({ costoUsd: null, contextoPct: null, agentesActivos: 0, agentesTotal: 0, permisosPendientes: 0, limites: [], ahora: AHORA })).toBeUndefined()
})

test('sin permisos pendientes se omite el campo de permisos', () => {
  expect(footerTexto({ ...completo, permisosPendientes: 0 })).not.toContain('permisos')
})

test('sin ventanas de uso se omite el campo de uso', () => {
  expect(footerTexto({ ...completo, limites: [] })).not.toContain('uso')
})

test('un reseteo ausente deja el porcentaje sin paréntesis', () => {
  const texto = footerTexto({ ...completo, limites: [{ kind: 'five_hour', pct: 63, resetsAt: null }] })
  expect(texto).toContain('uso 63%')
  expect(texto).not.toContain('(')
})

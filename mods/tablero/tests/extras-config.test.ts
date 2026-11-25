import { expect, test } from 'claude-code/testing'
import { parseConfig } from '../hooks/core'

test('por omisión todas las fuentes nuevas están encendidas y sin presupuesto', () => {
  const c = parseConfig({})
  expect([...c.extras].sort()).toEqual(['cache', 'ci', 'gasto', 'git', 'presupuesto', 'servicio', 'sesiones'])
  expect(c.presupuestoDiario).toBe(0)
})

test('extras apaga lo que no nombra e ignora nombres desconocidos', () => {
  const c = parseConfig({ extras: 'git, servicio,raro', presupuestoDiario: 20 })
  expect([...c.extras].sort()).toEqual(['git', 'servicio'])
  expect(c.presupuestoDiario).toBe(20)
})

test('un presupuesto negativo o no numérico queda en 0', () => {
  expect(parseConfig({ presupuestoDiario: -5 }).presupuestoDiario).toBe(0)
  expect(parseConfig({ presupuestoDiario: 'veinte' }).presupuestoDiario).toBe(0)
})

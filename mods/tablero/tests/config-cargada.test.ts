import { expect, test } from 'claude-code/testing'
import { contarConfig, contarHooks, servidoresMcp } from '../hooks/config-cargada'

test('el texto de Config junta las cuatro cuentas', () => {
  expect(contarConfig({ claudeMd: 2, reglas: 10, hooks: 33, mcp: 9 })).toBe('2 CLAUDE.md · 10 reglas · 33 hooks · 9 MCP')
})

test('en singular cuando hay uno', () => {
  expect(contarConfig({ claudeMd: 1, reglas: 1, hooks: 1, mcp: 1 })).toBe('1 CLAUDE.md · 1 regla · 1 hook · 1 MCP')
})

test('los hooks se cuentan por comando dentro de cada evento y grupo', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'c' }] }],
  }
  expect(contarHooks(hooks)).toBe(3)
  expect(contarHooks(undefined)).toBe(0)
  expect(contarHooks('raro')).toBe(0)
})

test('los servidores MCP salen de los nombres de herramienta, sin repetir', () => {
  expect(servidoresMcp(['Read', 'mcp__context7__query-docs', 'mcp__context7__resolve', 'mcp__tablero__plan_progress'])).toBe(2)
})

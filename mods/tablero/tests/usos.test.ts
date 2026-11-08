import { expect, test } from 'claude-code/testing'

import { DEFAULT_USOS, noteUso, resumenUsos, usoDe } from '../hooks/core'

test('una llamada Skill cuenta como habilidad con su nombre', () => {
  expect(usoDe('Skill', { skill: 'caveman' })).toEqual({ kind: 'skill', name: 'caveman' })
})

test('una herramienta mcp__servidor__x cuenta como MCP del servidor', () => {
  expect(usoDe('mcp__tablero__paso', {})).toEqual({ kind: 'mcp', server: 'tablero' })
  expect(usoDe('mcp__claude-in-chrome__navigate', {})).toEqual({ kind: 'mcp', server: 'claude-in-chrome' })
})

test('las herramientas nativas y una Skill sin nombre no cuentan', () => {
  expect(usoDe('Bash', { command: 'ls' })).toBeNull()
  expect(usoDe('Skill', {})).toBeNull()
})

test('noteUso suma por habilidad y por servidor, sin tocar lo demás', () => {
  let u = DEFAULT_USOS
  u = noteUso(u, { kind: 'skill', name: 'caveman' })
  u = noteUso(u, { kind: 'skill', name: 'caveman' })
  u = noteUso(u, { kind: 'mcp', server: 'tablero' })
  expect(u).toEqual({ skills: { caveman: 2 }, mcp: { tablero: 1 } })
  expect(DEFAULT_USOS).toEqual({ skills: {}, mcp: {} })
})

test('resumenUsos lista habilidades y servidores con su conteo, y vacío si no hay nada', () => {
  expect(resumenUsos(DEFAULT_USOS)).toBe('')
  const u = { skills: { caveman: 2, tdd: 1 }, mcp: { tablero: 3 } }
  expect(resumenUsos(u)).toBe('habilidades caveman×2 tdd×1 · MCP tablero×3')
})

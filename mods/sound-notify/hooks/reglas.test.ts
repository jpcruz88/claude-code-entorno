import { expect, test } from 'claude-code/testing'
import { debeSonarPermiso, debeSonarTurno } from './reglas'

const turno = (durationMs: number, extra: { reason?: string; agentId?: string } = {}) => ({
  durationMs,
  reason: 'answer',
  ...extra,
})

test('31 s en el turno principal suena', () => {
  expect(debeSonarTurno(turno(31_000))).toBe(true)
})

test('30 s exactos no suena', () => {
  expect(debeSonarTurno(turno(30_000))).toBe(false)
})

test('un turno abortado no suena', () => {
  expect(debeSonarTurno(turno(90_000, { reason: 'aborted' }))).toBe(false)
})

test('un turno de subagente no suena', () => {
  expect(debeSonarTurno(turno(90_000, { agentId: 'a1' }))).toBe(false)
})

test('un turno de 5 s no suena', () => {
  expect(debeSonarTurno(turno(5_000))).toBe(false)
})

// El aviso de permiso solo suena cuando la persona tiene algo que responder.

test('un ask de una llamada real fuera del modo automático suena', () => {
  expect(debeSonarPermiso({ decision: 'ask', tool_use_id: 'k1', modo: 'default' })).toBe(true)
  expect(debeSonarPermiso({ decision: 'ask', tool_use_id: 'k1', modo: undefined })).toBe(true)
})

test('en modo automático un ask del motor no suena: lo decide el clasificador', () => {
  expect(debeSonarPermiso({ decision: 'ask', tool_use_id: 'k1', modo: 'auto' })).toBe(false)
})

test('en modo automático el ask de un plugin sí suena: lo responde la persona', () => {
  expect(debeSonarPermiso({ decision: 'ask', tool_use_id: 'k1', modo: 'auto', plugin: 'spec-gate' })).toBe(true)
})

test('una consulta sin tool_use_id o un veredicto que no es ask no suenan', () => {
  expect(debeSonarPermiso({ decision: 'ask', modo: 'default' })).toBe(false)
  expect(debeSonarPermiso({ decision: 'allow', tool_use_id: 'k1', modo: 'default' })).toBe(false)
})

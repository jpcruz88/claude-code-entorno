import { expect, test } from 'claude-code/testing'
import { debeSonarTurno } from './reglas'

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

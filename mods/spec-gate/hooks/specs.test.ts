import { expect, test } from 'claude-code/testing'
import { estadoSpecs, type EntradaSpec } from './specs'

const DIA = 86_400_000
const AHORA = Date.UTC(2026, 10, 5) // 2026-11-05
const md = (name: string, mtimeMs = 0): EntradaSpec => ({ name, kind: 'file', mtimeMs })

test('sin ningún .md no hay spec', () => {
  expect(estadoSpecs([], AHORA)).toBe('ninguna')
  expect(estadoSpecs([md('notas.txt'), { name: 'x.md', kind: 'dir', mtimeMs: 0 }], AHORA)).toBe('ninguna')
})

test('una spec con fecha en el nombre de hace 6 días es reciente', () => {
  expect(estadoSpecs([md('2026-10-30-x.md')], AHORA)).toBe('reciente')
})

test('una spec con fecha en el nombre de hace 35 días es vieja', () => {
  expect(estadoSpecs([md('2026-10-01-x.md')], AHORA)).toBe('vieja')
})

test('el límite es de 14 días: 14 es reciente y 15 es vieja', () => {
  const hace = (n: number) => new Date(AHORA - n * DIA).toISOString().slice(0, 10)
  expect(estadoSpecs([md(`${hace(14)}-x.md`)], AHORA)).toBe('reciente')
  expect(estadoSpecs([md(`${hace(15)}-x.md`)], AHORA)).toBe('vieja')
})

test('cuenta la más reciente aunque haya otras viejas', () => {
  expect(estadoSpecs([md('2026-01-01-a.md'), md('2026-11-01-b.md')], AHORA)).toBe('reciente')
})

test('sin prefijo usa la fecha de modificación', () => {
  expect(estadoSpecs([md('diseno.md', AHORA - 3 * DIA)], AHORA)).toBe('reciente')
  expect(estadoSpecs([md('diseno.md', AHORA - 40 * DIA)], AHORA)).toBe('vieja')
})

test('si ninguna spec tiene fecha legible, basta que exista un .md', () => {
  expect(estadoSpecs([md('diseno.md', 0)], AHORA)).toBe('reciente')
})

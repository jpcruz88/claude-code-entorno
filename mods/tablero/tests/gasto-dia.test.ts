import { expect, test } from 'claude-code/testing'
import type { RegistroSesion } from '../types'
import { gastoDelDia, porHora } from '../hooks/gasto-dia'
import { pronosticoCupo } from '../hooks/uso'

const reg = (id: string, costo: number, base: number, dia: string): RegistroSesion => ({
  id,
  nombre: null,
  carpeta: '/x',
  estado: 'inactiva',
  desde: 0,
  costo,
  base,
  dia,
  actualizado: 0,
})

test('costo por hora: nada con menos de un minuto de trabajo', () => {
  expect(porHora(1.38, 30_000)).toBeNull()
})

test('costo por hora: costo entre las horas trabajadas', () => {
  expect(porHora(2.0, 3_600_000)).toBe(2)
  expect(porHora(1.0, 1_800_000)).toBe(2)
})

test('gasto del día: suma lo gastado hoy por cada sesión, no lo de ayer', () => {
  const propio = { id: 'a', costo: 3, base: 1, dia: '2026-11-24' }
  const otros = [reg('b', 2, 0, '2026-11-24'), reg('c', 9, 0, '2026-11-23')]
  expect(gastoDelDia(propio, otros, '2026-11-24')).toBe(4)
})

test('gasto del día: la propia sesión no se cuenta dos veces si también está en la carpeta', () => {
  const propio = { id: 'a', costo: 3, base: 1, dia: '2026-11-24' }
  expect(gastoDelDia(propio, [reg('a', 3, 1, '2026-11-24')], '2026-11-24')).toBe(2)
})

test('pronóstico: al ritmo actual no se agota', () => {
  const ahora = Date.parse('2026-11-24T10:00:00')
  expect(pronosticoCupo(40, 0.5, ahora + 2.5 * 3_600_000, ahora)).toBe('Al ritmo actual no se agota')
})

test('pronóstico: se agota a la hora local que toca', () => {
  const ahora = Date.parse('2026-11-24T10:00:00')
  const hora = new Date(ahora + 50 * 60_000)
  const hhmm = `${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`
  expect(pronosticoCupo(60, 0.25, ahora + 3.75 * 3_600_000, ahora)).toBe(`Al ritmo actual se agota ${hhmm}`)
})

test('pronóstico: sin datos de la ventana no dice nada', () => {
  expect(pronosticoCupo(40, null, null, 0)).toBe('')
  expect(pronosticoCupo(0, 0.5, 1000, 0)).toBe('')
})

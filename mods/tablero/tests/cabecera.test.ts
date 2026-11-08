import { expect, test } from 'claude-code/testing'

import { fmtReinicio } from '../hooks/core'

// Sábado 7 nov 2026, 21:40 (hora local): la semana reinicia el viernes a las 06:00.
const ahora = new Date(2026, 10, 7, 21, 40).getTime()

test('el reinicio de la semana dice día y hora local', () => {
  expect(fmtReinicio(new Date(2026, 10, 13, 6, 0).getTime(), ahora)).toBe('vie 06:00')
})

test('un reinicio del mismo día dice hoy y la hora', () => {
  expect(fmtReinicio(new Date(2026, 10, 7, 23, 5).getTime(), ahora)).toBe('hoy 23:05')
})

test('un reinicio de mañana dice mañana y la hora', () => {
  expect(fmtReinicio(new Date(2026, 10, 8, 1, 30).getTime(), ahora)).toBe('mañana 01:30')
})

test('sin reinicio conocido, o ya pasado, no hay texto', () => {
  expect(fmtReinicio(null, ahora)).toBe('')
  expect(fmtReinicio(undefined, ahora)).toBe('')
  expect(fmtReinicio(new Date(2026, 10, 7, 20, 0).getTime(), ahora)).toBe('')
})

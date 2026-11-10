import { expect, test } from 'claude-code/testing'

import { lineasDeEdicion, restoCompacto } from '../hooks/resumen-modelo'

const AHORA = Date.parse('2026-11-06T10:00:00Z')
const MIN = 60_000

test('restoCompacto da días y horas, horas y minutos o minutos', () => {
  expect(restoCompacto(AHORA + 25 * MIN, AHORA)).toBe('25m')
  expect(restoCompacto(AHORA + (4 * 60 + 38) * MIN, AHORA)).toBe('4h38m')
  expect(restoCompacto(AHORA + (6 * 1440 + 14 * 60) * MIN, AHORA)).toBe('6d14h')
  expect(restoCompacto(null, AHORA)).toBe('')
  expect(restoCompacto(AHORA - MIN, AHORA)).toBe('')
})

test('lineasDeEdicion aproxima las líneas de Edit, Write y NotebookEdit', () => {
  expect(lineasDeEdicion('Edit', { old_string: 'a\nb', new_string: 'a\nb\nc\nd' })).toEqual({ agregadas: 4, quitadas: 2 })
  expect(lineasDeEdicion('Edit', { old_string: '', new_string: 'x' })).toEqual({ agregadas: 1, quitadas: 0 })
  expect(lineasDeEdicion('Write', { content: 'uno\ndos\ntres\n' })).toEqual({ agregadas: 3, quitadas: 0 })
  expect(lineasDeEdicion('NotebookEdit', { new_source: 'a\nb' })).toEqual({ agregadas: 2, quitadas: 0 })
  expect(lineasDeEdicion('Read', { file_path: 'x' })).toEqual({ agregadas: 0, quitadas: 0 })
  expect(lineasDeEdicion('Edit', undefined)).toEqual({ agregadas: 0, quitadas: 0 })
  expect(lineasDeEdicion('Edit', { old_string: 5, new_string: null })).toEqual({ agregadas: 0, quitadas: 0 })
})

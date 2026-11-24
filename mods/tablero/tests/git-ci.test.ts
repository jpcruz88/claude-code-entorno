import { expect, test } from 'claude-code/testing'
import { estadoCi, parseShortstat, parseSinSubir } from '../hooks/git-ci'

test('shortstat con archivos, inserciones y borrados', () => {
  expect(parseShortstat(' 3 files changed, 24 insertions(+), 7 deletions(-)')).toEqual({ archivos: 3, mas: 24, menos: 7 })
})

test('shortstat con solo borrados y en singular', () => {
  expect(parseShortstat(' 1 file changed, 2 deletions(-)')).toEqual({ archivos: 1, mas: 0, menos: 2 })
  expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ archivos: 1, mas: 1, menos: 0 })
})

test('shortstat vacío: sin cambios', () => {
  expect(parseShortstat('')).toEqual({ archivos: 0, mas: 0, menos: 0 })
})

test('commits sin subir: un número, o null si git no lo sabe', () => {
  expect(parseSinSubir('2\n')).toBe(2)
  expect(parseSinSubir('')).toBeNull()
  expect(parseSinSubir('fatal: no upstream')).toBeNull()
})

test('CI: un fallo gana, luego lo pendiente, y todo pasado o saltado pasa', () => {
  expect(estadoCi('[{"bucket":"pass"},{"bucket":"fail"},{"bucket":"pending"}]')).toBe('falla')
  expect(estadoCi('[{"bucket":"pass"},{"bucket":"pending"}]')).toBe('corriendo')
  expect(estadoCi('[{"bucket":"pass"},{"bucket":"skipping"}]')).toBe('pasa')
})

test('CI: sin comprobaciones o con salida rara no dice nada', () => {
  expect(estadoCi('[]')).toBeNull()
  expect(estadoCi('no checks reported')).toBeNull()
  expect(estadoCi('{"bucket":"pass"}')).toBeNull()
})

import { expect, test } from 'claude-code/testing'

import { BARRA_ANCHO, filasVida, vidaDe } from '../hooks/vida'

const celdas = (fila: { tramos: { texto: string }[] }, simbolo: string) =>
  fila.tramos.reduce((n, t) => n + [...t.texto].filter(c => c === simbolo).length, 0)

test('la vida es lo que le queda de contexto', () => {
  expect(vidaDe(0)).toBe(100)
  expect(vidaDe(27)).toBe(73)
  expect(vidaDe(120)).toBe(0)
  expect(vidaDe(-5)).toBe(100)
  expect(vidaDe(null)).toBeNull()
})

test('sin lectura de contexto no hay barra de vida', () => {
  expect(filasVida({ contextoPct: null, columnas: 80 })).toEqual([])
})

test('la barra llena tantas celdas como vida le queda', () => {
  const fila = filasVida({ contextoPct: 50, columnas: 80 })[0]
  expect(celdas(fila, '█')).toBe(BARRA_ANCHO / 2)
  expect(celdas(fila, '░')).toBe(BARRA_ANCHO / 2)
})

test('con vida llena la barra está toda llena y con vida agotada, vacía', () => {
  expect(celdas(filasVida({ contextoPct: 0, columnas: 80 })[0], '█')).toBe(BARRA_ANCHO)
  expect(celdas(filasVida({ contextoPct: 100, columnas: 80 })[0], '█')).toBe(0)
})

test('el color cambia con la vida: verde con vida alta, ámbar a media, rojo cuando queda poca', () => {
  const tonoLleno = (contextoPct: number) =>
    filasVida({ contextoPct, columnas: 80 })[0].tramos.find(t => t.texto.includes('█'))?.tono
  expect(tonoLleno(10)).toBe('acento')
  expect(tonoLleno(55)).toBe('aviso')
  expect(tonoLleno(90)).toBe('peligro')
})

test('la etiqueta muestra la vida en número', () => {
  const texto = filasVida({ contextoPct: 50, columnas: 80 })[0].tramos.map(t => t.texto).join('')
  expect(texto).toContain('vida 50%')
})

test('en un panel angosto la etiqueta se recorta y la fila no se sale', () => {
  const fila = filasVida({ contextoPct: 50, columnas: 12 })[0]
  const ancho = fila.tramos.reduce((n, t) => n + [...t.texto].length, 0)
  expect(ancho).toBeLessThanOrEqual(12 - 4)
  expect(fila.tramos[0].texto).toBe('50% ')
  expect(celdas(fila, '█')).toBeGreaterThan(0)
})

import { expect, test } from 'claude-code/testing'

import { BARRA_ANCHO, filasVida, svgVida, tonoDeVida, vidaDe } from '../hooks/vida'

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

// --- escritorio: degradado continuo

test('en escritorio la barra de vida es un SVG con degradado rojo, ámbar y verde', () => {
  const s = svgVida(50, 200)
  expect(s.includes('<linearGradient')).toBe(true)
  expect(s.includes('#D0453F')).toBe(true)
  expect(s.includes('#E0A030')).toBe(true)
  expect(s.includes('#3B9C5F')).toBe(true)
  expect(s.includes('vida 50%')).toBe(true)
})

test('el relleno cubre la vida: la mitad de la barra con vida al 50 %', () => {
  expect(svgVida(50, 200).includes('width="100"')).toBe(true)
  expect(svgVida(100, 200).includes('width="200"')).toBe(true)
})

test('el degradado se extiende por toda la barra, no solo por el relleno', () => {
  expect(svgVida(20, 200).includes('gradientUnits="userSpaceOnUse"')).toBe(true)
})

test('la vida fuera de rango se acota a 0..100', () => {
  expect(svgVida(-5, 200).includes('vida 0%')).toBe(true)
  expect(svgVida(150, 200).includes('vida 100%')).toBe(true)
})

// --- casos límite: anchos mínimos, umbrales exactos, valores no finitos

const anchoTotal = (fila: { tramos: { texto: string }[] }) => fila.tramos.reduce((n, t) => n + [...t.texto].length, 0)

test('en un panel de 4 columnas o menos no hay espacio: no se dibuja la fila', () => {
  expect(filasVida({ contextoPct: 0, columnas: 4 })).toEqual([])
  expect(filasVida({ contextoPct: 0, columnas: 3 })).toEqual([])
})

test('con 100% y 5 columnas la fila cabe: la etiqueta se recorta y no excede el ancho', () => {
  const filas = filasVida({ contextoPct: 0, columnas: 5 })
  expect(filas.length).toBe(1)
  expect(anchoTotal(filas[0])).toBeLessThanOrEqual(5 - 4)
})

test('los umbrales exactos de color: 29 peligro, 30 aviso, 59 aviso, 60 acento', () => {
  const tono = (vida: number) => tonoDeVida(vida)
  expect(tono(29)).toBe('peligro')
  expect(tono(30)).toBe('aviso')
  expect(tono(59)).toBe('aviso')
  expect(tono(60)).toBe('acento')
})

test('el redondeo sube 59.5 a 60 (acento) y 29.5 a 30 (aviso)', () => {
  expect(vidaDe(40.5)).toBe(60)
  expect(vidaDe(70.5)).toBe(30)
})

test('NaN e Infinity no producen vida', () => {
  expect(vidaDe(Number.NaN)).toBeNull()
  expect(vidaDe(Number.POSITIVE_INFINITY)).toBeNull()
  expect(vidaDe(Number.NEGATIVE_INFINITY)).toBeNull()
})

test('el SVG con vida NaN no escribe NaN en el dibujo ni en la etiqueta', () => {
  const s = svgVida(Number.NaN, 200)
  expect(s.includes('NaN')).toBe(false)
})

test('nunca se dibuja una etiqueta recortada: en cualquier ancho es entera o vacía', () => {
  for (let columnas = 5; columnas <= 40; columnas++) {
    for (const contextoPct of [0, 29.5, 50, 70, 100]) {
      const filas = filasVida({ contextoPct, columnas })
      if (filas.length === 0) continue
      const vida = vidaDe(contextoPct)!
      const etiqueta = filas[0].tramos[0].texto
      const entera = [`vida ${vida}% `, `${vida}% `, '']
      expect(entera).toContain(etiqueta)
    }
  }
})

test('con 5 columnas (1 de contenido) no aparece el número suelto "5" de una etiqueta cortada', () => {
  const filas = filasVida({ contextoPct: 50, columnas: 5 })
  expect(filas[0].tramos[0].texto).not.toBe('5')
})

test('el tono sale de la vida redondeada, igual que la barra (29.6 → 30 → ámbar)', () => {
  expect(tonoDeVida(29.6)).toBe('aviso')
  expect(tonoDeVida(59.6)).toBe('acento')
  expect(tonoDeVida(29.4)).toBe('peligro')
})

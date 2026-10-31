import { expect, test } from 'claude-code/testing'

import { PASO_MS, animoDe, filasMascota, posicion, vidaDe } from '../hooks/mascota'

test('la vida es lo que le queda de contexto', () => {
  expect(vidaDe(0)).toBe(100)
  expect(vidaDe(27)).toBe(73)
  expect(vidaDe(120)).toBe(0)
  expect(vidaDe(-5)).toBe(100)
  expect(vidaDe(null)).toBeNull()
})

test('el ánimo baja con la vida', () => {
  expect(animoDe(100)).toBe('feliz')
  expect(animoDe(60)).toBe('feliz')
  expect(animoDe(59)).toBe('cansada')
  expect(animoDe(30)).toBe('cansada')
  expect(animoDe(29)).toBe('enferma')
  expect(animoDe(10)).toBe('enferma')
  expect(animoDe(9)).toBe('muriendo')
  expect(animoDe(1)).toBe('muriendo')
  expect(animoDe(0)).toBe('muerta')
})

test('se mueve de un lado a otro dentro de su ancho', () => {
  const ancho = 20
  const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => posicion(t, ancho, 'feliz'))
  expect(Math.min(...xs)).toBe(0)
  expect(Math.max(...xs)).toBeGreaterThan(5)
  for (const x of xs) {
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(ancho)
  }
})

test('la enferma camina más despacio y el muriendo y la muerta no se mueven', () => {
  const ancho = 20
  expect(posicion(1, ancho, 'enferma')).toBe(posicion(0, ancho, 'enferma'))
  expect(posicion(3, ancho, 'muriendo')).toBe(posicion(0, ancho, 'muriendo'))
  expect(posicion(3, ancho, 'muerta')).toBe(posicion(0, ancho, 'muerta'))
})

test('la mascota feliz se ve en color vivo; la enferma, en alerta', () => {
  const feliz = filasMascota({ contextoPct: 10, ahora: 0, columnas: 80 })
  const enferma = filasMascota({ contextoPct: 80, ahora: 0, columnas: 80 })
  expect(feliz.length).toBe(2)
  expect(feliz[0].tramos[0].tono).toBe('acento')
  expect(enferma[0].tramos[0].tono).toBe('peligro')
})

test('sin lectura de contexto no dibuja nada', () => {
  expect(filasMascota({ contextoPct: null, ahora: 0, columnas: 80 })).toEqual([])
})

test('nada se sale del ancho de la banda', () => {
  for (const filas of [
    filasMascota({ contextoPct: 0, ahora: 9000, columnas: 30 }),
    filasMascota({ contextoPct: 99, ahora: 4000, columnas: 30 }),
  ]) {
    for (const fila of filas) {
      const ancho = fila.tramos.reduce((n, tr) => n + tr.texto.length, 0)
      expect(ancho).toBeLessThanOrEqual(30)
    }
  }
})

test('el paso de la animación dura 250 ms, para que camine sin saltos largos', () => {
  expect(PASO_MS).toBe(250)
})

test('al caminar la mascota alterna tres poses de pata distintas, no solo dos', () => {
  const patas = new Set<string>()
  for (let paso = 0; paso < 4; paso++) {
    const fila = filasMascota({ contextoPct: 10, ahora: paso * PASO_MS, columnas: 80 })[1]
    patas.add(fila.tramos[0].texto.trim())
  }
  expect(patas.size).toBeGreaterThanOrEqual(3)
})

import { expect, test } from 'claude-code/testing'

import { EMOJI_AGENTES, PASO_AGENTE_MS, barraAvance, barraIndeterminada, emojiDe, fotogramaDeMarcha, glifoAgente, pistaCarril, posicionMarcha } from '../hooks/agentes-anim'

test('con la animación apagada, un agente en marcha muestra siempre el mismo cuadro', () => {
  expect(glifoAgente(0, 'running', false)).toBe('◐')
  expect(glifoAgente(3 * PASO_AGENTE_MS, 'running', false)).toBe('◐')
})

test('el fotograma de marcha cambia cada paso solo si hay agentes caminando', () => {
  expect(fotogramaDeMarcha(0, 1)).not.toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 1))
  expect(fotogramaDeMarcha(0, 0)).toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 0))
})

test('un agente en marcha cambia de cuadro cada PASO_AGENTE_MS', () => {
  expect(PASO_AGENTE_MS).toBe(250)
  expect(glifoAgente(0, 'running')).not.toBe(glifoAgente(PASO_AGENTE_MS, 'running'))
})

test('el ciclo de marcha son cuatro cuadros distintos y se repite', () => {
  const cuadros = [0, 1, 2, 3].map(i => glifoAgente(i * PASO_AGENTE_MS, 'running'))
  expect(new Set(cuadros).size).toBe(4)
  expect(glifoAgente(4 * PASO_AGENTE_MS, 'running')).toBe(cuadros[0])
})

test('los agentes terminados quedan fijos, sin importar el momento', () => {
  expect(glifoAgente(0, 'done')).toBe('✓')
  expect(glifoAgente(999_999, 'done')).toBe('✓')
  expect(glifoAgente(0, 'failed')).toBe('✗')
  expect(glifoAgente(777, 'failed')).toBe('✗')
  expect(glifoAgente(0, 'other')).toBe('■')
})

// --- cangrejo en el carril: emoji por agente que va de un lado a otro mientras trabaja

test('cada agente tiene un emoji fijo, siempre el mismo para el mismo id', () => {
  expect(emojiDe('ag1')).toBe(emojiDe('ag1'))
  expect(EMOJI_AGENTES).toContain(emojiDe('ag1'))
  expect(EMOJI_AGENTES).toContain(emojiDe('otro-agente'))
})

test('posicionMarcha va de izquierda a derecha y regresa, sin salirse de la pista', () => {
  // pista de 10 celdas: el emoji ocupa 2, así que las posiciones van de 0 a 8
  const pos = Array.from({ length: 17 }, (_, i) => posicionMarcha(i * PASO_AGENTE_MS, 10, 0))
  expect(pos.slice(0, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  expect(pos.slice(9)).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
  expect(Math.min(...pos)).toBeGreaterThanOrEqual(0)
  expect(Math.max(...pos)).toBeLessThanOrEqual(8)
})

test('posicionMarcha con pista demasiado corta no mueve el emoji', () => {
  expect(posicionMarcha(5 * PASO_AGENTE_MS, 2, 0)).toBe(0)
  expect(posicionMarcha(5 * PASO_AGENTE_MS, 1, 0)).toBe(0)
})

test('pistaCarril parte la barra alrededor del emoji sin perder celdas', () => {
  const g = { before: 3, bar: 4, after: 3 }
  for (const p of [0, 2, 5, 8]) {
    const { antes, despues } = pistaCarril(g, p)
    const cuenta = (ts: { texto: string }[]) => ts.reduce((n, t) => n + [...t.texto].length, 0)
    expect(cuenta(antes) + 2 + cuenta(despues)).toBe(10)
  }
})

test('pistaCarril sin emoji deja toda la pista en un trozo', () => {
  const { antes, despues } = pistaCarril({ before: 2, bar: 3, after: 1 }, null)
  expect(despues).toEqual([])
  expect(antes.reduce((n, t) => n + [...t.texto].length, 0)).toBe(6)
})

test('la barra del carril usa el tono de barra y lo demás es tenue', () => {
  const { antes } = pistaCarril({ before: 1, bar: 2, after: 0 }, null)
  expect(antes).toEqual([
    { texto: '·', barra: false },
    { texto: '━━', barra: true },
  ])
})

test('la barra de avance llena celdas según done/total', () => {
  expect(barraAvance(0, 4, 8)).toBe('░░░░░░░░')
  expect(barraAvance(2, 4, 8)).toBe('████░░░░')
  expect(barraAvance(4, 4, 8)).toBe('████████')
})

test('la barra de avance se acota y tolera datos raros', () => {
  expect(barraAvance(9, 4, 8)).toBe('████████')
  expect(barraAvance(-1, 4, 8)).toBe('░░░░░░░░')
  expect(barraAvance(1, 0, 8)).toBe('░░░░░░░░')
  expect(barraAvance(NaN, 4, 8)).toBe('░░░░░░░░')
  expect(barraAvance(1, 4, 0)).toBe('')
})

test('la barra indeterminada tiene el ancho pedido y su bloque se mueve con el tiempo', () => {
  const a = barraIndeterminada(0, 10)
  const b = barraIndeterminada(3 * PASO_AGENTE_MS, 10)
  expect([...a].length).toBe(10)
  expect(a).not.toBe(b)
  expect(barraIndeterminada(0, 2)).toBe('██')
})

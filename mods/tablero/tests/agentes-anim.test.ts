import { expect, test } from 'claude-code/testing'

import { PASO_AGENTE_MS, barraIndeterminada, fotogramaDeMarcha, pistaCarril } from '../hooks/agentes-anim'

test('el fotograma de marcha cambia cada paso solo si hay agentes caminando', () => {
  expect(fotogramaDeMarcha(0, 1)).not.toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 1))
  expect(fotogramaDeMarcha(0, 0)).toBe(fotogramaDeMarcha(PASO_AGENTE_MS, 0))
})

// --- cangrejo en el carril: emoji por agente que va de un lado a otro mientras trabaja

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

test('la barra indeterminada tiene el ancho pedido y su bloque se mueve con el tiempo', () => {
  const a = barraIndeterminada(0, 10)
  const b = barraIndeterminada(3 * PASO_AGENTE_MS, 10)
  expect([...a].length).toBe(10)
  expect(a).not.toBe(b)
  expect(barraIndeterminada(0, 2)).toBe('██')
})

// Indicador por estado: la luna gira mientras el agente trabaja; terminado ✅, fallido ❌, detenido 🛑.
import { CARRILES_VISIBLES, emojiDeEstado } from '../hooks/agentes-anim'

test('un agente en marcha muestra una luna que gira, un cuadro por paso', () => {
  expect(emojiDeEstado(0, 'running')).toBe('🌑')
  expect(emojiDeEstado(PASO_AGENTE_MS, 'running')).toBe('🌒')
  expect(emojiDeEstado(8 * PASO_AGENTE_MS, 'running')).toBe('🌑')
})

test('cada agente va en su fase: el desfase cambia la luna de un mismo instante', () => {
  expect(emojiDeEstado(0, 'running', 1)).toBe('🌒')
})

test('con la animación apagada, un agente en marcha muestra siempre la misma luna', () => {
  expect(emojiDeEstado(3 * PASO_AGENTE_MS, 'running', 0, false)).toBe('🌑')
})

test('terminado, fallido y detenido tienen su emoji fijo', () => {
  expect(emojiDeEstado(0, 'done')).toBe('✅')
  expect(emojiDeEstado(0, 'failed')).toBe('❌')
  expect(emojiDeEstado(0, 'stopped')).toBe('🛑')
})

test('la lista muestra hasta siete agentes', () => {
  expect(CARRILES_VISIBLES).toBe(7)
})

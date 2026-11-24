import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_ARCHITECT,
  addCard,
  cerrarConsultas,
  endConsult,
  isAdvising,
  normalizeCard,
  startConsult,
} from '../hooks/core'
import type { AgentCard } from '../types'

const tarjeta = (id: string, status: string): AgentCard => ({ ...normalizeCard({ id }), status })

test('una consulta que se reanuda vuelve a estar abierta, con su hora de inicio', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: 'advisor tool' })
  a = endConsult(a, 10, null, 's1')
  a = startConsult(a, { id: 's1', at: 50, moment: 'before done', via: 'again' })
  expect(a.consults.length).toBe(1)
  expect(a.consults[0]).toMatchObject({ at: 0, endAt: null })
  expect(isAdvising(a)).toBe(true)
})

test('cerrarConsultas termina las abiertas y deja las ya cerradas como estaban', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: 'advisor tool' })
  a = endConsult(a, 5, null, 's1')
  a = startConsult(a, { id: 's2', at: 7, moment: 'before done', via: 'advisor tool' })
  const cerrada = cerrarConsultas(a, 20)
  expect(cerrada.consults.map(c => c.endAt)).toEqual([5, 20])
  expect(isAdvising(cerrada)).toBe(false)
})

test('cerrarConsultas no cierra la de un subagente asesor que sigue vivo (su id está en ids)', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 'srv', at: 0, moment: 'before done', via: 'advisor tool' })
  a = startConsult(a, { id: 'ag1', at: 1, moment: 'before a plan', via: 'architect' })
  a = { ...a, ids: ['ag1'] }
  const cerrada = cerrarConsultas(a, 9)
  expect(cerrada.consults.map(c => c.endAt)).toEqual([9, null])
})

test('al pasar de 24 tarjetas se quita la terminada más vieja, nunca una en curso', () => {
  let cards: AgentCard[] = [tarjeta('viva', 'running')]
  for (let i = 0; i < 23; i += 1) cards = addCard(cards, tarjeta(`t${i}`, 'done'))
  expect(cards.length).toBe(24)
  cards = addCard(cards, tarjeta('nueva', 'running'))
  expect(cards.length).toBe(24)
  expect(cards[0]?.id).toBe('viva')
  expect(cards.some(c => c.id === 't0')).toBe(false)
  expect(cards.at(-1)?.id).toBe('nueva')
})

test('si las 24 están en curso no se quita ninguna: la lista pasa de 24', () => {
  let cards: AgentCard[] = []
  for (let i = 0; i < 25; i += 1) cards = addCard(cards, tarjeta(`r${i}`, 'running'))
  expect(cards.length).toBe(25)
  expect(cards[0]?.id).toBe('r0')
})

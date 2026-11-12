import { expect, test } from 'claude-code/testing'

import { esperaPersona } from '../hooks/core'

// Un `ask` solo espera a la persona cuando es ella quien lo responde. En modo automático lo decide el
// clasificador, salvo el `ask` que hizo el hook de un plugin: ese siempre va a la persona.

test('fuera del modo automático un ask espera a la persona', () => {
  expect(esperaPersona('default', { decision: 'ask' })).toBe(true)
  expect(esperaPersona('acceptEdits', { decision: 'ask' })).toBe(true)
  expect(esperaPersona(undefined, { decision: 'ask' })).toBe(true)
})

test('en modo automático un ask del motor no espera a la persona: lo decide el clasificador', () => {
  expect(esperaPersona('auto', { decision: 'ask' })).toBe(false)
})

test('en modo automático el ask de un plugin sí espera a la persona', () => {
  expect(esperaPersona('auto', { decision: 'ask', plugin: 'spec-gate' })).toBe(true)
})

test('un allow o un deny nunca esperan a nadie', () => {
  expect(esperaPersona('default', { decision: 'allow' })).toBe(false)
  expect(esperaPersona('default', { decision: 'deny' })).toBe(false)
})

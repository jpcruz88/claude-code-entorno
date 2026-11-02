import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { emojiDe } from '../hooks/agentes-anim'

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: {
    title: 'Flightdeck',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

const engine = (on: On) => {
  const reloj = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ag1' }))
  return reloj
}

const encargo = {
  prompt: 'Write the parser tests',
  description: 'Write the parser tests',
  subagentType: 'general-purpose',
  tool_use_id: 'tu1',
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
}

// Texto plano de un nodo del árbol que dibuja el motor (Box/Text con children anidados).
const texto = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map(texto).join('')
  if (n && typeof n === 'object' && 'children' in n) return texto((n as { children: unknown }).children)
  return ''
}

// La pista del carril: el Text que contiene el emoji del agente como hijo. Devuelve su texto completo.
const pistaDe = (arbol: unknown, emoji: string): string | undefined => {
  let hallada: string | undefined
  const visita = (n: unknown): void => {
    if (hallada !== undefined || !n || typeof n !== 'object') return
    const hijos = (n as { children?: unknown }).children
    if (!Array.isArray(hijos)) return
    if (hijos.some(h => h && typeof h === 'object' && (h as { type?: string }).type === 'Text' && texto(h) === emoji)) {
      hallada = texto(n)
      return
    }
    hijos.forEach(visita)
  }
  visita(arbol)
  return hallada
}

test('con animación apagada, el emoji del agente no cambia de sitio mientras trabaja', { options: { banda: true, animacion: false } }, async ($, on) => {
  const reloj = engine(on)
  await $.turn.start({ text: 'go', turnId: 'P1' })
  await $.agent.spawn(encargo as never)
  const emoji = emojiDe('ag1')
  let ui = await $.ui.mount(pane(64) as never)
  const primera = pistaDe(await ui.drawn(), emoji)
  expect(primera).toBeDefined()
  // Ocho pasos de 250 ms; se vuelve a montar para que el panel se dibuje con la hora nueva.
  for (let k = 0; k < 8; k += 1) await reloj.advance(250)
  await ui.unmount()
  ui = await $.ui.mount(pane(64) as never)
  expect(pistaDe(await ui.drawn(), emoji)).toBe(primera)
  await ui.unmount()
})

test('control: con animación encendida, el emoji sí se mueve', { options: { banda: true } }, async ($, on) => {
  const reloj = engine(on)
  await $.turn.start({ text: 'go', turnId: 'P2' })
  await $.agent.spawn(encargo as never)
  const emoji = emojiDe('ag1')
  let ui = await $.ui.mount(pane(64) as never)
  const primera = pistaDe(await ui.drawn(), emoji)
  for (let k = 0; k < 8; k += 1) await reloj.advance(250)
  await ui.unmount()
  ui = await $.ui.mount(pane(64) as never)
  expect(pistaDe(await ui.drawn(), emoji)).not.toBe(primera)
  await ui.unmount()
})

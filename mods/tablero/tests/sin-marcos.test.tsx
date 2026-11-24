import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// 1.1.0: el panel tiene como mucho un marco (el exterior). Las secciones son títulos con `weight`
// y color `subtle`, separadas con `gap`; ningún Box con borderStyle dentro del panel.

const pane = {
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
}

const motor = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
}

const marcos = (n: unknown, out: unknown[] = []): unknown[] => {
  if (typeof n !== 'object' || n === null) return out
  const nodo = n as { type?: string; props?: { borderStyle?: string }; children?: unknown[] }
  if (nodo.type === 'Box' && nodo.props?.borderStyle) out.push(nodo)
  for (const k of nodo.children ?? []) marcos(k, out)
  return out
}

for (const layout of ['diagrama', 'compact'] as const) {
  test(`en la distribución ${layout} el panel no dibuja más marco que el exterior`, { options: { layout } }, async ($, on) => {
    motor(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(pane as never)
    expect(marcos(await ui.drawn()).length).toBeLessThanOrEqual(1)
    await ui.unmount()
  })
}

// `bold` está obsoleto: el panel usa `weight`. Ningún elemento dibujado lleva `bold`.
const conBold = (n: unknown, out: unknown[] = []): unknown[] => {
  if (typeof n !== 'object' || n === null) return out
  const nodo = n as { props?: { bold?: unknown }; children?: unknown[] }
  if (nodo.props?.bold) out.push(nodo)
  for (const k of nodo.children ?? []) conBold(k, out)
  return out
}

for (const layout of ['diagrama', 'compact', 'wide'] as const) {
  test(`en la distribución ${layout} ningún texto usa bold, todo va con weight`, { options: { layout } }, async ($, on) => {
    motor(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(pane as never)
    expect(conBold(await ui.drawn())).toEqual([])
    await ui.unmount()
  })
}

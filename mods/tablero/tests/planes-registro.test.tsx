import { expect, test } from 'claude-code/testing'

// La herramienta de planes vive ahora en el tablero: mcp__tablero__plan_progress.
const TOOL = 'mcp__tablero__plan_progress'

const motor = (on: any) => {
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_000_000 }))
}

test('plan_progress crea el plan y responde con su avance', async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
  const r: any = await $.tool.call({ tool: TOOL, id: 'x', title: 'Arreglar login', steps: [{ title: 'A' }, { title: 'B' }] } as never)
  expect(JSON.stringify(r)).toContain('x: 0/2')
})

test('las reglas de planes van al prompt y nombran la herramienta del tablero', async ($, on) => {
  motor(on)
  on('prompt.compose', () => ({ sections: [] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
  const r: any = await $.prompt.compose({ sections: [], model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as never)
  const seccion = r.sections.find((s: any) => s.id === 'tablero:planes')
  expect(seccion).toBeDefined()
  expect(seccion.text).toContain(TOOL)
})

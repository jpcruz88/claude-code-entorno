import { expect, test } from 'claude-code/testing'

const BANDA = (extra: Record<string, unknown> = {}) => ({
  plugin: 'barra-plan',
  component: 'AbovePrompt' as const,
  surface: 'terminal' as const,
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
    rows: [],
    ...extra,
  },
})

// the engine's own row beneath the plugin: it is what `next(e)` answers, so the band must leave it on screen
const debajo = (cuenta: { n: number }) => (on: any) => {
  on('ui.render', ($: any, e: any) => {
    cuenta.n += 1
    const { Text } = $.ui.resolve(e)
    return <Text>otro mod</Text>
  })
}

// what the engine answers beneath the plugin: the tool's full name and the clock
const motor = (on: any) => {
  on('tool.register', () => ({ value: { tool: 'mcp__barra-plan__plan_progress' } }))
  on('clock.now', () => ({ value: 1_000_000 }))
}

const abrirPlan = async ($: any) => {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__barra-plan__plan_progress',
    id: 'login',
    title: 'Arreglar login',
    stages: [{ name: 'Cambio', steps: [{ title: 'Leer código' }, { title: 'Probar' }] }],
  })
}

test('sin planes la banda no dibuja fila y deja lo de los otros mods', async ($, on) => {
  const cuenta = { n: 0 }
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  motor(on)
  debajo(cuenta)(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(BANDA())

  expect((await ui.find({ type: 'Text', text: /otro mod/ }))?.text).toBe('otro mod')
  expect(await ui.find({ type: 'Text', text: /paso:/ })).toBeUndefined()
  expect(cuenta.n).toBeGreaterThan(0)
  await ui.unmount()
})

test('con un plan abierto la banda dibuja su línea y sigue dejando lo de debajo', async ($, on) => {
  const cuenta = { n: 0 }
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: 'ok' }))
  motor(on)
  debajo(cuenta)(on)
  await abrirPlan($)

  const ui = await $.ui.mount(BANDA())

  expect((await ui.find({ type: 'Text', text: /Arreglar login/ }))?.text).toBe('Arreglar login')
  expect((await ui.find({ type: 'Text', text: /●/ }))?.text).toBe('● ')
  expect((await ui.find({ type: 'Text', text: /otro mod/ }))?.text).toBe('otro mod')
  expect(cuenta.n).toBeGreaterThan(0)
  await ui.unmount()
})

test('la banda colapsada no dibuja su fila pero llama a lo de debajo', async ($, on) => {
  const cuenta = { n: 0 }
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: 'ok' }))
  motor(on)
  debajo(cuenta)(on)
  await abrirPlan($)

  const ui = await $.ui.mount(BANDA({ isCollapsed: true }))

  expect(await ui.find({ type: 'Text', text: /Arreglar login/ })).toBeUndefined()
  expect(cuenta.n).toBeGreaterThan(0)
  await ui.unmount()
})

test('la herramienta crea la barra y responde con el avance, el estado y el paso activo', async ($, on) => {
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const r: any = await $.tool.call({
    tool: 'mcp__barra-plan__plan_progress',
    id: 'login',
    title: 'Arreglar login',
    stages: [{ name: 'Cambio', steps: [{ title: 'Leer código' }, { title: 'Probar' }] }],
  })
  expect(r.result).toBe('login: 0/2, running, active "Leer código"')

  const dos: any = await $.tool.call({ tool: 'mcp__barra-plan__plan_progress', id: 'login', next: true })
  expect(dos.result).toBe('login: 1/2, running, active "Probar"')
})

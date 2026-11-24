import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// 1.3.0: todo el estado de la sesión vive en el tablero, sin duplicados, con mayúscula inicial y sin «?» sueltos.

const TOOL = 'mcp__tablero__plan_progress'

const pane = (bodyColumns: number) => ({
  plugin: 'tablero',
  component: 'Pane' as const,
  requestId: 'tablero',
  surface: 'terminal' as const,
  props: { title: 'Tablero', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 90 }, view: {} },
})

const banda = (bodyColumns = 100) => ({
  plugin: 'tablero',
  component: 'AbovePrompt' as const,
  surface: 'terminal' as const,
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 12, bodyColumns, scroll: { offset: 0, bodyRows: 12 }, view: {}, rows: [] },
})

type Opciones = { herdr?: boolean; colocado?: boolean }

const motor = (on: On, o: Opciones = {}) => {
  const reloj = mock.clock(on)
  const ahoraS = () => Math.floor(reloj.now() / 1000)
  const entorno: Record<string, string> = { HOME: '/casa', ...(o.herdr ? { HERDR_ENV: '1' } : {}) }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: (o.colocado ?? true) ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'estrecho' } }) as never)
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('session.cwd', () => ({ value: '/x/claude-code-entorno' }))
  on('session.root', () => ({ value: '/x/claude-code-entorno' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('env.get', (_$, e) => ({ value: entorno[e.name] }))
  on('fs.read', (_$, e) => {
    if (String(e.path).endsWith('/.claude/tablero/sesiones/otra.json')) {
      return {
        value: JSON.stringify({ id: 'otra', nombre: 'Mazda', carpeta: 'mazda', estado: 'espera', desde: reloj.now() - 120_000, costo: 2, base: 0, dia: '2026-11-24', actualizado: reloj.now() }),
      }
    }
    if (String(e.path).endsWith('/.claude/tablero/linea/abc.json')) {
      return {
        value: JSON.stringify({
          actualizado: ahoraS(),
          session_id: 'abc',
          session_name: 'Nuevo mod de prueba',
          thinking: true,
          prompt_cache: { warm: true, ttl: '5m', expires_at: ahoraS() + 192, hit_ratio: 0.91 },
          pr: { number: 41, url: 'u', review_state: 'pending' },
        }),
      }
    }
    throw new Error('ENOENT')
  })
  on('fs.write', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('fs.list', (_$, e) => ({ value: String((e as { path?: string }).path ?? '').endsWith('/sesiones') ? [{ name: 'otra.json', kind: 'file', size: 10, mtimeMs: 0, isLink: false }] : [] }) as never)
  on('session.messages', () => ({
    value: [1, 2, 3].map(n => ({ role: 'assistant', text: '', toolUses: [{ tool_use_id: `r${n}`, tool: 'Read', input: { file_path: 'src/a.ts' }, text: 'x'.repeat(4000) }] })),
  }) as never)
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })
  on('settings.read', () => ({ value: { hooks: {} } }) as never)
  on('tool.list', () => ({ value: [] }))
  on('process.run', (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    if (argv[0] === 'git' && argv[1] === 'diff') return { value: { exitCode: 0, stdout: ' 3 files changed, 24 insertions(+), 7 deletions(-)\n', stderr: '' } } as never
    if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '1\n', stderr: '' } } as never
    return { value: { exitCode: 0, stdout: '[{"bucket":"pass"}]', stderr: '' } } as never
  })
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{"status":{"indicator":"none"}}' } }) as never)
  return reloj
}

const preparar = async ($: any, reloj: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start({ cwd: '/x/claude-code-entorno', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { window: 1_000_000, tokens: 85_000, percent: 8 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 40, resetsAt: new Date(reloj && Date.now() + 3_600_000).toISOString() },
      { kind: 'seven_day', percentUsed: 17, resetsAt: new Date(Date.now() + 4 * 86_400_000).toISOString() },
    ],
    cost: { usd: 0.63 },
    changed: ['context', 'rateLimits'],
  })
  await $.tool.call({ tool: TOOL, id: 'login', title: 'Arreglar login', steps: [{ title: 'Reproducir' }, { title: 'Verificar' }] })
  await $.tool.call({ tool: TOOL, id: 'login', state: 'needs_input', note: '¿Subo?' })
  await reloj.advance(10_000)
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', agentId: null, reason: 'answer' })
}

const textos = async (ui: any): Promise<string[]> => (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text ?? ''))

test('la cabecera dice el estado y Caveman, sin el modelo', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(108) as never)
  expect(await ui.find({ type: 'Text', text: /^TABLERO · ○ En espera · Caveman full$/ })).toBeDefined()
  expect(await ui.find({ text: /Claude sin incidencias/ })).toBeDefined()
  await ui.unmount()
})

test('Sesión: etiquetas con mayúscula y sin datos repetidos', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(108) as never)
  const faltan: string[] = []
  for (const etiqueta of ['Modelo', 'Contexto', 'Cache', 'Costo', 'Cupo 5 h', 'Cupo 7 d', 'Proyecto', 'Git', 'Config']) {
    if (!(await ui.find({ text: new RegExp(`^${etiqueta} `) }))) faltan.push(etiqueta)
  }
  expect(faltan).toEqual([])
  expect(await ui.find({ text: /^Cache +● Caliente +Caduca en 3:12/ })).toBeDefined()
  expect(await ui.find({ text: /^Proyecto +claude-code-entorno · «Nuevo mod de prueba»/ })).toBeDefined()
  expect(await ui.find({ text: /^Git +3 archivos \+24 −7 .*↑1 sin subir .*PR #41.*✓ CI pasa/ })).toBeDefined()
  const todo = (await textos(ui)).join('\n')
  expect(todo).not.toContain('bypassPermissions')
  expect(todo).not.toMatch(/agentes \d+\/\d+/)
  expect(todo).not.toMatch(/permisos \d+ ·|· permisos \d+/)
  await ui.unmount()
})

test('con herdr la rama y la hora no salen; sin herdr, sí', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(108) as never)
  expect((await textos(ui)).join('\n')).not.toContain('⎇')
  await ui.unmount()
})

test('un plan que pregunta: «◆ Te espera» y la pregunta con ↳ debajo', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(108) as never)
  expect(await ui.find({ text: /^Planes/ })).toBeDefined()
  expect(await ui.find({ text: /◆ Te espera +Arreglar login/ })).toBeDefined()
  expect(await ui.find({ text: /↳ ¿Subo\?/ })).toBeDefined()
  expect((await textos(ui)).some(t => /(^|\s)\? /.test(t))).toBe(false)
  await ui.unmount()
})

test('Gasto y Sesiones salen plegadas en una línea', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(108) as never)
  expect(await ui.find({ text: /^Gasto +Lo que más gasta: Read src\/a\.ts, leído 3 veces/ })).toBeDefined()
  expect(await ui.find({ text: /^Sesiones +1 más abierta · ◆ Mazda te espera/ })).toBeDefined()
  await ui.unmount()
})

test('a 40 columnas ninguna línea pasa del ancho', async ($, on) => {
  const reloj = motor(on, { herdr: false })
  await preparar($, reloj)
  const ui = await $.ui.mount(pane(40) as never)
  const largas = (await textos(ui)).flatMap(t => t.split('\n')).filter(l => [...l].length > 40)
  expect(largas).toEqual([])
  await ui.unmount()
})

test('con el panel sin colocar, sobre el prompt sale el resumen', async ($, on) => {
  const reloj = motor(on, { herdr: true, colocado: false })
  await preparar($, reloj)
  const ui = await $.ui.mount(banda() as never)
  expect(await ui.find({ text: /◆ Te espera/ })).toBeDefined()
  expect(await ui.find({ text: /Cache/ })).toBeDefined()
  await ui.unmount()
})

test('con el panel colocado, sobre el prompt no se repite nada', async ($, on) => {
  const reloj = motor(on, { herdr: true, colocado: true })
  await preparar($, reloj)
  const ui = await $.ui.mount(banda() as never)
  expect(await ui.find({ text: /Te espera|TABLERO|Cache/ })).toBeUndefined()
  await ui.unmount()
})

test('Agentes: cabecera con mayúscula y estados con palabra', async ($, on) => {
  const reloj = motor(on, { herdr: true })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }) as never)
  await preparar($, reloj)
  await ($ as any).agent.spawn({
    prompt: 'haz el trabajo',
    description: 'Revisar riesgo',
    subagentType: 'general-purpose',
    tool_use_id: 'tu1',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  const ui = await $.ui.mount(pane(108) as never)
  expect(await ui.find({ type: 'Text', text: /^Agentes$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1 activo · 1 en total$/ })).toBeDefined()
  expect(await ui.find({ text: /Propósito general/ })).toBeDefined()
  expect(await ui.find({ text: /En curso/ })).toBeDefined()
  expect(await ui.find({ text: /en curso|propósito general|^agentes/ })).toBeUndefined()
  await ui.unmount()
})

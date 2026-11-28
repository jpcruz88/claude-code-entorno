import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Cada tablero anota en ~/.claude/tablero/conversaciones/<sesión>.json lo que su sesión envía a otra.

const CARPETA = '/casa/.claude/tablero/conversaciones'

type Opciones = {
  /** Lo que responde `herdr agent get`: JSON, 'falla' o 'lento'. */
  herdrGet?: string
  /** Las demás sesiones en el registro de Sesiones. */
  sesiones?: Record<string, unknown>[]
  /** La llamada a herramienta falla. */
  llamadaFalla?: boolean
  /** Variables de entorno; por omisión HOME=/casa. */
  entorno?: Record<string, string>
}

const getDe = (sesion: string, titulo: string) =>
  JSON.stringify({ id: 'cli:agent:get', result: { agent: { agent_session: { value: sesion }, terminal_title_stripped: titulo, pane_id: 'w5:p2' }, type: 'agent_info' } })

const motor = (on: On, o: Opciones = {}) => {
  const reloj = mock.clock(on)
  const escritos: Record<string, string> = {}
  const llamadasHerdr: string[][] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'abc' }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.register', () => ({ value: { tool: 'mcp__tablero__plan_progress' } }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  on('env.get', (_$, e) => ({ value: (o.entorno ?? { HOME: '/casa', HERDR_ENV: '1' })[e.name] }))
  on('fs.write', (_$, e) => {
    escritos[String(e.path)] = String(e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const ruta = String((e as { path?: string }).path ?? '')
    if (ruta.endsWith('/sesiones')) return { value: (o.sesiones ?? []).map(s => ({ name: `${s.id}.json`, kind: 'file', size: 10, mtimeMs: 0, isLink: false })) } as never
    return { value: [] } as never
  })
  on('fs.read', (_$, e) => {
    const s = (o.sesiones ?? []).find(x => String(e.path).endsWith(`/sesiones/${x.id}.json`))
    if (s) return { value: JSON.stringify({ ...s, actualizado: reloj.now() }) }
    throw new Error('ENOENT')
  })
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })
  on('process.run', async (_$, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    if (argv[0] === 'herdr') {
      llamadasHerdr.push(argv)
      if (o.herdrGet === 'falla' || o.herdrGet === undefined) return { value: { exitCode: 1, stdout: '', stderr: 'no such agent' } } as never
      if (o.herdrGet === 'lento') await reloj.advance(5_000)
      return { value: { exitCode: 0, stdout: o.herdrGet, stderr: '' } } as never
    }
    throw new Error('ENOENT')
  })
  on('http.fetch', () => {
    throw new Error('sin red')
  })
  on('tool.call', () => (o.llamadaFalla ? { result: {}, text: 'timeout', isError: true } : { result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  return { reloj, escritos, llamadasHerdr }
}

const iniciar = async ($: any) => {
  await $.session.start({ cwd: '/x/proyecto', surface: 'terminal', isInteractive: true })
}

const mensajes = (escritos: Record<string, string>) => JSON.parse(escritos[`${CARPETA}/abc.json`] ?? '[]') as Record<string, unknown>[]

test('herdr agent prompt con --wait: se anota con el destino resuelto y se cierra la espera al terminar', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer "Revisa el diff" --wait', tool_use_id: 'b1' } as never)
  const [m] = mensajes(escritos)
  expect(m).toMatchObject({ id: 'b1', de: 'abc', a: 'rev', aNombre: 'Revisor', canal: 'herdr', resumen: 'Revisa el diff', espera: true })
  expect(typeof m!.esperaFin).toBe('number')
})

test('sin --wait no se cierra la espera al terminar la llamada', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1' } as never)
  expect(mensajes(escritos)[0]).toMatchObject({ a: 'rev', espera: false, esperaFin: null })
})

test('si herdr no sabe el destino, se anota con su nombre y sin sesión', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: 'falla' })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1' } as never)
  expect(mensajes(escritos)[0]).toMatchObject({ a: null, aNombre: 'reviewer' })
})

test('si herdr tarda más de 2 s, el destino queda sin resolver', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: 'lento' })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1' } as never)
  expect(mensajes(escritos)[0]).toMatchObject({ a: null, aNombre: 'reviewer' })
})

test('un envío a la propia sesión no se anota', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('abc', 'Yo') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt yo hola', tool_use_id: 'b1' } as never)
  expect(mensajes(escritos)).toEqual([])
})

test('lo que envía un subagente no se anota', async ($, on) => {
  const { escritos, llamadasHerdr } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1', agentId: 'sub1' } as never)
  expect(mensajes(escritos)).toEqual([])
  expect(llamadasHerdr).toEqual([])
})

test('SendMessage busca el destino por nombre en el registro de Sesiones', async ($, on) => {
  const { reloj, escritos } = motor(on, {
    sesiones: [{ id: 'otra', nombre: 'Mazda', carpeta: 'mazda', estado: 'inactiva', desde: 0, costo: 0, base: 0, dia: '2026-11-24' }],
  })
  await iniciar($)
  await reloj.advance(10_000)
  await $.tool.call({ tool: 'SendMessage', to: 'Mazda', message: '¿Subo el PR?', tool_use_id: 's1' } as never)
  expect(mensajes(escritos)[0]).toMatchObject({ a: 'otra', aNombre: 'Mazda', canal: 'claude', resumen: '¿Subo el PR?' })
})

test('agent wait no crea mensaje: marca la espera del último mensaje a ese destino', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent wait reviewer', tool_use_id: 'b2' } as never)
  const lista = mensajes(escritos)
  expect(lista).toHaveLength(1)
  expect(lista[0]).toMatchObject({ id: 'b1', espera: true })
  expect(typeof lista[0]!.esperaFin).toBe('number')
})

test('al terminar un turno del lead, el registro de Sesiones lleva turnoFin', async ($, on) => {
  const { reloj, escritos } = motor(on)
  await iniciar($)
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'T1', agentId: null, reason: 'answer' } as never)
  const fin = reloj.now()
  await reloj.advance(10_000)
  const registro = JSON.parse(escritos['/casa/.claude/tablero/sesiones/abc.json'] ?? '{}') as { turnoFin?: number }
  expect(registro.turnoFin).toBe(fin)
})

test('un --wait que falla no cuenta como respuesta', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor'), llamadaFalla: true })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola --wait', tool_use_id: 'b1' } as never)
  expect(mensajes(escritos)[0]).toMatchObject({ a: 'rev', esperaFin: null, espera: false })
})

test('dos envíos a la vez quedan anotados los dos', async ($, on) => {
  const { escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await Promise.all([
    $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer uno', tool_use_id: 'b1' } as never),
    $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer dos', tool_use_id: 'b2' } as never),
  ])
  expect(mensajes(escritos).map(m => m.id).sort()).toEqual(['b1', 'b2'])
})

test('agent wait reabre la espera desde ahora, no desde el envío viejo', async ($, on) => {
  const { reloj, escritos } = motor(on, { herdrGet: getDe('rev', 'Revisor') })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer hola', tool_use_id: 'b1' } as never)
  await reloj.advance(60_000)
  const antes = reloj.now()
  await $.tool.call({ tool: 'Bash', command: 'herdr agent wait reviewer', tool_use_id: 'b2' } as never)
  expect(mensajes(escritos)[0]!.enviado as number).toBeGreaterThanOrEqual(antes)
})

test('al empezar un turno del lead, el registro de Sesiones lleva turnoInicio', async ($, on) => {
  const { reloj, escritos } = motor(on)
  await iniciar($)
  await $.turn.start({ text: 'hola', turnId: 'T1' } as never)
  const inicio = reloj.now()
  await reloj.advance(10_000)
  const registro = JSON.parse(escritos['/casa/.claude/tablero/sesiones/abc.json'] ?? '{}') as { turnoInicio?: number }
  expect(registro.turnoInicio).toBe(inicio)
})

test('Windows sin HOME: escribe bajo USERPROFILE y nunca en una carpeta «undefined»', async ($, on) => {
  const { escritos, reloj } = motor(on, { herdrGet: getDe('rev', 'Revisor'), entorno: { USERPROFILE: '/perfil', HERDR_ENV: '1' } })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'herdr agent prompt reviewer "Revisa el diff"', tool_use_id: 'b1' } as never)
  await reloj.advance(6_000)
  // En Windows el motor devuelve las rutas como C:\perfil\…: se comparan sin unidad y con barras normales.
  const rutas = Object.keys(escritos).map(r => r.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''))
  expect(rutas.some(r => r.includes('undefined'))).toBe(false)
  expect(rutas).toContain('/perfil/.claude/tablero/conversaciones/abc.json')
  expect(rutas).toContain('/perfil/.claude/tablero/sesiones/abc.json')
})

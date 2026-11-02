// Conecta el panel de progreso y de agentes de savvy-progress (MIT, johnnyvizz/claude-kit) a los
// eventos del motor. La lógica está en savvy-core.ts y los dibujos en savvy-dibujo.ts; aquí solo
// se registran manejadores, con el estado en atoms propios del mod (plugin «tablero»).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import {
  type AgenteRun,
  type Flujo,
  type EntradaProgreso,
  PALABRAS,
  PANE_AGENTES,
  PROGRESS_TOOL,
  STEP_TOOL,
  ajustarUso,
  agregarRun,
  cargarFlujo,
  debeInstruirse,
  etiquetaFlujo,
  esFlujoNuevo,
  finRun,
  fmtCost,
  fmtTime,
  fmtTokens,
  fusionarFlujo,
  instruccion,
  modelName,
  nivelDe,
  nivelDeTarea,
  nuevoFlujo,
  norm,
  palabraNivel,
  plannedOf,
  ratio,
  reportarPaso,
  totales,
  elapsed,
  colorDeNivel,
  palabraEsfuerzo,
  type Uso,
  MODELO_NIVEL,
} from './savvy-core'
import {
  agentSvg,
  barraTexto,
  compactSvg,
  ctxBarra,
  gridSvg,
  gridTiles,
  headerSvg,
  plannedSvg,
  rowSvg,
} from './savvy-dibujo'

type Panel = { plegado: boolean; terminadosPlegados: boolean; autoAbiertoPara: string }

const flujo = atom({ plugin: 'tablero', key: 'savvy-flujo' } as const, null as Flujo | null)
const agentes = atom({ plugin: 'tablero', key: 'savvy-agentes' } as const, [] as AgenteRun[])
const panel = atom({ plugin: 'tablero', key: 'savvy-panel' } as const, { plegado: false, terminadosPlegados: false, autoAbiertoPara: '' } as Panel)
const ahora = atom({ plugin: 'tablero', key: 'savvy-ahora' } as const, 0)

const COLOR_ACENTO = '#8f8cf4'
const COLOR_HECHO = '#5fbf8f'
const ESTADO: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

const TOOL_PROGRESO = PROGRESS_TOOL
const TOOL_PASO = STEP_TOOL

// Lo que el mod registra al iniciar la sesión: herramientas y comando.

export async function iniciarAgentes($: EngineInterface): Promise<void> {
  await $.tool.register({
    name: 'progreso',
    description:
      'Muestra el avance de /savvy-flow en la barra sobre el prompt y en el panel de agentes. ' +
      'Llámala después de presentar el plan (título, total, tareas, fase "delegate"), cada vez que se acepta una tarea (done), ' +
      'al cambiar de fase o al replanificar (tasks), y al final con finished: true. Los campos que no se mandan conservan su valor. ' +
      'Solo para la sesión principal: una llamada desde un subagente se ignora (los trabajadores reportan con `paso`).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Nombre corto de la tarea general, unas pocas palabras.' },
        total: { type: 'integer', minimum: 0, description: 'Número de tareas planificadas para los trabajadores.' },
        done: { type: 'integer', minimum: 0, description: 'Número de tareas aceptadas tras la revisión.' },
        phase: { type: 'string', enum: ['plan', 'design', 'delegate', 'review', 'close'] },
        finished: { type: 'boolean', description: 'Verdadero cuando el flujo se cierra.' },
        tasks: {
          type: 'array',
          description:
            'Las tareas planificadas en orden, numeradas desde 1. Cada título debe ser igual a la `description` de la herramienta Agent con la que se delegará, para que el panel relacione cada ejecución con su tarea.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Unas pocas palabras; se reutiliza tal cual como description del Agent.' },
              tier: { type: 'string', enum: ['light', 'medium', 'careful', 'heavy'] },
              after: { type: 'array', items: { type: 'integer' }, description: 'Números de las tareas de las que depende esta.' },
            },
            required: ['title', 'tier'],
          },
        },
      },
    },
  })
  await $.tool.register({
    name: 'paso',
    description:
      'Para trabajadores de savvy-flow: reporta el avance de su propia tarea en el panel de agentes. ' +
      'Justo después de leer el encargo, llámala con `total` (tu plan en 3 a 8 pasos) y `done: 0`; ' +
      'vuelve a llamarla al terminar cada paso. Es barata y silenciosa: solo dibuja una barra.',
    inputSchema: {
      type: 'object',
      properties: {
        done: { type: 'integer', minimum: 0, description: 'Pasos terminados hasta ahora.' },
        total: { type: 'integer', minimum: 1, description: 'Pasos planificados; puede cambiar si cambia el plan.' },
        note: { type: 'string', description: 'El paso en curso, unas pocas palabras.' },
      },
      required: ['done'],
    },
    // En la lista de herramientas de todos los agentes, no detrás de ToolSearch: los trabajadores no la buscan.
    isDeferred: false,
  })
}


type EncargoBase = { prompt: string; description: string; subagentType: string; tool_use_id: string }
type RespuestaBase = { model: string; agentId?: string; deny?: unknown }

/** Lanzar un subagente: savvy-* recibe la instrucción de reportar pasos y entra al panel. */
export async function lanzarAgente<E extends EncargoBase, R extends RespuestaBase>(
  $: EngineInterface,
  e: E,
  next: (x: E) => Promise<R>,
): Promise<R> {
  const encargo = debeInstruirse(e.subagentType, e.prompt) ? ({ ...e, prompt: instruccion(e.prompt) } as E) : e
  const iniciado = await next(encargo)
  if (iniciado.deny !== undefined) return iniciado

  const en = await $.clock.now()
  await update($, agentes, lista => {
    const ronda = 1 + lista.filter(a => norm(a.description) === norm(e.description) && e.description).length
    const run: AgenteRun = {
      id: iniciado.agentId ?? e.tool_use_id,
      agentId: iniciado.agentId,
      type: e.subagentType,
      description: e.description,
      model: iniciado.model,
      status: 'running',
      startedAt: en,
      contextTokens: 0,
      contextMax: 1_000_000,
      tokens: 0,
      costUsd: 0,
      steps: 0,
      round: ronda,
    }
    return agregarRun(lista, run)
  })
  await update($, ahora, () => en)
  return iniciado
}

/** Cada petición de un subagente: contexto en vivo, tokens y costo. */
export async function pasoDeSubagente(
  $: EngineInterface,
  e: { agentId?: string; model: string; effort?: unknown },
  resultado: { usage?: Uso },
): Promise<void> {
  const agentId = e.agentId
  const uso = resultado.usage
  if (!agentId || !uso) return
  const modelo = uso.model || e.model
  await update($, agentes, lista =>
    lista.map((a): AgenteRun => (a.agentId !== agentId ? a : ajustarUso(a, uso, modelo, typeof e.effort === 'string' ? e.effort : a.effort))),
  )
}

/** Fin del turno de un subagente: terminado o fallido. */
export async function finDeTurno($: EngineInterface, e: { agentId?: string; reason: string; usage?: Uso }): Promise<void> {
  const agentId = e.agentId
  if (!agentId) return
  const en = await $.clock.now()
  await update($, agentes, lista => finRun(lista, agentId, e.reason, en, e.usage))
  await update($, ahora, () => en)
}

/** El avance que reporta cada trabajador (paso, total y nota), por id, para dibujarlo en su tarjeta de Tablero. */
export async function pasosDeAgentes($: EngineInterface): Promise<Map<string, { done: number; total: number; note?: string }>> {
  const mapa = new Map<string, { done: number; total: number; note?: string }>()
  for (const a of await read($, agentes)) {
    if (a.stepTotal) mapa.set(a.id, { done: a.stepDone ?? 0, total: a.stepTotal, note: a.stepNote })
  }
  return mapa
}

export const registrarAgentes = (on: On): void => {
  on('tool.call', { tool: TOOL_PROGRESO }, async ($, e) => {
    // El flujo es de la sesión principal: una llamada con agentId no cambia nada.
    if (e.agentId) return { result: 'ignored: solo la sesión principal reporta el flujo' }
    const input = e as unknown as EntradaProgreso
    const previo = cargarFlujo(await read($, flujo))
    if (esFlujoNuevo(previo, input) && input.title !== undefined) {
      // Un flujo nuevo empieza con la lista limpia; los agentes en marcha siguen.
      await update($, agentes, lista => lista.filter(a => a.status === 'running'))
    }
    const siguiente = await update($, flujo, p => fusionarFlujo(cargarFlujo(p), input))
    return { result: `ok: ${etiquetaFlujo(siguiente ?? nuevoFlujo())}` }
  })

  // El avance de un trabajador: la llamada corre en su propio bucle, así que trae su agentId.
  on('tool.call', { tool: TOOL_PASO }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: solo los subagentes reportan pasos' }
    let encontrado = false
    await update($, agentes, lista => {
      const r = reportarPaso(lista, agentId, input)
      encontrado = r.encontrado
      return r.lista
    })
    return { result: encontrado ? 'ok' : `ignored: no hay fila en el panel para el agente ${agentId}` }
  })

  // Red de seguridad: lanzar un trabajador mueve la capa tenue aunque el orquestador lo olvide.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const tipo = String(e.subagent_type ?? '')
    if (!tipo.startsWith('savvy-')) return next(e)

    await update($, flujo, prev => {
      const base = prev && !prev.isFinished ? { ...nuevoFlujo(), ...prev } : nuevoFlujo()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flujo, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = cargarFlujo(await read($, flujo))
    if (f === null || e.props.hasSurvey) return next(e)
    // La fila se dibuja con las bandas de otros mods debajo. El marcador vacío del motor nunca se anida.
    const dibujado = await Promise.resolve(next(e)).catch(() => null)
    const debajo = dibujado && typeof dibujado === 'object' && (dibujado as { type?: string }).type !== 'engine' ? dibujado : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const lista = await read($, agentes)
    const cuadrilla = lista.length + plannedOf(f, lista).length
    const trabajando = lista.some(a => a.status === 'running')
    const cuentaCuadrilla = <Text key="tablero-agentes">{`×${cuadrilla}`}</Text>
    const porcentaje = `${Math.round(ratio(f) * 100)}%`
    const descartar = (
      <Button key="tablero-descartar" label="✕" plain role="dismiss" onPress={() => update($, flujo, () => null)} />
    )

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // Unos 8 px CSS por columna; el resto es el contador, el botón de cerrar y sus huecos.
      const ancho = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={rowSvg(f, ancho, trabajando)} alt={`${f.title}: ${etiquetaFlujo(f)}, ${porcentaje}`} width={ancho} height={22} />
            {cuentaCuadrilla}
            {descartar}
          </Box>
          {debajo}
        </Box>
      )
    }

    const columnas = e.props.bodyColumns
    const anchoTitulo = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(columnas / 3)))
    const ancho = Math.max(6, Math.min(40, columnas - anchoTitulo - 32))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={anchoTitulo} flexShrink={0}>
            <Text color={f.isFinished ? COLOR_HECHO : COLOR_ACENTO}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={f.isFinished ? COLOR_HECHO : COLOR_ACENTO}>{barraTexto(f, ancho)}</Text>
          <Text bold>{etiquetaFlujo(f)}</Text>
          <Text dimColor>{porcentaje}</Text>
          <Text color="#D97757">▣</Text>
          {cuentaCuadrilla}
          {descartar}
        </Box>
        {debajo}
      </Box>
    )
  })
}


import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentCard, Architect, Bucket, Check, Gate, JevEstado, Layout, Loop, Main, Plan, Receipt, Roster, Turn, Usage, View } from '../types'
import { CAIDA_MS, aplicar, resumen as resumenPlan } from './planes'
import {
  DEFAULT_ARCHITECT,
  addCard,
  resumeCard,
  DEFAULT_GATE,
  DEFAULT_MAIN,
  DEFAULT_ROSTER,
  DEFAULT_TURN,
  DEFAULT_USOS,
  noteUso,
  resumenUsos,
  usoDe,
  DEFAULT_USAGE,
  DEFAULT_VIEW,
  EDIT_TOOLS,
  MOD_VERSION,
  SCHEMA_VERSION,
  afterCall,
  applyStep,
  bucketOf,
  piecesThatFit,
  cardTitle,
  afterCompactRead,
  claimCompactRead,
  contextFill,
  faultKey,
  anotarFallo,
  anotarTipoAsesor,
  consejoNuevo,
  esTipoAsesor,
  llamadaConAutomatica,
  forgetCompactRead,
  titleLines,
  consultTimeline,
  describeInput,
  endConsult,
  fitLegend,
  fmtClock,
  fmtDuration,
  fmtTimer,
  fmtUsd,
  carpetaDe,
  momentLabel,
  statusLabel,
  plural,
  gateSummary,
  gauge,
  isAdvising,
  isLoopActive,
  kTokens,
  lanes,
  limitLabel,
  limitOf,
  fmtReinicio,
  fmtSpeed,
  listOf,
  marksIn,
  momentOf,
  normalize,
  normalizeCard,
  normalizeGate,
  noteTool,
  PALETTES,
  parseConfig,
  prettyModel,
  handbackOf,
  adviceLine,
  receiptOf,
  recordCheck,
  retireAsks,
  retireAsksDe,
  esperaPersona,
  settleCheck,
  shorten,
  limpio,
  TOPE_LECTURA,
  startConsult,
  cerrarConsultas,
  stepSpeed,
  stepLoop,
} from './core'
import type { Config, Panel } from './core'
import { celdasUso, ritmoCupo, tonoUso } from './uso'
import { avanzar, necesitaRedibujo, puntoEspera, pulsoActivo } from './animacion'
import { CARRILES_VISIBLES, barraIndeterminada, emojiDeEstado, pistaCarril } from './agentes-anim'
import { PERIODO_RELOJ_MS, claveDeRedibujo, enReposo, modoReloj, puedeArrancarReloj, type ModoReloj } from './clave-redibujo'
import { nombreDeTipo } from './nombres'
import { COLOR_DE, filasVida, svgVida, vidaDe } from './vida'
import type { BandaEntrada } from './banda-modelo'
import { lineasDeEdicion } from './resumen-modelo'
import { gitdirDe, ramaDeHead } from './rama'
import { filaRitmo, textoRitmoMapa, leerDecisiones, leerLimites, marcaTarjeta, resumenJev, ritmoSemana, topeAhora } from './jev-modelo'
import { anotarCosto, type MuestraCosto } from './costo-min'
import type { DecisionJev } from './jev-modelo'
import { panelJev } from './panel-jev'
import { DIAGRAMA_MIN, anchosDiagrama, disposicionDiagrama } from './diagrama'
import { MAPA_ANCHO, MAPA_MIN, SPARK_ANCHO } from './mapa'
import { datosDelMapa, tintaDeNivel, vistaMapa } from './mapa-vista'
import { carrilesSvg } from './carriles-svg'
import { anchoDe, filaDeMarcas, linea, type Piece } from './linea'

const PANE = 'tablero'
const TITLE = 'Tablero'


// ---------------------------------------------------------------- state

const meta = atom({ plugin: 'tablero', key: 'meta' } as const, { schemaVersion: SCHEMA_VERSION })
const main = atom({ plugin: 'tablero', key: 'main' } as const, DEFAULT_MAIN)
const usage = atom({ plugin: 'tablero', key: 'usage' } as const, DEFAULT_USAGE)
const architect = atom({ plugin: 'tablero', key: 'architect' } as const, DEFAULT_ARCHITECT)
const gate = atom({ plugin: 'tablero', key: 'gate' } as const, DEFAULT_GATE)
const agents = atom({ plugin: 'tablero', key: 'agents' } as const, [])
const loops = atom({ plugin: 'tablero', key: 'loops' } as const, [])
const turn = atom({ plugin: 'tablero', key: 'turn' } as const, DEFAULT_TURN)
const receipt = atom({ plugin: 'tablero', key: 'receipt' } as const, null)
const view = atom({ plugin: 'tablero', key: 'view' } as const, DEFAULT_VIEW)
const roster = atom({ plugin: 'tablero', key: 'roster' } as const, DEFAULT_ROSTER)
// Los planes de trabajo: la herramienta plan_progress (antes el mod barra-plan) los crea y los mueve.
const PLAN_TOOL = 'mcp__tablero__plan_progress'
const planes = atom({ plugin: 'tablero', key: 'planes' } as const, [] as Plan[])
const REGLAS_PLANES = `# Barras de progreso
Las tareas de más de unos 3 pasos llevan una barra: créala una vez con ${PLAN_TOOL} (id, title y stages: 2 a 7 etapas con steps {title}; o steps como lista plana). Los títulos de 4 palabras como mucho, en el idioma del usuario; el primer paso abierto queda activo. Avanza con {id, next:true} cuando termina el paso activo, o con {id, done:[...], active:"..."}. Si un paso falla: {id, failed:"...", note}. Antes de pedir una decisión al usuario: {id, state:"needs_input", note}. No describas las barras al usuario.`
const jev = atom({ plugin: 'tablero', key: 'jev' } as const, { decisiones: [], limites: null, alDia: null } as JevEstado)
const usos = atom({ plugin: 'tablero', key: 'usos' } as const, DEFAULT_USOS)
const gitBranch = atom({ plugin: 'tablero', key: 'branch' } as const, null as string | null)

type ServerBlock = { type: string; id?: string; name?: string; tool_use_id?: string }

// Every read goes through these, so a value saved under an older shape still reads.
async function getMain($: EngineInterface): Promise<Main> {
  return normalize(DEFAULT_MAIN, await read($, main))
}
async function getUsage($: EngineInterface): Promise<Usage> {
  return normalize(DEFAULT_USAGE, await read($, usage))
}
async function getArchitect($: EngineInterface): Promise<Architect> {
  const a = normalize(DEFAULT_ARCHITECT, await read($, architect))
  return { ...a, consults: listOf(a.consults), ids: listOf(a.ids), seen: listOf(a.seen) }
}
async function getGate($: EngineInterface): Promise<Gate> {
  return normalizeGate(await read($, gate))
}
async function getCards($: EngineInterface): Promise<AgentCard[]> {
  return listOf<unknown>(await read($, agents)).map(normalizeCard)
}
async function getLoops($: EngineInterface): Promise<Loop[]> {
  return listOf<Loop>(await read($, loops))
}
/** Un valor guardado de cualquier forma: lo que no se entiende queda en su valor vacío, sin romperse. */
function normalizeJev(stored: unknown): JevEstado {
  const j = normalize<JevEstado>({ decisiones: [], limites: null, alDia: null }, stored)
  // `limites` pasa por leerLimites: un valor guardado con otra forma (o sin la clave) queda en null.
  const limites = j.limites ? leerLimites(JSON.stringify(j.limites)) : null
  return { decisiones: listOf<DecisionJev>(j.decisiones), limites, alDia: typeof j.alDia === 'string' ? j.alDia : null }
}

async function getJev($: EngineInterface): Promise<JevEstado> {
  return normalizeJev(await read($, jev))
}

async function getTurn($: EngineInterface): Promise<Turn> {
  return normalize(DEFAULT_TURN, await read($, turn))
}
async function getView($: EngineInterface): Promise<View> {
  return normalize(DEFAULT_VIEW, await read($, view))
}
async function getRoster($: EngineInterface): Promise<Roster> {
  const r = normalize(DEFAULT_ROSTER, await read($, roster))
  return { architectTypes: listOf(r.architectTypes) }
}

// Lo último que releerJev dejó en el estado: si la nueva lectura da lo mismo, no hay nada que comparar ni escribir.
let ultimoJev: JevEstado | null = null

/**
 * Relee las decisiones de Jev de esta sesión y las guarda en su estado. Sin id de sesión, sin carpeta
 * personal o sin archivo, no hay ninguna: el tablero no muestra nada de Jev.
 */
async function releerJev($: EngineInterface): Promise<DecisionJev[]> {
  const sesionId = await $.session.id().catch(() => null)
  // Windows no siempre define HOME: en ese caso va USERPROFILE. `$.env.get` exige literales.
  const home = (await $.env.get('HOME').catch(() => undefined)) || (await $.env.get('USERPROFILE').catch(() => undefined))
  const texto = sesionId && home ? await $.fs.read(`${home}/.claude/jev/decisiones.jsonl`).catch(() => null) : null
  // El uso de la cuenta no depende de la sesión: se lee aunque no haya id. Ausente es «sin dato»; roto (por ejemplo,
  // a medio escribir) deja el último válido.
  const textoLimites = home ? await $.fs.read(`${home}/.claude/jev/limites.json`).catch(() => null) : null
  const leidos = typeof textoLimites === 'string' ? leerLimites(textoLimites) : null
  const limites = typeof textoLimites === 'string' && leidos === null ? (await getJev($)).limites : leidos
  // Lo que actualizó la revisión «Al día»; ausente o roto es «sin dato» (la caja no se dibuja).
  const textoAlDia = home ? await $.fs.read(`${home}/.claude/al-dia/resultado.json`).catch(() => null) : null
  const alDia = typeof textoAlDia === 'string' && textoAlDia.length <= TOPE_LECTURA ? textoAlDia : null
  const ds = sesionId && texto !== null && texto !== undefined ? leerDecisiones(texto, sesionId) : []
  // Escribir el estado redibuja el panel: solo se escribe si algo cambió.
  const nuevo: JevEstado = { decisiones: ds, limites, alDia }
  // `ds` es el mismo objeto cuando el archivo no cambió (ver leerDecisiones): sin cambios, no se compara.
  if (ultimoJev && ultimoJev.decisiones === ds && ultimoJev.alDia === alDia && JSON.stringify(ultimoJev.limites) === JSON.stringify(limites)) return ds
  if (JSON.stringify(await getJev($)) !== JSON.stringify(normalizeJev(nuevo))) await update($, jev, () => nuevo)
  ultimoJev = nuevo
  return ds
}

/** La marca de la decisión de modelo más reciente cuya descripción coincide con la del encargo (recortada a 60). */
const marcaDeSpawn = (ds: DecisionJev[], descripcion: string): string | null => {
  const clave = [...descripcion].slice(0, 60).join('')
  return marcaTarjeta(ds.filter(d => d.tipo === 'modelo' && d.descripcion === clave).at(-1))
}

/**
 * La rama de git, leída de `.git/HEAD` en la carpeta de trabajo o en la primera de sus carpetas madre que
 * sea un repositorio (hasta 6 niveles). Un worktree tiene un archivo `.git` que apunta a su carpeta.
 */
async function leerRama($: EngineInterface): Promise<string | null> {
  let dir = (await $.session.cwd().catch(() => '')) || ''
  for (let nivel = 0; dir && nivel < 6; nivel += 1) {
    const head = await $.fs.read(`${dir}/.git/HEAD`).catch(() => null)
    if (head !== null) return ramaDeHead(head)
    const archivo = await $.fs.read(`${dir}/.git`).catch(() => null)
    const gitdir = archivo === null ? null : gitdirDe(archivo, dir)
    if (gitdir) return ramaDeHead(await $.fs.read(`${gitdir}/HEAD`).catch(() => ''))
    const padre = dir.replace(/[\\/][^\\/]*$/, '')
    if (padre === dir) break
    dir = padre
  }
  return null
}

async function refrescarRama($: EngineInterface) {
  const branch = await leerRama($)
  if ((await read($, gitBranch)) !== branch) await update($, gitBranch, () => branch)
}

/** A stored shape older than this build's: drop what cannot be read, keep the rest. */
async function migrate($: EngineInterface) {
  const m = await read($, meta)
  if ((m?.schemaVersion ?? 0) >= SCHEMA_VERSION) return
  await update($, agents, list => listOf<unknown>(list).map(normalizeCard))
  await update($, gate, g => normalizeGate(g))
  await update($, meta, () => ({ schemaVersion: SCHEMA_VERSION }))
}

async function consultStarted($: EngineInterface, cfg: Config, id: string, via: string) {
  const t = await getTurn($)
  const moment = momentOf(t)
  const at = await $.clock.now()
  await update($, architect, a => startConsult(normalize(DEFAULT_ARCHITECT, a), { id, at, moment, via }))
  if (moment === 'before done') await update($, turn, x => ({ ...normalize(DEFAULT_TURN, x), isReviewing: true }))
}

async function consultEnded($: EngineInterface, cfg: Config, advice: string | null, id?: string) {
  const at = await $.clock.now()
  const first = advice?.split('\n').find(l => l.trim()) ?? null
  const text = first ? shorten(first.replace(/^[#>*\s-]+/, ''), 160) : null
  await update($, architect, a => endConsult(normalize(DEFAULT_ARCHITECT, a), at, text, id))
  await update($, turn, t => ({ ...normalize(DEFAULT_TURN, t), isReviewing: false }))
}

async function noteAdvice($: EngineInterface, cfg: Config, advice: string) {
  await update($, architect, x => ({ ...normalize(DEFAULT_ARCHITECT, x), lastAdvice: advice }))
}

async function isArchitectType($: EngineInterface, cfg: Config, type: string) {
  return cfg.architect.test(type) || (await getRoster($)).architectTypes.includes(type)
}

async function openPane($: EngineInterface, cfg: Config) {
  // columns apply when docked beside the transcript, rows when seated inline above the prompt.
  return $.ui.open({ id: PANE, title: TITLE, columns: cfg.paneColumns, rows: 8 })
}

async function resetAll($: EngineInterface) {
  await update($, main, m => ({ ...DEFAULT_MAIN, model: normalize(DEFAULT_MAIN, m).model, mode: normalize(DEFAULT_MAIN, m).mode }))
  await update($, architect, () => DEFAULT_ARCHITECT)
  await update($, gate, () => DEFAULT_GATE)
  await update($, agents, () => [])
  await update($, loops, () => [])
  await update($, usos, () => DEFAULT_USOS)
  await update($, turn, () => DEFAULT_TURN)
  await update($, receipt, () => null)
  await update($, view, () => DEFAULT_VIEW)
  // The context gauge waits for the next measurement rather than showing the pre-clear fill.
  // /clear starts the session over: its edits and its clock count from here.
  mostrado.contexto = null
  muestrasCosto.length = 0
  const startedAt = await $.clock.now()
  await update($, usage, x => ({ ...normalize(DEFAULT_USAGE, x), pct: null, tokens: null, linesAdded: 0, linesRemoved: 0, startedAt }))
}

/**
 * Stores the compaction window for the model window `window`. A `summary` breakdown estimates locally
 * and sends no request; until the host gives one, the gauge stays on the model's window (afterCompactRead).
 */
async function readCompactWindow($: EngineInterface, window: number) {
  const r = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  await update($, usage, x => afterCompactRead(normalize(DEFAULT_USAGE, x), window, r?.context.breakdown))
}

/** The session's cost read fresh, not from the last measurement: the receipt subtracts two of these. */
async function costNow($: EngineInterface): Promise<number | null> {
  const u = await $.session.usage().catch(() => null)
  return u?.cost?.usd ?? null
}

async function noteMode($: EngineInterface, mode: string | undefined) {
  if (mode) await update($, main, m => (normalize(DEFAULT_MAIN, m).mode === mode ? normalize(DEFAULT_MAIN, m) : { ...normalize(DEFAULT_MAIN, m), mode }))
}

// ---------------------------------------------------------------- reloj del panel


// Lo que el reloj ve ahora (con animación, el valor a medio camino) y el último cuadro dibujado.
const mostrado = { contexto: null as number | null, usos: new Map<string, number>() }
let fase = 0
// Verdadero mientras el último dibujo fue el mapa: sus relojes tienen segundos y, con trabajo, se anima con cada marco.
let mapaVisible = false
/** El costo de la sesión a lo largo del tiempo, para la gráfica costo/min del mapa. */
const muestrasCosto: MuestraCosto[] = []
let ultimaClave = ''
// El reloj del panel: corre solo mientras el panel se dibuja (lo arranca su `ui.render`, lo paran `ui.close` y
// `session.end`), rápido con trabajo en curso y lento en reposo.
let reloj: { cancel: () => void } | null = null
let modoActual: ModoReloj = 'lento'
// Sube cada vez que el reloj se para: un dibujo que empezó antes de parar no lo vuelve a arrancar al terminar.
let generacionReloj = 0
const redondeo = (n: number) => Math.round(n * 10) / 10
/** «último turno» con su duración, agentes, ediciones y errores: la línea del recibo y la del modo compacto. */
const textoUltimoTurno = (r: Receipt) =>
  `último turno ${fmtDuration(r.durationMs)} · ${plural(r.agents, 'agente', 'agentes')} · ${plural(r.edits, 'edición', 'ediciones')} · ${plural(r.errors, 'error', 'errores')}`

async function entradaDe($: EngineInterface): Promise<BandaEntrada> {
  const [u, g, cards, ahora] = await Promise.all([getUsage($), getGate($), getCards($), $.clock.now()])
  return {
    costoUsd: u.costUsd,
    contextoPct: contextFill(u).pct,
    agentesActivos: cards.filter(c => c.status === 'running').length,
    permisosPendientes: g.recent.filter(c => c.verdict === 'ask').length,
    limites: u.limits.map(l => ({ kind: l.kind, pct: l.pct })),
    ahora,
  }
}

/** Un cuadro hacia los valores reales; sin animación, los alcanza de una vez. */
function suavizar(cfg: Config, e: BandaEntrada): BandaEntrada {
  const paso = (actual: number | undefined, objetivo: number) =>
    actual === undefined || !cfg.animacion ? objetivo : avanzar(actual, objetivo)
  if (e.contextoPct !== null) mostrado.contexto = paso(mostrado.contexto ?? undefined, e.contextoPct)
  for (const l of e.limites) mostrado.usos.set(l.kind, paso(mostrado.usos.get(l.kind), l.pct))
  return {
    ...e,
    contextoPct: e.contextoPct === null ? null : redondeo(mostrado.contexto ?? e.contextoPct),
    limites: e.limites.map(l => ({ ...l, pct: redondeo(mostrado.usos.get(l.kind) ?? l.pct) })),
    ...(cfg.animacion ? { pulso: pulsoActivo(e.agentesActivos > 0 || e.permisosPendientes > 0, fase) } : {}),
  }
}

async function cuadroDeReloj($: EngineInterface, cfg: Config) {
  fase += 1
  const [e, m] = await Promise.all([entradaDe($), getMain($)])
  if (!reloj) return
  const hayTrabajo = m.isRunning || e.agentesActivos > 0
  const modo = modoReloj({ animacion: cfg.animacion, hayTrabajo })
  const s = suavizar(cfg, e)
  const clave = claveDeRedibujo({ ...s, marco: mapaVisible && modo === 'rapido' ? fase : undefined, segundos: mapaVisible, reposo: enReposo({ hayTrabajo, permisosPendientes: e.permisosPendientes }) })
  if (necesitaRedibujo(ultimaClave, clave)) {
    ultimaClave = clave
    $.ui.invalidate('ui.render')
  }
  // Empezó o terminó el trabajo: el reloj cambia de ritmo.
  if (modo !== modoActual) iniciarReloj($, cfg, modo)
}

function detenerReloj() {
  generacionReloj += 1
  reloj?.cancel()
  reloj = null
}

function iniciarReloj($: EngineInterface, cfg: Config, modo: ModoReloj) {
  detenerReloj()
  modoActual = modo
  // Un cuadro por periodo; solo redibuja si la clave cambió (ver PERIODO_RELOJ_MS).
  reloj = $.clock.every(PERIODO_RELOJ_MS[modo], () => void cuadroDeReloj($, cfg).catch(() => undefined))
}

// ---------------------------------------------------------------- hooks

export const register: Register = (on, options) => {
  const cfg = parseConfig(options)
  const C = PALETTES[cfg.palette]
  // tool.check carries no loop id; the tool.call around it does, keyed by the call's id.
  const callLoop = new Map<string, string | null>()
  // Las `ask` que en modo automático decide el clasificador: no esperan a la persona, así que no se anotan como
  // pendientes. Se anotan al terminar su llamada, con lo que pasó.
  const autoAsks = new Map<string, Check>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tablero',
      description: 'Tablero: abre, cierra, reinicia o cambia la distribución del panel completo',
      argumentHint: '[abrir|cerrar|reiniciar|layout auto|compact|wide|mini|diagrama|mapa]',
    })
    await migrate($)
    // Un host sin herramientas de plugin (o que la rechaza) no impide que el panel arranque.
    await $.tool.register({
      name: 'plan_progress',
      description: 'Plan con barra de progreso en el tablero, uno por id. Créalo con title y stages; avanza con next, done, active, failed o state.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { enum: ['plan', 'todo'] },
          stages: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array' } } } },
          steps: { type: 'array' },
          next: { type: 'boolean' },
          done: { type: 'array', items: { type: 'string' } },
          active: { type: 'string' },
          failed: { type: 'string' },
          note: { type: 'string' },
          state: { enum: ['running', 'needs_input', 'error', 'done'] },
        },
      },
    }).catch(() => undefined)
    // Lo guardado puede venir de un proceso que se cerró de golpe o de una sesión reanudada: su turno, sus agentes «en
    // curso» y sus permisos pendientes ya no siguen. Se dan por terminados para que el panel no los enseñe vivos.
    const inicio = await $.clock.now()
    await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
    await update($, agents, list =>
      listOf<unknown>(list)
        .map(normalizeCard)
        .map(c => (c.status === 'running' ? { ...c, status: 'stopped' as const, endedAt: c.endedAt ?? inicio } : c)),
    )
    await update($, gate, g => retireAsks(normalizeGate(g), false))
    // Lo mismo con las consultas al asesor: no habrá respuesta para ellas.
    await update($, architect, a => cerrarConsultas(normalize(DEFAULT_ARCHITECT, a), inicio, true))
    // A host without usage (headless, an SDK host, a session not yet bound) just starts without it.
    const u = await $.session.usage().catch(() => null)
    // A resumed session has a fill to draw already: its compaction window is read now, not at its first
    // measurement. Any other start forgets the last reading (the setting may have changed) for that one to read.
    const resumedWindow = u && u.context.tokens !== undefined && u.context.window > 0 ? u.context.window : 0
    if (u) {
      await update($, usage, x => ({
        ...normalize(DEFAULT_USAGE, x),
        pct: u.context.percent ?? null,
        tokens: u.context.tokens ?? null,
        window: u.context.window,
        compactFor: resumedWindow,
        compactMisses: 0,
        costUsd: u.cost?.usd ?? null,
        limits: u.rateLimits.map(limitOf),
        startedAt: u.startedAt,
      }))
    }
    // The git branch: a host without a repository just starts without it.
    await refrescarRama($).catch(() => undefined)
    // Lo que actualizó la revisión «Al día» ya está en disco al abrir la sesión: la caja sale desde el primer cuadro.
    await releerJev($).catch(() => undefined)
    if (cfg.openOnStart) void openPane($, cfg).catch(() => undefined)
    const done = await next(e)
    if (resumedWindow > 0) {
      await readCompactWindow($, resumedWindow)
    }
    return done
  })

  on('session.end', async ($, e, next) => {
    detenerReloj()
    if (e.reason === 'clear') {
      await resetAll($)
    }
    return next(e)
  })

  on('command.run', { command: 'tablero' }, async ($, e) => {
    const [verb = 'open', arg = ''] = e.args.trim().split(/\s+/)
    if (verb === 'close' || verb === 'cerrar') {
      await $.ui.close({ id: PANE })
      return { text: 'Tablero cerrado.' }
    }
    if (verb === 'reset' || verb === 'reiniciar') {
      await resetAll($)
      return { text: 'Tablero reiniciado.' }
    }
    if (verb === 'layout') {
      const layout: Layout | null = arg === 'compact' || arg === 'wide' || arg === 'auto' || arg === 'mini' || arg === 'diagrama' || arg === 'mapa' ? arg : null
      if (!layout) return { text: 'Uso: /tablero layout auto|compact|wide|mini|diagrama|mapa' }
      await update($, view, v => ({ ...normalize(DEFAULT_VIEW, v), layout }))
      const opened = await openPane($, cfg)
      return { text: opened.isPlaced ? `Distribución de Tablero: ${layout}.` : `Distribución ${layout} guardada; el panel aún no se muestra: ${opened.reason}` }
    }
    const opened = await openPane($, cfg)
    if (!opened.isPlaced) return { text: `Tablero aún no se muestra: ${opened.reason}` }
    return { text: 'Tablero abierto. Enfócalo con ctrl+x tab.' }
  })

  // Un panel que el mod abre solo, al iniciar, espera sin dibujar por debajo de 144 columnas. El primer
  // prompt de la sesión sí cuenta como pedido de la persona y se coloca a cualquier ancho.
  let openedOnPrompt = false
  on('prompt.submit', async ($, e, next) => {
    // A branch switched since the last prompt shows now; a failed read leaves the last one.
    void refrescarRama($).catch(() => undefined)
    if (cfg.openOnStart && !openedOnPrompt) {
      openedOnPrompt = true
      void openPane($, cfg).catch(() => undefined)
    }
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (esTipoAsesor(cfg.architect, cfg.matchDescriptions, e)) await update($, roster, r => anotarTipoAsesor(normalize(DEFAULT_ROSTER, r), e.agent))
    return offered
  })

  on('turn.start', async ($, e, next) => {
    // A subagent's turn (its spawn, or a resume by SendMessage) is its card's, not the main turn's.
    if (e.agentId !== undefined) return next(e)
    const [now, cost] = await Promise.all([$.clock.now(), costNow($)])
    await update($, turn, () => ({ ...DEFAULT_TURN, startedAt: now, costAtStart: cost }))
    await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: true }))
    // A background architect's report reaches the main loop as the text opening this turn. The
    // SubagentHandback tool call (in tool.call) normally carries it first; this is the fallback.
    const back = e.text ? handbackOf(e.text) : null
    const a = back ? await getArchitect($) : null
    if (back && a && a.ids.includes(back.from)) {
      const advice = adviceLine(back.body)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, cfg, advice)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // The main loop's model is known when its request starts; a long first request shouldn't read "—".
    if (!e.agentId) {
      let isNewModel = false
      await update($, main, m => {
        const x = normalize(DEFAULT_MAIN, m)
        isNewModel = x.model !== '' && x.model !== e.model
        return { ...x, model: e.model, effort: String(e.effort ?? x.effort), steps: x.steps + 1 }
      })
      if (isNewModel) await update($, usage, x => forgetCompactRead(normalize(DEFAULT_USAGE, x)))
      // Time the response as it passes: its first piece that is neither the engine's envelope nor the
      // stop. One clock read in the stream and nothing stored until it has ended.
      const sentAt = await $.clock.now()
      let firstAt: number | null = null
      const s = next(e)
      for await (const c of s) {
        if (firstAt === null && c.kind !== 'engine' && c.kind !== 'stop') firstAt = await $.clock.now()
        yield c
      }
      const result = await s.result
      const speed = result.usage ? stepSpeed(sentAt, firstAt) : null
      if (speed) await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), speed }))
      return result
    }
    const id = e.agentId
    // A step from an agent whose card finished means it was resumed (SendMessage): it runs again.
    const before = (await getCards($)).find(c => c.id === id)
    if (before && before.status !== 'running') {
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id !== id || c.status === 'running' ? c : resumeCard(c))),
      )
    }
    const result = yield* next(e)
    const [cards, a] = await Promise.all([getCards($), getArchitect($)])
    if (cards.some(c => c.id === id)) {
      const step = { model: e.model, usage: result.usage, stopReason: result.stopReason }
      await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? applyStep(c, step) : c)))
    } else if (!a.ids.includes(id)) {
      const now = await $.clock.now()
      await update($, loops, l => stepLoop(listOf<Loop>(l), id, now))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    // The compaction window is read once per model window, not on every measurement (a breakdown
    // estimates every category each time): claimed here, in the same write, so no two reads overlap.
    let isStale = false
    await update($, usage, x => {
      const claim = claimCompactRead(normalize(DEFAULT_USAGE, x), e.context.window)
      isStale = claim.isClaimed
      return {
        ...claim.usage,
        pct: e.context.percent ?? null,
        tokens: e.context.tokens ?? null,
        window: e.context.window,
        costUsd: e.cost?.usd ?? null,
        limits: e.rateLimits.map(limitOf),
      }
    })
    const done = await next(e)
    if (isStale) {
      await readCompactWindow($, e.context.window)
    }
    return done
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      const now = await $.clock.now()
      await update($, usage, x => {
        const u = normalize(DEFAULT_USAGE, x)
        return { ...u, compactions: u.compactions + 1, lastCompactAt: now }
      })
    }
    return done
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id) {
      const agente = e.agentId ?? callLoop.get(e.tool_use_id) ?? undefined
      const check: Check = {
        id: e.tool_use_id,
        tool: e.tool,
        bucket: bucketOf(e.tool),
        verdict: verdict.decision === 'allow' ? 'rule' : verdict.decision,
        inSubagent: Boolean(agente),
        ...(agente ? { agente } : {}),
        detail: shorten(describeInput(e.tool, e.input), 90),
        at: await $.clock.now(),
      }
      if (verdict.decision === 'ask' && !esperaPersona((await getMain($)).mode, verdict)) autoAsks.set(e.tool_use_id, check)
      else await update($, gate, g => recordCheck(normalizeGate(g), check))
    }
    return verdict
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    return { sections: [...result.sections, { id: 'tablero:planes', text: REGLAS_PLANES, scope: 'session' as const }] }
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    const raw = e as unknown as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) return { result: `${PLAN_TOOL}: el id es obligatorio, por ejemplo "arreglar-login".` }
    const ahora = await $.clock.now()
    const hecho = aplicar((await read($, planes)).find(p => p.id === id), raw, ahora)
    if (typeof hecho === 'string') return { result: hecho }
    await update($, planes, lista =>
      [...listOf<Plan>(lista).filter(p => p.id !== id && (p.estado !== 'done' || ahora - (p.endedAt ?? ahora) < CAIDA_MS)), hecho],
    )
    return { result: resumenPlan(hecho) }
  })

  on('tool.call', async ($, e, next) => {
    callLoop.set(e.tool_use_id, e.agentId ?? null)
    // La `ask` del clasificador se lee al terminar la llamada, y se borra aunque la llamada lance: no queda para siempre.
    const { ran, auto } = await llamadaConAutomatica(autoAsks, e.tool_use_id, () => next(e)).finally(() => callLoop.delete(e.tool_use_id))
    const didRun = ran.deny === undefined
    // Una `ask` que decidió el clasificador se anota ahora, ya resuelta: corrió o fue rechazada.
    if (auto) {
      await update($, gate, g => recordCheck(normalizeGate(g), { ...auto, verdict: didRun ? 'cleared' : 'deny' }))
    }
    // Settle this call's pending ask, if it had one; skip the write (and the redraw) otherwise.
    const g0 = await getGate($)
    const isSettled = settleCheck(g0, e.tool_use_id, didRun) !== g0
    if (isSettled) await update($, gate, g => settleCheck(normalizeGate(g), e.tool_use_id, didRun))
    // A background agent hands its report back through this tool; an architect's report is its advice.
    if (String(e.tool) === 'SubagentHandback') {
      const consejo = consejoNuevo(e.agentId ? await getArchitect($) : null, e.agentId, (e as unknown as { message?: unknown }).message)
      if (consejo) await noteAdvice($, cfg, consejo)
      return ran
    }
    if (e.tool === 'Agent') return ran
    const uso = didRun ? usoDe(String(e.tool), e) : null
    if (uso) await update($, usos, x => noteUso(normalize(DEFAULT_USOS, x), uso))
    const hasFailed = didRun && ran.isError === true
    const isEdit = !hasFailed && didRun && EDIT_TOOLS.has(e.tool)
    if (isEdit) {
      const cambio = lineasDeEdicion(e.tool, e)
      if (cambio.agregadas > 0 || cambio.quitadas > 0) {
        await update($, usage, x => {
          const u0 = normalize(DEFAULT_USAGE, x)
          return { ...u0, linesAdded: (u0.linesAdded ?? 0) + cambio.agregadas, linesRemoved: (u0.linesRemoved ?? 0) + cambio.quitadas }
        })
      }
    }
    const t0 = await getTurn($)
    if (isEdit || hasFailed || (!e.agentId && t0.errorStreak > 0)) {
      await update($, turn, t => afterCall(normalize(DEFAULT_TURN, t), { inSubagent: Boolean(e.agentId), hasFailed, isEdit }))
    }
    const text = shorten(describeInput(e.tool, e), 64)
    if (e.agentId) {
      const id = e.agentId
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id === id ? noteTool(c, { tool: e.tool, text, isError: hasFailed || ran.deny !== undefined }) : c)),
      )
    }
    if (hasFailed) await releerJev($)
    return ran
  })

  // A server-side review tool never reaches tool.call: it shows only in the assistant's rows.
  on('session.append', async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const a = await getArchitect($)
      // Consults this row opened: their result may be in the same row, after the stale read above.
      const opened = new Set<string>()
      for (const block of e.message.content as unknown as readonly ServerBlock[]) {
        if (block.type === 'server_tool_use' && block.name && block.id && cfg.architect.test(block.name)) {
          if (a.seen.includes(block.id)) continue
          const id = block.id
          await update($, architect, x => {
            const y = normalize(DEFAULT_ARCHITECT, x)
            return { ...y, seen: [...listOf<string>(y.seen), id].slice(-60) }
          })
          opened.add(id)
          await consultStarted($, cfg, id, `${block.name} tool`)
        } else if (block.type.endsWith('_tool_result') && block.tool_use_id) {
          const id = block.tool_use_id
          const isOpen = opened.has(id) || (await getArchitect($)).consults.some(c => c.id === id && c.endAt === null)
          if (isOpen) await consultEnded($, cfg, null, id)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const decisiones = await releerJev($)
    if (!e.parentAgentId) await noteMode($, e.permissionMode)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    if (await isArchitectType($, cfg, e.subagentType)) {
      await update($, architect, a => {
        const x = normalize(DEFAULT_ARCHITECT, a)
        const ids = listOf<string>(x.ids)
        return { ...x, ids: ids.includes(id) ? ids : [...ids, id].slice(-40) }
      })
      await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
      await consultStarted($, cfg, id, e.subagentType.split(':').pop() ?? 'agente')
      return started
    }
    const descripcion = limpio(e.description)
    const card: AgentCard = {
      ...normalizeCard({}),
      id,
      type: e.name ?? e.subagentType,
      model: started.model,
      description: descripcion,
      jev: marcaDeSpawn(decisiones, descripcion),
      spawnedAt: await $.clock.now(),
    }
    // Decided in the write: a resume whose first step already put its card back to running is not logged again.
    await update($, agents, list => addCard(listOf<unknown>(list).map(normalizeCard), card))
    await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await releerJev($)
    const id = e.agentId
    const now = await $.clock.now()
    if (!id) {
      const [t, cards, cost] = await Promise.all([getTurn($), getCards($), costNow($)])
      const r = receiptOf(t, {
        durationMs: e.durationMs,
        agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length,
        costNow: cost,
        reason: e.reason,
      })
      await update($, receipt, () => r)
      await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
      // Un permiso del lead que sigue pendiente al cerrar su turno ya no se va a responder.
      await update($, gate, g => retireAsks(normalizeGate(g), true))
      // Una consulta al asesor que sigue abierta al cerrar el turno del lead ya no tendrá respuesta. Si el turno
      // terminó normal, un subagente asesor en segundo plano sigue vivo: solo con Esc (isAborted) se cierran todas.
      await update($, architect, a => cerrarConsultas(normalize(DEFAULT_ARCHITECT, a), now, e.isAborted === true))
      return done
    }
    // Un permiso de este subagente que sigue pendiente al terminar ya no se va a responder.
    const g0 = await getGate($)
    if (retireAsksDe(g0, id) !== g0) await update($, gate, g => retireAsksDe(normalizeGate(g), id))
    if ((await getArchitect($)).ids.includes(id)) {
      await consultEnded($, cfg, e.answer, id)
      return done
    }
    const cards = await getCards($)
    if (cards.some(c => c.id === id)) {
      const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id === id ? { ...c, status, endedAt: now, answer: shorten(e.answer, 400) } : c)),
      )
    } else {
      await update($, loops, l => listOf<Loop>(l).map(x => (x.id === id ? { ...x, isDone: true, lastAt: now } : x)))
    }
    return done
  })

  // ---------------------------------------------------------------- drawing

  // Un panel cerrado no se ve: el reloj se para hasta que vuelva a dibujarse.
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE) {
      detenerReloj()
      mapaVisible = false
    }
    return r
  })

  // After a surface module faults on a surface, this load draws it there as plain text; the other
  // module, and other surfaces, keep theirs. Keyed by faultKey: `desktop:rail.tsx`.
  const faulted = new Set<string>()
  on('ui.fault', async ($, e, next) => {
    if (anotarFallo(faulted, PANE, e)) {
      $.ui.log(`tablero: ${e.module} faulted on ${e.surface} (${e.phase}: ${e.reason}); drawing it without animation`)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const generacion = generacionReloj
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const hasClient = 'Client' in els
    const hasRail = hasClient && !faulted.has(faultKey(e.surface, 'rail.tsx'))
    const hasClock = hasClient && !faulted.has(faultKey(e.surface, 'elapsed.tsx'))
    const [m, u, a, g, cards, lp, t, r, v, now, cwd, jevs, branchNow, usosNow] = await Promise.all([
      getMain($),
      getUsage($),
      getArchitect($),
      getGate($),
      getCards($),
      getLoops($),
      getTurn($),
      read($, receipt),
      getView($),
      $.clock.now(),
      $.session.cwd().catch(() => ''),
      getJev($),
      read($, gitBranch),
      read($, usos).then(x => normalize(DEFAULT_USOS, x)),
    ])
    const rit = ritmoSemana(jevs.limites, now / 1000)
    const filaRit = filaRitmo(rit, jevs.limites?.five_hour, now / 1000)
    const resumenJevs = { ...resumenJev(jevs.decisiones), ritmo: filaRit }
    const jevN = resumenJevs.total
    // The body's own width, down to the narrowest dock Claude Code seats (24): a wider drawing is cut off at the frame.
    const W = Math.max(24, e.props.bodyColumns)
    const layout = v.layout ?? cfg.layout
    // El diagrama: `diagrama` desde 66 columnas; por debajo, la columna de siempre.
    const enDiagramaPosible = W >= DIAGRAMA_MIN && layout === 'diagrama'
    // `mapa` acoplado dibuja el mapa de cajas desde 40 columnas y se adapta al ancho (ver mapa.ts): dos columnas
    // desde 100, apilado por debajo. Sobre el prompt (inline) el mapa es demasiado alto: ahí sigue la columna.
    const enMapa = layout === 'mapa' && W >= MAPA_MIN && (W >= MAPA_ANCHO || e.props.placement !== 'inline')
    // `auto` (1.2.0): la lista de secciones con título, sin cajas ni conectores.
    const esLista = layout === 'auto'
    const enDiagrama = enDiagramaPosible && !enMapa
    const isWide = layout === 'wide'
    const colW = isWide ? Math.floor((W - 2) / 2) : W
    const jevVisible = cfg.panels.includes('jev') && (jevN > 0 || enDiagrama)
    const modelName = prettyModel(m.model)
    const viewed = e.props.view?.agentId ?? null
    const advising = isAdvising(a)
    const running = cards.filter(c => c.status === 'running')
    // El panel se está dibujando: si el reloj no corre (recién abierto o reabierto), arranca al ritmo que toca.
    mapaVisible = enMapa
    // Si el reloj se paró mientras este dibujo esperaba datos (cierre o fin de sesión), no lo arranca.
    if (puedeArrancarReloj({ corriendo: reloj !== null, generacionDibujo: generacion, generacionActual: generacionReloj })) iniciarReloj($, cfg, modoReloj({ animacion: cfg.animacion, hayTrabajo: m.isRunning || running.length > 0 }))
    const showArchitect = a.consults.length > 0 || a.ids.length > 0
    const motion = cfg.motion && hasRail
    // A panel with nothing to show yet takes no room: most sessions never spawn an agent.
    const isEmpty: Record<Panel, boolean> = {
      main: false,
      jev: jevN === 0,
      architect: !showArchitect,
      gate: g.recent.length === 0 && gateSummary(g).total === 0,
      agents: cards.length === 0,
      loops: lp.length === 0,
      receipt: !m.isRunning && !r,
      // La caja AL DÍA se dibuja dentro del mapa, no como un panel de la columna.
      aldia: true,
    }
    const panels = cfg.panels.filter(p => !isEmpty[p])
    const decider = m.mode === 'auto' ? 'auto' : 'tú'

    // A connector between panels: animated while its flow is live, a dim line otherwise.
    const rail = (key: string, active: boolean, color: string, width: number, marks: number[] = [], isMerge = false) =>
      motion ? (
        <els.Client
          key={key}
          module="./rail.tsx"
          width={width}
          height={1}
          props={{ active, width, color, dim: C.faint, marks, isMerge }}
        />
      ) : (
        <Text color={C.faint} mono>
          {'─'.repeat(Math.max(1, width))}
        </Text>
      )

    // A start time of 0 is unknown (state saved before it was recorded): no clock, not decades.
    const clock = (key: string, since: number, endAt: number | null, color: string) =>
      since <= 0 ? (
        <Text color={color}>—</Text>
      ) : hasClock ? (
        <els.Client key={key} module="./elapsed.tsx" props={{ since, now, endAt, color }} />
      ) : (
        <Text color={color}>{fmtTimer((endAt ?? now) - since)}</Text>
      )

    const isTerminal = e.surface === 'terminal'
    // A terminal's border row stands apart from the text above it; a graphical surface draws the
    // border flush against it, so the legend keeps one row of air there.
    const legendGap = isTerminal ? 0 : 1

    // Las piezas de una línea y las filas de marcas: linea.tsx.
    const line = (pieces: (Piece | null)[], room: number, gap = 1, justify?: 'center') => linea(els, pieces, room, gap, justify)
    const markRow = (marks: RenderChildren, lead = 0) => filaDeMarcas(els, marks, lead)

    // ---- main
    const effortN = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 }[m.effort] ?? 0
    const ctxFill = contextFill(u)
    const s = gateSummary(g)
    // Solo el nombre de la carpeta, cortado para que la línea conserve agentes y permisos.
    const carpeta = carpetaDe(cwd, Math.max(8, Math.floor((colW - 4) / 3)))
    const ctxGauge = ctxFill.pct !== null ? gauge(ctxFill.pct, 10) : null

    // ---- Sesión: la sección principal de la lista (layout auto). Una fila por dato, etiqueta a la izquierda,
    // barras del mismo ancho y porcentajes alineados; el color solo marca el umbral (65 % aviso, 85 % alerta).
    const ETIQUETA = 11
    const tinta = (pct: number) => {
      const t = tonoUso(pct)
      return t === 'alerta' ? C.warn : t === 'aviso' ? C.amber : C.main
    }
    const filaBarra = (k: string, etiqueta: string, pct: number, ancho: number, extra: string, extraColor?: string, cola = '') => {
      const llenas = celdasUso(pct, ancho)
      return (
        <Text key={k} wrap="truncate">
          <Text dimColor>{etiqueta.padEnd(ETIQUETA)}</Text>
          <Text color={tinta(pct)}>{'█'.repeat(llenas)}</Text>
          <Text color={C.faint}>{'░'.repeat(ancho - llenas)}</Text>
          <Text tabular>{`  ${String(Math.round(pct)).padStart(3)} %`}</Text>
          {extra ? <Text color={extraColor}>{`  ${extra}`}</Text> : null}
          {cola ? <Text dimColor>{`  ${cola}`}</Text> : null}
        </Text>
      )
    }
    const nombreCupo = (kind: string) => (/five/i.test(kind) ? 'cupo 5 h' : /seven/i.test(kind) ? 'cupo 7 d' : `cupo ${limitLabel(kind)}`)
    const sesionPanel = (w: number) => {
      const ancho = Math.max(6, Math.min(20, w - ETIQUETA - 26))
      const detalle = [
        carpeta,
        branchNow ? `⎇ ${branchNow}` : '',
        `agentes ${running.length}/${cards.length}`,
        `permisos ${s.total}`,
      ].filter(Boolean)
      return (
        <Box flexDirection="column" width={w}>
          <Text weight="semibold">Sesión</Text>
          <Box flexDirection="column" paddingLeft={2}>
            <Text wrap="truncate">
              <Text dimColor>{'modelo'.padEnd(ETIQUETA)}</Text>
              <Text>{modelName}</Text>
              {m.effort ? <Text dimColor>{` · ${m.effort}`}</Text> : null}
              {m.mode ? <Text dimColor>{` · ${m.mode}`}</Text> : null}
            </Text>
            {ctxFill.pct !== null
              ? filaBarra(
                  'ctx',
                  'contexto',
                  ctxFill.pct,
                  ancho,
                  u.compactions > 0 ? `⟲${u.compactions}` : '',
                  C.amber,
                  u.tokens !== null ? `${kTokens(u.tokens)}/${kTokens(ctxFill.window)}` : '',
                )
              : null}
            {u.costUsd !== null ? (
              <Text wrap="truncate">
                <Text dimColor>{'costo'.padEnd(ETIQUETA)}</Text>
                <Text tabular>{fmtUsd(u.costUsd)}</Text>
                <Text dimColor>{`  · ${plural(m.steps, 'respuesta', 'respuestas')}`}</Text>
              </Text>
            ) : null}
            {u.limits.slice(0, 2).map(l => {
              const ventana = /five/i.test(l.kind) ? 5 * 3_600_000 : 7 * 86_400_000
              const fraccion = l.resetsAt == null ? null : Math.min(1, Math.max(0, 1 - (l.resetsAt - now) / ventana))
              const ritmo = ritmoCupo(l.pct, fraccion)
              const reinicio = w >= 56 ? fmtReinicio(l.resetsAt, now) : ''
              return filaBarra(`cupo-${l.kind}`, nombreCupo(l.kind), l.pct, ancho, ritmo, ritmo.startsWith('⇡') ? C.amber : C.gate, reinicio ? `↻ ${reinicio}` : '')
            })}
            <Text dimColor wrap="truncate">
              {detalle.join(' · ')}
            </Text>
            {s.ask > 0 || s.deny > 0 ? (
              <Text wrap="truncate">
                {s.ask > 0 ? <Text color={C.amber}>{`? ${s.ask} permiso${s.ask === 1 ? '' : 's'} pendiente${s.ask === 1 ? '' : 's'}`}</Text> : null}
                {s.ask > 0 && s.deny > 0 ? <Text dimColor>{'  '}</Text> : null}
                {s.deny > 0 ? <Text color={C.warn}>{`✗ ${s.deny} denegado${s.deny === 1 ? '' : 's'}`}</Text> : null}
              </Text>
            ) : null}
            {resumenUsos(usosNow) ? <Text dimColor wrap="truncate">{resumenUsos(usosNow)}</Text> : null}
            {m.speed ? <Text dimColor wrap="truncate">{`última respuesta  ${fmtSpeed(m.speed)}`}</Text> : null}
          </Box>
        </Box>
      )
    }

    const mainPanel = (w: number) => (
      <Box flexDirection="column" paddingX={1} width={w}>
        <Box justifyContent="space-between">
          <Text color={C.main} weight="semibold" wrap="truncate">
            {modelName} · principal
          </Text>
          <Box flexShrink={0}>
            <Text color={m.isRunning ? C.main : C.dim}>
              {m.isRunning ? '● trabajando' : `${puntoEspera(undefined)} en espera`}
            </Text>
          </Box>
        </Box>
        {line(
          [
            {
              spans: [
                { text: 'esfuerzo ', dim: true },
                { text: `${'▮'.repeat(effortN) + '▯'.repeat(4 - effortN)} `, color: C.main },
                { text: m.effort || '—', color: C.main, weight: 'semibold' },
              ],
            },
            m.mode ? { spans: [{ text: `modo ${m.mode}`, dim: true }] } : null,
            { spans: [{ text: plural(m.steps, 'respuesta', 'respuestas'), dim: true }] },
          ],
          w - 4,
          3,
        )}
        {line(
          [
            carpeta ? { spans: [{ text: 'carpeta ', dim: true }, { text: carpeta, color: C.main }] } : null,
            { spans: [{ text: `agentes ${running.length}/${cards.length}`, color: running.length > 0 ? C.agent : C.dim }] },
            {
              spans: [
                { text: `permisos ${s.total}`, dim: true },
                ...(s.ask > 0 ? [{ text: ` · ${s.ask} pend.`, color: C.amber }] : []),
                ...(s.deny > 0 ? [{ text: ` · ${s.deny} den.`, color: C.warn }] : []),
              ],
            },
          ],
          w - 4,
          3,
        )}
        {branchNow ? <Text dimColor wrap="truncate">{`⎇ ${branchNow}`}</Text> : null}
        {resumenUsos(usosNow) ? <Text dimColor wrap="truncate">{resumenUsos(usosNow)}</Text> : null}
        {ctxGauge
          ? line(
              [
                {
                  spans: [
                    { text: 'contexto ', dim: true },
                    { text: ctxGauge.on, color: ctxFill.pct !== null && ctxFill.pct >= 80 ? C.warn : C.main },
                    { text: ctxGauge.off, color: C.faint },
                    { text: ` ${Math.round(ctxFill.pct ?? 0)}%`, weight: 'semibold' },
                  ],
                },
                u.tokens !== null ? { spans: [{ text: `${kTokens(u.tokens)}/${kTokens(ctxFill.window)}`, dim: true }] } : null,
                u.compactions > 0 ? { spans: [{ text: `⟲${u.compactions}`, color: C.amber }], lead: 1 } : null,
              ],
              w - 4,
            )
          : null}
        {u.costUsd !== null || u.limits.length > 0
          ? line(
              [
                u.costUsd !== null ? { spans: [{ text: 'costo ', dim: true }, { text: fmtUsd(u.costUsd), color: C.text }] } : null,
                ...u.limits.slice(0, 2).map((l, i): Piece => {
                  const lg = gauge(l.pct, 5)
                  // El color marca el umbral (aviso 65 %, alerta 85 %); el ritmo compara el uso con el tiempo de la ventana.
                  const tono = tonoUso(l.pct)
                  const ventana = l.kind.includes('five_hour') ? 5 * 3_600_000 : 7 * 86_400_000
                  const fraccion = l.resetsAt == null ? null : Math.min(1, Math.max(0, 1 - (l.resetsAt - now) / ventana))
                  // Con menos de 72 columnas no cabe junto al reinicio: se oculta antes que partir la línea.
                  const ritmo = w >= 72 ? ritmoCupo(l.pct, fraccion) : ''
                  // The time to each reset where the line has room for it: both windows fit from 56 columns,
                  // so a wide pane's half column (59 at 120) has them; a window that doesn't fit is left out.
                  // The hour the window resets (`↻ vie 06:00`): two windows share this line, so only the hour fits.
                  const resetAt = w >= 56 ? fmtReinicio(l.resetsAt, now) : ''
                  const reset = resetAt ? ` ↻ ${resetAt}` : ''
                  return {
                    lead: i > 0 ? 1 : u.costUsd !== null ? 2 : 0,
                    spans: [
                      { text: `${limitLabel(l.kind)} `, dim: true },
                      { text: lg.on, color: tono === 'alerta' ? C.warn : tono === 'aviso' ? C.amber : C.main },
                      { text: lg.off, color: C.faint },
                      { text: ` ${Math.round(l.pct)}%`, dim: true },
                      ...(ritmo ? [{ text: `  ${ritmo}`, color: ritmo.startsWith('⇡') ? C.amber : C.gate }] : []),
                      { text: reset, dim: true },
                    ],
                  }
                }),
              ],
              w - 4,
            )
          : null}
        {m.speed ? <Text dimColor wrap="truncate">{`última respuesta  ${fmtSpeed(m.speed)}`}</Text> : null}
        {vidaEscritorio(w) ?? vidaSesion(w)}
      </Box>
    )

    // ---- architect
    const lastConsult = a.consults[a.consults.length - 1]
    const architectPanel = (w: number) => {
      // Both ends are anchors (the first consult, now): should it run past its box, it asks to lose the middle.
      const tl = consultTimeline(a, now, Math.max(8, w - 4))
      return (
        <Box flexDirection="column" paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.faint} weight="semibold" wrap="truncate">
              {cfg.architectLabel} · {advising ? 'asesorando' : `${a.consults.length} ${a.consults.length === 1 ? 'consulta' : 'consultas'}`}
            </Text>
            <Box flexShrink={0}>
              <Text>
                <Text dimColor>consultas </Text>
                <Text color={C.arch} weight="semibold">
                  {a.consults.length}
                </Text>
              </Text>
            </Box>
          </Box>
          <Text color={C.arch} wrap="truncate-middle">
            {tl}
          </Text>
          {lastConsult ? (
            <Text dimColor wrap="truncate">
              {advising
                ? `consultando desde ${fmtClock(lastConsult.at)}`
                : `última hace ${fmtDuration(now - (lastConsult.endAt ?? lastConsult.at))} · duró ${fmtDuration((lastConsult.endAt ?? now) - lastConsult.at)}`}
            </Text>
          ) : (
            <Text dimColor>aún sin consultas</Text>
          )}
          {cfg.moments ? (
            <Box flexWrap="wrap" columnGap={2}>
              {(['before a plan', 'error repeats', 'before done'] as const).map(mo => {
                const isOn = lastConsult?.moment === mo
                return (
                  <Text color={isOn ? C.arch : C.dim} weight={isOn ? 'semibold' : 'regular'}>
                    {isOn ? '◆' : '◇'} {momentLabel(mo)}
                  </Text>
                )
              })}
              <Text color={C.faint}>(inferido)</Text>
            </Box>
          ) : null}
          {a.lastAdvice ? (
            <Text color={C.arch} wrap="truncate">
              » {a.lastAdvice}
            </Text>
          ) : null}
        </Box>
      )
    }

    // ---- gate
    const verdictColor = (c: Check) =>
      c.verdict === 'rule' ? C.gate : c.verdict === 'cleared' ? C.cleared : c.verdict === 'ask' ? C.amber : C.warn
    const checkMark = (c: Check) => (
      <Text key={c.id} color={verdictColor(c)} dimColor={c.inSubagent}>
        {c.verdict === 'deny' ? '✗' : '■'}
      </Text>
    )
    const gatePanel = (w: number) => {
      const strip = g.recent.slice(-Math.max(8, marksIn(w - 4, isTerminal)))
      const open = v.gateOpen
      // The totals in words where they all fit, in numbers alone where they don't: the colours say which is which.
      const totalsOf = (isShort: boolean): Piece[] => [
        { spans: [{ text: '■', color: C.gate }, { text: isShort ? ` ${s.rule}` : ` ${plural(s.rule, 'permitido', 'permitidos')}`, dim: true }] },
        { spans: [{ text: '■', color: C.cleared }, { text: isShort ? ` ${s.cleared}` : ` ${s.cleared} ${decider}`, dim: true }] },
        ...(s.ask > 0 ? [{ spans: [{ text: isShort ? `■ ${s.ask}` : `■ ${plural(s.ask, 'pendiente', 'pendientes')}`, color: C.amber }] }] : []),
        { spans: [{ text: isShort ? `✗ ${s.deny}` : `✗ ${plural(s.deny, 'denegado', 'denegados')}`, color: s.deny > 0 ? C.warn : C.dim }] },
      ]
      const words = totalsOf(false)
      const isShort = piecesThatFit(words.map(p => ({ width: anchoDe(p) })), w - 4, 2) < words.length
      const totals = isShort ? totalsOf(true) : words
      return (
        <Box flexDirection="column" paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.faint} weight="semibold" wrap="truncate">
              {cfg.gateLabel} · revisión
            </Text>
            <Box flexShrink={0}>
              <Text dimColor>{`${s.total} revisiones`}</Text>
            </Box>
          </Box>
          {strip.length === 0 ? <Text color={C.faint}>sin revisiones aún</Text> : markRow(strip.map(checkMark))}
          {line([...totals, !isShort && w >= 80 && g.recent.some(c => c.inSubagent) ? { spans: [{ text: 'tenue: en subagentes', color: C.faint }] } : null], w - 4, 2)}
          {/* Below about 44 columns the three rows' buttons take two lines rather than run past the box. */}
          <Box columnGap={2} flexWrap="wrap">
            {(['file', 'shell', 'other'] as const).map((b: Bucket) => {
              const name = { file: 'archivo', shell: 'shell', other: 'otro' }[b]
              const tl = g.totals[b]
              const n = tl.rule + tl.ask + tl.cleared + tl.deny
              return (
                <Button
                  key={`gate-${b}`}
                  plain
                  hotkey={name[0]}
                  label={`${name} ${n}${open === b ? ' ▾' : ''}`}
                  dimColor={n === 0}
                  onPress={() => update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), gateOpen: normalize(DEFAULT_VIEW, x).gateOpen === b ? null : b }))}
                />
              )
            })}
          </Box>
          {open
            ? g.recent
                .filter(c => c.bucket === open)
                .slice(-5)
                .map(c => (
                  // The verdict sits in a box of its own width, not padded with spaces, which a graphical surface collapses.
                  <Box width={w - 4} columnGap={1} overflow="hidden">
                    <Box width={13} flexShrink={0}>
                      <Text>
                        <Text color={verdictColor(c)}>{c.verdict === 'deny' ? '✗ ' : '■ '}</Text>
                        <Text color={C.dim}>{c.verdict === 'rule' ? 'permitido' : c.verdict === 'cleared' ? decider : c.verdict === 'ask' ? 'pendiente' : 'denegado'}</Text>
                      </Text>
                    </Box>
                    <Text dimColor={c.inSubagent} wrap="truncate">
                      {shorten(c.detail, Math.max(10, w - 19))}
                    </Text>
                  </Box>
                ))
            : null}
        </Box>
      )
    }

    // ---- agents: cards up to the limit, swimlanes beyond it
    const statusColor = (c: AgentCard) => (c.status === 'failed' ? C.warn : c.status === 'done' ? C.gate : C.agent)
    // El símbolo de estado: un giro mientras el agente trabaja (cada uno en su fase) y ✓, ✗ o ○ al acabar.
    const glyph = (c: AgentCard, i: number) => emojiDeEstado(now, c.status, i, cfg.animacion)
    // La pista del agente: la barra en su color. El emoji va al principio de la fila, no en la pista.
    const pistaDe = (c: AgentCard, g: { before: number; bar: number; after: number }) => {
      const { antes, despues } = pistaCarril(g, null)
      const color = (t: { barra: boolean }) => (t.barra ? statusColor(c) : C.faint)
      return (
        <Text>
          {[...antes, ...despues].map((t, k) => (
            <Text key={String(k)} color={color(t)}>{t.texto}</Text>
          ))}
        </Text>
      )
    }
    const expandOnPress = (id: string) => () =>
      update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), expanded: normalize(DEFAULT_VIEW, x).expanded === id ? null : id }))

    const agentsPanel = (w: number) => {
      // Cards need 20 columns each; when the pane can't hold the limit, lanes take over.
      const fit = Math.max(1, Math.min(cfg.maxCards, Math.floor((w + 1) / 21)))
      const useLanes = cards.length > fit
      const isNarrow = w < 40
      const header = (
        <Box justifyContent="space-between" width={w}>
          <Text weight="semibold" wrap="truncate">
            {isNarrow ? `agentes · ${running.length}/${cards.length}` : `agentes · ${running.length} activos · ${cards.length} total`}
          </Text>
          {cards.length > 0 ? (
            <Box flexShrink={0}>
              <Text color={C.faint}>{`1-${Math.min(cards.length, useLanes ? CARRILES_VISIBLES : fit)}${isNarrow ? '' : ' abrir'}`}</Text>
            </Box>
          ) : null}
        </Box>
      )
      if (cards.length === 0) {
        return (
          <Box flexDirection="column" width={w}>
            {header}
            <Text color={C.faint}>aún sin subagentes</Text>
          </Box>
        )
      }
      if (useLanes) {
        const shown = cards.slice(-CARRILES_VISIBLES)
        // A lane is its glyph (an emoji, two columns), a label, the bar and a clock: below 34 columns the label
        // narrows, below 36 the bar, so a 24-column pane still holds it. From 40 they are as they always were.
        const labelW = Math.min(17, Math.max(7, w - 18))
        const barW = Math.max(4, w - 12 - labelW)
        const geo = lanes(shown, now, barW)
        return (
          <Box flexDirection="column" width={w}>
            {header}
            {cards.length > shown.length ? <Text color={C.faint}>{`+${cards.length - shown.length} anteriores`}</Text> : null}
            {shown.map((c, i) => {
              const gm = geo[i]
              const isViewed = viewed === c.id
              return (
                <Box key={c.id} columnGap={1}>
                  <Text color={statusColor(c)} weight={isViewed ? 'semibold' : 'regular'}>
                    {isViewed ? '▶ ' : glyph(c, i)}
                  </Text>
                  <Box width={labelW} flexShrink={0}>
                    <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={shorten(cardTitle(c), labelW - 3)} onPress={expandOnPress(c.id)} />
                  </Box>
                  <Box flexShrink={0}>
                    {pistaDe(c, gm ?? { before: 0, bar: barW, after: 0 })}
                  </Box>
                  {clock(`lane-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}
                </Box>
              )
            })}
          </Box>
        )
      }
      const shown = cards.slice(-fit)
      const cardW = Math.max(20, Math.floor((w - (shown.length - 1)) / shown.length))
      const centers = shown.map((_, i) => i * (cardW + 1) + Math.floor(cardW / 2))
      return (
        <Box flexDirection="column" width={w}>
          {header}
          {rail('fan-out', running.length > 0, C.agent, w, centers)}
          <Box columnGap={1}>
            {shown.map((c, i) => {
              const isViewed = viewed === c.id
              const sameModel = !c.model || prettyModel(c.model) === modelName
              return (
                <Box key={c.id} flexDirection="column" width={cardW} paddingX={1}>
                  <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={titleLines(cardTitle(c), cardW - 7, cardW - 4)[0]} onPress={expandOnPress(c.id)} />
                  <Text weight={isViewed ? 'semibold' : 'regular'} wrap="truncate">
                    {titleLines(cardTitle(c), cardW - 7, cardW - 4)[1]}
                  </Text>
                  <Text color={C.dim} wrap="truncate">
                    {`${sameModel ? nombreDeTipo(c.type) : `${nombreDeTipo(c.type)} · ${prettyModel(c.model)}`}${c.jev ? ` · ${c.jev}` : ''}`}
                  </Text>
                  <Text dimColor wrap="truncate">
                    {c.steps > 0 ? `ctx ${kTokens(c.ctx)} · sal ${kTokens(c.out)} · ${c.steps} pas.` : c.status === 'running' ? 'iniciando…' : statusLabel(c.status)}
                  </Text>
                  {cardW >= 14 && c.status === 'running' ? (
                    <Text color={C.agent} wrap="truncate">
                      {barraIndeterminada(cfg.animacion ? now : 0, cardW - 4)}
                    </Text>
                  ) : null}
                  {pistaDe(c, { before: Math.max(2, cardW - 4), bar: 0, after: 0 })}
                  <Box columnGap={1}>
                    <Text color={c.lastStop === 'max_tokens' ? C.warn : statusColor(c)}>
                      {cardW >= 26 ? `${glyph(c, i)} ${c.lastStop === 'max_tokens' ? 'tope de tokens' : statusLabel(c.status)}` : glyph(c, i)}
                    </Text>
                    <Box flexShrink={0}>{clock(`card-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}</Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
          {rail('merge', running.length > 0, C.agent, w, centers, true)}
        </Box>
      )
    }

    const expandedCard = cards.find(c => c.id === v.expanded)
    const expandedPanel = (w: number) =>
      expandedCard ? (
        <Box flexDirection="column" paddingX={1} width={w}>
          <Text weight="semibold" wrap="wrap">
            {expandedCard.description || nombreDeTipo(expandedCard.type)}
          </Text>
          <Text dimColor wrap="truncate">{`${nombreDeTipo(expandedCard.type)} · ${prettyModel(expandedCard.model)} · ${statusLabel(expandedCard.status)} · ${expandedCard.steps} pasos`}</Text>
          {expandedCard.tools.length === 0 ? <Text color={C.faint}>sin llamadas aún</Text> : null}
          {expandedCard.tools.map((n, i) => (
            <Text key={String(i)} color={n.isError ? C.warn : C.text} wrap="truncate">
              {`${n.isError ? '✗' : '·'} ${n.text}`}
            </Text>
          ))}
          {expandedCard.answer ? (
            <Text dimColor wrap="wrap">
              {`» ${shorten(expandedCard.answer, 240)}`}
            </Text>
          ) : null}
        </Box>
      ) : null

    // ---- other loops (workflow agents, forks): ids that match no card
    const loopsPanel = (w: number) => {
      if (lp.length === 0) return null
      const active = lp.filter(l => isLoopActive(l, now)).length
      const dots = lp.slice(-Math.max(4, marksIn(w - 38, isTerminal)))
      const isNarrow = w < 40
      return (
        <Box width={w} columnGap={1}>
          <Text color={C.faint} weight="semibold">{isNarrow ? 'loops' : 'otros loops'}</Text>
          <Text dimColor>{isNarrow ? `${lp.length} · ${active} activos` : `${lp.length} vistos · ${active} activos`}</Text>
          {markRow(
            dots.map(l => (
              <Text key={l.id} color={isLoopActive(l, now) ? C.agent : l.isDone ? C.dim : C.faint}>{isLoopActive(l, now) ? '●' : l.isDone ? '✓' : '○'}</Text>
            )),
            1,
          )}
        </Box>
      )
    }

    // ---- receipt: the turn now, or the last one
    const receiptPanel = (w: number) => {
      const isReview = t.isReviewing
      return (
        <Box flexDirection="column" paddingX={1} width={w}>
          {m.isRunning ? (
            <Box width={w - 4} columnGap={1} overflow="hidden">
              <Text color={C.main} wrap="truncate">{`◐ turno de ${modelName.toLowerCase()}`}</Text>
              <Box flexShrink={0}>{clock('turn-clock', t.startedAt, null, C.main)}</Box>
              {w >= 60 ? <Text dimColor wrap="truncate">{`· ${plural(t.edits, 'edición', 'ediciones')} · ${plural(t.errors, 'error', 'errores')}`}</Text> : null}
            </Box>
          ) : r ? (
            line(
              [
                { spans: [{ text: r.reason === 'answer' ? '✓' : '✗', color: r.reason === 'answer' ? C.gate : C.warn }] },
                {
                  spans: [{ text: textoUltimoTurno(r) }],
                  fill: true,
                },
                r.costDelta !== null ? { spans: [{ text: `· +${fmtUsd(r.costDelta)}`, color: C.main }] } : null,
              ],
              w - 4,
            )
          ) : (
            <Text color={C.faint}>aún sin turnos terminados</Text>
          )}
          {isReview ? (
            <Text color={C.arch} wrap="wrap">
              {`${cfg.architectLabel.toLowerCase()} revisando antes de terminar (inferido)`}
            </Text>
          ) : null}
        </Box>
      )
    }

    // La barra de vida: una fila dentro del panel, con la vida que le queda de contexto.
    // Una fila por línea, con cada trozo en su Text y los espacios de los bordes en cajas: el gap va en la Box.
    const vidaSesion = (w: number) => {
      const filas = filasVida({ contextoPct: ctxFill.pct, columnas: w })
      return filas.map((fila, i) => (
        <Box key={`m${i}`} flexDirection="row">
          {fila.tramos.flatMap((tr, j) => {
            const core = tr.texto.trim()
            if (core === '') return [<Box key={`s${j}`} width={tr.texto.length} flexShrink={0} />]
            const lead = tr.texto.length - tr.texto.trimStart().length
            const trail = tr.texto.length - tr.texto.trimEnd().length
            return [
              lead > 0 ? <Box key={`l${j}`} width={lead} flexShrink={0} /> : null,
              <Text key={`t${j}`} color={C[COLOR_DE[tr.tono]]} weight={tr.tono === 'peligro' ? 'semibold' : 'regular'}>
                {core}
              </Text>,
              trail > 0 ? <Box key={`r${j}`} width={trail} flexShrink={0} /> : null,
            ]
          })}
        </Box>
      ))
    }
    // En escritorio la vida es un SVG con degradado continuo; en la terminal, la fila de texto.
    const vidaEscritorio = (w: number) => {
      if (e.surface === 'terminal') return null
      const v = vidaDe(ctxFill.pct)
      if (!('Svg' in els) || v === null) return null
      const { Svg } = els
      const px = Math.max(120, Math.min(600, w * 8 - 48))
      return <Svg source={svgVida(v, px)} alt={`vida ${v}%`} width={px} height={18} />
    }
    // La caja JEV sale en la columna solo con decisiones; en el diagrama, siempre que el panel esté en `panels`.
    const jevPanel = (w: number) => panelJev(els, C, w, resumenJevs)

    const draw = (p: Panel, w: number) =>
      p === 'main'
        ? esLista
          ? sesionPanel(w)
          : mainPanel(w)
        : p === 'jev'
          ? jevPanel(w)
          : p === 'architect'
            ? architectPanel(w)
            : p === 'gate'
              ? gatePanel(w)
              : p === 'agents'
                ? agentsPanel(w)
                : p === 'loops'
                  ? loopsPanel(w)
                  : receiptPanel(w)

    // Panels with the flow between them; the agents panel draws its own rails.
    // En la lista (auto) las secciones se separan con una fila en blanco, sin conectores.
    const column = (ps: Panel[], w: number) => (
      <Box flexDirection="column" width={w} gap={esLista ? 1 : 0}>
        {ps.map((p, i) => {
          const prev = ps[i - 1]
          const link =
            esLista || i === 0 || p === 'agents' || prev === 'agents' || p === 'loops' || prev === 'loops'
              ? null
              : rail(`link-${p}`, p === 'architect' ? advising : m.isRunning, p === 'architect' ? C.arch : C.main, w)
          return (
            <Box key={p} flexDirection="column">
              {link}
              {draw(p, w)}
              {p === 'agents' ? expandedPanel(w) : null}
            </Box>
          )
        })}
      </Box>
    )

    // Desktop draws the agents' time axis as SVG under the panels.
    const svgLanes = e.surface !== 'terminal' && panels.includes('agents') && cards.length > 0 ? carrilesSvg($.ui.resolve(e).Svg, cards, now) : null

    // Inline above the prompt (the terminal's main screen), the pane is a summary of at most 8 rows.
    // Con `auto` y 66 columnas o más, el diagrama también va inline; el resumen queda para lo más estrecho.
    const isMini = layout === 'mini' || (layout === 'auto' && e.props.placement === 'inline' && !enDiagrama && !enMapa)
    if (isMini) {
      const live = cfg.panels.includes('agents') ? [...cards.filter(c => c.status === 'running'), ...cards.filter(c => c.status !== 'running').reverse()].slice(0, 3) : []
      const counts = `${plural(s.rule, 'permitido', 'permitidos')} · ${s.cleared} ${decider}${s.ask > 0 ? ` · ${plural(s.ask, 'pendiente', 'pendientes')}` : ''} · ${plural(s.deny, 'denegado', 'denegados')}`
      const strip = cfg.panels.includes('gate') ? g.recent.slice(-Math.max(4, marksIn(W - cfg.gateLabel.length - 2 - counts.length, isTerminal))) : []
      const mg = ctxFill.pct !== null ? gauge(ctxFill.pct, 6) : null
      return (
        <Box flexDirection="column" width={W}>
          {line(
            [
              {
                spans: [
                  { text: modelName, color: C.main, weight: 'semibold' },
                  { text: m.isRunning ? ' ● trabajando' : ' ○ en espera', color: m.isRunning ? C.main : C.dim },
                ],
              },
              mg
                ? {
                    spans: [
                      { text: '· ctx ', dim: true },
                      { text: mg.on, color: (ctxFill.pct ?? 0) >= 80 ? C.warn : C.main },
                      { text: mg.off, color: C.faint },
                      { text: ` ${Math.round(ctxFill.pct ?? 0)}%` },
                      ...(u.compactions > 0 ? [{ text: ` ⟲${u.compactions}`, color: C.amber }] : []),
                    ],
                  }
                : u.compactions > 0
                  ? { spans: [{ text: `⟲${u.compactions}`, color: C.amber }] }
                  : null,
              u.costUsd !== null ? { spans: [{ text: `· ${fmtUsd(u.costUsd)}`, dim: true }] } : null,
              jevN > 0 ? { spans: [{ text: `· jev [${jevN} decisiones]`, color: C.agent }] } : null,
              showArchitect && cfg.panels.includes('architect') ? { spans: [{ text: `· ${cfg.architectLabel.toLowerCase()} ${advising ? 'asesorando' : a.consults.length}`, color: C.arch }] } : null,
            ],
            W,
          )}
          {strip.length > 0 ? (
            <Box columnGap={1}>
              <Text dimColor>{cfg.gateLabel.toLowerCase()}</Text>
              {markRow(strip.map(checkMark))}
              <Text color={s.deny > 0 ? C.warn : s.ask > 0 ? C.amber : C.dim} wrap="truncate">
                {counts}
              </Text>
            </Box>
          ) : null}
          {live.map((c, i) => (
            <Box key={c.id} columnGap={1}>
              <Text color={statusColor(c)}>{glyph(c, i)}</Text>
              <Box width={Math.max(6, W - 30)} flexShrink={0}>
                <Text wrap="truncate">{cardTitle(c)}</Text>
              </Box>
              {c.steps > 0 ? <Text dimColor>{`ctx ${kTokens(c.ctx)}`}</Text> : null}
              {clock(`mini-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}
            </Box>
          ))}
          {cfg.panels.includes('agents') && cards.length > live.length ? (
            <Text color={C.faint} wrap="truncate">{`+${cards.length - live.length} agentes más · /tablero layout compact para ver todos`}</Text>
          ) : null}
          {cfg.panels.includes('loops') && lp.length > 0 ? <Text dimColor wrap="truncate">{`otros loops ${lp.length} · ${lp.filter(l => isLoopActive(l, now)).length} activos`}</Text> : null}
          {!m.isRunning && r && cfg.panels.includes('receipt') ? (
            <Text dimColor wrap="truncate">
              {`${textoUltimoTurno(r)}${r.costDelta !== null ? ` · +${fmtUsd(r.costDelta)}` : ''}`}
            </Text>
          ) : null}
        </Box>
      )
    }

    const legend = fitLegend(
      [
        { label: 'principal', color: C.main },
        { label: 'agentes', color: C.agent },
        { label: cfg.gateLabel.toLowerCase(), color: C.gate },
        ...(showArchitect ? [{ label: cfg.architectLabel.toLowerCase(), color: C.arch }] : []),
        ...(jevVisible ? [{ label: 'jev', color: C.cleared }] : []),
      ],
      W,
    )

    // El diagrama: el asesor a la izquierda, el lead y la caja JEV a la derecha, y debajo las tarjetas. Los paneles
    // que el diagrama no tiene sitio (permisos, bucles, turno, sesión) siguen en columna debajo, sin perderse.
    // El asesor sale solo si hubo consultas (y `panels` lo incluye): sin asesor configurado, la caja estorbaba vacía.
    const conAsesor = cfg.panels.includes('architect') && showArchitect
    const { aw, rw } = anchosDiagrama(W, conAsesor)
    const conTarjetas = panels.includes('agents')
    const restoPaneles = panels.filter(p => !['main', 'jev', 'architect', 'agents'].includes(p))
    const diagramaBody = enDiagrama ? disposicionDiagrama(els, C, {
      ancho: W,
      asesor: conAsesor ? architectPanel(aw) : null,
      aw,
      lead: panels.includes('main') ? mainPanel(rw) : null,
      jev: cfg.panels.includes('jev') ? jevPanel(rw) : null,
      delegar: conTarjetas,
      tarjetas: conTarjetas ? agentsPanel(W) : null,
      expandido: conTarjetas ? expandedPanel(W) : null,
      vuelta: conTarjetas && running.length === 0,
      resto: restoPaneles.length > 0 ? column(restoPaneles, W) : null,
      barra: `subagentes [${cards.filter(c => c.status !== 'running').length}/${cards.length}]${conAsesor ? ` · ${cfg.architectLabel.toLowerCase()} [${advising ? 'asesorando' : a.consults.length}]` : ''}${jevN > 0 ? ` · jev [${jevN} decisiones]` : ''}`,
      motion: cfg.motion,
      activo: running.length > 0,
    }) : null

    const nivelRit = filaRit?.nivel
    const ritmoMapa = rit && nivelRit
      ? { texto: textoRitmoMapa(rit.exceso, nivelRit), k: tintaDeNivel(nivelRit) }
      : undefined
    // El tope que rige ahora para los subagentes (no el último que se aplicó): se calcula del uso de la cuenta.
    const topeVigente = topeAhora(jevs.limites, now / 1000)
    anotarCosto(muestrasCosto, u.costUsd, now, SPARK_ANCHO)
    // La vista del mapa (`auto`, desde 40 columnas): sus datos y su dibujo están en mapa-vista.tsx.
    const mapaDatos = datosDelMapa({
      now,
      rama: branchNow,
      u,
      m,
      t,
      r,
      s,
      cards,
      lp,
      a,
      jevs,
      usos: usosNow,
      muestras: muestrasCosto,
      panels: cfg.panels,
      jevN,
      modelo: modelName,
      agentesActivos: running.length,
      contexto: ctxFill.pct,
      asesorVisible: showArchitect,
      asesorActivo: advising,
      ritmo: ritmoMapa,
      tope: topeVigente,
    })
    if (enMapa) return vistaMapa(els, C, mapaDatos, W, now, cfg.animacion)

    const body = enDiagrama ? diagramaBody : isWide ? (
      <Box flexDirection="column">
        <Box columnGap={2}>
          {column(panels.filter(p => p === 'main' || p === 'architect' || p === 'gate'), colW)}
          {column(panels.filter(p => p === 'agents' || p === 'loops' || p === 'receipt'), colW)}
        </Box>
      </Box>
    ) : (
      column(panels, W)
    )

    // La lista lleva una cabecera sobria: nombre, modelo y estado a la izquierda; versión, tiempo y hora a la derecha,
    // atenuados; debajo, una línea fina. Sin emoji ni leyenda de colores.
    if (esLista) {
      const dcha = [W >= 48 ? `v${MOD_VERSION}` : '', W >= 40 && u.startedAt ? fmtDuration(now - u.startedAt) : '', fmtClock(now).slice(0, 5)].filter(Boolean).join('  ')
      return (
        <Box flexDirection="column" width={W}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text weight="semibold">TABLERO</Text>
              <Text dimColor>{` · ${modelName} · `}</Text>
              <Text color={m.isRunning ? C.main : C.dim}>{m.isRunning ? '● trabajando' : '○ en espera'}</Text>
              {showArchitect ? <Text color={C.arch}>{advising ? ' · asesorando' : ''}</Text> : null}
            </Text>
            <Box flexShrink={0}>
              <Text dimColor tabular>{dcha}</Text>
            </Box>
          </Box>
          <Text color={C.faint}>{'─'.repeat(W)}</Text>
          {body}
          {svgLanes}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={W}>
        {/* Below 40 columns the frame's own title names the pane, so the header starts at the model. */}
        {line(
          [
            W >= 40 ? { spans: [{ text: 'TABLERO', weight: 'semibold' }, { text: ' ·', color: C.dim, weight: 'semibold' }] } : null,
            { spans: [{ text: modelName.toUpperCase(), color: C.main, weight: 'semibold' }, { text: m.isRunning ? ' TRABAJA' : ' EN ESPERA', weight: 'semibold' }] },
            W >= 40 ? { spans: [{ text: `v${MOD_VERSION}`, dim: true }] } : null,
            W >= 56 ? { spans: [{ text: `⏱ ${u.startedAt ? fmtDuration(now - u.startedAt) : '—'}`, dim: true }] } : null,
            W >= 56 ? { spans: [{ text: `🕐 ${fmtClock(now).slice(0, 5)}`, dim: true }] } : null,
            showArchitect
              ? {
                  spans: [
                    { text: '· ', color: C.dim, weight: 'semibold' },
                    { text: cfg.architectLabel, color: C.arch, weight: 'semibold' },
                    { text: advising ? ' ASESORANDO' : ' DE GUARDIA', weight: 'semibold' },
                  ],
                }
              : null,
          ],
          W,
          1,
          'center',
        )}
        <Box key="legend" justifyContent="center" columnGap={2} marginBottom={legendGap}>
          {legend.map(l => (
            <Box key={l.label} flexShrink={0}>
              <Text>
                <Text color={l.color}>■</Text>
                <Text dimColor>{` ${l.label}`}</Text>
              </Text>
            </Box>
          ))}
        </Box>
        {body}
        {svgLanes}
      </Box>
    )
  }).catch(($, e, next) => {
    // Without this a failed draw leaves the engine's empty pane.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" width={Math.max(20, e.props.bodyColumns)}>
        <Text weight="semibold">TABLERO</Text>
        <Text color={C.warn} wrap="wrap">{`falló el dibujo (${next.error.kind}): ${next.error.message ?? 'sin mensaje'}`}</Text>
      </Box>
    )
  })
}

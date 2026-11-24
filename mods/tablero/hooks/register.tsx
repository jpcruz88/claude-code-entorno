import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentCard, Architect, Bucket, Check, Gate, JevEstado, Layout, Loop, Main, Plan, Receipt, Roster, Turn, Usage, View } from '../types'
import { CAIDA_MS, aplicar, filaPlan, resumen as resumenPlan, visibles as planesVisibles } from './planes'
import { etiquetaCaveman } from './caveman'
import { filasAduana, vigente as aduanaVigente } from './aduana'
import { textoCache } from './cache'
import { gastoDelDia, porHora } from './gasto-dia'
import { siguienteModo, type Modo } from './caveman'
import { leerLinea } from './linea-sesion'
import type { EstadoAduana, Extra, Fuentes } from '../types'
import { estadoCi, parseShortstat, parseSinSubir } from './git-ci'
import { URL_SERVICIO, leerServicio } from './servicio'
import { contarConfig, contarHooks, servidoresMcp, soloImporta } from './config-cargada'
import { consejoGasto, topGasto } from './gasto'
import { abiertas, estadoSesion, leerSesiones } from './sesiones'
import { anotar, destinoHerdr, envioDe, filasConversaciones, leerConversaciones, resumenConversaciones, type Envio, type Mensaje } from './conversaciones'
import type { RegistroSesion } from '../types'
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
import { celdasUso, pronosticoCupo, ritmoCupo, tonoUso } from './uso'
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
// Aduana (antes aduana-panel): su escritor deja este archivo cada pocos segundos mientras corren pruebas largas.
const ARCHIVO_ADUANA = '.cache/detector-humo/en-curso.json'
const aduana = atom({ plugin: 'tablero', key: 'aduana' } as const, null as EstadoAduana | null)
let relojAduana: { cancel: () => void } | null = null
let aduanaAvisada = 0
// El modo caveman (antes caveman-badge): lo cambian «/caveman lite|full|ultra», «stop caveman» y «modo normal».
const caveman = atom({ plugin: 'tablero', key: 'caveman' } as const, 'full' as Modo)
// Las fuentes externas: git cada 10 s, el CI del PR cada 60 s y la página de estado y la config cada 5 min.
const DEFAULT_FUENTES: Fuentes = { git: null, ci: null, servicio: null, config: null }
const fuentes = atom({ plugin: 'tablero', key: 'fuentes' } as const, DEFAULT_FUENTES)
let relojFuentes: { cancel: () => void } | null = null
// Las demás sesiones, lo que más gasta y lo plegado del panel.
const otras = atom({ plugin: 'tablero', key: 'otras' } as const, [] as RegistroSesion[])
const gasto = atom({ plugin: 'tablero', key: 'gasto' } as const, { filas: [], consejo: null } as { filas: { llamada: string; motivo: string; tokens: number }[]; consejo: string | null })
const plegado = atom({ plugin: 'tablero', key: 'plegado' } as const, { gasto: true, sesiones: true, conversaciones: true })
// Quién le habla a quién (conversaciones.ts): lo que envió esta sesión, lo de todas y su último fin de turno.
const DEFAULT_CONV = { mias: [] as Mensaje[], todas: [] as Mensaje[], turnoFin: null as number | null }
const conv = atom({ plugin: 'tablero', key: 'conversaciones' } as const, DEFAULT_CONV)
const carpetaConversaciones = async ($: EngineInterface) => `${await $.env.get('HOME')}/.claude/tablero/conversaciones`
/** Anota (o cambia) un mensaje de esta sesión y reescribe su archivo para las demás. */
const guardarMensaje = async ($: EngineInterface, m: Mensaje) => {
  const ahora = await $.clock.now()
  const c = normalize(DEFAULT_CONV, await read($, conv))
  const mias = anotar(c.mias, m, ahora)
  await update($, conv, x => ({ ...normalize(DEFAULT_CONV, x), mias }))
  await $.fs.write(`${await carpetaConversaciones($)}/${m.de}.json`, JSON.stringify(mias)).catch(() => undefined)
}
/** A qué sesión va un envío: herdr lo sabe por `agent get` (como mucho 2 s); SendMessage, por el registro de Sesiones. */
const resolverDestino = async ($: EngineInterface, canal: 'herdr' | 'claude', destino: string): Promise<{ id: string | null; nombre: string }> => {
  if (canal === 'claude') {
    const s = listOf<RegistroSesion>(await read($, otras)).find(o => o.nombre === destino)
    return { id: s?.id ?? null, nombre: destino }
  }
  const r = await conTope($, 2000, $.process.run(['herdr', 'agent', 'get', destino], { timeoutMs: 2000 }))
  const d = r && r.exitCode === 0 ? destinoHerdr(r.stdout) : null
  return d ?? { id: null, nombre: destino }
}
/** Anota lo que envía esta sesión. `agent wait` no crea mensaje: vuelve a abrir la espera del último a ese destino.
 *  Un envío a la propia sesión no se anota. Devuelve el mensaje anotado, o null. */
const anotarEnvio = async ($: EngineInterface, envio: Envio, id: string): Promise<Mensaje | null> => {
  const [propia, ahora, ex, cwd] = await Promise.all([$.session.id().catch(() => ''), $.clock.now(), read($, extra), $.session.cwd().catch(() => '')])
  if (!propia) return null
  const destino = await resolverDestino($, envio.canal, envio.destino)
  if (destino.id === propia) return null
  if (envio.soloEspera) {
    const previos = normalize(DEFAULT_CONV, await read($, conv)).mias.filter(m => (destino.id !== null && m.a === destino.id) || m.aNombre === destino.nombre || m.aNombre === envio.destino)
    const ultimo = previos[previos.length - 1]
    if (!ultimo) return null
    const m = { ...ultimo, espera: true, esperaFin: null }
    await guardarMensaje($, m)
    return m
  }
  const nombrePropio = normalize(DEFAULT_EXTRA, ex).linea?.session_name ?? (cwd.split('/').filter(Boolean).pop() || propia)
  const m: Mensaje = {
    id,
    de: propia,
    deNombre: nombrePropio,
    a: destino.id,
    aNombre: destino.nombre,
    canal: envio.canal,
    resumen: envio.resumen,
    enviado: ahora,
    esperaFin: null,
    espera: envio.espera,
  }
  await guardarMensaje($, m)
  return m
}
const leerTodasConversaciones = async ($: EngineInterface) => {
  const [carpeta, ahora] = await Promise.all([carpetaConversaciones($), $.clock.now()])
  const lista = await $.fs.list(carpeta).catch(() => [])
  const textos = await Promise.all(
    lista
      .filter(f => f.kind === 'file' && f.name.endsWith('.json'))
      .map(async f => ({ nombre: f.name, texto: String(await $.fs.read(`${carpeta}/${f.name}`).catch(() => '')) })),
  )
  const todas = leerConversaciones(textos, ahora)
  // Sin cambios no se toca el estado: cada escritura pide un redibujo.
  if (JSON.stringify(todas) === JSON.stringify(normalize(DEFAULT_CONV, await read($, conv)).todas)) return
  await update($, conv, x => ({ ...normalize(DEFAULT_CONV, x), todas }))
}
// Desde cuándo esta sesión está en su estado actual, para el reloj de Sesiones de las otras.
let estadoPropio: { estado: RegistroSesion['estado']; desde: number } | null = null
const carpetaSesiones = async ($: EngineInterface) => `${await $.env.get('HOME')}/.claude/tablero/sesiones`
/** Escribe el registro de esta sesión para las demás y para el presupuesto. Sin rename en la API: quien lee
 *  ignora un archivo a medio escribir. */
const escribirRegistro = async ($: EngineInterface) => {
  const [id, ahora, m, g, ps, ex, costo, cwd, cv] = await Promise.all([
    $.session.id().catch(() => ''),
    $.clock.now(),
    getMain($),
    read($, gate),
    read($, planes),
    read($, extra),
    costNow($),
    $.session.cwd().catch(() => ''),
    read($, conv),
  ])
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return
  const c = normalize(DEFAULT_CONV, cv)
  const x = normalize(DEFAULT_EXTRA, ex)
  const estado = estadoSesion({
    trabajando: m.isRunning,
    permisosPendientes: gateSummary(normalizeGate(g)).ask,
    planEspera: listOf<Plan>(ps).some(p => p.estado === 'needs_input'),
  })
  if (estadoPropio?.estado !== estado) estadoPropio = { estado, desde: ahora }
  const registro: RegistroSesion = {
    id,
    nombre: x.linea?.session_name ?? null,
    carpeta: cwd.split('/').filter(Boolean).pop() ?? cwd,
    estado,
    desde: estadoPropio.desde,
    costo: costo ?? 0,
    base: x.base,
    dia: x.dia,
    actualizado: ahora,
    ...(c.turnoFin !== null ? { turnoFin: c.turnoFin } : {}),
  }
  await $.fs.write(`${await carpetaSesiones($)}/${id}.json`, JSON.stringify(registro))
}
const leerOtras = async ($: EngineInterface) => {
  const [carpeta, id, ahora] = await Promise.all([carpetaSesiones($), $.session.id().catch(() => ''), $.clock.now()])
  const lista = await $.fs.list(carpeta).catch(() => [])
  const textos = await Promise.all(
    lista
      .filter(f => f.kind === 'file' && f.name.endsWith('.json'))
      .map(async f => ({ nombre: f.name, texto: String(await $.fs.read(`${carpeta}/${f.name}`).catch(() => '')) })),
  )
  await update($, otras, () => leerSesiones(textos, id, ahora))
}
let vueltaFuentes = 0
// El último intento de leer el CI: con qué PR y cuándo (ms), para no lanzar gh más de una vez por minuto.
let ciIntento: { pr: number | null; en: number } = { pr: null, en: 0 }
/** Lo que tarde más que `ms` se da por perdido: el panel no espera a una red lenta. */
const conTope = <T,>($: EngineInterface, ms: number, p: Promise<T>): Promise<T | null> =>
  Promise.race([p.catch(() => null), $.clock.sleep(ms).then(() => null)])
const ponerFuente = ($: EngineInterface, parte: Partial<Fuentes>) => update($, fuentes, f => ({ ...normalize(DEFAULT_FUENTES, f), ...parte }))
const leerGit = async ($: EngineInterface) => {
  const cwd = await $.session.cwd().catch(() => '')
  const stat = await conTope($, 5000, $.process.run(['git', 'diff', '--shortstat', 'HEAD'], { cwd, timeoutMs: 5000 }))
  if (!stat || stat.exitCode !== 0) return ponerFuente($, { git: null })
  const sub = await conTope($, 5000, $.process.run(['git', 'rev-list', '--count', '@{u}..HEAD'], { cwd, timeoutMs: 5000 }))
  return ponerFuente($, { git: { ...parseShortstat(stat.stdout), sinSubir: sub && sub.exitCode === 0 ? parseSinSubir(sub.stdout) : null } })
}
const leerCi = async ($: EngineInterface) => {
  const pr = normalize(DEFAULT_EXTRA, await read($, extra)).linea?.pr
  if (!pr) return ponerFuente($, { ci: null })
  const cwd = await $.session.cwd().catch(() => '')
  const r = await conTope($, 10_000, $.process.run(['gh', 'pr', 'checks', String(pr.number), '--json', 'bucket'], { cwd, timeoutMs: 10_000 }))
  // gh sale con 8 mientras hay comprobaciones pendientes: su JSON sigue valiendo.
  return ponerFuente($, { ci: r && r.stdout ? estadoCi(r.stdout) : null })
}
const leerServicioClaude = async ($: EngineInterface) => {
  const r = await conTope($, 5000, $.http.fetch(URL_SERVICIO))
  return ponerFuente($, { servicio: r ? leerServicio(r.status, r.text) : null })
}
const leerConfig = async ($: EngineInterface) => {
  const [casa, raiz, ajustes, herramientas] = await Promise.all([
    $.env.get('HOME'),
    $.session.root().catch(() => ''),
    $.settings.read().catch(() => ({}) as Record<string, unknown>),
    $.tool.list().catch(() => []),
  ])
  const existe = (ruta: string) => $.fs.stat(ruta).then(() => 1).catch(() => 0)
  const mds = (carpeta: string) => $.fs.list(carpeta).then(l => l.filter(x => x.name.endsWith('.md')).length).catch(() => 0)
  const cuentas = await Promise.all([
    ...[`${casa}/.claude/CLAUDE.md`, `${raiz}/CLAUDE.md`, `${raiz}/AGENTS.md`, `${raiz}/.claude/CLAUDE.md`].map(existe),
    mds(`${casa}/.claude/rules`),
    mds(`${raiz}/.claude/rules`),
  ])
  // El CLAUDE.md del proyecto que solo hace `@AGENTS.md` es el mismo archivo de instrucciones: cuenta uno.
  const soloAgents = cuentas[1] && cuentas[2] ? await $.fs.read(`${raiz}/CLAUDE.md`).then(t => soloImporta(String(t))).catch(() => false) : false
  const claudeMd = cuentas.slice(0, 4).reduce((a, b) => a + b, 0) - (soloAgents ? 1 : 0)
  const reglas = (cuentas[4] ?? 0) + (cuentas[5] ?? 0)
  const hooks = contarHooks((ajustes as { hooks?: unknown }).hooks)
  const mcp = servidoresMcp(herramientas.map(h => h.name))
  return ponerFuente($, { config: contarConfig({ claudeMd, reglas, hooks, mcp }) })
}
// Lo que solo tiene la statusline, el tiempo de trabajo del lead, la cache leída y el arranque del día.
const DEFAULT_EXTRA: Extra = { linea: null, trabajoMs: 0, cacheLeida: 0, dia: '', base: 0 }
const extra = atom({ plugin: 'tablero', key: 'extra' } as const, DEFAULT_EXTRA)
const diaLocal = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Lee el archivo de la statusline de esta sesión y apunta el costo con que empezó el día. */
const refrescarExtra = async ($: EngineInterface) => {
  const [casa, id, ahora, costo] = await Promise.all([$.env.get('HOME'), $.session.id().catch(() => ''), $.clock.now(), costNow($)])
  const texto = casa && id && /^[A-Za-z0-9_-]+$/.test(id) ? await $.fs.read(`${casa}/.claude/tablero/linea/${id}.json`).catch(() => null) : null
  const linea = typeof texto === 'string' ? leerLinea(texto, ahora / 1000) : null
  const hoy = diaLocal(ahora)
  await update($, extra, x => {
    const v = normalize(DEFAULT_EXTRA, x)
    return { ...v, linea, ...(v.dia === hoy ? {} : { dia: hoy, base: costo ?? 0 }) }
  })
}

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

// Si el panel está a la vista: sin él, el resumen va sobre el prompt (ver el hook de AbovePrompt).
let panelColocado = false

async function openPane($: EngineInterface, cfg: Config) {
  // columns apply when docked beside the transcript, rows when seated inline above the prompt.
  const r = await $.ui.open({ id: PANE, title: TITLE, columns: cfg.paneColumns, rows: 8 })
  panelColocado = r?.isPlaced === true
  return r
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
    if (relojFuentes === null) {
      vueltaFuentes = 0
      // Una vuelta nunca lanza: una fuente que falla deja su dato como estaba y el resto sigue.
      const vuelta = () => vueltaSegura().catch(() => undefined)
      const vueltaSegura = async () => {
        const n = vueltaFuentes++
        const tareas: Promise<unknown>[] = []
        if (cfg.extras.has('git')) tareas.push(leerGit($))
        // El CI se mira en cuanto aparece un PR nuevo y después como mucho una vez por minuto, aunque gh falle.
        const pr = normalize(DEFAULT_EXTRA, await read($, extra)).linea?.pr?.number ?? null
        const ahoraCi = await $.clock.now()
        if (cfg.extras.has('ci') && pr !== null && (pr !== ciIntento.pr || ahoraCi - ciIntento.en >= 60_000)) {
          ciIntento = { pr, en: ahoraCi }
          tareas.push(leerCi($))
        }
        if (cfg.extras.has('servicio') && n % 30 === 0) tareas.push(leerServicioClaude($))
        if (n % 30 === 0) tareas.push(leerConfig($))
        if (cfg.extras.has('sesiones') || cfg.extras.has('presupuesto')) tareas.push(leerOtras($))
        if (cfg.extras.has('sesiones')) tareas.push(leerTodasConversaciones($))
        await Promise.all(tareas.map(t => t.catch(() => undefined)))
      }
      void vuelta()
      relojFuentes = $.clock.every(10_000, vuelta)
    }
    if (relojAduana === null) {
      relojAduana = $.clock.every(5000, async () => {
        await refrescarExtra($).catch(() => undefined)
        if (cfg.extras.has('sesiones') || cfg.extras.has('presupuesto')) await escribirRegistro($).catch(() => undefined)
        try {
          const casa = await $.env.get('HOME')
          const leido = JSON.parse((await $.fs.read(`${casa}/${ARCHIVO_ADUANA}`)) as string) as EstadoAduana
          await update($, aduana, () => leido)
          if (leido.terminado && leido.actualizado !== aduanaAvisada) {
            aduanaAvisada = leido.actualizado
            $.ui.toast(`Aduana: pruebas terminadas, ${leido.hechas}/${leido.total}`)
          }
        } catch {
          await update($, aduana, () => null)
        }
      })
    }
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
    relojAduana?.cancel()
    relojAduana = null
    relojFuentes?.cancel()
    relojFuentes = null
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
    await update($, caveman, m => siguienteModo(m === 'lite' || m === 'ultra' || m === 'normal' ? m : 'full', e.text))
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
      const leidos = result.usage?.cache_read_input_tokens ?? 0
      if (leidos > 0) await update($, extra, x => ({ ...normalize(DEFAULT_EXTRA, x), cacheLeida: normalize(DEFAULT_EXTRA, x).cacheLeida + leidos }))
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
    // Lo que la sesión principal envía a otra sesión se anota antes de correr, para que se vea mientras espera.
    const envio = !e.agentId && cfg.extras.has('sesiones') ? envioDe(String(e.tool), e) : null
    const anotado = envio ? await anotarEnvio($, envio, e.tool_use_id).catch(() => null) : null
    const correr = async () => {
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
    }
    if (!anotado?.espera) return correr()
    // Con --wait (o agent wait) la llamada dura lo que tarda la respuesta: al terminar, la espera se cierra.
    try {
      return await correr()
    } finally {
      await guardarMensaje($, { ...anotado, esperaFin: await $.clock.now() }).catch(() => undefined)
    }
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
      // Las demás sesiones saben así si ya respondió a lo que le mandaron.
      await update($, conv, x => ({ ...normalize(DEFAULT_CONV, x), turnoFin: now }))
      const [t, cards, cost] = await Promise.all([getTurn($), getCards($), costNow($)])
      const r = receiptOf(t, {
        durationMs: e.durationMs,
        agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length,
        costNow: cost,
        reason: e.reason,
      })
      await update($, receipt, () => r)
      await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
      if (cfg.extras.has('gasto')) {
        const mensajes = await $.session.messages({ last: 400 }).catch(() => null)
        if (Array.isArray(mensajes)) {
          const filas = topGasto(mensajes)
          await update($, gasto, () => ({ filas, consejo: consejoGasto(filas) }))
        }
      }
      if (e.durationMs > 0) await update($, extra, x => ({ ...normalize(DEFAULT_EXTRA, x), trabajoMs: normalize(DEFAULT_EXTRA, x).trabajoMs + e.durationMs }))
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
      panelColocado = false
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

  // Un solo hook dibuja el panel (Pane) y, con el panel sin colocar, su resumen sobre el prompt (AbovePrompt):
  // el motor no deja pasar `$` a una función interna, así que el dibujo es una clausura de este hook.
  on('ui.render', async ($, entrada, next) => {
    const esPanel = entrada.component === 'Pane' && entrada.requestId === PANE
    if (!esPanel && entrada.component !== 'AbovePrompt') return next(entrada)
    const debajo = esPanel ? null : await next(entrada)
    if (!esPanel && (panelColocado || entrada.props.isCollapsed || entrada.props.hasSurvey)) return debajo
    // Sobre el prompt se dibuja lo mismo que en un Pane colocado ahí (inline): el resumen de hasta 8 filas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e: any = esPanel
      ? entrada
      : {
          ...entrada,
          component: 'Pane',
          requestId: PANE,
          props: { title: TITLE, isFocused: false, bodyColumns: entrada.props.bodyColumns, placement: 'inline', scroll: entrada.props.scroll, view: {} },
        }
    const pintar = async () => {
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
    const [planesNow, aduanaNow, cavemanNow, extraNow, fuentesNow, otrasNow, gastoNow, plegadoNow, herdr, convNow, idPropio] = await Promise.all([
      read($, planes).then(x => listOf<Plan>(x)),
      read($, aduana),
      read($, caveman),
      read($, extra).then(x => normalize(DEFAULT_EXTRA, x)),
      read($, fuentes).then(x => normalize(DEFAULT_FUENTES, x)),
      read($, otras).then(x => listOf<RegistroSesion>(x)),
      read($, gasto),
      read($, plegado).then(x => normalize({ gasto: true, sesiones: true, conversaciones: true }, x)),
      $.env.get('HERDR_ENV').then(x => x === '1').catch(() => false),
      read($, conv).then(x => normalize(DEFAULT_CONV, x)),
      $.session.id().catch(() => ''),
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
    const nombreCupo = (kind: string) => (/five/i.test(kind) ? 'Cupo 5 h' : /seven/i.test(kind) ? 'Cupo 7 d' : `Cupo ${limitLabel(kind)}`)
    // Lo que solo dice la statusline (cache, thinking, nombre, PR), lo que leen las fuentes y el dinero del día.
    const lineaNow = extraNow.linea
    const cacheNow = cfg.extras.has('cache') ? textoCache(lineaNow?.prompt_cache ?? null, now / 1000) : null
    const trabajoMs = extraNow.trabajoMs + (m.isRunning && t.startedAt > 0 ? Math.max(0, now - t.startedAt) : 0)
    const porHoraNow = u.costUsd !== null ? porHora(u.costUsd, trabajoMs) : null
    const hoyNow = cfg.extras.has('presupuesto') && cfg.presupuestoDiario > 0 && u.costUsd !== null && extraNow.dia
      ? gastoDelDia({ id: lineaNow?.session_id ?? '', costo: u.costUsd, base: extraNow.base, dia: extraNow.dia }, otrasNow, extraNow.dia)
      : null
    const REVISION: Record<string, string> = { approved: 'aprobado', pending: 'en revisión', changes_requested: 'con cambios pedidos', draft: 'borrador' }
    const etq = (x: string) => <Text dimColor>{x.padEnd(ETIQUETA)}</Text>
    // Una fila en trozos: entran por orden mientras caben en `room`; lo opcional va al final y es lo primero que cae.
    type Trozo = { t: string; c?: string; dim?: boolean }
    const caben = (xs: (Trozo | null | false)[], room: number): Trozo[] => {
      const out: Trozo[] = []
      let n = 0
      for (const x of xs) {
        if (!x) continue
        if (n + [...x.t].length > room) break
        out.push(x)
        n += [...x.t].length
      }
      return out
    }
    const trozos = (xs: Trozo[]) => xs.map((x, k) => (
      <Text key={`t${k}`} color={x.c} dimColor={x.dim}>
        {x.t}
      </Text>
    ))
    const sesionPanel = (w: number) => {
      const ancho = Math.max(6, Math.min(20, w - ETIQUETA - 26))
      const room = w - 2 - ETIQUETA
      const pr = lineaNow?.pr ?? null
      const git = fuentesNow.git
      return (
        <Box flexDirection="column" width={w}>
          <Text weight="semibold">Sesión</Text>
          <Box flexDirection="column" paddingLeft={2}>
            <Text wrap="truncate">
              {etq('Modelo')}
              {trozos(
                caben(
                  [
                    { t: modelName },
                    !!m.effort && { t: ` · ${m.effort}`, dim: true },
                    lineaNow?.thinking != null && { t: ` · thinking ${lineaNow.thinking ? 'on' : 'off'}`, dim: true },
                    !!m.speed && { t: ` · ${fmtSpeed(m.speed!)}`, dim: true },
                  ],
                  room,
                ),
              )}
            </Text>
            {ctxFill.pct !== null
              ? filaBarra(
                  'ctx',
                  'Contexto',
                  ctxFill.pct,
                  ancho,
                  u.compactions > 0 ? `⟲${u.compactions}` : '',
                  C.amber,
                  u.tokens !== null ? `${kTokens(u.tokens)}/${kTokens(ctxFill.window)}` : '',
                )
              : null}
            {cacheNow && lineaNow?.prompt_cache ? (
              <Text wrap="truncate">
                {etq('Cache')}
                {trozos(
                  caben(
                    [
                      { t: cacheNow.caliente ? '● Caliente' : '○ Fría', c: cacheNow.caliente ? C.gate : C.amber },
                      !!cacheNow.queda && { t: `  Caduca en ${cacheNow.queda}`, c: cacheNow.aviso ? C.amber : undefined, dim: !cacheNow.aviso },
                      cacheNow.aciertos !== null && { t: `  · ${cacheNow.aciertos} % aciertos`, dim: true },
                      extraNow.cacheLeida > 0 && { t: `  · ${kTokens(extraNow.cacheLeida)} leídos`, dim: true },
                    ],
                    room,
                  ),
                )}
              </Text>
            ) : null}
            {u.costUsd !== null ? (
              <Text wrap="truncate">
                {etq('Costo')}
                {trozos(
                  caben(
                    [
                      { t: fmtUsd(u.costUsd) },
                      { t: `  · ${plural(m.steps, 'respuesta', 'respuestas')}`, dim: true },
                      porHoraNow !== null && { t: ` · ${fmtUsd(porHoraNow)}/h trabajando`, dim: true },
                    ],
                    room,
                  ),
                )}
              </Text>
            ) : null}
            {hoyNow !== null
              ? filaBarra('hoy', 'Hoy', (hoyNow / cfg.presupuestoDiario) * 100, ancho, '', undefined, `${fmtUsd(hoyNow)} de ${fmtUsd(cfg.presupuestoDiario)}`)
              : null}
            {u.limits.slice(0, 2).map(l => {
              const ventana = /five/i.test(l.kind) ? 5 * 3_600_000 : 7 * 86_400_000
              const fraccion = l.resetsAt == null ? null : Math.min(1, Math.max(0, 1 - (l.resetsAt - now) / ventana))
              const ritmo = ritmoCupo(l.pct, fraccion)
              const reinicio = w >= 56 ? fmtReinicio(l.resetsAt, now) : ''
              const pronostico = w >= 90 ? pronosticoCupo(l.pct, fraccion, l.resetsAt ?? null, now) : ''
              const cola = [reinicio ? `↻ ${reinicio}` : '', pronostico].filter(Boolean).join(' · ')
              return filaBarra(`cupo-${l.kind}`, nombreCupo(l.kind), l.pct, ancho, ritmo, ritmo.startsWith('⇡') ? C.amber : C.gate, cola)
            })}
            <Text wrap="truncate">
              {etq('Proyecto')}
              <Text>{carpeta || '—'}</Text>
              {lineaNow?.session_name && room - (carpeta || '—').length - 5 >= 6 ? (
                <Text dimColor>{` · «${shorten(lineaNow.session_name, room - (carpeta || '—').length - 5)}»`}</Text>
              ) : null}
            </Text>
            {cfg.extras.has('git') && (git || pr) ? (
              <Text wrap="truncate">
                {etq('Git')}
                {trozos(
                  caben(
                    [
                      ...(git && git.archivos > 0
                        ? [{ t: `${plural(git.archivos, 'archivo', 'archivos')} ` }, { t: `+${git.mas}`, c: C.gate }, { t: ` −${git.menos}`, c: C.warn }]
                        : git
                          ? [{ t: 'Sin cambios', dim: true }]
                          : []),
                      !!git?.sinSubir && { t: `  · ↑${git!.sinSubir} sin subir`, dim: true },
                      !!pr && { t: `  · PR #${pr!.number}${pr!.review_state && REVISION[pr!.review_state] ? ` ${REVISION[pr!.review_state]}` : ''}`, dim: true },
                      fuentesNow.ci === 'corriendo' && { t: ` · ${emojiDeEstado(now, 'running', 6, cfg.animacion)} CI corriendo`, c: C.main },
                      fuentesNow.ci === 'pasa' && { t: ' · ✓ CI pasa', c: C.gate },
                      fuentesNow.ci === 'falla' && { t: ' · ✗ CI falla', c: C.warn },
                    ],
                    room,
                  ),
                )}
              </Text>
            ) : null}
            {fuentesNow.config ? (
              <Text wrap="truncate">
                {etq('Config')}
                <Text dimColor>{shorten(fuentesNow.config, room)}</Text>
              </Text>
            ) : null}
            {resumenUsos(usosNow) ? <Text dimColor wrap="truncate">{resumenUsos(usosNow)}</Text> : null}
          </Box>
        </Box>
      )
    }

    // ---- Planes: los de plan_progress, con símbolo y palabra de su estado; la pregunta va debajo con ↳.
    const planesAhora = planesVisibles(planesNow, now)
    const planesPanel = (w: number) => {
      const abiertos = planesAhora.filter(p => p.estado !== 'done').length
      const filas = planesAhora.slice(0, 3).map(p => filaPlan(p, now))
      const tw = Math.min(26, Math.max(8, ...filas.map(f => f.titulo.length)))
      const ancho = Math.max(6, Math.min(20, w - tw - 40))
      const tinta = (f: { palabra: string }) => (f.palabra === 'Te espera' ? C.amber : f.palabra === 'Falló' ? C.warn : f.palabra === 'Hecho' ? C.gate : C.main)
      return (
        <Box flexDirection="column" width={w}>
          <Box justifyContent="space-between">
            <Text weight="semibold">Planes</Text>
            <Text dimColor>{abiertos === 0 ? 'ninguno abierto' : plural(abiertos, 'abierto', 'abiertos')}</Text>
          </Box>
          <Box flexDirection="column" paddingLeft={2}>
            {filas.map((f, i) => {
              const glifo = f.palabra === 'En curso' ? emojiDeEstado(now, 'running', 3 + i, cfg.animacion) : f.glifo
              const llenas = celdasUso(f.total > 0 ? (f.hechos / f.total) * 100 : 0, ancho)
              return (
                <Box key={`plan-${i}`} flexDirection="column">
                  <Text wrap="truncate">
                    {trozos(
                      caben(
                        [
                          { t: `${glifo} ${f.palabra.padEnd(10)}`, c: tinta(f) },
                          { t: `${shorten(f.titulo, Math.min(tw, w - 16)).padEnd(Math.min(tw, w - 16))} ` },
                          f.palabra !== 'Hecho' && w >= 60 && { t: '█'.repeat(llenas), c: tinta(f) },
                          f.palabra !== 'Hecho' && w >= 60 && { t: '░'.repeat(ancho - llenas), c: C.faint },
                          { t: `  ${f.hechos}/${f.total}` },
                          !!f.paso && f.palabra !== 'Hecho' && { t: `  Paso: ${f.paso}`, dim: true },
                          { t: `  ${f.tiempo}`, dim: true },
                        ],
                        w - 2,
                      ),
                    )}
                  </Text>
                  {f.nota ? <Text color={f.palabra === 'Falló' ? C.warn : C.amber} wrap="truncate">{`  ${shorten(`↳ ${f.nota}`, w - 4)}`}</Text> : null}
                </Box>
              )
            })}
            {planesAhora.length > 3 ? <Text dimColor>{`+${planesAhora.length - 3} más`}</Text> : null}
          </Box>
        </Box>
      )
    }

    // ---- Aduana: solo mientras corren las pruebas largas (o 10 min tras terminar).
    const aduanaAhora = aduanaNow && aduanaVigente(aduanaNow, now) ? filasAduana(aduanaNow) : null
    const aduanaPanel = (w: number) => {
      if (!aduanaAhora) return null
      const ancho = Math.max(6, Math.min(20, w - 50))
      const llenas = celdasUso(aduanaAhora.total > 0 ? (aduanaAhora.hechas / aduanaAhora.total) * 100 : 0, ancho)
      const estado = aduanaAhora.terminado ? '✓ Hecho    ' : `${emojiDeEstado(now, 'running', 5, cfg.animacion)} En curso   `
      return (
        <Box flexDirection="column" width={w}>
          <Text>
            <Text weight="semibold">Aduana</Text>
            <Text dimColor>  Pruebas largas</Text>
          </Text>
          <Box flexDirection="column" paddingLeft={2}>
            <Text wrap="truncate">
              <Text color={aduanaAhora.terminado ? C.gate : C.main}>{estado}</Text>
              <Text>{`${aduanaAhora.titulo} `}</Text>
              <Text color={C.main}>{'█'.repeat(llenas)}</Text>
              <Text color={C.faint}>{'░'.repeat(ancho - llenas)}</Text>
              <Text tabular>{`  ${aduanaAhora.hechas}/${aduanaAhora.total}`}</Text>
              <Text dimColor>{`  · ${aduanaAhora.costo}${aduanaAhora.invalidas > 0 ? ` · ${plural(aduanaAhora.invalidas, 'inválida', 'inválidas')}` : ''}`}</Text>
            </Text>
            {aduanaAhora.enCurso ? <Text dimColor wrap="truncate">{`  ${aduanaAhora.enCurso}`}</Text> : null}
          </Box>
        </Box>
      )
    }

    // ---- Gasto y Sesiones: plegadas en una línea; g y s las abren.
    const plegar = (k: 'gasto' | 'sesiones' | 'conversaciones') => () => update($, plegado, x => {
      const v = normalize({ gasto: true, sesiones: true, conversaciones: true }, x)
      return { ...v, [k]: !v[k] }
    })
    const gastoFilas = cfg.extras.has('gasto') ? (gastoNow?.filas ?? []) : []
    const gastoPanel = (w: number) => {
      if (gastoFilas.length === 0) return null
      const abierto = !plegadoNow.gasto
      const primera = gastoFilas[0]!
      return (
        <Box flexDirection="column" width={w}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text weight="semibold">Gasto</Text>
              <Text dimColor>
                {`  ${shorten(abierto ? 'Lo que más contexto consume' : `Lo que más gasta: ${primera.llamada}, ${primera.motivo} · ${kTokens(primera.tokens)}`, w - 16)}`}
              </Text>
            </Text>
            <Box flexShrink={0}>
              <Button key="gasto-plegar" plain hotkey="g" label={abierto ? 'plegar' : 'abrir'} dimColor onPress={plegar('gasto')} />
            </Box>
          </Box>
          {abierto ? (
            <Box flexDirection="column" paddingLeft={2}>
              {gastoFilas.map((f, i) => {
                // Ancho completo desde 80 columnas; por debajo, la llamada y los tokens.
                const ancho = w >= 80
                const llamadaW = ancho ? 32 : Math.max(8, w - 10)
                const llenas = celdasUso((f.tokens / Math.max(1, primera.tokens)) * 100, 12)
                return (
                  <Text key={`gasto-${i}`} wrap="truncate">
                    <Text>{`${shorten(f.llamada, llamadaW).padEnd(llamadaW)} `}</Text>
                    {ancho ? <Text dimColor>{`${f.motivo.padEnd(24)} `}</Text> : null}
                    {ancho ? <Text color={C.main}>{'█'.repeat(llenas)}</Text> : null}
                    {ancho ? <Text color={C.faint}>{'░'.repeat(12 - llenas)}</Text> : null}
                    <Text tabular>{`${ancho ? '  ' : ''}${kTokens(f.tokens)}`}</Text>
                  </Text>
                )
              })}
              {gastoNow?.consejo ? <Text dimColor wrap="truncate">{shorten(gastoNow.consejo, w - 2)}</Text> : null}
            </Box>
          ) : null}
        </Box>
      )
    }
    const otrasVivas = cfg.extras.has('sesiones') ? abiertas(otrasNow, now) : []
    const sesionesPanel = (w: number) => {
      if (otrasVivas.length === 0) return null
      const abierto = !plegadoNow.sesiones
      const esperan = otrasVivas.filter(o => o.estado === 'espera')
      const trabajan = otrasVivas.filter(o => o.estado === 'trabajando').length
      const nombre = (o: RegistroSesion) => o.nombre ?? o.carpeta
      return (
        <Box flexDirection="column" width={w}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text weight="semibold">Sesiones</Text>
              {abierto ? (
                <Text dimColor>{`  ${shorten('Otras sesiones de esta máquina', Math.max(4, w - 21))}`}</Text>
              ) : (
                <Text>
                  {trozos(
                    caben(
                      [
                        { t: `  ${plural(otrasVivas.length, 'más abierta', 'más abiertas')}`, dim: true },
                        !!esperan[0] && { t: ` · ◆ ${nombre(esperan[0]!)} te espera`, c: C.amber },
                        trabajan > 0 && { t: ` · ${trabajan} trabajando`, dim: true },
                      ],
                      w - 17,
                    ),
                  )}
                </Text>
              )}
            </Text>
            <Box flexShrink={0}>
              <Button key="sesiones-plegar" plain hotkey="v" label={abierto ? 'plegar' : 'abrir'} dimColor onPress={plegar('sesiones')} />
            </Box>
          </Box>
          {abierto ? (
            <Box flexDirection="column" paddingLeft={2}>
              {otrasVivas.slice(0, 6).map((o, i) => (
                <Text key={`ses-${o.id}`} wrap="truncate">
                  <Text color={o.estado === 'espera' ? C.amber : o.estado === 'trabajando' ? C.main : C.dim}>
                    {o.estado === 'espera' ? '◆ Te espera  ' : o.estado === 'trabajando' ? `${emojiDeEstado(now, 'running', i, cfg.animacion)} Trabajando ` : '○ Inactiva   '}
                  </Text>
                  <Text>{`${shorten(`${nombre(o)}${o.nombre ? ` · ${o.carpeta}` : ''}`, Math.min(34, w - 24)).padEnd(Math.min(34, w - 24))} `}</Text>
                  <Text dimColor>{fmtDuration(Math.max(0, now - o.desde))}</Text>
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      )
    }

    // Conversaciones: quién le habla a quién y quién espera respuesta (conversaciones.ts).
    const turnosFin = new Map<string, number>(otrasNow.filter(o => o.turnoFin !== undefined).map(o => [o.id, o.turnoFin!]))
    if (convNow.turnoFin !== null && idPropio) turnosFin.set(idPropio, convNow.turnoFin)
    const filasConv = cfg.extras.has('sesiones') && idPropio ? filasConversaciones(convNow.todas, idPropio, id => turnosFin.get(id), now) : []
    const conversacionesPanel = (w: number) => {
      if (filasConv.length === 0) return null
      const abierto = !plegadoNow.conversaciones
      const ESTADO: Record<string, { t: string; c?: string; dim?: boolean }> = {
        teToca: { t: '◆ Te pidió algo   ', c: C.amber },
        espera: { t: '◆ Espera respuesta', c: C.amber },
        respondio: { t: '✓ Respondió       ', c: C.gate },
        enviado: { t: '○ Enviado         ', dim: true },
      }
      return (
        <Box flexDirection="column" width={w}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text weight="semibold">Conversaciones</Text>
              <Text dimColor>{`  ${shorten(abierto ? 'Quién le habla a quién' : resumenConversaciones(filasConv), Math.max(4, w - 27))}`}</Text>
            </Text>
            <Box flexShrink={0}>
              <Button key="conversaciones-plegar" plain hotkey="c" label={abierto ? 'plegar' : 'abrir'} dimColor onPress={plegar('conversaciones')} />
            </Box>
          </Box>
          {abierto ? (
            <Box flexDirection="column" paddingLeft={2}>
              {filasConv.slice(0, 6).map((f, i) => {
                const est = ESTADO[f.teToca ? 'teToca' : f.estado]!
                const quien = shorten(`${f.de} → ${f.a}`, Math.max(4, Math.min(24, w - 2 - 19 - 9)))
                const cuando = f.estado === 'espera' ? fmtDuration(Math.max(0, now - f.desde)) : `hace ${fmtDuration(Math.max(0, now - f.desde))}`
                const resto = w - 2 - [...quien].length - 2 - 19 - [...cuando].length - 2
                return (
                  <Text key={`conv-${i}`} wrap="truncate">
                    {trozos(
                      caben(
                        [
                          { t: `${quien}  ` },
                          { t: `${est.t} `, c: est.c, dim: est.dim },
                          { t: cuando, dim: true },
                          resto > 6 && f.resumen ? { t: `  «${shorten(f.resumen, resto - 2)}»`, dim: true } : null,
                        ],
                        w - 2,
                      ),
                    )}
                  </Text>
                )
              })}
            </Box>
          ) : null}
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
            {esLista ? (
              <Text weight="semibold">Permisos</Text>
            ) : (
              <Text color={C.faint} weight="semibold" wrap="truncate">
                {cfg.gateLabel} · revisión
              </Text>
            )}
            <Box flexShrink={0}>
              <Text dimColor>{plural(s.total, 'revisión', 'revisiones')}</Text>
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
          <Box columnGap={2} flexShrink={1} overflow="hidden">
            <Text weight="semibold">Agentes</Text>
            <Text dimColor wrap="truncate">
              {isNarrow ? `${running.length}/${cards.length}` : `${plural(running.length, 'activo', 'activos')} · ${cards.length} en total`}
            </Text>
          </Box>
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
            <Text color={C.faint}>Aún sin subagentes</Text>
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
    const esperaOtra = otrasVivas.find(o => o.estado === 'espera')
    const cavMini = etiquetaCaveman(cavemanNow === 'lite' || cavemanNow === 'ultra' || cavemanNow === 'normal' ? cavemanNow : 'full')
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
              ...u.limits.slice(0, 2).map((l): Piece => ({ spans: [{ text: `· ${nombreCupo(l.kind)} `, dim: true }, { text: `${Math.round(l.pct)}%`, color: tinta(l.pct) }] })),
              cavMini ? { spans: [{ text: `· ${cavMini}`, color: C.amber }] } : null,
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
          {cacheNow && lineaNow?.prompt_cache ? (
            <Text wrap="truncate">
              <Text dimColor>Cache </Text>
              <Text color={cacheNow.caliente ? C.gate : C.amber}>{cacheNow.caliente ? `● Caliente ${cacheNow.queda ?? ''}` : '○ Fría'}</Text>
              {esperaOtra ? <Text color={C.amber}>{` · ◆ ${esperaOtra.nombre ?? esperaOtra.carpeta} te espera`}</Text> : null}
            </Text>
          ) : null}
          {planesAhora.slice(0, 2).map((p, i) => {
            const f = filaPlan(p, now)
            const glifo = f.palabra === 'En curso' ? emojiDeEstado(now, 'running', 3 + i, cfg.animacion) : f.glifo
            const color = f.palabra === 'Te espera' ? C.amber : f.palabra === 'Falló' ? C.warn : f.palabra === 'Hecho' ? C.gate : C.main
            return (
              <Box key={`mini-plan-${p.id}`} flexDirection="column">
                <Text wrap="truncate">
                  <Text color={color}>{`${glifo} ${f.palabra} `}</Text>
                  <Text>{`${f.titulo} `}</Text>
                  <Text dimColor>{`${f.hechos}/${f.total}${f.paso && f.palabra !== 'Hecho' ? `  Paso: ${f.paso}` : ''}  ${f.tiempo}`}</Text>
                </Text>
                {f.nota ? <Text color={color} wrap="truncate">{`  ↳ ${f.nota}`}</Text> : null}
              </Box>
            )
          })}
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

    // La lista (1.3.0): Sesión, Planes, Agentes, Jev, Asesor, Aduana, Gasto, Sesiones, bucles, Permisos y turno.
    const listaBody = (
      <Box flexDirection="column" width={W} gap={1}>
        {[
          draw('main', W),
          planesAhora.length > 0 ? planesPanel(W) : null,
          !isEmpty.agents && cfg.panels.includes('agents') ? (
            <Box key="agentes" flexDirection="column">
              {agentsPanel(W)}
              {expandedPanel(W)}
            </Box>
          ) : null,
          !isEmpty.jev && cfg.panels.includes('jev') ? jevPanel(W) : null,
          !isEmpty.architect && cfg.panels.includes('architect') ? architectPanel(W) : null,
          aduanaPanel(W),
          gastoPanel(W),
          sesionesPanel(W),
          conversacionesPanel(W),
          !isEmpty.loops && cfg.panels.includes('loops') ? loopsPanel(W) : null,
          !isEmpty.gate && cfg.panels.includes('gate') ? gatePanel(W) : null,
          !isEmpty.receipt && cfg.panels.includes('receipt') ? receiptPanel(W) : null,
        ].filter(Boolean)}
      </Box>
    )
    const body = esLista ? listaBody : enDiagrama ? diagramaBody : isWide ? (
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
      const servicio = cfg.extras.has('servicio') && W >= 80 ? fuentesNow.servicio : null
      const dcha = [
        W >= 48 ? `v${MOD_VERSION}` : '',
        W >= 40 && u.startedAt ? fmtDuration(now - u.startedAt) : '',
        // herdr ya muestra la rama y la hora arriba: fuera de herdr las da la cabecera.
        !herdr && branchNow && W >= 70 ? `⎇ ${branchNow}` : '',
        !herdr ? fmtClock(now).slice(0, 5) : '',
      ].filter(Boolean).join(' · ')
      // En un panel muy angosto la etiqueta del modo no cabe junto al estado: se omite.
      const cav = W >= 44 ? etiquetaCaveman(cavemanNow === 'lite' || cavemanNow === 'ultra' || cavemanNow === 'normal' ? cavemanNow : 'full') : null
      return (
        <Box flexDirection="column" width={W}>
          <Box justifyContent="space-between">
            <Text wrap="truncate">
              <Text weight="semibold">TABLERO</Text>
              <Text dimColor>{' · '}</Text>
              <Text color={m.isRunning ? C.main : C.dim}>{m.isRunning ? `${emojiDeEstado(now, 'running', 0, cfg.animacion)} Trabajando` : '○ En espera'}</Text>
              {cav ? <Text dimColor>{' · '}</Text> : null}
              {cav ? <Text color={C.amber}>{cav}</Text> : null}
              {showArchitect && advising ? <Text color={C.arch}>{' · Asesorando'}</Text> : null}
            </Text>
            <Box flexShrink={0}>
              <Text>
                {servicio ? <Text color={servicio.ok ? C.gate : C.amber}>{`${servicio.ok ? '✓' : '◆'} ${servicio.texto}   `}</Text> : null}
                <Text dimColor tabular>{dcha}</Text>
              </Text>
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
    }
    const arbol = await pintar()
    if (esPanel || !debajo) return arbol
    const { Box } = $.ui.resolve(entrada)
    return (
      <Box flexDirection="column">
        {arbol}
        {debajo}
      </Box>
    )
  }).catch(($, e, next) => {
    // Sobre el prompt, un fallo no deja una caja de error: la fila simplemente no sale.
    if (e.component === 'AbovePrompt') return null
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

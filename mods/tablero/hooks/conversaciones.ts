// Las conversaciones entre sesiones: qué envía esta sesión a otra (SendMessage o herdr) y quién espera respuesta.
// Solo cálculo; el registro en disco y el dibujo están en register.tsx.
import { redact } from './core'

/** Un envío a otra sesión reconocido en una llamada a herramienta. */
export type Envio = {
  canal: 'herdr' | 'claude'
  /** Como lo nombra la llamada: nombre de agente o id de pestaña de herdr, o nombre de sesión de SendMessage. */
  destino: string
  resumen: string
  /** Quien envía se queda esperando la respuesta mientras dura la llamada (`--wait` o `agent wait`). */
  espera: boolean
  /** `herdr agent wait`: no es un mensaje nuevo, solo espera al destino. */
  soloEspera: boolean
}

const MAX_RESUMEN = 60
const OPERADORES = new Set(['&&', '||', ';', '|'])

const resumir = (s: string): string => {
  const linea = redact(s).replace(/\s+/g, ' ').trim()
  return [...linea].length > MAX_RESUMEN ? `${[...linea].slice(0, MAX_RESUMEN - 1).join('')}…` : linea
}

/** Parte un comando de shell en órdenes y cada orden en palabras, respetando comillas simples y dobles. */
const ordenes = (comando: string): string[][] => {
  const res: string[][] = [[]]
  let palabra: string | null = null
  let comilla: '"' | "'" | null = null
  const cerrar = () => {
    if (palabra !== null) res[res.length - 1]!.push(palabra)
    palabra = null
  }
  for (let i = 0; i < comando.length; i++) {
    const c = comando[i]!
    if (comilla) {
      if (c === comilla) comilla = null
      else palabra += c
      continue
    }
    if (c === '"' || c === "'") {
      comilla = c
      palabra ??= ''
      continue
    }
    const dos = comando.slice(i, i + 2)
    if (OPERADORES.has(dos) || OPERADORES.has(c) || c === '\n') {
      cerrar()
      res.push([])
      if (OPERADORES.has(dos)) i++
      continue
    }
    if (/\s/.test(c)) {
      cerrar()
      continue
    }
    palabra = (palabra ?? '') + c
  }
  cerrar()
  return res.filter(o => o.length > 0)
}

// Los flags de herdr que pueden ir en un envío: los demás `--algo` son texto del mensaje.
const FLAGS_SIN_VALOR = new Set(['--wait', '--ansi'])
const FLAGS_CON_VALOR = new Set(['--timeout', '--until', '--lines', '--source', '--format'])

/** Las palabras que no son flags conocidos de herdr (ni sus valores). */
const sinFlags = (palabras: readonly string[]): string[] => {
  const res: string[] = []
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i]!
    if (FLAGS_SIN_VALOR.has(p)) continue
    if (FLAGS_CON_VALOR.has(p)) {
      i++
      continue
    }
    res.push(p)
  }
  return res
}

const envioHerdr = (orden: readonly string[]): Envio | null => {
  const [bin, grupo, accion, ...resto] = orden
  if (!bin || !(bin === 'herdr' || bin.endsWith('/herdr'))) return null
  const args = sinFlags(resto)
  const destino = args[0]
  if (!destino) return null
  const conWait = resto.includes('--wait')
  if (grupo === 'agent' && accion === 'prompt' && args.length >= 2) {
    return { canal: 'herdr', destino, resumen: resumir(args.slice(1).join(' ')), espera: conWait, soloEspera: false }
  }
  if (grupo === 'agent' && accion === 'send-keys' && args.length >= 2) {
    // Lo tecleado puede ser una contraseña: no se guarda.
    return { canal: 'herdr', destino, resumen: '', espera: false, soloEspera: false }
  }
  if (grupo === 'agent' && accion === 'wait') {
    return { canal: 'herdr', destino, resumen: '', espera: true, soloEspera: true }
  }
  if (grupo === 'pane' && accion === 'run' && args.length >= 2) {
    return { canal: 'herdr', destino, resumen: resumir(args.slice(1).join(' ')), espera: false, soloEspera: false }
  }
  return null
}

/** El envío que hace una llamada a herramienta, o null si no le habla a otra sesión. */
export const envioDe = (tool: string, input: unknown): Envio | null => {
  const i = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (tool === 'SendMessage') {
    if (typeof i.to !== 'string' || !i.to) return null
    const texto = typeof i.message === 'string' ? i.message : typeof i.summary === 'string' ? i.summary : ''
    return { canal: 'claude', destino: i.to, resumen: resumir(texto), espera: false, soloEspera: false }
  }
  if (tool !== 'Bash' || typeof i.command !== 'string') return null
  for (const orden of ordenes(i.command)) {
    const envio = envioHerdr(orden)
    if (envio) return envio
  }
  return null
}

/** Un mensaje anotado en ~/.claude/tablero/conversaciones/<de>.json. */
export type Mensaje = {
  /** El id de la llamada a herramienta que lo envió. */
  id: string
  /** Id de la sesión que envía y su nombre visible. */
  de: string
  deNombre: string
  /** Id de la sesión destino, o null si no se pudo saber. */
  a: string | null
  aNombre: string
  canal: 'herdr' | 'claude'
  resumen: string
  /** Cuándo se envió (ms epoch). */
  enviado: number
  /** Cuándo terminó la llamada que esperaba la respuesta (`--wait` o `agent wait`); null si sigue o no esperó. */
  esperaFin: number | null
  /** La llamada esperaba la respuesta. */
  espera: boolean
}

export type EstadoMensaje = 'espera' | 'respondio' | 'enviado'

/** Cuándo empezó y terminó el último turno de una sesión (registro de Sesiones). */
export type Turno = { inicio?: number; fin?: number }

/** Una fila de la sección: nombres ya listos para leer («esta» es la sesión propia). */
export type FilaConversacion = {
  de: string
  a: string
  estado: EstadoMensaje
  /** Alguien espera la respuesta de esta sesión. */
  teToca: boolean
  desde: number
  resumen: string
}

const MAX_EDAD_MS = 24 * 3_600_000
const VENTANA_MS = 30 * 60_000
const MAX_MENSAJES = 20

const esMensaje = (v: unknown): v is Mensaje => {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  const texto = (k: string) => typeof r[k] === 'string'
  const num = (k: string) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)
  return (
    texto('id') && texto('de') && texto('deNombre') && (r.a === null || texto('a')) && texto('aNombre') &&
    (r.canal === 'herdr' || r.canal === 'claude') && texto('resumen') && num('enviado') &&
    (r.esperaFin === null || num('esperaFin')) && typeof r.espera === 'boolean'
  )
}

/** Los mensajes de todos los archivos: sin los rotos ni los de más de 24 h. */
export const leerConversaciones = (textos: readonly { nombre: string; texto: string }[], ahoraMs: number): Mensaje[] =>
  textos.flatMap(({ texto }) => {
    try {
      const v = JSON.parse(texto) as unknown
      return Array.isArray(v) ? v.filter(esMensaje).filter(m => ahoraMs - m.enviado <= MAX_EDAD_MS) : []
    } catch {
      return []
    }
  })

/** Añade o reemplaza un mensaje (por id) y deja los 20 más nuevos de menos de 24 h. */
export const anotar = (lista: readonly Mensaje[], m: Mensaje, ahoraMs: number): Mensaje[] =>
  [...lista.filter(x => x.id !== m.id), m]
    .filter(x => ahoraMs - x.enviado <= MAX_EDAD_MS)
    .sort((x, y) => x.enviado - y.enviado)
    .slice(-MAX_MENSAJES)

/** El destino respondió si terminó un turno que empezó después del envío. Un turno que ya corría al enviar no
 *  cuenta. Un registro viejo sin inicio de turno se juzga solo por el fin. */
const respondio = (t: Turno | undefined, enviado: number): boolean => {
  if (t?.fin === undefined || t.fin <= enviado) return false
  return t.inicio === undefined || (t.inicio > enviado && t.fin >= t.inicio)
}

/** Se espera respuesta mientras el destino no responda (ver `respondio`) ni acabe bien la llamada que esperaba,
 *  y como mucho 30 min. Sin destino conocido no se dice nada de la respuesta. */
export const estadoMensaje = (m: Mensaje, turnoDe: (id: string) => Turno | undefined, ahoraMs: number): EstadoMensaje => {
  if (m.a === null) return 'enviado'
  if (m.esperaFin !== null) return 'respondio'
  if (respondio(turnoDe(m.a), m.enviado)) return 'respondio'
  if (ahoraMs - m.enviado > VENTANA_MS) return 'enviado'
  return 'espera'
}

/** Las filas de la sección: lo que espera a esta sesión, luego lo que envió ella y luego lo demás; lo nuevo primero. */
export const filasConversaciones = (
  todos: readonly Mensaje[],
  propia: string,
  turnoDe: (id: string) => Turno | undefined,
  ahoraMs: number,
  /** El nombre actual de una sesión (registro de Sesiones), que gana al que tenía al enviar. */
  nombreDe: (id: string) => string | undefined = () => undefined,
): FilaConversacion[] =>
  todos
    .map(m => ({ m, estado: estadoMensaje(m, turnoDe, ahoraMs) }))
    .filter(({ m, estado }) => estado === 'espera' || ahoraMs - m.enviado <= VENTANA_MS)
    .map(({ m, estado }) => {
      const teToca = m.a === propia && estado === 'espera'
      const orden = teToca ? 0 : m.de === propia ? 1 : 2
      const fila: FilaConversacion = {
        de: m.de === propia ? 'esta' : (nombreDe(m.de) ?? m.deNombre),
        a: m.a === propia ? 'esta' : ((m.a !== null ? nombreDe(m.a) : undefined) ?? m.aNombre),
        estado,
        teToca,
        desde: m.enviado,
        resumen: m.resumen,
      }
      return { fila, orden }
    })
    .sort((x, y) => x.orden - y.orden || y.fila.desde - x.fila.desde)
    .map(x => x.fila)

/** La línea plegada: «1 espera respuesta · 1 te pidió algo», o «2 mensajes recientes, sin esperas». */
export const resumenConversaciones = (filas: readonly FilaConversacion[]): string => {
  const esperan = filas.filter(f => f.estado === 'espera' && !f.teToca).length
  const piden = filas.filter(f => f.teToca).length
  const partes = [
    esperan > 0 ? `${esperan} ${esperan === 1 ? 'espera' : 'esperan'} respuesta` : '',
    piden > 0 ? `${piden} te ${piden === 1 ? 'pidió' : 'pidieron'} algo` : '',
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : `${filas.length} ${filas.length === 1 ? 'mensaje reciente' : 'mensajes recientes'}, sin esperas`
}

/** La sesión de Claude y el nombre de pestaña que da `herdr agent get <destino>`; null si no es JSON o no los trae. */
export const destinoHerdr = (stdout: string): { id: string; nombre: string } | null => {
  try {
    const agente = (JSON.parse(stdout) as { result?: { agent?: { agent_session?: { value?: unknown }; terminal_title_stripped?: unknown } } })?.result?.agent
    const id = agente?.agent_session?.value
    if (typeof id !== 'string' || !id) return null
    const nombre = typeof agente?.terminal_title_stripped === 'string' && agente.terminal_title_stripped.trim() ? agente.terminal_title_stripped.trim() : id
    return { id, nombre }
  } catch {
    return null
  }
}

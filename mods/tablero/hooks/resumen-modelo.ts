// La franja al pie del panel de Tablero: las tres líneas que muestra el footer (resumen del mod, datos
// de la sesión y modo de permisos), como texto plano, sin motor ni dibujo.
import { footerTexto } from './banda-modelo'
import { cellWidth, fmtUsd, limitLabel } from './core'

export type ResumenEntrada = {
  modelo: string
  carpeta: string
  esfuerzo: string
  contextoPct: number | null
  costoUsd: number | null
  lineas: { agregadas: number; quitadas: number }
  /** Cuándo empezó la sesión, en ms; null si se desconoce. */
  inicioSesion: number | null
  ahora: number
  limites: { kind: string; pct: number; resetsAt: number | null }[]
  /** Modo de permisos tal como lo reporta Claude Code (`bypassPermissions`, `acceptEdits`, `plan`…). */
  modo: string
  agentesActivos: number
  agentesTotal: number
  permisosPendientes: number
  /** La rama de git (o el commit suelto); sin ella, no se muestra. */
  rama?: string | null
  /** Lo que costó el último turno terminado. */
  costoUltimoTurno?: number | null
  /** Cuánto lleva el turno en curso, en ms; null si no hay uno corriendo. */
  turnoMs?: number | null
}

/** Desde este porcentaje de contexto o de uso, la franja avisa. */
const UMBRAL_AVISO = 80
/** Con menos sesión que esta, el gasto por hora es puro ruido. */
const MIN_RITMO_MS = 5 * 60_000

const SEP = ' · '
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const dos = (n: number) => String(n).padStart(2, '0')
const hayNumero = (n: number | null): n is number => n !== null && Number.isFinite(n)

/** Tiempo que falta para un reseteo, sin espacios: `25m`, `4h38m`, `6d14h`; vacío si se desconoce o ya pasó. */
export const restoCompacto = (resetsAt: number | null, ahora: number): string => {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= ahora) return ''
  const m = Math.max(1, Math.floor((resetsAt - ahora) / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d${h}h`
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`
}

/** El modo de permisos como lo escribe el footer nativo; el modo normal no ocupa línea. */
export const modoLabel = (modo: string): string => {
  switch (modo) {
    case 'bypassPermissions':
      return '⏵⏵ bypass permissions on'
    case 'acceptEdits':
      return '⏵⏵ accept edits on'
    case 'auto':
      return '⏵⏵ auto mode on'
    case 'plan':
      return '⏸ plan mode on'
    default:
      return ''
  }
}

const lineasDe = (texto: unknown): number => {
  if (typeof texto !== 'string' || texto === '') return 0
  return texto.replace(/\n$/, '').split('\n').length
}

/**
 * Las líneas que una edición agrega y quita, contadas sobre el texto que recibe la herramienta: una
 * aproximación (no resta las líneas que quedan iguales ni cuenta lo que un Write pisa).
 */
export const lineasDeEdicion = (tool: string, input: unknown): { agregadas: number; quitadas: number } => {
  const i = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  if (tool === 'Edit') return { agregadas: lineasDe(i.new_string), quitadas: lineasDe(i.old_string) }
  if (tool === 'Write') return { agregadas: lineasDe(i.content), quitadas: 0 }
  if (tool === 'NotebookEdit') return { agregadas: lineasDe(i.new_source), quitadas: 0 }
  return { agregadas: 0, quitadas: 0 }
}

const nombreLimite = (kind: string) => (kind === 'five_hour' ? 'sesión' : kind === 'seven_day' ? 'semana' : limitLabel(kind))

const duracion = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60_000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h${dos(m % 60)}m` : `${m}m`
}

// Una superficie gráfica colapsa los espacios de los bordes de una línea: la continuación se marca con
// una flecha, no con espacios.
const SANGRIA = '↳ '

/**
 * Parte una línea en varias de a lo más `ancho` celdas, siempre en un separador `·`: una pieza no se
 * corta nunca (si una sola no cabe, queda en su línea). Las líneas siguientes empiezan con `↳`.
 */
export const partirLinea = (texto: string, ancho: number): string[] => {
  if (texto === '') return []
  const filas: string[] = []
  let actual = ''
  for (const pieza of texto.split(SEP)) {
    const prefijo = filas.length > 0 ? SANGRIA : ''
    const candidata = actual === '' ? `${prefijo}${pieza}` : `${actual}${SEP}${pieza}`
    if (actual === '' || cellWidth(candidata) <= ancho) {
      actual = candidata
      continue
    }
    filas.push(actual)
    actual = `${SANGRIA}${pieza}`
  }
  filas.push(actual)
  return filas
}

/** Un turno en curso cuenta segundos: `45s`, `1m20s`, `1h02m`. */
const duracionTurno = (ms: number) => {
  const s = Math.floor(Math.max(0, ms) / 1000)
  if (s >= 3600) return duracion(ms)
  return s >= 60 ? `${Math.floor(s / 60)}m${dos(s % 60)}s` : `${s}s`
}

export const resumenLineas = (e: ResumenEntrada, ancho = Infinity): string[] => {
  const resumen = footerTexto({
    costoUsd: e.costoUsd,
    contextoPct: e.contextoPct,
    agentesActivos: e.agentesActivos,
    agentesTotal: e.agentesTotal,
    permisosPendientes: e.permisosPendientes,
    limites: e.limites,
    ahora: e.ahora,
  })

  const datos: string[] = []
  if (e.modelo) datos.push(e.modelo)
  if (e.carpeta) datos.push(`📁 ${e.carpeta}`)
  if (e.rama) datos.push(`⎇ ${e.rama}`)
  if (e.esfuerzo) datos.push(`eff ${e.esfuerzo}`)
  if (hayNumero(e.contextoPct)) {
    datos.push(`ctx ${Math.round(e.contextoPct)}%`)
    if (e.contextoPct >= UMBRAL_AVISO) datos.push('⚠ compactar pronto')
  }
  if (hayNumero(e.costoUsd)) datos.push(fmtUsd(e.costoUsd))
  if (hayNumero(e.costoUltimoTurno ?? null)) datos.push(`último turno ${fmtUsd(e.costoUltimoTurno as number)}`)
  if (hayNumero(e.costoUsd) && e.costoUsd > 0 && hayNumero(e.inicioSesion) && e.ahora - e.inicioSesion >= MIN_RITMO_MS) {
    datos.push(`${fmtUsd(e.costoUsd / ((e.ahora - e.inicioSesion) / 3_600_000))}/h`)
  }
  if (e.lineas.agregadas > 0 || e.lineas.quitadas > 0) datos.push(`+${e.lineas.agregadas} −${e.lineas.quitadas}`)
  if (hayNumero(e.inicioSesion)) datos.push(`⏱ ${duracion(e.ahora - e.inicioSesion)}`)
  if (hayNumero(e.turnoMs ?? null)) datos.push(`⏱ turno ${duracionTurno(e.turnoMs as number)}`)
  for (const l of e.limites) {
    const resta = restoCompacto(l.resetsAt, e.ahora)
    let texto = `${l.pct >= UMBRAL_AVISO ? '⚠ ' : ''}${nombreLimite(l.kind)} ${Math.round(l.pct)}%`
    if (resta) texto += ` ↻ ${resta}`
    // La ventana semanal dice además qué día y a qué hora se reinicia.
    if (resta && l.kind === 'seven_day' && l.resetsAt !== null) {
      const f = new Date(l.resetsAt)
      texto += ` (${DIAS[f.getDay()]} ${dos(f.getHours())}:${dos(f.getMinutes())})`
    }
    datos.push(texto)
  }

  return [resumen ? `tablero: ${resumen}` : '', datos.join(SEP), modoLabel(e.modo)].flatMap(l => partirLinea(l, ancho))
}

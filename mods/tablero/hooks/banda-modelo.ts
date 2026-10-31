// Las filas de la banda de Tablero como texto con tono, sin motor ni dibujo: lo que se muestra y cómo
// se recorta a las columnas. El color lo pone banda.tsx.
import { cellWidth, fmtUsd, gauge, limitLabel } from './core'

export type Tono = 'normal' | 'tenue' | 'aviso' | 'peligro' | 'acento'
export type Tramo = { texto: string; tono: Tono }
export type FilaBanda = { tramos: Tramo[] }

export type BandaEntrada = {
  cwd: string
  modelo: string
  costoUsd: number | null
  contextoPct: number | null
  agentesActivos: number
  agentesTotal: number
  permisosPendientes: number
  permisosDenegados: number
  limites: { kind: string; pct: number; resetsAt: number | null }[]
  ahora: number
  columnas: number
  /** Fase del indicador de actividad; sin ella, siempre encendido. */
  pulso?: 'encendido' | 'apagado'
}

const ANCHO_BARRA = 10
const SEP = '  ·  '

/** Tiempo que falta para un reseteo: `25 min`, `3 h 10 min`, `4 d 2 h`; vacío si se desconoce o ya pasó. */
export const tiempoRestante = (resetsAt: number | null, ahora: number): string => {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= ahora) return ''
  const m = Math.max(1, Math.floor((resetsAt - ahora) / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d} d ${h} h`
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`
}

/** El final de una ruta en a lo más `anchoMax` celdas; si se recorta, empieza con `…`. */
export const carpetaCorta = (cwd: string, anchoMax: number): string => {
  const letras = [...cwd]
  if (anchoMax <= 0) return ''
  if (letras.length <= anchoMax) return cwd
  return `…${letras.slice(letras.length - (anchoMax - 1)).join('')}`
}

const t = (texto: string, tono: Tono = 'normal'): Tramo => ({ texto, tono })

const nombreLimite = (kind: string) => (kind === 'spend_limit' ? 'gasto' : limitLabel(kind))
const tonoUso = (pct: number): Tono => (pct > 100 ? 'peligro' : pct >= 80 ? 'aviso' : 'normal')
const barra = (pct: number, tono: Tono): Tramo[] => {
  const g = gauge(Number.isFinite(pct) ? pct : 0, ANCHO_BARRA)
  return [t(g.on, tono === 'normal' ? 'acento' : tono), t(g.off, 'tenue')]
}

/** Recorta una fila a `max` celdas: lo que sobra se corta del último tramo que cabe, con `…`. */
const ajustar = (tramos: Tramo[], max: number): Tramo[] => {
  const fuera: Tramo[] = []
  let usado = 0
  for (const tr of tramos) {
    const ancho = cellWidth(tr.texto)
    if (usado + ancho <= max) {
      fuera.push(tr)
      usado += ancho
      continue
    }
    const sobra = max - usado
    if (sobra > 0) fuera.push({ ...tr, texto: `${[...tr.texto].slice(0, sobra - 1).join('')}…` })
    break
  }
  return fuera
}

export const bandaFilas = (e: BandaEntrada): FilaBanda[] => {
  const max = Math.max(20, e.columnas)

  const modelo = [t(SEP, 'tenue'), t('Modelo ', 'tenue'), t(e.modelo || '—')]
  const fijo = cellWidth('Carpeta ') + modelo.reduce((n, x) => n + cellWidth(x.texto), 0)
  const fila1 = [t('Carpeta ', 'tenue'), t(carpetaCorta(e.cwd, Math.max(4, max - fijo)), 'acento'), ...modelo]

  const fila2: Tramo[] = []
  if (e.costoUsd !== null && Number.isFinite(e.costoUsd)) fila2.push(t('Costo ', 'tenue'), t(fmtUsd(e.costoUsd)), t(SEP, 'tenue'))
  fila2.push(t('Contexto ', 'tenue'))
  if (e.contextoPct === null || !Number.isFinite(e.contextoPct)) fila2.push(t('—'))
  else {
    const tono = tonoUso(e.contextoPct)
    fila2.push(t(`${Math.round(e.contextoPct)}%`, tono), t(' '), ...barra(e.contextoPct, tono))
  }

  const fila3: Tramo[] = []
  if (e.agentesActivos > 0 || e.permisosPendientes > 0) {
    const encendido = (e.pulso ?? 'encendido') === 'encendido'
    fila3.push(t('● ', encendido ? (e.permisosPendientes > 0 ? 'aviso' : 'acento') : 'tenue'))
  }
  fila3.push(t('Subagentes ', 'tenue'))
  fila3.push(e.agentesTotal > 0 ? t(`${e.agentesActivos}/${e.agentesTotal}`, e.agentesActivos > 0 ? 'acento' : 'normal') : t('ninguno'))
  fila3.push(t(SEP, 'tenue'), t('Permisos ', 'tenue'))
  fila3.push(
    e.permisosPendientes > 0
      ? t(`${e.permisosPendientes} ${e.permisosPendientes === 1 ? 'pendiente' : 'pendientes'}`, 'aviso')
      : t('sin pendientes'),
  )
  if (e.permisosDenegados > 0) fila3.push(t(SEP, 'tenue'), t('Denegados ', 'tenue'), t(String(e.permisosDenegados), 'peligro'))

  const fila4: Tramo[] = [t('Uso ', 'tenue')]
  if (e.limites.length === 0) fila4.push(t('no disponible en esta cuenta', 'tenue'))
  e.limites.forEach((l, i) => {
    if (i > 0) fila4.push(t(SEP, 'tenue'))
    const tono = tonoUso(l.pct)
    fila4.push(t(`${nombreLimite(l.kind)} `, 'tenue'), ...barra(l.pct, tono), t(' '), t(`${l.pct}%`, tono))
    const resta = tiempoRestante(l.resetsAt, e.ahora)
    if (resta) fila4.push(t(` (se reinicia en ${resta})`, 'tenue'))
  })

  return [fila1, fila2, fila3, fila4].map(tramos => ({ tramos: ajustar(tramos, max) }))
}

/** La línea del footer nativo: lo esencial en una sola línea; sin ningún dato, no hay línea. */
export const footerTexto = (
  e: Pick<BandaEntrada, 'costoUsd' | 'contextoPct' | 'agentesActivos' | 'agentesTotal' | 'permisosPendientes' | 'limites' | 'ahora'>,
): string | undefined => {
  const uso = e.limites[0]
  const resta = uso ? tiempoRestante(uso.resetsAt, e.ahora) : ''
  const partes = [
    e.costoUsd !== null && Number.isFinite(e.costoUsd) ? fmtUsd(e.costoUsd) : null,
    e.contextoPct !== null && Number.isFinite(e.contextoPct) ? `ctx ${Math.round(e.contextoPct)}%` : null,
    e.agentesActivos > 0 ? `agentes ${e.agentesActivos}` : null,
    e.permisosPendientes > 0 ? `permisos ${e.permisosPendientes}` : null,
    uso ? `uso ${uso.pct}%${resta ? ` (${resta})` : ''}` : null,
  ].filter((p): p is string => p !== null)
  return partes.length > 0 ? partes.join(' · ') : undefined
}

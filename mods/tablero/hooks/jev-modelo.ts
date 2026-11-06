// Las decisiones de Jev que dejan los hooks en decisiones.jsonl, como datos para pintar el tablero:
// lectura por sesión, resumen, línea de log y marca de tarjeta. Sin red ni disco: recibe el texto.

export type TipoDecision = 'modelo' | 'esfuerzo' | 'reintento'

export type DecisionJev = {
  hora: number
  sessionId: string
  tipo: TipoDecision
  opcion: string | null
  confianza: number | null
  sharp: boolean
  claude: string | null
  aplicada: boolean
  descripcion: string
}

export type FilaJev = { tipo: string; etiqueta: string; confianza: number | null; sharp: boolean | null }

const TIPOS: TipoDecision[] = ['modelo', 'esfuerzo', 'reintento']
const ETIQUETAS: Record<TipoDecision, string> = {
  modelo: 'qué modelo',
  esfuerzo: 'qué esfuerzo',
  reintento: 'reintentar o parar',
}
/** Cuántas respuestas recientes de un mismo tipo entran en la media de confianza. */
const MEDIA_MAX = 20
/** Orden para decidir si Jev subió o bajó lo que eligió Claude. */
const RANGO = new Map<string, number>([
  ['haiku', 0],
  ['sonnet', 1],
  ['opus', 2],
  ['low', 0],
  ['medium', 1],
  ['high', 2],
])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTipo = (v: unknown): v is TipoDecision => TIPOS.some(t => t === v)

/** La hora de la línea: número en ms o cadena ISO del hook; null si no se entiende. */
const horaDe = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const ms = Date.parse(v)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/** Una línea del archivo como decisión; null si no es JSON válido, no es de la sesión o le falta lo esencial. */
const aDecision = (linea: string, sessionId: string): DecisionJev | null => {
  let o: unknown
  try {
    o = JSON.parse(linea)
  } catch {
    return null
  }
  if (!isObject(o) || o.session_id !== sessionId) return null
  const hora = horaDe(o.hora)
  if (hora === null || !esTipo(o.tipo)) return null
  return {
    hora,
    sessionId,
    tipo: o.tipo,
    opcion: typeof o.opcion === 'string' ? o.opcion : null,
    confianza: typeof o.confianza === 'number' && Number.isFinite(o.confianza) ? o.confianza : null,
    sharp: o.sharp === true,
    claude: typeof o.claude === 'string' ? o.claude : null,
    aplicada: o.aplicada === true,
    descripcion: typeof o.descripcion === 'string' ? o.descripcion : '',
  }
}

/** Las decisiones de una sesión, en el orden del archivo; las líneas rotas o ajenas se ignoran. */
export const leerDecisiones = (texto: string, sessionId: string): DecisionJev[] => {
  const ds: DecisionJev[] = []
  for (const linea of texto.split('\n')) {
    const d = aDecision(linea, sessionId)
    if (d) ds.push(d)
  }
  return ds
}

/**
 * Las tres filas del tablero (una por tipo, siempre en el mismo orden) y el total de decisiones. La confianza
 * es la media de las últimas 20 con respuesta de ese tipo; el `sharp` es el de la última decisión del tipo.
 */
export const resumenJev = (ds: DecisionJev[]): { total: number; filas: FilaJev[] } => {
  const filas = TIPOS.map((tipo): FilaJev => {
    const del = ds.filter(d => d.tipo === tipo)
    const confianzas = del
      .filter((d): d is DecisionJev & { confianza: number } => d.opcion !== null && d.confianza !== null)
      .slice(-MEDIA_MAX)
      .map(d => d.confianza)
    const media = confianzas.length > 0 ? confianzas.reduce((a, b) => a + b, 0) / confianzas.length : null
    const ultima = del.at(-1)
    return { tipo, etiqueta: ETIQUETAS[tipo], confianza: media, sharp: ultima ? ultima.sharp : null }
  })
  return { total: ds.length, filas }
}

/** La línea de log de una decisión: `qué modelo → sonnet   p=0.91 sharp → código`, `… split → claude` o `sin respuesta`. */
export const lineaLog = (d: DecisionJev): string => {
  const etiqueta = ETIQUETAS[d.tipo]
  if (d.opcion === null) return `${etiqueta} → sin respuesta`
  const confianza = d.confianza === null ? '' : `   p=${d.confianza.toFixed(2)}`
  return `${etiqueta} → ${d.opcion}${confianza} ${d.sharp ? 'sharp → código' : 'split → claude'}`
}

/** `jev ↑ sonnet` o `jev ↓ haiku` si Jev cambió lo que eligió Claude; null si no se aplicó o no se puede comparar. */
export const marcaTarjeta = (d: DecisionJev | undefined): string | null => {
  if (!d || !d.aplicada || d.opcion === null || d.claude === null) return null
  const claude = RANGO.get(d.claude)
  const jev = RANGO.get(d.opcion)
  if (claude === undefined || jev === undefined || claude === jev) return null
  return `jev ${jev > claude ? '↑' : '↓'} ${d.opcion}`
}

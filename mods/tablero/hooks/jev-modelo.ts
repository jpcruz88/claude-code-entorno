// Las decisiones de Jev que dejan los hooks en decisiones.jsonl, como datos para pintar el tablero:
// lectura por sesión, resumen, línea de log y marca de tarjeta. Sin red ni disco: recibe el texto.

export type TipoDecision = 'modelo' | 'esfuerzo' | 'reintento' | 'tope'
/** Los tipos con fila de confianza: el tope no decide nada, solo limita lo que ya se decidió. */
type TipoFila = Exclude<TipoDecision, 'tope'>

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
  /** Solo en los topes: `tope semana +12 pts → sonnet`. Vacío en el resto. */
  motivo: string
}

export type FilaJev = { tipo: string; etiqueta: string; confianza: number | null; sharp: boolean | null }

const TIPOS: TipoFila[] = ['modelo', 'esfuerzo', 'reintento']
const TIPOS_VALIDOS: TipoDecision[] = [...TIPOS, 'tope']
const ETIQUETAS: Record<TipoFila, string> = {
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
  ['xhigh', 3],
])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esTipo = (v: unknown): v is TipoDecision => TIPOS_VALIDOS.some(t => t === v)

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
    motivo: typeof o.motivo === 'string' ? o.motivo : '',
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
  const propias = ds.filter(d => d.tipo !== 'tope')
  const filas = TIPOS.map((tipo): FilaJev => {
    const del = propias.filter(d => d.tipo === tipo)
    const confianzas = del
      .filter((d): d is DecisionJev & { confianza: number } => d.opcion !== null && d.confianza !== null)
      .slice(-MEDIA_MAX)
      .map(d => d.confianza)
    const media = confianzas.length > 0 ? confianzas.reduce((a, b) => a + b, 0) / confianzas.length : null
    const ultima = del.at(-1)
    return { tipo, etiqueta: ETIQUETAS[tipo], confianza: media, sharp: ultima ? ultima.sharp : null }
  })
  return { total: propias.length, filas }
}

/**
 * El tope como línea de log: `tope → sonnet · semana +12 pts`, `tope → haiku · 5h 90%` o, si solo bajó el esfuerzo,
 * `tope → opus · semana +6 pts · esfuerzo medium`. Sale del motivo que guarda el guardián (`tope <causa> → <límite>`).
 */
const lineaTope = (d: DecisionJev): string => {
  const partes: string[] = []
  // El motivo trae partes separadas por «; »: `tope semana +12 pts → sonnet; esfuerzo high → medium`.
  for (const parte of d.motivo.replace(/^tope[;\s]*/, '').split('; ')) {
    const [causa = '', ...cambios] = parte.split(' → ').map(x => x.trim())
    const final = cambios.at(-1)
    if (causa.startsWith('esfuerzo')) partes.push(final ? `esfuerzo ${final.replace(/^esfuerzo\s+/, '')}` : causa)
    else {
      if (causa) partes.push(causa)
      if (final?.startsWith('esfuerzo')) partes.push(final)
    }
  }
  return [`tope → ${d.opcion ?? 'sin modelo'}`, ...partes].join(' · ')
}

/** La línea de log de una decisión: `qué modelo → sonnet   p=0.91 sharp → código`, `… split → claude` o `sin respuesta`. */
export const lineaLog = (d: DecisionJev): string => {
  if (d.tipo === 'tope') return lineaTope(d)
  const etiqueta = ETIQUETAS[d.tipo]
  if (d.opcion === null) return `${etiqueta} → sin respuesta`
  const confianza = d.confianza === null ? '' : `   p=${d.confianza.toFixed(2)}`
  return `${etiqueta} → ${d.opcion}${confianza} ${d.sharp ? 'sharp → código' : 'split → claude'}`
}

const FAMILIAS_MODELO = ['haiku', 'sonnet', 'opus']

/** Igual que `familia_de_modelo` del guardián: `claude-sonnet-5-5` y `sonnet` son la misma familia. */
const familiaDe = (modelo: string): string => {
  const m = modelo.toLowerCase()
  for (const familia of FAMILIAS_MODELO) {
    if (m === familia || m.startsWith(`claude-${familia}`)) return familia
  }
  return m
}

/** `jev ↑ sonnet` o `jev ↓ haiku` si Jev cambió lo que eligió Claude; null si no se aplicó o no se puede comparar. */
export const marcaTarjeta = (d: DecisionJev | undefined): string | null => {
  if (!d || !d.aplicada || d.opcion === null || d.claude === null) return null
  const claude = RANGO.get(familiaDe(d.claude))
  const jev = RANGO.get(familiaDe(d.opcion))
  if (claude === undefined || jev === undefined || claude === jev) return null
  return `jev ${jev > claude ? '↑' : '↓'} ${d.opcion}`
}

// ---------------------------------------------------------------- ritmo semanal (réplica de jev_limites.py)

export type VentanaLimite = { usado: number; reinicio: number }
/** Lo que escribe la statusline en limites.json: `actualizado` y los reinicios, en segundos epoch. */
export type LimitesJev = { actualizado: number; five_hour?: VentanaLimite; seven_day?: VentanaLimite }
export type RitmoSemana = { usado: number; ritmo: number; exceso: number }
export type CfgRitmo = { metaCorte: number; corteDia: number; corteHora: number; maxAntiguedadH: number }
export const CFG_RITMO: CfgRitmo = { metaCorte: 90, corteDia: 3, corteHora: 23, maxAntiguedadH: 6 }
/** Desfase de la zona local respecto a UTC, en minutos, en el instante dado (epoch en segundos). */
export type Zona = (epochSeg: number) => number
/** La zona del sistema, con su horario de verano. */
export const zonaDelSistema: Zona = epochSeg => -new Date(epochSeg * 1000).getTimezoneOffset()

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ventanaDe = (v: unknown): VentanaLimite | undefined =>
  isObject(v) && esNumero(v.usado) && esNumero(v.reinicio) ? { usado: v.usado, reinicio: v.reinicio } : undefined

/** limites.json como datos; null si el texto está roto (por ejemplo a medio escribir) o no trae `actualizado`. */
export const leerLimites = (texto: string): LimitesJev | null => {
  let o: unknown
  try {
    o = JSON.parse(texto)
  } catch {
    return null
  }
  if (!isObject(o) || !esNumero(o.actualizado)) return null
  const five_hour = ventanaDe(o.five_hour)
  const seven_day = ventanaDe(o.seven_day)
  return { actualizado: o.actualizado, ...(five_hour ? { five_hour } : {}), ...(seven_day ? { seven_day } : {}) }
}

const DIA_S = 86400

/** Epoch del corte: el día `corteDia` (lunes = 0) a `corteHora` locales más reciente que no pase de `reinicio`. */
const corteDe = (reinicio: number, cfg: CfgRitmo, zona: Zona): number => {
  // Se trabaja con la hora "de pared" como si fuera UTC (epoch + desfase) y se vuelve al epoch real al final.
  const pared = reinicio + zona(reinicio) * 60
  const dias = Math.floor(pared / DIA_S)
  const semanaDia = (((dias + 3) % 7) + 7) % 7 // 1-ene-1970 fue jueves: lunes = 0
  const atras = (((semanaDia - cfg.corteDia) % 7) + 7) % 7
  const aEpoch = (dia: number) => {
    const paredCorte = dia * DIA_S + cfg.corteHora * 3600
    // El desfase se evalúa en el instante resultante (dos pasadas) para respetar el cambio de hora.
    const aprox = paredCorte - zona(paredCorte) * 60
    return paredCorte - zona(aprox) * 60
  }
  const corte = aEpoch(dias - atras)
  return corte > reinicio ? aEpoch(dias - atras - 7) : corte
}

/**
 * El ritmo de la semana: uso, ritmo ideal (0 a `metaCorte`, lineal hasta el corte del jueves) y exceso en puntos.
 * `ahora` y los datos van en segundos epoch. Null sin dato, con dato de más de `maxAntiguedadH` horas o con el
 * reinicio ya vencido; igual que `_tope_semana` de jev_limites.py.
 */
export const ritmoSemana = (limites: LimitesJev | null, ahora: number, cfg: Partial<CfgRitmo> = {}, zona: Zona = zonaDelSistema): RitmoSemana | null => {
  const c = { ...CFG_RITMO, ...cfg }
  const semana = limites?.seven_day
  if (!limites || !semana || ahora - limites.actualizado > c.maxAntiguedadH * 3600 || semana.reinicio <= ahora) return null
  const inicio = semana.reinicio - 7 * DIA_S
  const corte = corteDe(semana.reinicio, c, zona)
  const bruto = corte > inicio ? (c.metaCorte * (ahora - inicio)) / (corte - inicio) : c.metaCorte
  const ritmo = Math.max(0, Math.min(c.metaCorte, bruto))
  return { usado: semana.usado, ritmo, exceso: semana.usado - ritmo }
}

export type NivelRitmo = 'verde' | 'ambar' | 'rojo'
/** Con este margen bajo el ritmo, el tope deja pasar xhigh. */
const MARGEN_XHIGH = -10

/** La fila de la caja JEV: `semana 52% · ritmo 40% · +12`, con su nivel de color; null si no hay ritmo. */
export const filaRitmo = (r: RitmoSemana | null): { texto: string; nivel: NivelRitmo } | null => {
  if (!r) return null
  const exceso = Math.round(r.exceso)
  const signo = exceso < 0 ? `−${-exceso}` : `+${exceso}`
  const margen = r.exceso <= MARGEN_XHIGH ? ' · xhigh ok' : ''
  const nivel: NivelRitmo = r.exceso <= 5 ? 'verde' : r.exceso <= 15 ? 'ambar' : 'rojo'
  return { texto: `semana ${Math.round(r.usado)}% · ritmo ${Math.round(r.ritmo)}% · ${signo}${margen}`, nivel }
}

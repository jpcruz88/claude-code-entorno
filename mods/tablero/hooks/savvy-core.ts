// Lógica del panel de progreso y de agentes de savvy-progress (MIT, johnnyvizz/claude-kit),
// en español y sin el nivel «fable». Solo cálculo: sin red, sin procesos y sin escribir a disco.
// savvy-dibujo.ts pinta estos datos y savvy-registro.ts los conecta a los eventos del motor.

export type Fase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type TareaPlanificada = { title: string; tier: string; after: number[] }

export type Flujo = {
  title: string
  total: number
  done: number
  running: number
  phase: Fase
  isFinished: boolean
  tasks: TareaPlanificada[]
}

export type EstadoAgente = 'running' | 'done' | 'failed'

export type AgenteRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: EstadoAgente
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Lo reporta el propio trabajador con la herramienta de pasos. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type Uso = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model?: string
}

export type EntradaProgreso = {
  title?: string
  total?: number
  done?: number
  phase?: Fase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

export const STEP_TOOL = 'mcp__tablero__paso'
export const PROGRESS_TOOL = 'mcp__tablero__progreso'
export const PANE_AGENTES = 'tablero-agentes'

export const FASES: readonly Fase[] = ['plan', 'design', 'delegate', 'review', 'close']
// Niveles de los subagentes savvy-*. El nivel «fable» se quitó: no usamos ese modelo.
export const NIVELES: readonly string[] = ['light', 'medium', 'careful', 'heavy']
export const MAX_TAREAS = 200
export const MAX_DESPUES = 20
export const MAX_TITULO = 120
export const MAX_AGENTES = 200

// Colores de cada nivel, en la paleta de la banda.
export const TIER_COLOR: Record<string, string> = {
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

export const colorDeNivel = (nivel: string): string => TIER_COLOR[nivel] ?? '#888780'

// Modelo y esfuerzo que usa cada nivel, para las tareas planificadas que aún no tienen agente.
export const MODELO_NIVEL: Record<string, [modelo: string, esfuerzo: string]> = {
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
}

export const PALABRAS = {
  panel: 'Agentes',
  costo: 'Costo',
  tokens: 'Tokens',
  tiempo: 'Tiempo',
  plegar: 'Plegar',
  desplegar: 'Desplegar',
  enMarcha: 'En marcha',
  terminados: 'Terminados',
  planificados: 'Planificados',
  vacio: 'Todavía no hay subagentes.',
  ronda: 'ronda',
  error: 'error',
  despues: 'después de',
  tokensPalabra: 'tokens',
  agentes: 'agentes',
  enMarchaSing: 'en marcha',
  terminadoSing: 'terminado',
  planificadoSing: 'planificado',
  abierto: 'Panel de agentes abierto.',
  cerrado: 'Panel de agentes cerrado.',
  listo: 'Listo',
  plan: 'Plan',
  diseno: 'Diseño',
  tareas: 'Tareas',
  revision: 'Revisión',
  ocupado: 'en marcha',
  ctx: 'ctx',
  nivel: {
    light: 'ligero',
    medium: 'medio',
    careful: 'cuidadoso',
    heavy: 'pesado',
    other: 'otro',
  } as Record<string, string>,
  esfuerzo: {
    low: 'bajo',
    medium: 'medio',
    high: 'alto',
    xhigh: 'muy alto',
    max: 'máximo',
  } as Record<string, string>,
}

export const palabraNivel = (nivel: string): string => PALABRAS.nivel[nivel] ?? nivel

/** Nombres de los agentes integrados de Claude Code, en español. Lo que no está en la tabla sale tal cual. */
const NOMBRES_TIPO: Record<string, string> = {
  Explore: 'explorar',
  'general-purpose': 'propósito general',
  Plan: 'plan',
}
export const nombreDeTipo = (tipo: string): string => NOMBRES_TIPO[tipo] ?? tipo
export const palabraEsfuerzo = (esfuerzo: string): string => PALABRAS.esfuerzo[esfuerzo] ?? esfuerzo

// Instrucción que se añade al final del encargo de cada subagente savvy-*. Su prompt de sistema
// dice que reporte pasos «si la herramienta aparece», y lo omiten aunque esté; el encargo sí se cumple.
export const STEP_BRIEF = `

Reporte de avance: antes de cualquier otro trabajo, llama a \`${STEP_TOOL}\` con \`total\` (tu plan en 3 a 8 pasos) y \`done: 0\`. Vuelve a llamarla con \`done\` y una \`note\` de pocas palabras cada vez que termine un paso. Solo dibuja una barra de progreso.`

// --- niveles y modelos

/** El nivel sale de `savvy-<nivel>`, o `savvy-flow:savvy-<nivel>`. Un nombre ajeno cuenta como «other». */
export const nivelDe = (tipo: string): string => {
  const sinPlugin = tipo.replace(/^[^:]*:/, '')
  const nivel = sinPlugin.replace(/^savvy-/, '').toLowerCase()
  return sinPlugin.startsWith('savvy-') && NIVELES.includes(nivel) ? nivel : 'other'
}

/** Solo un nivel conocido se guarda: el nombre después sirve de clave en las tablas. */
const nivelLimpio = (valor: string): string => {
  const nivel = valor.replace(/^savvy-/, '').trim().toLowerCase()
  return NIVELES.includes(nivel) ? nivel : ''
}

export const modelName = (id: string): string => {
  const m = /(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, familia = '', mayor = '', menor] = m ?? []
  if (!familia) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${familia.charAt(0).toUpperCase()}${familia.slice(1).toLowerCase()} ${mayor}${menor ? '.' + menor : ''}`
}

/** Haiku 4 y Claude 3 tienen ventana de 200k; el resto, Haiku 5.5 incluido, de 1M. */
export const windowOf = (modelo: string): number => (/haiku-4|claude-3/i.test(modelo) ? 200_000 : 1_000_000)

// --- costo

// USD por millón de tokens: entrada, salida, lectura de caché y escritura de caché. Gana la
// primera fila que coincide, así que una versión va antes que su familia.
export type Tarifa = [entrada: number, salida: number, lecturaCache: number, escrituraCache: number]

const TARIFAS: [RegExp, Tarifa][] = [
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]
const TARIFA_OMISION: Tarifa = [4, 20, 0.2, 8]

// Haiku 5.5 se cobra por longitud de prompt: si el prompt pasa de 100.000 tokens, tarifa larga.
const HAIKU_PROMPT_LARGO = 100_000
const HAIKU_LARGO: Tarifa = [0.5, 2.5, 0.05, 1]

const tarifaDe = (modelo: string, prompt: number): Tarifa => {
  const id = modelo.toLowerCase()
  if (prompt > HAIKU_PROMPT_LARGO && /haiku-5-5/.test(id)) return HAIKU_LARGO
  return TARIFAS.find(([re]) => re.test(id))?.[1] ?? TARIFA_OMISION
}

/** `esPeticion`: el uso es una sola petición al modelo, que es lo que fija la tarifa de prompt largo. */
export const costOf = (modelo: string, u: Uso, esPeticion: boolean): number => {
  const prompt = esPeticion ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [e, s, lc, ec] = tarifaDe(modelo, prompt)
  return (
    ((u.input_tokens || 0) * e +
      (u.output_tokens || 0) * s +
      (u.cache_read_input_tokens || 0) * lc +
      (u.cache_creation_input_tokens || 0) * ec) /
    1e6
  )
}

// --- formato

export const fmtTokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)

export const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// --- medida del texto (aproximada, para repartir el espacio de la barra)

const ANCHO_ANCHO = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏！-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

/** Avance aproximado de un carácter en em. Los caracteres anchos (CJK, emoji) ocupan casi 1 em. */
const emDe = (ch: string): number =>
  ANCHO_ANCHO.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZÁÉÍÓÚÑÜ@%]/.test(ch) ? 0.72 : 0.56

export const anchoTexto = (s: string, tamano: number): number => [...s].reduce((w, ch) => w + emDe(ch) * tamano, 0)

/** Recorta `s` para que quepa en `maxW` píxeles, con puntos suspensivos si tuvo que cortar. */
export const fitText = (s: string, tamano: number, maxW: number): string => {
  if (anchoTexto(s, tamano) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (anchoTexto(out + ch + '…', tamano) > maxW) break
    out += ch
  }
  return out + '…'
}

// --- flujo

export const nuevoFlujo = (): Flujo => ({
  title: 'savvy-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

/** Un flujo guardado de antes puede no traer `tasks`: se completa aquí. */
export const cargarFlujo = (f: Flujo | null): Flujo | null => (f ? { ...f, tasks: f.tasks ?? [] } : null)

export const esFlujoNuevo = (prev: Flujo | null, input: EntradaProgreso): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITULO) !== prev.title)

export const cleanTasks = (tareas: EntradaProgreso['tasks']): TareaPlanificada[] | undefined =>
  tareas
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TAREAS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: nivelLimpio(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_DESPUES),
    }))

/** Un título nuevo es un flujo nuevo: nunca se arrastran contadores de otro. */
export const fusionarFlujo = (prev: Flujo | null, input: EntradaProgreso): Flujo => {
  const base = esFlujoNuevo(prev, input) || !prev ? nuevoFlujo() : { ...nuevoFlujo(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TAREAS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && FASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITULO),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

export const etiquetaFlujo = (f: Flujo): string => {
  if (f.isFinished) return PALABRAS.listo
  if (f.phase === 'plan') return PALABRAS.plan
  if (f.phase === 'design') return PALABRAS.diseno
  const cuenta = f.total ? `${f.done}/${f.total}` : `${f.running} ${PALABRAS.ocupado}`
  return `${f.phase === 'review' ? PALABRAS.revision : PALABRAS.tareas} ${cuenta}`
}

export const ratio = (f: Flujo): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

/** Ruido determinista: el punteado no parpadea entre dibujos. */
export const ruido = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// --- agentes

export const plannedOf = (f: Flujo | null, lista: AgenteRun[]): (TareaPlanificada & { n: number })[] => {
  if (!f || f.isFinished) return []
  const empezadas = new Set(lista.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !empezadas.has(norm(t.title)))
}

export const totales = (lista: AgenteRun[], ahora: number) => {
  const cost = lista.reduce((s, a) => s + a.costUsd, 0)
  const tokens = lista.reduce((s, a) => s + a.tokens, 0)
  const inicio = Math.min(...lista.map(a => a.startedAt))
  const fin = Math.max(...lista.map(a => a.endedAt ?? Math.max(ahora, a.startedAt)))
  return { cost, tokens, time: lista.length ? fin - inicio : 0 }
}

/** El progreso del agente: terminado lleno, con pasos la proporción, si no null (se usa el contexto). */
export const progresoRun = (a: AgenteRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

export const elapsed = (a: AgenteRun, ahora: number): number => (a.endedAt ?? Math.max(ahora, a.startedAt)) - a.startedAt

export const ctxOf = (a: AgenteRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

export const agregarRun = (lista: AgenteRun[], run: AgenteRun): AgenteRun[] => [...lista.filter(a => a.id !== run.id), run].slice(-MAX_AGENTES)

/** Un paso de una petición del subagente: contexto, tokens, costo y un paso más. */
export const ajustarUso = (a: AgenteRun, uso: Uso, modelo: string, esfuerzo?: string): AgenteRun => ({
  ...a,
  model: modelo,
  effort: esfuerzo ?? a.effort,
  status: 'running',
  endedAt: undefined,
  contextTokens: (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0) + (uso.output_tokens || 0),
  contextMax: windowOf(modelo),
  tokens: a.tokens + (uso.input_tokens || 0) + (uso.output_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0),
  costUsd: a.costUsd + costOf(modelo, uso, true),
  steps: a.steps + 1,
})

/** Fin del turno de un subagente: terminado si respondió, fallido si no. Sin pasos vistos, toma la suma del turno. */
export const finRun = (lista: AgenteRun[], agentId: string, razon: string, ahora: number, uso: Uso | undefined): AgenteRun[] =>
  lista.map((a): AgenteRun => {
    if (a.agentId !== agentId) return a
    const respaldo = a.steps === 0 && uso
    return {
      ...a,
      status: razon === 'answer' ? 'done' : 'failed',
      endedAt: ahora,
      ...(respaldo && uso
        ? {
            model: uso.model || a.model,
            tokens: uso.input_tokens + uso.output_tokens + uso.cache_read_input_tokens + uso.cache_creation_input_tokens,
            costUsd: costOf(uso.model || a.model, uso, false),
          }
        : {}),
    }
  })

/** Lo que reporta el trabajador con la herramienta de pasos. `encontrado` dice si hay fila para ese agente. */
export const reportarPaso = (
  lista: AgenteRun[],
  agentId: string,
  input: { done?: number; total?: number; note?: string },
): { lista: AgenteRun[]; encontrado: boolean } => {
  let encontrado = false
  const nueva = lista.map(a => {
    if (a.agentId !== agentId) return a
    encontrado = true
    const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
    const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
    return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
  })
  return { lista: nueva, encontrado }
}

export const nivelDeTarea = (t: TareaPlanificada): string => (t.tier in TIER_COLOR ? t.tier : 'other')

// --- la instrucción a los trabajadores

/** Solo los subagentes savvy-* que aún no traen la instrucción la reciben. */
export const debeInstruirse = (tipo: string, prompt: string): boolean => tipo.startsWith('savvy-') && !prompt.includes(STEP_TOOL)

export const instruccion = (prompt: string): string => prompt + STEP_BRIEF

// Los planes de trabajo (antes el mod barra-plan): el estado de cada plan y su fila en el tablero.
import type { EstadoPaso, EstadoPlan, Paso, Plan } from '../types'

type Entrada = Record<string, unknown>

const PARCIALES = ['▏', '▎', '▍', '▌', '▋', '▊', '▉']
const ESTADOS: EstadoPlan[] = ['running', 'needs_input', 'error', 'done']
export const CAIDA_MS = 30_000

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const titulos = (entrada: Entrada): string[] => {
  const etapas = Array.isArray(entrada.stages) ? entrada.stages.flatMap(e => (e as { steps?: unknown[] }).steps ?? []) : []
  const pasos = Array.isArray(entrada.steps) ? entrada.steps : []
  return [...etapas, ...pasos]
    .map(p => (typeof p === 'string' ? p.trim() : texto((p as { title?: unknown })?.title)))
    .filter(t => t !== '')
}

const sinPaso = (id: string, t: string, pasos: Paso[]) =>
  `plan_progress: "${id}" has no step "${t}". Its steps: ${pasos.map(p => p.title).join(', ')}`

export const aplicar = (prev: Plan | undefined, entrada: Entrada, ahora: number): Plan | string => {
  const id = texto(entrada.id)
  const nombres = titulos(entrada)
  if (!prev && nombres.length === 0) return `plan_progress: no bar "${id}" yet; create it with title and stages.`

  const hechos = new Set((prev?.pasos ?? []).filter(p => p.status === 'done').map(p => p.title))
  let pasos: Paso[] =
    nombres.length > 0
      ? nombres.map(title => ({ title, status: hechos.has(title) ? 'done' : 'pending' }))
      : (prev as Plan).pasos.slice()
  const hallar = (t: string) => pasos.findIndex(p => p.title === t)
  const fijar = (i: number, status: EstadoPaso) => {
    pasos = pasos.map((p, j) => (j === i ? { ...p, status } : p))
  }

  for (const t of Array.isArray(entrada.done) ? entrada.done.map(texto) : []) {
    const i = hallar(t)
    if (i < 0) return sinPaso(id, t, pasos)
    fijar(i, 'done')
  }
  const activo = texto(entrada.active)
  if (activo) {
    const i = hallar(activo)
    if (i < 0) return sinPaso(id, activo, pasos)
    pasos = pasos.map(p => (p.status === 'active' ? { ...p, status: 'pending' } : p))
    fijar(i, 'active')
  }
  if (entrada.next === true) {
    const i = pasos.findIndex(p => p.status === 'active')
    if (i >= 0) fijar(i, 'done')
  }
  const caido = texto(entrada.failed)
  if (caido) {
    const i = hallar(caido)
    if (i < 0) return sinPaso(id, caido, pasos)
    fijar(i, 'failed')
  } else if (!pasos.some(p => p.status === 'active')) {
    const i = pasos.findIndex(p => p.status === 'pending')
    if (i >= 0) fijar(i, 'active')
  }

  const todos = pasos.length > 0 && pasos.every(p => p.status === 'done')
  const pedido = ESTADOS.find(s => s === entrada.state)
  const estado: EstadoPlan = pedido ?? (caido ? 'error' : todos ? 'done' : 'running')
  const fin = estado === 'done' ? (prev?.estado === 'done' && prev.endedAt ? prev.endedAt : ahora) : null

  return {
    id,
    title: texto(entrada.title) || prev?.title || id,
    pasos,
    estado,
    note: texto(entrada.note) || null,
    startedAt: prev?.startedAt ?? ahora,
    endedAt: fin,
  }
}

export const barra = (fraccion: number, celdas: number): string => {
  const octavos = Math.round(Math.min(1, Math.max(0, fraccion)) * celdas * 8)
  const llenas = Math.floor(octavos / 8)
  const resto = octavos % 8
  const parcial = resto > 0 ? PARCIALES[resto - 1] : ''
  const vacias = celdas - llenas - (resto > 0 ? 1 : 0)
  return '█'.repeat(llenas) + parcial + '░'.repeat(vacias)
}

export const tiempo = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

const avance = (p: Plan) => ({ hechos: p.pasos.filter(s => s.status === 'done').length, total: p.pasos.length })

const activoDe = (p: Plan): string | null => {
  const paso = p.pasos.find(s => s.status === 'active') ?? p.pasos.find(s => s.status === 'failed')
  return paso ? paso.title : null
}

export const resumen = (p: Plan): string => {
  const { hechos, total } = avance(p)
  const activo = activoDe(p)
  return `${p.id}: ${hechos}/${total}, ${p.estado}${activo ? `, active "${activo}"` : ''}`
}


export type FilaPlan = {
  glifo: string
  palabra: 'En curso' | 'Te espera' | 'Falló' | 'Hecho'
  titulo: string
  hechos: number
  total: number
  paso: string | null
  tiempo: string
  nota: string | null
}

const PALABRA: Record<EstadoPlan, FilaPlan['palabra']> = { running: 'En curso', needs_input: 'Te espera', error: 'Falló', done: 'Hecho' }
// En curso el glifo lo pone el giro del dibujo; aquí queda el de reposo.
const GLIFO: Record<EstadoPlan, string> = { running: '●', needs_input: '◆', error: '✗', done: '✓' }

/** Reloj m:ss como el de las tarjetas de agentes. */
const reloj = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Lo que el tablero dibuja de un plan: símbolo y palabra de su estado, avance, paso, reloj y la nota a leer. */
export const filaPlan = (p: Plan, ahora: number): FilaPlan => {
  const { hechos, total } = avance(p)
  return {
    glifo: GLIFO[p.estado],
    palabra: PALABRA[p.estado],
    titulo: p.title,
    hechos,
    total,
    paso: activoDe(p),
    tiempo: reloj((p.endedAt ?? ahora) - p.startedAt),
    nota: p.estado === 'needs_input' || p.estado === 'error' ? p.note : null,
  }
}

/** Los planes que siguen a la vista: abiertos, y los terminados durante CAIDA_MS. */
export const visibles = (planes: Plan[], ahora: number): Plan[] =>
  planes.filter(p => p.estado !== 'done' || ahora - (p.endedAt ?? ahora) < CAIDA_MS)

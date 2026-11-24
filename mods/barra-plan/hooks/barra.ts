import type { EstadoPaso, EstadoPlan, Paso, Plan } from '../types'

type Entrada = Record<string, unknown>

export type Fila = {
  estado: EstadoPlan | null
  marca: string
  titulo: string
  barra: string
  resto: string
  nota: string | null
  texto: string
}

const PARCIALES = ['▏', '▎', '▍', '▌', '▋', '▊', '▉']
const ESTADOS: EstadoPlan[] = ['running', 'needs_input', 'error', 'done']
const MARCAS: Record<EstadoPlan, string> = { running: '●', needs_input: '?', error: '✗', done: '✓' }
const VISIBLES = 3
export const CAIDA_MS = 30_000
const TITULO_MIN = 8

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const titulos = (entrada: Entrada): string[] => {
  const etapas = Array.isArray(entrada.stages) ? entrada.stages.flatMap(e => (e as { steps?: unknown[] }).steps ?? []) : []
  const pasos = Array.isArray(entrada.steps) ? entrada.steps : []
  return [...etapas, ...pasos]
    .map(p => (typeof p === 'string' ? p.trim() : texto((p as { title?: unknown })?.title)))
    .filter(t => t !== '')
}

const sinPaso = (id: string, t: string, pasos: Paso[]) =>
  `barra-plan: "${id}" has no step "${t}". Its steps: ${pasos.map(p => p.title).join(', ')}`

export const aplicar = (prev: Plan | undefined, entrada: Entrada, ahora: number): Plan | string => {
  const id = texto(entrada.id)
  const nombres = titulos(entrada)
  if (!prev && nombres.length === 0) return `barra-plan: no bar "${id}" yet; create it with title and stages.`

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

const cortar = (s: string, n: number): string => {
  if (n <= 0) return ''
  const letras = [...s]
  if (letras.length <= n) return s
  return n === 1 ? '…' : `${letras.slice(0, n - 1).join('')}…`
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

const filaDe = (p: Plan, columnas: number, ahora: number): Fila => {
  const { hechos, total } = avance(p)
  if (p.estado === 'done') {
    const resto = ` · ${hechos}/${total} · ${tiempo((p.endedAt ?? ahora) - p.startedAt)}`
    const titulo = cortar(p.title, columnas - 2 - resto.length)
    return { estado: 'done', marca: '✓', titulo, barra: '', resto, nota: null, texto: `✓ ${titulo}${resto}` }
  }
  const celdas = Math.min(12, Math.max(4, Math.floor(columnas / 8)))
  const cuenta = `  ${hechos}/${total}`
  const cola = `  ${tiempo(ahora - p.startedAt)}`
  const activo = activoDe(p)
  const base = 4 + celdas + cuenta.length + cola.length
  let paso = activo ? `  paso: ${activo}` : ''
  if (columnas - base - paso.length < Math.min(p.title.length, TITULO_MIN)) paso = ''
  const titulo = cortar(p.title, columnas - base - paso.length)
  const barraTxt = barra(hechos / Math.max(total, 1), celdas)
  const resto = `${cuenta}${paso}${cola}`
  const nota = p.estado === 'needs_input' || p.estado === 'error' ? p.note : null
  return {
    estado: p.estado,
    marca: MARCAS[p.estado],
    titulo,
    barra: barraTxt,
    resto,
    nota,
    texto: `${MARCAS[p.estado]} ${titulo}  ${barraTxt}${resto}`,
  }
}

export const filas = (planes: Plan[], columnas: number, ahora: number): Fila[] => {
  const visibles = planes.filter(p => p.estado !== 'done' || ahora - (p.endedAt ?? ahora) < CAIDA_MS)
  const lineas = visibles.slice(0, VISIBLES).map(p => filaDe(p, columnas, ahora))
  const sobran = visibles.length - VISIBLES
  if (sobran > 0) {
    const mas = `+${sobran} más`
    lineas.push({ estado: null, marca: '', titulo: mas, barra: '', resto: '', nota: null, texto: mas })
  }
  return lineas
}

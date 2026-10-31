export type EntradaSpec = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }

const DIA_MS = 86_400_000
const LIMITE_DIAS = 14
const PREFIJO_FECHA = /^(\d{4})-(\d{2})-(\d{2})-/

// Fecha de una spec: el prefijo YYYY-MM-DD- del nombre (en UTC) o, si no lo tiene, su fecha de modificación.
function fechaDeSpec(e: EntradaSpec): number | undefined {
  const m = PREFIJO_FECHA.exec(e.name)
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return e.mtimeMs > 0 ? e.mtimeMs : undefined
}

export function estadoSpecs(entradas: EntradaSpec[], ahora: number): 'reciente' | 'vieja' | 'ninguna' {
  const specs = entradas.filter(e => e.kind === 'file' && e.name.toLowerCase().endsWith('.md'))
  if (specs.length === 0) return 'ninguna'
  const fechas = specs.map(fechaDeSpec).filter((f): f is number => f !== undefined)
  // Sin ninguna fecha legible solo se sabe que existe una spec.
  if (fechas.length === 0) return 'reciente'
  return ahora - Math.max(...fechas) <= LIMITE_DIAS * DIA_MS ? 'reciente' : 'vieja'
}

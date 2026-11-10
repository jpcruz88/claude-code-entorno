// Cálculos de texto para el panel, sin motor ni dibujo: el tiempo hasta un reseteo y las líneas de una edición.

/** Tiempo que falta para un reseteo, sin espacios: `25m`, `4h38m`, `6d14h`; vacío si se desconoce o ya pasó. */
export const restoCompacto = (resetsAt: number | null, ahora: number): string => {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= ahora) return ''
  const m = Math.max(1, Math.floor((resetsAt - ahora) / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d${h}h`
  return h > 0 ? `${h}h${m % 60}m` : `${m}m`
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

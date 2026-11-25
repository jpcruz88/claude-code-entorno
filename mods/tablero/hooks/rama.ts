import { TOPE_LECTURA, sinControles } from './core'

/** La rama de un `.git/HEAD`, o los 7 primeros caracteres de un commit suelto; null si no se entiende o pasa del tope. */
export const ramaDeHead = (texto: string): string | null => {
  if (texto.length > TOPE_LECTURA) return null
  const t = texto.trim()
  const rama = /^ref:\s*refs\/heads\/(.+)$/.exec(t)
  if (rama?.[1]) return sinControles(rama[1])
  return /^[0-9a-f]{40}$/i.test(t) ? t.slice(0, 7) : null
}

/**
 * Donde apunta un `.git` que es un archivo (un worktree); null si no lo es. Una ruta relativa se cuenta
 * desde `carpeta`, la que contiene ese `.git`.
 */
export const gitdirDe = (texto: string, carpeta: string): string | null => {
  const m = /^gitdir:\s*(.+)$/m.exec(texto.trim())
  if (!m?.[1]) return null
  const ruta = m[1].trim()
  return /^([\\/]|[A-Za-z]:)/.test(ruta) ? ruta : `${carpeta}/${ruta}`
}

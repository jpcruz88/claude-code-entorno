/** La rama de un `.git/HEAD`, o los 7 primeros caracteres de un commit suelto; null si no se entiende. */
export const ramaDeHead = (texto: string): string | null => {
  const t = texto.trim()
  const rama = /^ref:\s*refs\/heads\/(.+)$/.exec(t)
  if (rama?.[1]) return rama[1].trim()
  return /^[0-9a-f]{40}$/i.test(t) ? t.slice(0, 7) : null
}

/** Donde apunta un `.git` que es un archivo (un worktree); null si no lo es. */
export const gitdirDe = (texto: string): string | null => {
  const m = /^gitdir:\s*(.+)$/m.exec(texto.trim())
  return m?.[1] ? m[1].trim() : null
}

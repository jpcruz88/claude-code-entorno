// Lo que dicen git y gh de la carpeta de la sesión: cambios sin comitear, commits sin subir y el CI del PR.
// Solo lectura de su salida; quien lanza los comandos es register.tsx.

export type CambiosGit = { archivos: number; mas: number; menos: number }
export type EstadoCi = 'corriendo' | 'pasa' | 'falla'

const cifra = (s: string, re: RegExp) => Number(re.exec(s)?.[1] ?? 0)

/** `git diff --shortstat HEAD`: archivos, líneas añadidas y quitadas; vacío es sin cambios. */
export const parseShortstat = (s: string): CambiosGit => ({
  archivos: cifra(s, /(\d+) files? changed/),
  mas: cifra(s, /(\d+) insertions?\(\+\)/),
  menos: cifra(s, /(\d+) deletions?\(-\)/),
})

/** `git rev-list --count @{u}..HEAD`: cuántos commits faltan por subir; null sin rama remota. */
export const parseSinSubir = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? Number(s.trim()) : null)

/** `gh pr checks <n> --json bucket`: un fallo gana, luego lo pendiente; todo pasado o saltado pasa. */
export const estadoCi = (json: string): EstadoCi | null => {
  let lista: unknown
  try {
    lista = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(lista) || lista.length === 0) return null
  const buckets = lista.map(x => (x && typeof x === 'object' ? (x as { bucket?: unknown }).bucket : null))
  if (buckets.some(b => b === 'fail' || b === 'cancel')) return 'falla'
  if (buckets.some(b => b === 'pending')) return 'corriendo'
  return buckets.every(b => b === 'pass' || b === 'skipping') ? 'pasa' : null
}

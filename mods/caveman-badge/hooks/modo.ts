export type Modo = 'lite' | 'full' | 'ultra' | 'normal'

const NIVEL = /^\s*\/caveman\s+(lite|full|ultra)\b/i
// Se admite puntuación o comillas alrededor («stop caveman.», «¡modo normal!»), pero no más palabras.
const APAGAR = /^[\s\p{P}]*(stop\s+caveman|modo\s+normal)[\s\p{P}]*$/iu

export function siguienteModo(actual: Modo, texto: string): Modo {
  const nivel = NIVEL.exec(texto)?.[1]
  if (nivel) return nivel.toLowerCase() as Modo
  if (APAGAR.test(texto)) return 'normal'
  return actual
}

export function etiqueta(m: Modo): string {
  return `caveman: ${m}`
}

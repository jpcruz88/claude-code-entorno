// El modo caveman de la sesión (antes el mod caveman-badge): lo cambia el texto del prompt.
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

/** Lo que dice la cabecera del tablero: «Caveman full»; apagado, nada. */
export function etiquetaCaveman(m: Modo): string | null {
  return m === 'normal' ? null : `Caveman ${m}`
}

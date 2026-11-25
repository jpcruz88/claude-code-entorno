export const UMBRALES = [70, 85] as const

/** true = ese umbral ya avisó y sigue sin rearmarse. */
export type Armado = Record<number, boolean>

export function evaluar(
  percent: number | undefined,
  armado: Armado,
): { avisar: number[]; armado: Armado } {
  if (percent === undefined) return { avisar: [], armado }

  const siguiente: Armado = { ...armado }
  const avisar: number[] = []
  for (const umbral of UMBRALES) {
    if (percent < umbral) {
      siguiente[umbral] = false
    } else if (!siguiente[umbral]) {
      siguiente[umbral] = true
      avisar.push(umbral)
    }
  }
  return { avisar, armado: siguiente }
}

/**
 * Lo que Claude lee al cruzar un umbral: es el último momento en que puede escribir
 * el handoff con la conversación entera delante. Después de compactar solo queda un resumen.
 */
export function notaHandoff(umbral: number): string {
  return (
    `El contexto de esta sesión pasó del ${umbral} % (mod ctx-budget). Pronto se compactará ` +
    'y solo quedará un resumen. Este es el momento de actualizar `handoff.md` en la carpeta ' +
    'de memoria del proyecto, con la conversación entera todavía delante: qué pidió el ' +
    'usuario con sus palabras, qué se decidió, qué se hizo, qué quedó verificado y qué no, ' +
    'y qué sigue. Se hace antes de continuar con lo que pide este mensaje.'
  )
}

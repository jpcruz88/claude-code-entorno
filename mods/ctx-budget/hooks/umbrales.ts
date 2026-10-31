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

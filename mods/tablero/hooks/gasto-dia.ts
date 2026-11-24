// El costo frente al tiempo y al presupuesto del día. Solo cálculo.
import type { RegistroSesion } from '../types'

/** Con menos de un minuto de trabajo la cifra baila demasiado: no se muestra. */
const MIN_TRABAJO_MS = 60_000

/** Dólares por hora de trabajo real (turnos en marcha), o null con menos de un minuto. */
export const porHora = (costoUsd: number, msTrabajo: number): number | null =>
  msTrabajo < MIN_TRABAJO_MS ? null : costoUsd / (msTrabajo / 3_600_000)

/**
 * Lo gastado hoy entre todas las sesiones: por sesión, su costo menos el que tenía al empezar el día (`base`).
 * La propia va con su dato vivo, y no se cuenta dos veces si su archivo también está entre `otros`.
 */
export const gastoDelDia = (
  propio: { id: string; costo: number; base: number; dia: string },
  otros: RegistroSesion[],
  hoy: string,
): number =>
  [propio, ...otros.filter(o => o.id !== propio.id)]
    .filter(r => r.dia === hoy)
    .reduce((suma, r) => suma + Math.max(0, r.costo - r.base), 0)

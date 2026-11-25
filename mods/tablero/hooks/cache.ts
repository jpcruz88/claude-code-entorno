// La cache del prompt de la sesión: caliente o fría, cuánto le queda y su tasa de aciertos. Solo cálculo.
import type { CacheLinea } from './linea-sesion'

export type TextoCache = { caliente: boolean; queda: string | null; aviso: boolean; aciertos: number | null }

/** Menos de este margen y la cuenta atrás pasa a aviso: decidir si seguir antes de que caduque. */
const AVISO_S = 60

/** Lo que muestra la fila Cache con los datos de la statusline y la hora actual (segundos epoch). */
export const textoCache = (pc: CacheLinea | null, ahoraS: number): TextoCache => {
  if (!pc) return { caliente: false, queda: null, aviso: false, aciertos: null }
  const aciertos = pc.hit_ratio === null ? null : Math.round(pc.hit_ratio * 100)
  const resta = pc.expires_at === null ? null : Math.floor(pc.expires_at - ahoraS)
  if (!pc.warm || resta === null || resta <= 0) return { caliente: false, queda: null, aviso: false, aciertos }
  return { caliente: true, queda: `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`, aviso: resta < AVISO_S, aciertos }
}

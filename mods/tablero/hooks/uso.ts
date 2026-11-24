// El uso frente a un límite (cupos, contexto): umbrales de color y el ritmo del cupo. Solo cálculo.

/** Aviso desde 65 % del límite, alerta desde 85 %. */
export const tonoUso = (pct: number): 'normal' | 'aviso' | 'alerta' => (pct >= 85 ? 'alerta' : pct >= 65 ? 'aviso' : 'normal')

/**
 * El ritmo de un cupo: el uso menos el tiempo transcurrido de su ventana (`fraccion` de 0 a 1).
 * `⇡N%` si se gasta más rápido de lo que pasa el tiempo, `⇣N%` si hay margen, `=0%` si van a la par.
 */
export const ritmoCupo = (pct: number, fraccion: number | null): string => {
  if (fraccion === null || !Number.isFinite(fraccion)) return ''
  const diferencia = Math.round(pct - fraccion * 100)
  if (diferencia > 0) return `⇡${diferencia}%`
  if (diferencia < 0) return `⇣${-diferencia}%`
  return '=0%'
}

/** Cuántas celdas de una barra de `ancho` quedan llenas con ese uso, acotado a 0..ancho. */
export const celdasUso = (pct: number, ancho: number): number =>
  Number.isFinite(pct) ? Math.max(0, Math.min(ancho, Math.round((pct / 100) * ancho))) : 0

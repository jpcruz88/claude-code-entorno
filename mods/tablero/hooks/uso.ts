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

/**
 * Si el cupo se agota antes de reiniciarse al ritmo de lo que va de ventana, y a qué hora local.
 * `fraccion` es lo transcurrido de la ventana (0 a 1); sin ese dato o sin uso no dice nada.
 */
export const pronosticoCupo = (pct: number, fraccion: number | null, reinicioMs: number | null, ahoraMs: number): string => {
  if (fraccion === null || reinicioMs === null || !(fraccion > 0) || fraccion >= 1 || !(pct > 0)) return ''
  const ventanaMs = (reinicioMs - ahoraMs) / (1 - fraccion)
  const transcurridoMs = fraccion * ventanaMs
  const hastaLlenoMs = ((100 - pct) / pct) * transcurridoMs
  if (ahoraMs + hastaLlenoMs >= reinicioMs) return 'Al ritmo actual no se agota'
  const h = new Date(ahoraMs + hastaLlenoMs)
  return `Al ritmo actual se agota ${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`
}

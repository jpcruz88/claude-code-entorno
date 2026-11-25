// El gasto de cada minuto para la gráfica costo/min del mapa. Pura: recibe las muestras del costo de la sesión.

/** Una muestra del costo acumulado de la sesión: `t` en ms epoch, `usd` lo gastado hasta entonces. */
export type MuestraCosto = { t: number; usd: number }

const MINUTO = 60_000

/**
 * Lo que subió el costo en cada uno de los últimos `n` minutos, del más viejo al más reciente. Cada subida entre dos
 * muestras seguidas cuenta en el minuto de la segunda. Las bajadas (un costo que se reinicia) no cuentan.
 */
export const costoPorMinuto = (muestras: MuestraCosto[], ahora: number, n: number): number[] => {
  const ultimo = Math.floor((ahora - 1) / MINUTO)
  const primero = ultimo - n + 1
  const out = Array.from({ length: n }, () => 0)
  for (let i = 1; i < muestras.length; i++) {
    const subida = muestras[i].usd - muestras[i - 1].usd
    const k = Math.floor(muestras[i].t / MINUTO)
    if (subida > 0 && k >= primero && k <= ultimo) out[k - primero] += subida
  }
  return out
}

/** Agrega una muestra si el costo cambió y descarta las de hace más de `n` minutos (se modifica en el sitio). */
export const anotarCosto = (muestras: MuestraCosto[], usd: number | null, ahora: number, n: number): void => {
  if (usd === null) return
  const ultima = muestras.at(-1)
  if (!ultima || ultima.usd !== usd) muestras.push({ t: ahora, usd })
  const limite = ahora - (n + 1) * MINUTO
  // Se guarda la última muestra vieja como base, para que la primera subida dentro de la ventana tenga contra qué medirse.
  while (muestras.length > 1 && muestras[1].t < limite) muestras.shift()
}

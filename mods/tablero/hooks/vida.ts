// La barra de vida de la sesión: lo que le queda de contexto, en una barra que se vacía y cambia
// de color (verde, ámbar, rojo) según se agota. Solo cálculo: el dibujo lo pone register.tsx
// a partir de estas filas. En la terminal el degradado son tres tonos; la app de escritorio
// pinta un degradado continuo.
import type { FilaBanda, Tono } from './banda-modelo'

export const BARRA_ANCHO = 20

/** Vida = contexto que le queda, de 0 a 100. Sin lectura de contexto, no hay vida (null). */
export const vidaDe = (contextoPct: number | null): number | null => {
  if (contextoPct === null || !Number.isFinite(contextoPct)) return null
  return Math.min(100, Math.max(0, Math.round(100 - contextoPct)))
}

/** Color de la parte llena: verde con vida alta, ámbar a media, rojo cuando queda poca. */
export const tonoDeVida = (vida: number): Tono => (vida >= 60 ? 'acento' : vida >= 30 ? 'aviso' : 'peligro')

/**
 * Una fila: la etiqueta («vida 50%») y la barra. En un panel angosto la etiqueta se recorta a
 * solo el número, y la barra se encoge para que la fila no pase de las columnas.
 */
export const filasVida = (e: { contextoPct: number | null; columnas: number }): FilaBanda[] => {
  const vida = vidaDe(e.contextoPct)
  if (vida === null) return []
  const completa = `vida ${vida}% `
  const corta = `${vida}% `
  const etiqueta = completa.length + 4 <= e.columnas ? completa : corta
  const ancho = Math.min(BARRA_ANCHO, Math.max(0, e.columnas - 4 - etiqueta.length))
  const llenas = Math.round((vida / 100) * ancho)
  const tono = tonoDeVida(vida)
  return [
    {
      tramos: [
        { texto: etiqueta, tono: 'tenue' },
        { texto: '█'.repeat(llenas), tono },
        { texto: '░'.repeat(ancho - llenas), tono: 'tenue' },
      ],
    },
  ]
}

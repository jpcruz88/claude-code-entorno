// La barra de vida de la sesión: lo que le queda de contexto, en una barra que se vacía y cambia
// de color (verde, ámbar, rojo) según se agota. Solo cálculo: el dibujo lo pone register.tsx
// a partir de estas filas. En la terminal el degradado son tres tonos; la app de escritorio
// pinta un degradado continuo.
import type { Tono } from './banda-modelo'

/** Una fila de la barra de vida: trozos de texto, cada uno con su tono. */
export type FilaVida = { tramos: { texto: string; tono: Tono }[] }

export const BARRA_ANCHO = 20

/** Vida = contexto que le queda, de 0 a 100. Sin lectura de contexto, no hay vida (null). */
export const vidaDe = (contextoPct: number | null): number | null => {
  if (contextoPct === null || !Number.isFinite(contextoPct)) return null
  return Math.min(100, Math.max(0, Math.round(100 - contextoPct)))
}

/** Color de la parte llena: verde con vida alta, ámbar a media, rojo cuando queda poca. */
export const tonoDeVida = (vida: number): Tono => {
  const v = Math.round(vida)
  return v >= 60 ? 'acento' : v >= 30 ? 'aviso' : 'peligro'
}

/**
 * Una fila: la etiqueta («vida 50%») y la barra. `columnas` es el ancho del panel, con su borde
 * y su padding (4 columnas), así que el contenido disponible es `columnas - 4`. En un panel
 * angosto la etiqueta se recorta a solo el número, y la barra se encoge para que la fila no pase
 * de ese contenido. Sin espacio para nada, no hay fila.
 */
export const filasVida = (e: { contextoPct: number | null; columnas: number }): FilaVida[] => {
  const vida = vidaDe(e.contextoPct)
  if (vida === null) return []
  const disponible = e.columnas - 4
  if (disponible <= 0) return []
  const completa = `vida ${vida}% `
  const corta = `${vida}% `
  // Una etiqueta cortada se lee mal («5» por «50%»): va entera o no va.
  const etiqueta = completa.length <= disponible ? completa : corta.length <= disponible ? corta : ''
  const ancho = Math.min(BARRA_ANCHO, Math.max(0, disponible - etiqueta.length))
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

// Escritorio: la barra es un SVG con un degradado continuo. El degradado cubre toda la barra en
// coordenadas del usuario, así el color del relleno depende de cuánta vida queda: rojo cerca de 0,
// ámbar a media, verde al llenarse.
const ROJO = '#D0453F'
const AMBAR = '#E0A030'
const VERDE = '#3B9C5F'
const PIXELES_ALTO = 18

/** Vida de 0 a 100 (acotada) como SVG de `ancho` píxeles; el texto va en `alt`, no en el dibujo. */
export const svgVida = (vida: number, ancho: number): string => {
  // Un valor no finito no tiene vida que mostrar: el caller ya filtra null, esto solo evita escribir NaN.
  const v = Number.isFinite(vida) ? Math.min(100, Math.max(0, Math.round(vida))) : 0
  const llena = Math.round((ancho * v) / 100)
  const etiqueta = `vida ${v}%`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${PIXELES_ALTO}" viewBox="0 0 ${ancho} ${PIXELES_ALTO}" role="img" aria-label="${etiqueta}">
<defs><linearGradient id="vida" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${ancho}" y2="0"><stop offset="0" stop-color="${ROJO}"/><stop offset="0.5" stop-color="${AMBAR}"/><stop offset="1" stop-color="${VERDE}"/></linearGradient></defs>
<rect x="0" y="4" width="${ancho}" height="10" rx="5" fill="#8a8a8a" opacity="0.25"/>
<rect x="0" y="4" width="${llena}" height="10" rx="5" fill="url(#vida)"/>
</svg>`
}

// La mascota de la banda: una criatura en píxeles que camina por la banda según el contexto que
// queda. Su vida es el contexto que le queda; cuando se agota, se enferma y se muere. Solo cálculo:
// sin motor ni dibujo (el dibujo lo pone banda.tsx a partir de estas filas).
import type { FilaBanda, Tono } from './banda-modelo'

export type Animo = 'feliz' | 'cansada' | 'enferma' | 'muriendo' | 'muerta'

const ANCHO_SPRITE = 5
const ANCHO_MAX_ESCENA = 20
// Cada cuántos milisegundos cambia el paso de la animación.
export const PASO_MS = 800

const TONO_DE: Record<Animo, Tono> = {
  feliz: 'acento',
  cansada: 'aviso',
  enferma: 'peligro',
  muriendo: 'peligro',
  muerta: 'tenue',
}

const TEXTO_DE: Record<Animo, string> = {
  feliz: 'feliz',
  cansada: 'cansada',
  enferma: 'enferma',
  muriendo: 'muriendo',
  muerta: 'muerta',
}

/** Vida = contexto que le queda, de 0 a 100. Sin lectura de contexto, no hay vida (null). */
export const vidaDe = (contextoPct: number | null): number | null => {
  if (contextoPct === null || !Number.isFinite(contextoPct)) return null
  return Math.min(100, Math.max(0, Math.round(100 - contextoPct)))
}

/** El ánimo baja con la vida: feliz, cansada, enferma, muriendo y, con vida 0, muerta. */
export const animoDe = (vida: number): Animo => {
  if (vida <= 0) return 'muerta'
  if (vida < 10) return 'muriendo'
  if (vida < 30) return 'enferma'
  if (vida < 60) return 'cansada'
  return 'feliz'
}

/**
 * Columna de la mascota dentro de [0, ancho]: va y viene. La enferma camina a la mitad de
 * velocidad; la que muere y la muerta se quedan en su sitio.
 */
export const posicion = (tick: number, ancho: number, animo: Animo): number => {
  if (ancho <= 0 || animo === 'muriendo' || animo === 'muerta') return 0
  const paso = animo === 'enferma' ? Math.floor(tick / 2) : tick
  const periodo = 2 * ancho
  const p = ((paso % periodo) + periodo) % periodo
  return p <= ancho ? p : periodo - p
}

const SPRITES: Record<Animo, { arriba: string; abajo: [string, string] }> = {
  feliz: { arriba: '▄███▄', abajo: ['▀▀ ▀▀', ' ▀▀▀ '] },
  cansada: { arriba: '▄███▄', abajo: ['▀▄▄▄▀', '▀▄▄▄▀'] },
  enferma: { arriba: '▄▓▓▓▄', abajo: ['▀▄▄▄▀', '▀▄▄▄▀'] },
  muriendo: { arriba: '▄▒▒▒▄', abajo: ['▀▀▀▀▀', '▀▀▀▀▀'] },
  muerta: { arriba: ' ✝ ', abajo: ['▄▄▄▄▄', '▄▄▄▄▄'] },
}

/** Las dos filas de la mascota (cuerpo y patas) con su etiqueta, o ninguna si no hay lectura. */
export const filasMascota = (e: { contextoPct: number | null; ahora: number; columnas: number }): FilaBanda[] => {
  const vida = vidaDe(e.contextoPct)
  if (vida === null) return []
  const animo = animoDe(vida)
  const completa = ` ${TEXTO_DE[animo]} · vida ${vida}%`
  // En un panel angosto la etiqueta corta: solo la vida, para que la fila no se salga.
  const etiqueta = ANCHO_SPRITE + completa.length <= e.columnas ? completa : ` ${vida}%`
  // Lo que sobra de la banda después del sprite y la etiqueta es el espacio por el que camina.
  const ancho = Math.min(ANCHO_MAX_ESCENA, Math.max(0, e.columnas - ANCHO_SPRITE - etiqueta.length))
  const tick = Math.floor(e.ahora / PASO_MS)
  const x = posicion(tick, ancho, animo)
  const sprite = SPRITES[animo]
  const pata = sprite.abajo[tick % 2]
  const tono = TONO_DE[animo]
  return [
    { tramos: [{ texto: ' '.repeat(x) + sprite.arriba, tono }] },
    { tramos: [{ texto: ' '.repeat(x) + pata, tono }, { texto: etiqueta, tono: 'tenue' }] },
  ]
}

// Movimiento de las barras de la banda, sin motor: cada llamada da un cuadro.

export type Barras = { contexto: number; uso: number }

/** Acerca `mostrado` a `objetivo` en `pasos` cuadros; a menos de medio punto, llega. Un objetivo inválido deja el valor. */
export const avanzar = (mostrado: number, objetivo: number, pasos = 4): number => {
  if (!Number.isFinite(objetivo)) return mostrado
  const resta = objetivo - mostrado
  if (Math.abs(resta) < 0.5) return objetivo
  return mostrado + resta / Math.max(1, pasos)
}

/** El indicador pulsa: encendido cinco fases, apagado cinco. */
export const pulso = (fase: number): 'encendido' | 'apagado' => (Math.floor(fase / 5) % 2 === 0 ? 'encendido' : 'apagado')

/** Redibujar solo si lo que se vería cambió. */
export const necesitaRedibujo = (prev: string, sig: string): boolean => prev !== sig

// Movimiento de los valores que mira el reloj del panel, sin motor: cada llamada da un cuadro.

/** Acerca `mostrado` a `objetivo` en `pasos` cuadros; a menos de medio punto, llega. Un objetivo inválido deja el valor. */
export const avanzar = (mostrado: number, objetivo: number, pasos = 4): number => {
  if (!Number.isFinite(objetivo)) return mostrado
  const resta = objetivo - mostrado
  if (Math.abs(resta) < 0.5) return objetivo
  return mostrado + resta / Math.max(1, pasos)
}

/** El indicador pulsa: encendido cinco fases, apagado cinco. */
export const pulso = (fase: number): 'encendido' | 'apagado' => (Math.floor(fase / 5) % 2 === 0 ? 'encendido' : 'apagado')

/** El punto de «en espera» de la tarjeta principal: pulsa entre ● y ○ con el latido; sin animación (sin pulso), ○ fijo. */
export const puntoEspera = (latido: 'encendido' | 'apagado' | undefined): '●' | '○' => (latido === 'encendido' ? '●' : '○')

/** Redibujar solo si lo que se vería cambió. */
export const necesitaRedibujo = (prev: string, sig: string): boolean => prev !== sig

/** El pulso del latido solo se mueve con trabajo (agentes o permisos pendientes); en reposo queda apagado, fijo. */
export const pulsoActivo = (hayTrabajo: boolean, fase: number): 'encendido' | 'apagado' => (hayTrabajo ? pulso(fase) : 'apagado')

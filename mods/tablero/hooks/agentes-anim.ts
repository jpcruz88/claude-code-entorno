// La animación de los subagentes en la terminal: un agente en marcha cambia de cuadro cada
// PASO_AGENTE_MS; uno terminado o fallido queda fijo. Solo cálculo: register.tsx lo usa en el
// glifo de cada carril. (La app de escritorio anima sus cangrejos con CSS, aparte.)

export const PASO_AGENTE_MS = 250

// Cuatro cuadros de marcha: el ciclo de patas de un paso completo.
const MARCHA = ['◐', '◓', '◑', '◒'] as const

const FIJOS: Record<string, string> = { done: '✓', failed: '✗' }

/** El glifo de un carril en el momento `ahora` (ms). */
export const glifoAgente = (ahora: number, estado: string): string => {
  if (estado === 'running') return MARCHA[Math.floor(ahora / PASO_AGENTE_MS) % MARCHA.length]
  return FIJOS[estado] ?? '■'
}

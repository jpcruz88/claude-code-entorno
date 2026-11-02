// La animación de los subagentes en la terminal: un agente en marcha cambia de cuadro cada
// PASO_AGENTE_MS; uno terminado o fallido queda fijo. Solo cálculo: register.tsx lo usa en el
// glifo de cada carril. (La app de escritorio anima sus cangrejos con CSS, aparte.)

export const PASO_AGENTE_MS = 250

// Cuatro cuadros de marcha: el ciclo de patas de un paso completo.
const MARCHA = ['◐', '◓', '◑', '◒'] as const

const FIJOS: Record<string, string> = { done: '✓', failed: '✗' }

/** El glifo de un carril en el momento `ahora` (ms). Con `animado` en falso, un agente en marcha muestra siempre el primer cuadro. */
export const glifoAgente = (ahora: number, estado: string, animado = true): string => {
  if (estado === 'running') return MARCHA[animado ? Math.floor(ahora / PASO_AGENTE_MS) % MARCHA.length : 0]
  return FIJOS[estado] ?? '■'
}

/** El fotograma de marcha que cuenta para redibujar: cambia cada paso solo si hay agentes caminando. */
export const fotogramaDeMarcha = (ahora: number, enMarcha: number): number =>
  enMarcha > 0 ? Math.floor(ahora / PASO_AGENTE_MS) : 0

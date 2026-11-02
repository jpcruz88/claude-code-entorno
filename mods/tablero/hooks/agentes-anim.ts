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

// Cangrejo del carril: un emoji por agente que va de un lado a otro mientras trabaja y se queda
// quieto cuando termina.
export const EMOJI_AGENTES = ['🦀', '🐙', '🐝', '🐜', '🐢', '🦋'] as const

/** Un emoji fijo por agente: el mismo id siempre sale el mismo animal. */
export const emojiDe = (id: string): string => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return EMOJI_AGENTES[h % EMOJI_AGENTES.length]!
}

/** Primera celda del emoji (ocupa dos) en una pista de `ancho` celdas: ida y vuelta, un paso cada PASO. */
export const posicionMarcha = (ahora: number, ancho: number, desfase: number): number => {
  const recorrido = ancho - 2
  if (recorrido <= 0) return 0
  const ciclo = 2 * recorrido
  const t = (((Math.floor(ahora / PASO_AGENTE_MS) + desfase) % ciclo) + ciclo) % ciclo
  return t <= recorrido ? t : ciclo - t
}

export type Trozo = { texto: string; barra: boolean }

/** La pista partida alrededor del emoji (celdas p y p+1). Con `p` null, toda la pista va en `antes`. */
export const pistaCarril = (
  g: { before: number; bar: number; after: number },
  p: number | null,
): { antes: Trozo[]; despues: Trozo[] } => {
  const total = g.before + g.bar + g.after
  const celdas = (a: number, b: number): Trozo[] => {
    const out: Trozo[] = []
    for (let i = a; i < b; i += 1) {
      const barra = i >= g.before && i < g.before + g.bar
      const ch = barra ? '━' : '·'
      const last = out[out.length - 1]
      if (last && last.barra === barra) last.texto += ch
      else out.push({ texto: ch, barra })
    }
    return out
  }
  if (p === null) return { antes: celdas(0, total), despues: [] }
  return { antes: celdas(0, p), despues: celdas(p + 2, total) }
}

// La animación de los subagentes en la terminal: un agente en marcha cambia de cuadro cada PASO_AGENTE_MS; uno
// terminado o fallido queda fijo. Solo cálculo: register.tsx lo usa en los carriles y las tarjetas.

export const PASO_AGENTE_MS = 250

/** El fotograma de marcha que cuenta para redibujar: cambia cada paso solo si hay agentes caminando. */
export const fotogramaDeMarcha = (ahora: number, enMarcha: number): number =>
  enMarcha > 0 ? Math.floor(ahora / PASO_AGENTE_MS) : 0

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

/** Barra sin total conocido: un bloque de tres celdas que va y viene mientras el agente trabaja. */
export const barraIndeterminada = (ahora: number, ancho: number): string => {
  if (!(ancho > 0)) return ''
  const bloque = Math.min(3, ancho)
  const recorrido = ancho - bloque
  if (recorrido === 0) return '█'.repeat(ancho)
  const ciclo = 2 * recorrido
  const t = (((Math.floor(ahora / PASO_AGENTE_MS) % ciclo) + ciclo) % ciclo)
  const pos = t <= recorrido ? t : ciclo - t
  return '░'.repeat(pos) + '█'.repeat(bloque) + '░'.repeat(ancho - bloque - pos)
}

// Indicador por estado (la captura aprobada): una luna que gira mientras el agente trabaja, y un emoji fijo al terminar.
// Cada emoji ocupa dos celdas; todos están en el mismo ancho para que las filas no se desalineen.
const LUNAS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] as const
const FIJOS_EMOJI: Record<string, string> = { done: '✅', failed: '❌', stopped: '🛑' }

/** Cuántos agentes caben en la lista antes de resumir el resto como «anteriores». */
export const CARRILES_VISIBLES = 7

/** El emoji de un agente en el momento `ahora` (ms). `desfase` separa a los agentes que giran a la vez. */
export const emojiDeEstado = (ahora: number, estado: string, desfase = 0, animado = true): string => {
  if (estado === 'running') {
    const paso = animado ? Math.floor(ahora / PASO_AGENTE_MS) + desfase : 0
    return LUNAS[((paso % LUNAS.length) + LUNAS.length) % LUNAS.length]!
  }
  return FIJOS_EMOJI[estado] ?? '⏳'
}

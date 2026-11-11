// La clave que decide si el reloj del panel pide un redibujo, y el ritmo del reloj. Incluye el fotograma de marcha:
// sin él, el glifo de un agente caminando saltaría solo cada minuto, no cada paso.
import { fotogramaDeMarcha } from './agentes-anim'

export type EntradaClave = {
  contextoPct: number | null
  limites: { pct: number }[]
  /** Fase del latido, si lo hay. */
  pulso?: string
  ahora: number
  agentesActivos: number
  permisosPendientes: number
  costoUsd: number | null
  /** Marco de la animación del mapa: solo mientras el mapa se anima; sin él la clave no cambia con cada cuadro. */
  marco?: number
  /** El mapa enseña relojes con segundos: la clave cambia cada segundo en vez de cada minuto. */
  segundos?: boolean
}

/**
 * Cómo corre el reloj del panel. `rapido`: hay trabajo en curso y animación, un cuadro cada 120 ms. `lento`: un cuadro
 * por segundo, para que los relojes avancen y un agente que termina se vea al momento. El reloj se para del todo
 * mientras el panel no se ve (ver register.tsx).
 */
export type ModoReloj = 'rapido' | 'lento'

export const modoReloj = (e: { animacion: boolean; hayTrabajo: boolean }): ModoReloj => (e.animacion && e.hayTrabajo ? 'rapido' : 'lento')

/** Milisegundos entre cuadros en cada modo. Cada cuadro solo redibuja si la clave cambió. */
export const PERIODO_RELOJ_MS: Record<ModoReloj, number> = { rapido: 120, lento: 1000 }

export const claveDeRedibujo = (e: EntradaClave): string =>
  JSON.stringify([
    e.contextoPct,
    e.limites.map(l => l.pct),
    e.pulso,
    Math.floor(e.ahora / (e.segundos ? 1000 : 60_000)),
    e.agentesActivos,
    fotogramaDeMarcha(e.ahora, e.agentesActivos),
    e.permisosPendientes,
    e.costoUsd,
    ...(e.marco === undefined ? [] : [e.marco]),
  ])

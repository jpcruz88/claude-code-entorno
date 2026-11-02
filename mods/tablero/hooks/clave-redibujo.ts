// La clave que decide si el reloj del panel pide un redibujo. Incluye el fotograma de marcha:
// sin él, el glifo de un agente caminando saltaría solo cada minuto, no cada paso.
import { fotogramaDeMarcha } from './agentes-anim'

export type EntradaClave = {
  contextoPct: number | null
  limites: { pct: number }[]
  pulso?: number
  ahora: number
  agentesActivos: number
  permisosPendientes: number
  costoUsd: number
}

export const claveDeRedibujo = (e: EntradaClave): string =>
  JSON.stringify([
    e.contextoPct,
    e.limites.map(l => l.pct),
    e.pulso,
    Math.floor(e.ahora / 60_000),
    e.agentesActivos,
    fotogramaDeMarcha(e.ahora, e.agentesActivos),
    e.permisosPendientes,
    e.costoUsd,
  ])

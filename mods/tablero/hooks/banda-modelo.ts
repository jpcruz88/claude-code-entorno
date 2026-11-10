// Lo que el reloj del panel mira para decidir si redibuja: los valores de la sesión que cambian en pantalla.

export type Tono = 'normal' | 'tenue' | 'aviso' | 'peligro' | 'acento'

export type BandaEntrada = {
  cwd: string
  modelo: string
  costoUsd: number | null
  contextoPct: number | null
  agentesActivos: number
  agentesTotal: number
  permisosPendientes: number
  permisosDenegados: number
  limites: { kind: string; pct: number; resetsAt: number | null }[]
  ahora: number
  columnas: number
  /** Fase del indicador de actividad; sin ella, siempre encendido. */
  pulso?: 'encendido' | 'apagado'
}

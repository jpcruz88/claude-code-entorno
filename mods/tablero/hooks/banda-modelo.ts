// Lo que el reloj del panel mira para decidir si redibuja: los valores de la sesión que cambian en pantalla, y los
// tonos de texto de la barra de vida. (Es lo que queda de la banda sobre el prompt, que el mod ya no dibuja.)

export type Tono = 'normal' | 'tenue' | 'aviso' | 'peligro' | 'acento'

export type BandaEntrada = {
  costoUsd: number | null
  contextoPct: number | null
  agentesActivos: number
  permisosPendientes: number
  limites: { kind: string; pct: number }[]
  ahora: number
  /** Fase del indicador de actividad; sin ella, siempre encendido. */
  pulso?: 'encendido' | 'apagado'
}

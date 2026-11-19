export type CorridaViva = { lado: string; ronda: number; tarea: string; modelo: string; seg: number }
export type EstadoAduana = {
  titulo: string
  hechas: number
  total: number
  invalidas: number
  costo_usd: number
  fase: number
  fases: number
  terminado: boolean
  en_curso: CorridaViva[]
  actualizado: number
}

declare module 'claude-code' {
  interface PluginState {
    'aduana-panel': { estado: EstadoAduana | null }
  }
}

export type EstadoPlan = 'running' | 'needs_input' | 'error' | 'done'
export type EstadoPaso = 'pending' | 'active' | 'done' | 'failed'
export type Paso = { title: string; status: EstadoPaso }
// one bar: its steps flat, its state, the note a person must read (a question, a failure), and its clock
export type Plan = {
  id: string
  title: string
  pasos: Paso[]
  estado: EstadoPlan
  note: string | null
  startedAt: number
  endedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'barra-plan': { planes: Plan[] }
  }
}

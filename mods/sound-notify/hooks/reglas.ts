export const UMBRAL_MS = 30_000

export function debeSonarTurno(e: {
  durationMs: number
  reason: string
  agentId?: string
}): boolean {
  return e.agentId === undefined && e.reason !== 'aborted' && e.durationMs > UMBRAL_MS
}

/**
 * El aviso de permiso suena solo cuando la persona tiene algo que responder: un `ask` de una llamada real (con id).
 * En modo automático el `ask` lo decide el clasificador, salvo el que hizo el hook de un plugin (`plugin`).
 */
export function debeSonarPermiso(e: {
  decision: string
  tool_use_id?: string
  plugin?: string
  modo: string | undefined
}): boolean {
  if (e.decision !== 'ask' || !e.tool_use_id) return false
  return e.modo !== 'auto' || e.plugin !== undefined
}

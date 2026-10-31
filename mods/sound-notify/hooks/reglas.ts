export const UMBRAL_MS = 30_000

export function debeSonarTurno(e: {
  durationMs: number
  reason: string
  agentId?: string
}): boolean {
  return e.agentId === undefined && e.reason !== 'aborted' && e.durationMs > UMBRAL_MS
}

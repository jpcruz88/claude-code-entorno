// El estado del servicio de Claude según su página pública (status.claude.com, API de Statuspage).

export const URL_SERVICIO = 'https://status.claude.com/api/v2/status.json'

const TEXTOS: Record<string, { ok: boolean; texto: string }> = {
  none: { ok: true, texto: 'Claude sin incidencias' },
  minor: { ok: false, texto: 'Claude con fallos menores' },
  major: { ok: false, texto: 'Claude con fallos graves' },
  critical: { ok: false, texto: 'Claude caído' },
  maintenance: { ok: false, texto: 'Claude en mantenimiento' },
}

/** La respuesta de la página de estado; null si no es 2xx, no es JSON o el indicador es desconocido. */
export const leerServicio = (status: number, texto: string): { ok: boolean; texto: string } | null => {
  if (status < 200 || status > 299) return null
  try {
    const indicador = (JSON.parse(texto) as { status?: { indicator?: unknown } })?.status?.indicator
    return typeof indicador === 'string' ? (TEXTOS[indicador] ?? null) : null
  } catch {
    return null
  }
}

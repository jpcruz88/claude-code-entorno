// Lo que solo recibe la statusline y deja en ~/.claude/tablero/linea/<session_id>.json (ver claude/statusline.sh).
// Solo lectura y validación: un campo con otro tipo queda en null y un archivo viejo no vale.

export type CacheLinea = { warm: boolean; ttl: string | null; expires_at: number | null; hit_ratio: number | null }
export type PrLinea = { number: number; url: string | null; review_state: string | null }
export type Linea = {
  actualizado: number
  session_id: string
  session_name: string | null
  thinking: boolean | null
  prompt_cache: CacheLinea | null
  pr: PrLinea | null
}

const MAX_EDAD_S = 86_400

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** El archivo de la statusline, o null si no se puede leer, si falta su sesión o si tiene más de 24 h. */
export const leerLinea = (texto: string, ahoraS: number): Linea | null => {
  let datos: Record<string, unknown> | null
  try {
    datos = obj(JSON.parse(texto))
  } catch {
    return null
  }
  const id = txt(datos?.session_id)
  const actualizado = num(datos?.actualizado)
  if (!datos || !id || actualizado === null || ahoraS - actualizado > MAX_EDAD_S) return null
  const pc = obj(datos.prompt_cache)
  const pr = obj(datos.pr)
  return {
    actualizado,
    session_id: id,
    session_name: txt(datos.session_name),
    thinking: typeof datos.thinking === 'boolean' ? datos.thinking : null,
    prompt_cache:
      pc && typeof pc.warm === 'boolean'
        ? { warm: pc.warm, ttl: txt(pc.ttl), expires_at: num(pc.expires_at), hit_ratio: num(pc.hit_ratio) }
        : null,
    pr: pr && num(pr.number) !== null ? { number: num(pr.number) as number, url: txt(pr.url), review_state: txt(pr.review_state) } : null,
  }
}

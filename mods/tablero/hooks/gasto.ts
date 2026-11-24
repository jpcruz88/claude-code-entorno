// Lo que más contexto consume en la sesión: los resultados de herramienta más grandes y los archivos releídos.
// Solo cálculo sobre los mensajes de la sesión; los tokens se estiman a 4 caracteres por token.
import type { SessionMessage } from 'claude-code'

export type FilaGasto = { llamada: string; motivo: string; tokens: number }

const MAX_FILAS = 4
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Cómo se nombra una llamada: la herramienta y lo esencial de su entrada. */
const nombreDe = (tool: string, input: Record<string, unknown>): string => {
  const dato = input.file_path ?? input.command ?? input.pattern ?? input.url ?? input.path
  return typeof dato === 'string' && dato ? `${tool} ${corto(dato.replace(/\s+/g, ' '), 40)}` : tool
}

export const topGasto = (mensajes: readonly SessionMessage[]): FilaGasto[] => {
  const grupos = new Map<string, { veces: number; tokens: number; lineas: number; lectura: boolean }>()
  for (const m of mensajes) {
    for (const u of m.toolUses ?? []) {
      if (typeof u.text !== 'string' || u.text === '') continue
      const clave = nombreDe(u.tool, u.input ?? {})
      const g = grupos.get(clave) ?? { veces: 0, tokens: 0, lineas: 0, lectura: u.tool === 'Read' }
      g.veces += 1
      g.tokens += Math.ceil(u.text.length / 4)
      g.lineas = Math.max(g.lineas, u.text.split('\n').filter(Boolean).length)
      grupos.set(clave, g)
    }
  }
  return [...grupos]
    .map(([llamada, g]) => ({
      llamada,
      motivo: g.lectura && g.veces > 1 ? `leído ${g.veces} veces` : `salida de ${g.lineas} líneas`,
      tokens: g.tokens,
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, MAX_FILAS)
}

/** Un consejo cuando un archivo se leyó entero más de una vez; null si no hay nada que aconsejar. */
export const consejoGasto = (top: readonly FilaGasto[]): string | null => {
  const releido = top.find(t => t.llamada.startsWith('Read ') && t.motivo.startsWith('leído '))
  if (!releido) return null
  const veces = /leído (\d+) veces/.exec(releido.motivo)?.[1]
  return `Consejo: ${releido.llamada.slice(5)} se leyó ${veces} veces; pide sus líneas exactas en vez del archivo entero.`
}

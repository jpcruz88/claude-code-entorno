// Qué configuración carga la sesión: archivos CLAUDE.md, reglas, hooks y servidores MCP. Solo cálculo.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** La fila Config: «1 archivo de instrucciones · 10 reglas · 33 hooks · 9 conexiones MCP». */
export const contarConfig = (x: { claudeMd: number; reglas: number; hooks: number; mcp: number }): string =>
  [
    plural(x.claudeMd, 'archivo de instrucciones', 'archivos de instrucciones'),
    plural(x.reglas, 'regla', 'reglas'),
    plural(x.hooks, 'hook', 'hooks'),
    plural(x.mcp, 'conexión MCP', 'conexiones MCP'),
  ].join(' · ')

/** Un CLAUDE.md que solo importa otros archivos (`@AGENTS.md`) no aporta instrucciones propias. */
export const soloImporta = (texto: string): boolean => {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  return lineas.length > 0 && lineas.every(l => l.startsWith('@'))
}

/** Los comandos de hook de un `hooks` de settings.json: por evento, por grupo, cada entrada de su `hooks`. */
export const contarHooks = (hooks: unknown): number => {
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return 0
  let n = 0
  for (const grupos of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(grupos)) continue
    for (const g of grupos) {
      const lista = g && typeof g === 'object' ? (g as { hooks?: unknown }).hooks : null
      if (Array.isArray(lista)) n += lista.length
    }
  }
  return n
}

/** Cuántos servidores MCP distintos aparecen en los nombres de herramienta `mcp__<servidor>__<herramienta>`. */
export const servidoresMcp = (herramientas: readonly string[]): number =>
  new Set(herramientas.map(h => /^mcp__(.+?)__/.exec(h)?.[1]).filter((x): x is string => Boolean(x))).size

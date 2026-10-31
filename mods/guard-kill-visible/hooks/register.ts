import type { EngineInterface, Register, Timer } from 'claude-code'
import { detectarMatarPorNombre } from './patrones'

const MARCA_MS = 8_000
let limpieza: Timer | undefined

function avisarSiPeligroso($: EngineInterface, comando: string) {
  const etiqueta = detectarMatarPorNombre(comando)
  if (!etiqueta) return

  $.ui.toast(`guard-kill: comando que mata procesos por nombre (${etiqueta})`)
  $.ui.status(`⚠ guard-kill: ${etiqueta}`)
  limpieza?.cancel()
  limpieza = $.clock.after(MARCA_MS, () => $.ui.status(undefined))
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    avisarSiPeligroso($, e.command)
    return next(e)
  })

  on('tool.call', { tool: 'PowerShell' }, ($, e, next) => {
    avisarSiPeligroso($, e.command)
    return next(e)
  })
}

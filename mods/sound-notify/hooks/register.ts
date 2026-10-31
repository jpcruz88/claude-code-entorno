import type { EngineInterface, Register } from 'claude-code'
import { debeSonarTurno } from './reglas'

async function avisar($: EngineInterface, texto: string) {
  const envio = await $.ui.notify(texto, { title: $.plugin.name })
  if (!envio.isSent) $.ui.toast(texto)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (debeSonarTurno(e)) await avisar($, `Turno terminado (${Math.round(e.durationMs / 1000)} s)`)
    return r
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // Solo una llamada real (con id): las consultas de otros plugins no esperan a nadie.
    if (r.decision === 'ask' && e.tool_use_id) {
      await avisar($, 'Claude espera un permiso')
    }
    return r
  })
}

import type { EngineInterface, Register } from 'claude-code'
import { debeSonarPermiso, debeSonarTurno } from './reglas'

async function avisar($: EngineInterface, texto: string) {
  const envio = await $.ui.notify(texto, { title: $.plugin.name })
  if (!envio.isSent) $.ui.toast(texto)
}

export const register: Register = on => {
  // El modo de permisos de la sesión, como lo traen el prompt del usuario y el lanzamiento de un agente del lead.
  let modo: string | undefined

  on('classic.UserPromptSubmit', async (_$, e, next) => {
    if (e.permission_mode) modo = e.permission_mode
    return next(e)
  })

  on('agent.spawn', async (_$, e, next) => {
    if (!e.parentAgentId && e.permissionMode) modo = e.permissionMode
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (debeSonarTurno(e)) await avisar($, `Turno terminado (${Math.round(e.durationMs / 1000)} s)`)
    return r
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // Solo una llamada real (con id) que la persona deba responder: las consultas de otros plugins no esperan a
    // nadie y, en modo automático, decide el clasificador.
    if (debeSonarPermiso({ decision: r.decision, tool_use_id: e.tool_use_id, plugin: r.plugin, modo })) {
      await avisar($, 'Claude espera un permiso')
    }
    return r
  })
}

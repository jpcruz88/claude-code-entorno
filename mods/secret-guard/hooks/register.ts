import type { EngineInterface, Register } from 'claude-code'
import { detectarSecreto, esLecturaSensible } from './secretos'

const permitidos = new Set<string>()

function rechazarSiHaySecreto(texto: string) {
  const hallazgo = detectarSecreto(texto)
  if (!hallazgo) return undefined
  return {
    deny: `secret-guard: se detectó ${hallazgo.tipo} (${hallazgo.muestra}). Usa una variable de entorno o un gestor de secretos en lugar de escribirlo.`,
  }
}

async function revisarLectura($: EngineInterface, ruta: string) {
  if (!esLecturaSensible(ruta) || permitidos.has(ruta)) return undefined
  const nombre = ruta.split(/[\\/]/).pop()
  const rechazo = { deny: `secret-guard: lectura de ${nombre} cancelada (archivo sensible).` }
  let respuesta: string
  try {
    respuesta = await $.ui.ask(`Claude quiere leer un archivo sensible (${nombre}). ¿Permitirlo?`, ['Permitir', 'Cancelar'])
  } catch {
    // Sin nadie a quien preguntar, un guardia que bloquea se queda del lado seguro.
    return rechazo
  }
  if (respuesta !== 'Permitir') return rechazo
  permitidos.add(ruta)
  return undefined
}

// Si el hook falla, la llamada pasa (un guardia roto que bloquea todo obliga a apagarlo) y se avisa.
function alFallar<E, R>($: EngineInterface, e: E, next: (e: E) => R): R {
  $.ui.toast('secret-guard falló: la llamada pasó sin revisarse')
  return next(e)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Write' }, (_, e, next) => rechazarSiHaySecreto(e.content) ?? next(e)).catch(alFallar)
  on('tool.call', { tool: 'Edit' }, (_, e, next) => rechazarSiHaySecreto(e.new_string) ?? next(e)).catch(alFallar)
  on('tool.call', { tool: 'NotebookEdit' }, (_, e, next) => rechazarSiHaySecreto(e.new_source) ?? next(e)).catch(alFallar)
  on('tool.call', { tool: 'Bash' }, (_, e, next) => rechazarSiHaySecreto(e.command) ?? next(e)).catch(alFallar)
  on('tool.call', { tool: 'PowerShell' }, (_, e, next) => rechazarSiHaySecreto(e.command) ?? next(e)).catch(alFallar)
  on('tool.call', { tool: 'Read' }, async ($, e, next) => (await revisarLectura($, e.file_path)) ?? next(e)).catch(alFallar)
}

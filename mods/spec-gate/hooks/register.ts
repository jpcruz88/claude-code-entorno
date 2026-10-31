import type { EngineInterface, Register } from 'claude-code'
import { dentroDe, esCodigoDeProduccion } from './rutas'
import { estadoSpecs } from './specs'

type Edicion = { file_path: string; agentId?: string }

const SEGUIR = 'Seguir sin spec'
const CANCELAR = 'Cancelar'

async function revisarSpec($: EngineInterface, e: Edicion, resueltos: Set<string>) {
  if (e.agentId || !esCodigoDeProduccion(e.file_path)) return undefined
  const raiz = await $.session.root()
  if (!dentroDe(e.file_path, raiz)) return undefined
  const clave = `${await $.session.id()}|${raiz}`
  if (resueltos.has(clave)) return undefined

  const carpeta = `${raiz.replace(/[\\/]+$/, '')}/docs/superpowers/specs`
  if (!(await $.fs.exists(carpeta))) return undefined
  if (estadoSpecs(await $.fs.list(carpeta), Date.now()) === 'reciente') return undefined

  let respuesta: string
  try {
    respuesta = await $.ui.ask(
      'No hay una spec de los últimos 14 días en docs/superpowers/specs y Claude va a editar código de producción. ¿Seguir?',
      [SEGUIR, CANCELAR],
    )
  } catch {
    // Sin nadie a quien preguntar este guardia no bloquea; la próxima edición vuelve a preguntar.
    return undefined
  }
  if (respuesta === CANCELAR) {
    return { deny: 'spec-gate: edición cancelada. Escribe y aprueba una spec en docs/superpowers/specs antes de cambiar código.' }
  }
  if (respuesta === SEGUIR) resueltos.add(clave)
  return undefined
}

// Si el hook falla la llamada pasa: este guardia solo pregunta.
function pasar<E, R>(_$: EngineInterface, e: E, next: (e: E) => R): R {
  return next(e)
}

export const register: Register = on => {
  const resueltos = new Set<string>()

  on('tool.call', { tool: 'Write' }, async ($, e, next) => (await revisarSpec($, e, resueltos)) ?? next(e)).catch(pasar)
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => (await revisarSpec($, e, resueltos)) ?? next(e)).catch(pasar)
}

import type { EngineInterface, Register } from 'claude-code'
import { dentroDe, esArchivoDePrueba, esCodigoDeProduccion } from './rutas'

type Edicion = { file_path: string; agentId?: string }
type Estado = { conPrueba: Set<string>; resueltos: Set<string> }

const SEGUIR = 'Seguir sin prueba'
const CANCELAR = 'Cancelar'

async function revisarPrueba($: EngineInterface, e: Edicion, estado: Estado) {
  if (e.agentId) return undefined
  const raiz = await $.session.root()
  if (!dentroDe(e.file_path, raiz)) return undefined
  const clave = `${await $.session.id()}|${raiz}`

  if (esArchivoDePrueba(e.file_path)) {
    estado.conPrueba.add(clave)
    return undefined
  }
  if (!esCodigoDeProduccion(e.file_path)) return undefined
  if (estado.conPrueba.has(clave) || estado.resueltos.has(clave)) return undefined

  let respuesta: string
  try {
    respuesta = await $.ui.ask(
      'Claude va a editar código de producción y en esta sesión todavía no se tocó ningún archivo de prueba. ¿Seguir?',
      [SEGUIR, CANCELAR],
    )
  } catch {
    // Sin nadie a quien preguntar este guardia no bloquea; la próxima edición vuelve a preguntar.
    return undefined
  }
  if (respuesta === CANCELAR) {
    return { deny: 'tdd-gate: edición cancelada. Escribe primero la prueba que falle y luego cambia el código.' }
  }
  if (respuesta === SEGUIR) estado.resueltos.add(clave)
  return undefined
}

// Si el hook falla la llamada pasa: este guardia solo pregunta.
function pasar<E, R>(_$: EngineInterface, e: E, next: (e: E) => R): R {
  return next(e)
}

export const register: Register = on => {
  const estado: Estado = { conPrueba: new Set(), resueltos: new Set() }

  on('tool.call', { tool: 'Write' }, async ($, e, next) => (await revisarPrueba($, e, estado)) ?? next(e)).catch(pasar)
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => (await revisarPrueba($, e, estado)) ?? next(e)).catch(pasar)
}

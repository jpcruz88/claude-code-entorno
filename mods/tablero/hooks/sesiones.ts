// Las sesiones de esta máquina: cada tablero deja su estado en ~/.claude/tablero/sesiones/<id>.json y lee las demás.
import type { RegistroSesion } from '../types'

const MAX_EDAD_MS = 24 * 3_600_000
/** Cada tablero escribe su registro cada 5 s: sin noticias en 30 s, la sesión ya no corre (se cerró o se colgó). */
const VIVA_MS = 30_000
const ORDEN: Record<RegistroSesion['estado'], number> = { espera: 0, trabajando: 1, inactiva: 2 }

/** Esperar a la persona (un permiso o una pregunta de un plan) gana a estar trabajando. */
export const estadoSesion = (x: { trabajando: boolean; permisosPendientes: number; planEspera: boolean }): RegistroSesion['estado'] =>
  x.permisosPendientes > 0 || x.planEspera ? 'espera' : x.trabajando ? 'trabajando' : 'inactiva'

const valido = (v: unknown): v is RegistroSesion => {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  const num = (k: string) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)
  return (
    typeof r.id === 'string' &&
    (r.nombre === null || typeof r.nombre === 'string') &&
    typeof r.carpeta === 'string' &&
    (r.estado === 'trabajando' || r.estado === 'espera' || r.estado === 'inactiva') &&
    num('desde') && num('costo') && num('base') && num('actualizado') &&
    typeof r.dia === 'string'
  )
}

/** Las sesiones que siguen abiertas: escribieron su registro hace 30 s o menos. Las cerradas siguen en el
 *  registro (cuentan para el gasto del día), pero no están abiertas. */
export const abiertas = (otras: readonly RegistroSesion[], ahoraMs: number): RegistroSesion[] =>
  otras.filter(r => ahoraMs - r.actualizado <= VIVA_MS)

/** Los registros de las demás sesiones: sin la propia, sin los rotos ni los de más de 24 h, los que esperan primero.
 *  Una sesión que lleva más de 30 s sin escribir cuenta como inactiva desde su última escritura. */
export const leerSesiones = (textos: readonly { nombre: string; texto: string }[], propia: string, ahoraMs: number): RegistroSesion[] =>
  textos
    .map(({ texto }) => {
      try {
        return JSON.parse(texto) as unknown
      } catch {
        return null
      }
    })
    .filter(valido)
    .filter(r => r.id !== propia && ahoraMs - r.actualizado <= MAX_EDAD_MS)
    .map(r => (ahoraMs - r.actualizado > VIVA_MS && r.estado !== 'inactiva' ? { ...r, estado: 'inactiva' as const, desde: r.actualizado } : r))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.actualizado - a.actualizado)

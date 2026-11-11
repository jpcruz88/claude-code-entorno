// La revisión «Al día» como filas para la caja del tablero. Sin red ni disco: recibe el texto de resultado.json.

export type FilaAlDia = { marca: '↑' | '✗' | '…'; nombre: string; detalle: string; tipo: string; aviso: boolean }
export type AlDia = { cuando: string; filas: FilaAlDia[]; alDia: number }

/** Un resultado más viejo que esto ya no se enseña. */
const CADUCIDAD_MS = 24 * 3600 * 1000

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : [])
const dos = (n: number): string => String(n).padStart(2, '0')

/** `hoy HH:MM`, `ayer HH:MM` o, para otro día (un reloj adelantado), `DD/MM HH:MM`, en hora local. */
const cuandoDe = (ts: number, ahora: number): string => {
  const d = new Date(ts)
  const hoy = new Date(ahora)
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1).getTime()
  const dia = a === b ? 'hoy' : a === ayer ? 'ayer' : `${dos(d.getDate())}/${dos(d.getMonth() + 1)}`
  return `${dia} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

export const leerAlDia = (textoJson: string | null, ahora: number): AlDia | null => {
  if (textoJson === null) return null
  let o: unknown
  try {
    o = JSON.parse(textoJson)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return null
  const ts = o.ts * 1000
  if (ahora - ts > CADUCIDAD_MS) return null

  const fallos: FilaAlDia[] = lista(o.fallos).map(f => ({
    marca: '✗',
    nombre: texto(f.nombre),
    detalle: 'no se pudo bajar · sigue la anterior',
    tipo: texto(f.tipo),
    aviso: false,
  }))
  const cambios = lista(o.cambios).map(c => ({
    marca: '↑' as const,
    nombre: texto(c.nombre),
    detalle: `${texto(c.antes)} → ${texto(c.despues)}`,
    tipo: texto(c.tipo),
    aviso: c.cambio_texto === true,
  }))
  const pendientes: FilaAlDia[] = lista(o.pendientes).map(p => ({
    marca: '…',
    nombre: texto(p.nombre),
    detalle: 'pendiente · se reintenta en la próxima sesión',
    tipo: texto(p.tipo),
    aviso: false,
  }))
  const filas = [...fallos, ...cambios.filter(c => c.aviso), ...cambios.filter(c => !c.aviso), ...pendientes]
  if (filas.length === 0) return null
  const alDia = typeof o.al_dia === 'number' && Number.isFinite(o.al_dia) ? o.al_dia : 0
  return { cuando: cuandoDe(ts, ahora), filas, alDia }
}

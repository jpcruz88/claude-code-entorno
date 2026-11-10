// La franja grande de situación: un color y un rótulo que dicen de lejos si el agente trabaja, te espera,
// está detenido o no hace nada. Solo decide y nombra; el dibujo lo pone mapa.ts y el color, el render.

export type Situacion = 'trabajando' | 'espera' | 'detenido' | 'inactivo'

/** Cuántos errores seguidos dejan al agente «detenido». */
export const UMBRAL_ERRORES = 3

export type EntradaSituacion = { trabajando: boolean; permisosPendientes: number; rachaErrores: number }

/** Un permiso pendiente manda (lo desbloqueas tú); después, los errores seguidos, el trabajo y, si no hay nada, inactivo. */
export const situacionDe = (e: EntradaSituacion): Situacion => {
  if (e.permisosPendientes > 0) return 'espera'
  if (e.rachaErrores >= UMBRAL_ERRORES) return 'detenido'
  return e.trabajando ? 'trabajando' : 'inactivo'
}

/** Cómo se anima el glifo: el spinner gira, el latido alterna ○/●, el resto es fijo. */
export type GlifoBanner = 'spin' | 'latido' | '▲' | '■'

export type Banner = { rotulo: string; glifo: GlifoBanner; tinta: 'lead' | 'amb' | 'warn' | 'mut'; detalle: string }

export type DetalleBanner = { turno?: string; permisos?: number; errores?: number }

export const bannerDe = (s: Situacion, d: DetalleBanner): Banner => {
  if (s === 'trabajando') return { rotulo: 'TRABAJANDO', glifo: 'spin', tinta: 'lead', detalle: d.turno ? `turno ${d.turno}` : 'el lead trabaja' }
  if (s === 'espera') {
    const n = d.permisos ?? 1
    return { rotulo: 'TE ESPERA', glifo: '▲', tinta: 'amb', detalle: `${n} ${n === 1 ? 'permiso pendiente' : 'permisos pendientes'} · responde para seguir` }
  }
  if (s === 'detenido') return { rotulo: 'DETENIDO', glifo: '■', tinta: 'warn', detalle: `${d.errores ?? UMBRAL_ERRORES} errores seguidos · el lead paró` }
  return { rotulo: 'EN ESPERA', glifo: 'latido', tinta: 'mut', detalle: 'sin trabajo · el lead espera' }
}

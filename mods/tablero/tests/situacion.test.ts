import { expect, test } from 'claude-code/testing'

import { UMBRAL_ERRORES, bannerDe, situacionDe } from '../hooks/situacion'

// La franja grande de arriba dice, con un color, si el agente trabaja, te espera, está detenido o no hace nada.

const base = { trabajando: false, permisosPendientes: 0, rachaErrores: 0 }

test('sin trabajo, sin permisos y sin errores el agente está inactivo', () => {
  expect(situacionDe(base)).toBe('inactivo')
})

test('con trabajo en curso está trabajando', () => {
  expect(situacionDe({ ...base, trabajando: true })).toBe('trabajando')
})

test('un permiso pendiente lo deja esperándote, aunque siga habiendo trabajo en curso', () => {
  expect(situacionDe({ ...base, trabajando: true, permisosPendientes: 1 })).toBe('espera')
})

test('el umbral de errores seguidos es 3', () => {
  expect(UMBRAL_ERRORES).toBe(3)
})

test('con errores seguidos en el umbral está detenido', () => {
  expect(situacionDe({ ...base, trabajando: true, rachaErrores: UMBRAL_ERRORES })).toBe('detenido')
})

test('con un error menos que el umbral sigue trabajando', () => {
  expect(situacionDe({ ...base, trabajando: true, rachaErrores: UMBRAL_ERRORES - 1 })).toBe('trabajando')
})

test('un permiso pendiente gana a los errores: lo que desbloquea al agente eres tú', () => {
  expect(situacionDe({ ...base, permisosPendientes: 2, rachaErrores: UMBRAL_ERRORES })).toBe('espera')
})

test('cada situación tiene su rótulo, su color y su detalle', () => {
  expect(bannerDe('trabajando', { turno: '0:42' })).toEqual({ rotulo: 'TRABAJANDO', glifo: 'spin', tinta: 'lead', detalle: 'turno 0:42' })
  expect(bannerDe('espera', { permisos: 2 })).toEqual({ rotulo: 'TE ESPERA', glifo: '▲', tinta: 'amb', detalle: '2 permisos pendientes · responde para seguir' })
  expect(bannerDe('detenido', { errores: 3 })).toEqual({ rotulo: 'DETENIDO', glifo: '■', tinta: 'warn', detalle: '3 errores seguidos · el lead paró' })
  expect(bannerDe('inactivo', {})).toEqual({ rotulo: 'EN ESPERA', glifo: 'latido', tinta: 'mut', detalle: 'sin trabajo · el lead espera' })
})

test('con un solo permiso el detalle va en singular', () => {
  expect(bannerDe('espera', { permisos: 1 }).detalle).toBe('1 permiso pendiente · responde para seguir')
})

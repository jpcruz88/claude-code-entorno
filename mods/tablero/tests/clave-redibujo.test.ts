import { expect, test } from 'claude-code/testing'

import { PASO_AGENTE_MS } from '../hooks/agentes-anim'
import { PERIODO_RELOJ_MS, claveDeRedibujo, modoReloj } from '../hooks/clave-redibujo'

const base = {
  contextoPct: 40,
  limites: [{ kind: 'five_hour', pct: 10 }],
  pulso: 'apagado',
  ahora: 0,
  agentesActivos: 0,
  permisosPendientes: 0,
  costoUsd: 0,
}

test('con agentes caminando, la clave cambia cuando cambia el cuadro de marcha', () => {
  const a = claveDeRedibujo({ ...base, agentesActivos: 1, ahora: 0 })
  const b = claveDeRedibujo({ ...base, agentesActivos: 1, ahora: PASO_AGENTE_MS })
  expect(a).not.toBe(b)
})

test('sin agentes caminando, la clave no cambia con el paso del tiempo (dentro del mismo minuto)', () => {
  const a = claveDeRedibujo({ ...base, agentesActivos: 0, ahora: 0 })
  const b = claveDeRedibujo({ ...base, agentesActivos: 0, ahora: PASO_AGENTE_MS })
  expect(a).toBe(b)
})

test('el reloj va rápido solo con trabajo y animación; si no, mira el estado cada segundo', () => {
  expect(modoReloj({ animacion: true, hayTrabajo: true })).toBe('rapido')
  expect(modoReloj({ animacion: true, hayTrabajo: false })).toBe('lento')
  expect(modoReloj({ animacion: false, hayTrabajo: true })).toBe('lento')
  expect(PERIODO_RELOJ_MS.rapido).toBe(120)
  expect(PERIODO_RELOJ_MS.lento).toBe(1000)
})

test('con relojes de segundos la clave cambia cada segundo; sin ellos, cada minuto', () => {
  expect(claveDeRedibujo({ ...base, ahora: 1000, segundos: true })).not.toBe(claveDeRedibujo({ ...base, ahora: 2000, segundos: true }))
  expect(claveDeRedibujo({ ...base, ahora: 1000 })).toBe(claveDeRedibujo({ ...base, ahora: 2000 }))
})

test('con el mapa animado, la clave cambia con cada marco de la animación', () => {
  const a = claveDeRedibujo({ ...base, marco: 1 })
  const b = claveDeRedibujo({ ...base, marco: 2 })
  expect(a).not.toBe(b)
  // Sin mapa (sin `marco`) la clave es la de siempre.
  expect(claveDeRedibujo(base)).toBe(claveDeRedibujo({ ...base, marco: undefined }))
})

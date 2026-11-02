import { expect, test } from 'claude-code/testing'

import { PASO_AGENTE_MS } from '../hooks/agentes-anim'
import { PERIODO_RELOJ_MS, claveDeRedibujo } from '../hooks/clave-redibujo'

const base = {
  contextoPct: 40,
  limites: [{ kind: 'five_hour', pct: 10 }],
  pulso: 0,
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

test('sin animación, el reloj mira el estado cada segundo para que un agente que termina se vea al momento', () => {
  expect(PERIODO_RELOJ_MS(true)).toBe(120)
  expect(PERIODO_RELOJ_MS(false)).toBeLessThanOrEqual(1000)
})

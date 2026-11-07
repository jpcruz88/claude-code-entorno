// La caja JEV: total de decisiones y una fila por tipo, con su confianza y sharp/split. Solo dibujo: los datos
// vienen de resumenJev (jev-modelo.ts), que ya los separa por sesión.
import type { EngineInterface } from 'claude-code'

import type { Colors } from './core'
import type { FilaJev } from './jev-modelo'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>
export type ResumenJevPanel = { total: number; filas: FilaJev[] }

/** Separador de miles con coma: 1382 → 1,382. */
export const miles = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Celdas de la barra de confianza. */
export const CELDAS_JEV = 8

/** La barra de confianza: 8 celdas, con media celda («▌») cuando la fracción pasa de 0,5; sin dato, todo vacío. */
export const barraJev = (confianza: number | null, celdas = CELDAS_JEV) => {
  if (confianza === null) return '░'.repeat(celdas)
  const x = Math.min(1, Math.max(0, confianza)) * celdas
  const llenas = Math.floor(x)
  const media = x - llenas >= 0.5 ? '▌' : ''
  return '█'.repeat(llenas) + media + '░'.repeat(celdas - llenas - media.length)
}

/** Ancho que pide una fila completa: etiqueta 18, barra 8, valor 4, sharp/split 5, con un espacio entre cada una. */
const FILA_COMPLETA = 38

/** La caja JEV de `w` columnas: total, filas y la leyenda de sharp y split. Sin decisiones, dice que aún no hay. */
export const panelJev = (els: Elementos, colores: Colors, w: number, resumen: ResumenJevPanel) => {
  const { Box, Text } = els
  const compacta = w - 4 < FILA_COMPLETA
  const fila = (f: FilaJev) => {
    const valor = f.confianza === null ? '—' : f.confianza.toFixed(2)
    const forma = f.sharp === null ? '' : f.sharp ? 'sharp' : 'split'
    if (compacta) {
      return <Text wrap="truncate">{[f.etiqueta, valor, forma].filter(Boolean).join(' ')}</Text>
    }
    return (
      <Box columnGap={1}>
        <Box width={18} flexShrink={0}>
          <Text dimColor wrap="truncate">
            {f.etiqueta}
          </Text>
        </Box>
        <Text color={colores.cleared}>{barraJev(f.confianza)}</Text>
        <Box width={4} flexShrink={0}>
          <Text bold>{valor}</Text>
        </Box>
        <Box width={5} flexShrink={0}>
          <Text dimColor>{forma}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colores.cleared} paddingX={1} width={w}>
      <Box justifyContent="space-between">
        <Text color={colores.cleared} bold wrap="truncate">
          JEV · decisiones
        </Text>
        <Box flexShrink={0}>
          <Text color={colores.cleared} bold>
            {miles(resumen.total)}
          </Text>
        </Box>
      </Box>
      {resumen.total === 0 ? <Text color={colores.faint}>sin decisiones aún</Text> : resumen.filas.map(f => <Box key={f.tipo}>{fila(f)}</Box>)}
      {resumen.total > 0 ? (
        <Text dimColor wrap="wrap">
          sharp → se aplica en código · split → decide Claude
        </Text>
      ) : null}
    </Box>
  )
}

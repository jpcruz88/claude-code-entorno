// Piezas de texto de una línea: una fila de trozos de color (`linea`) y una fila de marcas (`filaDeMarcas`).
// Solo dibujo: reciben los elementos de la superficie (`els`) y no leen estado.
import type { EngineInterface, RenderChildren } from 'claude-code'

import { cellWidth, piecesThatFit } from './core'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>
export type Span = { text: string; color?: string; dim?: boolean; bold?: boolean }
export type Piece = { spans: Span[]; lead?: number; fill?: boolean }

const estiloDe = (s: Span) => ({ ...(s.color ? { color: s.color } : {}), ...(s.dim ? { dimColor: true } : {}), ...(s.bold ? { bold: true } : {}) })
export const anchoDe = (p: Piece) => p.spans.reduce((n, s) => n + cellWidth(s.text), 0)

// Una línea de trozos de color, dibujada como una fila de cajas. Un Text que anida otros Text de color se trunca
// como una sola línea en la terminal, pero la app de escritorio parte cada trozo anidado por su cuenta, dibuja
// los que se truncan como bloques propios y colapsa los espacios seguidos. Por eso los trozos van separados `gap`
// celdas (el `lead` de un trozo suma más), cada uno conserva su ancho, y los que no caben en `room` se quitan
// desde el final; o un trozo marcado `fill` (un solo tramo) se trunca a lo que dejen los demás.
export const linea = (els: Elementos, pieces: (Piece | null)[], room: number, gap = 1, justify?: 'center') => {
  const { Box, Text } = els
  const all = pieces.filter((p): p is Piece => p !== null)
  const shown = all.some(p => p.fill) ? all : all.slice(0, piecesThatFit(all.map(p => ({ width: anchoDe(p), lead: p.lead })), room, gap))
  return (
    <Box width={room} columnGap={gap} overflow="hidden" {...(justify ? { justifyContent: justify } : {})}>
      {shown.map(p => {
        const lead = p.lead ? { marginLeft: p.lead } : {}
        if (p.fill && p.spans[0]) {
          return (
            <Text {...estiloDe(p.spans[0])} wrap="truncate">
              {p.spans[0].text}
            </Text>
          )
        }
        return (
          <Box flexShrink={0} {...lead}>
            {p.spans.length === 1 && p.spans[0] ? <Text {...estiloDe(p.spans[0])}>{p.spans[0].text}</Text> : <Text>{p.spans.map(s => <Text {...estiloDe(s)}>{s.text}</Text>)}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}

// Una fila de marcas (revisiones del permiso, puntos de los bucles), dimensionada con `marksIn`. Si una superficie
// la dibuja más ancha, la fila se corta en su caja y no se sale.
export const filaDeMarcas = (els: Elementos, marks: RenderChildren, lead = 0) => {
  const { Box, Text } = els
  return (
    <Box overflow="hidden" {...(lead ? { marginLeft: lead } : {})}>
      <Text wrap="truncate-start">{marks}</Text>
    </Box>
  )
}

// La banda de Tablero dibujada: las filas de banda-modelo con el color de la paleta. Solo dibujo.
import type { EngineInterface } from 'claude-code'

import type { Colors } from './core'
import type { FilaBanda, Tono } from './banda-modelo'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>

const COLOR_DE: Record<Tono, keyof Colors> = {
  normal: 'text',
  tenue: 'dim',
  aviso: 'amber',
  peligro: 'warn',
  acento: 'main',
}

export const bandaElemento = (filas: FilaBanda[], colores: Colors, els: Elementos) => {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      {filas.map((fila, i) => (
        <Text key={`f${i}`} wrap="truncate">
          {fila.tramos.map((tr, j) => (
            <Text key={`t${j}`} color={colores[COLOR_DE[tr.tono]]} bold={tr.tono === 'peligro'}>
              {tr.texto}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

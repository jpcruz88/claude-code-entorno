// Conector horizontal animado del diagrama: entre el asesor y el lead, un paquete cruza la línea mientras `active`.
// Como conector-v.tsx: una fase cada STEP_MS, y solo esta región se redibuja.
import type { ClientModule } from 'claude-code'

import { cuadroConectorH } from './conector-h'

type Props = {
  active: boolean
  /** Celdas que ocupa la línea, flecha incluida. */
  ancho: number
  color: string
  dim: string
}

type Ref = { phase: number; active: boolean }
type State = { ref: Ref }

const STEP_MS = 110

const ConectorH: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { phase: 0, active: props.active }
  ref.active = props.active
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(STEP_MS, () => {
      if (ref.active) {
        ref.phase += 1
        surface.setState({ ref })
      }
    })
  }

  const linea = [...cuadroConectorH(props.ancho, ref.phase, props.active)]
  return (
    <Box flexDirection="row" width={props.ancho}>
      {linea.map((ch, i) => (
        <Text key={i} color={ch === '─' ? props.dim : props.color} bold={ch !== '─'} mono>
          {ch}
        </Text>
      ))}
    </Box>
  )
}

export default ConectorH

// Conector vertical animado del diagrama: el paquete baja por la columna mientras `active`, y en reposo queda
// como una línea tenue. Como rail.tsx: solo redibuja esta región, con el reloj de cuadros de la superficie.
import type { ClientModule } from 'claude-code'

import { cuadroConectorV } from './conector-v'

type Props = {
  active: boolean
  /** Filas que ocupa el conector. */
  alto: number
  color: string
  dim: string
}

type Ref = { phase: number; active: boolean }
type State = { ref: Ref }

const STEP_MS = 110

const ConectorV: ClientModule<Props, State> = (props, surface) => {
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

  const filas = cuadroConectorV(props.alto, ref.phase, props.active)
  return (
    <Box flexDirection="column" width={1}>
      {filas.map((f, i) => (
        <Text key={i} color={f === '│' ? props.dim : props.color} bold={f !== '│'} mono>
          {f}
        </Text>
      ))}
    </Box>
  )
}

export default ConectorV

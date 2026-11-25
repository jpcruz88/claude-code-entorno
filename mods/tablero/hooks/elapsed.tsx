// A running agent's clock, ticking on the surface's frame clock so the pane need not redraw.
// `since` and `now` come from the hooks module's $.clock; between redraws it adds its own ticks.
import type { ClientModule } from 'claude-code'

import { fmtTimer } from './core'

type Props = { since: number; now: number; endAt: number | null; color: string }
type Ref = { base: number; ticks: number; lastNow: number; isRunning: boolean }
type State = { ref: Ref }

const Elapsed: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1, isRunning: true }
  if (props.now !== ref.lastNow) {
    // A fresh reading from the hooks module: restart the local count from it.
    ref.lastNow = props.now
    ref.base = (props.endAt ?? props.now) - props.since
    ref.ticks = 0
  }
  ref.isRunning = props.endAt === null
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(1000, () => {
      if (ref.isRunning) {
        ref.ticks += 1
        surface.setState({ ref })
      }
    })
  }
  return <Text color={props.color}>{fmtTimer(ref.base + ref.ticks * 1000)}</Text>
}

export default Elapsed

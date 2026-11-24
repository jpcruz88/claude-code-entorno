// Escritorio: el eje de tiempo de los agentes como SVG, una fila por agente (los últimos 10). El terminal no lo dibuja.
import type { EngineInterface } from 'claude-code'

import type { AgentCard } from '../types'
import { cardTitle, lanes, shorten, SVG_COLORS } from './core'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>
type Svg = Extract<Elementos, { Svg: unknown }>['Svg']

export const carrilesSvg = (Svg: Svg, cards: AgentCard[], now: number) => {
  const rowH = 18
  const pxW = 520
  const geo = lanes(cards.slice(-10), now, 100)
  const rects = cards
    .slice(-10)
    .map((c, i) => {
      const gm = geo[i]
      const x = 150 + ((gm?.before ?? 0) / 100) * (pxW - 160)
      const wpx = Math.max(3, ((gm?.bar ?? 1) / 100) * (pxW - 160))
      const fill = c.status === 'running' ? SVG_COLORS.running : c.status === 'done' ? SVG_COLORS.done : c.status === 'failed' ? SVG_COLORS.failed : SVG_COLORS.other
      const label = shorten(cardTitle(c), 22).replace(/[<&>]/g, '')
      return `<text x="4" y="${i * rowH + 13}" font-size="11" fill="${SVG_COLORS.label}">${label}</text><rect x="${x}" y="${i * rowH + 4}" width="${wpx}" height="10" rx="3" fill="${fill}"/>`
    })
    .join('')
  const svgH = Math.min(10, cards.length) * rowH + 4
  // Sin ancho ni alto en el elemento: toma el ancho del propio marcado hasta el del panel y se encoge para caber en
  // uno angosto, en vez de salirse con 520 píxeles.
  return (
    <Svg
      source={`<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${svgH}" viewBox="0 0 ${pxW} ${svgH}">${rects}</svg>`}
      alt={`${cards.length} agentes en una línea de tiempo`}
    />
  )
}

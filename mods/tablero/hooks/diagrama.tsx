// La vista en diagrama: el asesor a la izquierda; a la derecha, el lead, la caja JEV, la línea «delegar a
// subagentes», y debajo las tarjetas, la vuelta al lead, el resto de paneles y la barra.
// Recibe los paneles ya dibujados (los de siempre) y solo los coloca. Solo dibujo.
import type { EngineInterface, RenderChildren } from 'claude-code'

import { cuadroConectorH } from './conector-h'
import type { Colors } from './core'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>

/** Desde este ancho del panel acoplado, `auto` dibuja el diagrama. */
export const DIAGRAMA_MIN = 66

/** Celdas de la línea entre el asesor y el lead: la flecha ▶ y el paquete que la cruza. */
export const ANCHO_FLECHA = 5

/**
 * Columnas de la columna del asesor (`aw`) y de la derecha (`rw`); entre ambas, la línea de la flecha.
 * El asesor tiene 23 como mínimo: su fila de momentos («◇ errores repetidos», 19) cabe dentro del borde.
 */
export const anchosDiagrama = (ancho: number, conAsesor: boolean) => {
  const aw = conAsesor ? Math.min(30, Math.max(23, Math.floor(ancho * 0.3))) : 0
  return { aw, rw: ancho - (conAsesor ? aw + ANCHO_FLECHA : 0) }
}

export type PiezasDiagrama = {
  ancho: number
  /** El asesor ya dibujado con `aw` columnas; null si no hay asesor de guardia. */
  asesor: RenderChildren | null
  aw: number
  lead: RenderChildren | null
  jev: RenderChildren | null
  /** Hay tarjetas: se dibuja la línea «delegar a subagentes» con su conector. */
  delegar: boolean
  tarjetas: RenderChildren | null
  expandido: RenderChildren | null
  /** Todas las tarjetas terminaron: la caja «de vuelta al lead». */
  vuelta: boolean
  resto: RenderChildren | null
  barra: string
  /** Movimiento activo en la configuración: los conectores verticales se animan. */
  motion: boolean
  /** Hay trabajo en curso: el paquete solo baja mientras es verdad. */
  activo: boolean
}

export const disposicionDiagrama = (els: Elementos, colores: Colors, p: PiezasDiagrama) => {
  const { Box, Text } = els
  // Los módulos animados solo existen en las superficies que tienen `Client`; en las demás, el conector es texto.
  const Client = 'Client' in els ? els.Client : null
  const { rw } = anchosDiagrama(p.ancho, p.asesor !== null)
  // El conector baja desde el centro de la columna derecha; su sangría es un margen, no espacios en el texto.
  const centro = Math.floor(rw / 2)
  // Con movimiento, el conector es un módulo animado (el paquete baja por la columna mientras hay trabajo).
  const conector = (simbolo: string, id: string) => (
    <Box marginLeft={centro}>
      {p.motion && Client ? (
        <Client key={id} module="./conector-v.tsx" width={1} height={1} props={{ active: p.activo, alto: 1, color: colores.arch, dim: colores.faint }} />
      ) : (
        <Text color={colores.faint}>{simbolo}</Text>
      )}
    </Box>
  )
  return (
    <Box flexDirection="column" width={p.ancho}>
      <Box>
        {p.asesor !== null ? p.asesor : null}
        {p.asesor !== null ? (
          // La línea va en la fila del contenido del lead (la fila 1), no en el borde. Con movimiento, el paquete la cruza.
          <Box marginTop={1} width={ANCHO_FLECHA} flexShrink={0}>
            {p.motion && Client ? (
              <Client key="asesor-lead" module="./conector-h.tsx" width={ANCHO_FLECHA} height={1} props={{ active: p.activo, ancho: ANCHO_FLECHA, color: colores.arch, dim: colores.faint }} />
            ) : (
              <Text color={colores.arch}>{cuadroConectorH(ANCHO_FLECHA, 0, false)}</Text>
            )}
          </Box>
        ) : null}
        <Box flexDirection="column" width={rw}>
          {p.lead}
          {p.lead !== null && p.jev !== null ? conector('▼', 'lead-jev') : null}
          {p.jev}
          {p.delegar ? conector('│', 'delegar-1') : null}
          {p.delegar ? conector('▼', 'delegar-2') : null}
          {p.delegar ? <Text dimColor>delegar a subagentes</Text> : null}
        </Box>
      </Box>
      {p.tarjetas}
      {p.expandido}
      {p.vuelta ? (
        <Box marginLeft={p.asesor !== null ? p.aw + ANCHO_FLECHA : 0} width={rw} borderStyle="round" borderColor={colores.main} paddingX={1}>
          <Text color={colores.main} wrap="truncate">
            de vuelta al lead · revisar y verificar
          </Text>
        </Box>
      ) : null}
      {p.resto}
      <Text dimColor wrap="truncate">
        {p.barra}
      </Text>
    </Box>
  )
}

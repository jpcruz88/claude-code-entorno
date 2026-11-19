import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EstadoAduana } from '../types'
import { lineas, vigente } from './resumen'

// El escritor `herramientas/estado_en_curso.py` de Aduana deja este archivo cada pocos segundos.
const ARCHIVO = '.cache/detector-humo/en-curso.json'

const estado = atom({ plugin: 'aduana-panel', key: 'estado' } as const, null)

export const register: Register = on => {
  let timer: (() => void) | null = null
  let avisado = 0

  on('session.start', async ($, e, next) => {
    if (timer === null) {
      timer = $.clock.every(5000, async () => {
        try {
          const casa = await $.env.get('HOME')
          const texto = await $.fs.read(`${casa}/${ARCHIVO}`)
          const leido = JSON.parse(texto as string) as EstadoAduana
          await update($, estado, () => leido)
          if (leido.terminado && leido.actualizado !== avisado) {
            avisado = leido.actualizado
            $.ui.toast(`Aduana: pruebas terminadas, ${leido.hechas}/${leido.total}`)
          }
        } catch {
          await update($, estado, () => null)
        }
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const actual = await read($, estado)
    const ahora = await $.clock.now()

    if (e.props.hasSurvey || actual === null || !vigente(actual, ahora)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {lineas(actual).map((linea, i) => (
          <Text key={i} dimColor>
            {linea}
          </Text>
        ))}
      </Box>
    )
  })
}

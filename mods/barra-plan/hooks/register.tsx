import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EstadoPlan, Plan } from '../types'
import { CAIDA_MS, aplicar, filas, resumen } from './barra'

const TOOL = 'mcp__barra-plan__plan_progress'
const planes = atom({ plugin: 'barra-plan', key: 'planes' } as const, [] as Plan[])
// the theme's colour for each state; the rest of the row is dimmed
const COLOR: Record<EstadoPlan, 'suggestion' | 'warning' | 'error' | 'success'> = {
  running: 'suggestion',
  needs_input: 'warning',
  error: 'error',
  done: 'success',
}

const RULES = `# Barras de progreso
Las tareas de más de unos 3 pasos llevan una barra: créala una vez con ${TOOL} (id, title y stages: 2 a 7 etapas con steps {title}; o steps como lista plana). Los títulos de 4 palabras como mucho, en el idioma del usuario; el primer paso abierto queda activo. Avanza con {id, next:true} cuando termina el paso activo, o con {id, done:[...], active:"..."}. Si un paso falla: {id, failed:"...", note}. Antes de pedir una decisión al usuario: {id, state:"needs_input", note}. No describas las barras al usuario.`

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'plan_progress',
      description: 'Barra de progreso sobre el prompt, una por id. Créala con title y stages; avanza con next, done, active, failed o state.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { enum: ['plan', 'todo'] },
          stages: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array' } } } },
          steps: { type: 'array' },
          next: { type: 'boolean' },
          done: { type: 'array', items: { type: 'string' } },
          active: { type: 'string' },
          failed: { type: 'string' },
          note: { type: 'string' },
          state: { enum: ['running', 'needs_input', 'error', 'done'] },
        },
      },
    })
    // the clock redraws the band only while a row shows, so an idle session stays still
    if (timer === null) {
      timer = $.clock.every(1000, async () => {
        if (filas(await read($, planes), 80, await $.clock.now()).length > 0) $.ui.invalidate('ui.render')
      })
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)

    return { sections: [...result.sections, { id: 'barra-plan:reglas', text: RULES, scope: 'session' as const }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const raw = e as unknown as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) return { result: `${TOOL}: el id es obligatorio, por ejemplo "arreglar-login".` }
    const ahora = await $.clock.now()
    const made = aplicar((await read($, planes)).find(p => p.id === id), raw, ahora)
    if (typeof made === 'string') return { result: made }
    await update($, planes, list =>
      [...list.filter(p => p.id !== id && (p.estado !== 'done' || ahora - (p.endedAt ?? ahora) < CAIDA_MS)), made],
    )

    return { result: resumen(made) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // asked last and always: the rows below stay where the engine and the other plugins put them
    const below = await next(e)
    const lineas = e.props.isCollapsed ? [] : filas(await read($, planes), e.props.bodyColumns, await $.clock.now())
    if (lineas.length === 0) return below

    const { Box, Text } = $.ui.resolve(e)
    const tree = (
      <Box flexDirection="column">
        {lineas.map((f, i) => (
          <Box key={`fila-${i}`} flexDirection="column">
            <Box flexDirection="row">
              <Text color={f.estado ? COLOR[f.estado] : undefined}>{f.marca ? `${f.marca} ` : ''}</Text>
              <Text dimColor>{f.titulo}</Text>
              {f.barra ? <Text color={f.estado ? COLOR[f.estado] : undefined}>{`  ${f.barra}`}</Text> : null}
              <Text dimColor>{f.resto}</Text>
            </Box>
            {f.nota ? <Text dimColor>{`  ${f.nota}`}</Text> : null}
          </Box>
        ))}
      </Box>
    )

    return below ? (
      <Box flexDirection="column">
        {tree}
        {below}
      </Box>
    ) : (
      tree
    )
  })
}

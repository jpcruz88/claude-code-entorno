import { expect, test } from 'claude-code/testing'
import { consejoGasto, topGasto } from '../hooks/gasto'

const uso = (tool: string, input: Record<string, unknown>, text: string) => ({ tool_use_id: `${tool}-${Math.random()}`, tool, input, text })
const msj = (...toolUses: ReturnType<typeof uso>[]) => ({ role: 'assistant' as const, text: '', toolUses })

const LEIDO = 'x'.repeat(1000)
const SALIDA = 'l\n'.repeat(900)

test('un archivo leído varias veces se junta y va primero si es lo que más gasta', () => {
  const top = topGasto([
    msj(uso('Read', { file_path: 'src/a.ts' }, LEIDO)),
    msj(uso('Read', { file_path: 'src/a.ts' }, LEIDO), uso('Bash', { command: 'npm test' }, SALIDA)),
    msj(uso('Read', { file_path: 'src/a.ts' }, LEIDO)),
  ] as never)
  expect(top[0]).toEqual({ llamada: 'Read src/a.ts', motivo: 'leído 3 veces', tokens: 750 })
  expect(top[1]?.llamada).toBe('Bash npm test')
  expect(top[1]?.motivo).toBe('salida de 900 líneas')
})

test('como mucho cuatro filas, de mayor a menor', () => {
  const muchos = [1, 2, 3, 4, 5, 6].map(n => msj(uso('Bash', { command: `c${n}` }, 'y'.repeat(n * 100))))
  const top = topGasto(muchos as never)
  expect(top).toHaveLength(4)
  expect(top.map(t => t.llamada)).toEqual(['Bash c6', 'Bash c5', 'Bash c4', 'Bash c3'])
})

test('sin llamadas con resultado no hay filas ni consejo', () => {
  expect(topGasto([{ role: 'user', text: 'hola', toolUses: [] }] as never)).toEqual([])
  expect(consejoGasto([])).toBeNull()
})

test('el consejo nombra el archivo releído', () => {
  expect(consejoGasto([{ llamada: 'Read src/a.ts', motivo: 'leído 3 veces', tokens: 750 }])).toBe(
    'Consejo: src/a.ts se leyó 3 veces; pide sus líneas exactas en vez del archivo entero.',
  )
  expect(consejoGasto([{ llamada: 'Bash npm test', motivo: 'salida de 900 líneas', tokens: 450 }])).toBeNull()
})

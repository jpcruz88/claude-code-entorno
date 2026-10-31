import { expect, test } from 'claude-code/testing'

type Entrada = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number }
type Entorno = { specs: Entrada[] | null; respuesta?: string | 'falla' }

const RAIZ = 'C:\\p'
const HOY = new Date().toISOString().slice(0, 10)
const md = (name: string): Entrada => ({ name, kind: 'file', mtimeMs: 0 })
const RECIENTE = [md(`${HOY}-diseno.md`)]
const VIEJA = [md('2020-01-01-diseno.md')]

// Los hooks de la pregunta van antes que el general, que de otro modo la contestaría con un resultado vacío.
function preparar(on: (...args: any[]) => unknown, entorno: Entorno): string[] {
  const preguntas: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_: unknown, e: { questions: { question: string }[] }) => {
    const pregunta = e.questions[0]!.question
    preguntas.push(pregunta)
    if (entorno.respuesta === 'falla') throw new Error('descartada')
    return { result: { questions: [], answers: { [pregunta]: entorno.respuesta ?? 'Seguir sin spec' } } }
  })
  on('tool.call', () => ({ result: {} }))
  on('session.root', () => ({ value: RAIZ }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.exists', () => ({ value: entorno.specs !== null }))
  on('fs.list', () => ({ value: entorno.specs ?? [] }))
  return preguntas
}

const editar = (ruta: string, extra: object = {}) =>
  ({ tool: 'Edit', file_path: ruta, old_string: 'a', new_string: 'b', ...extra }) as const

test('sin carpeta de specs no pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: null })

  const r = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toEqual([])
  expect(r.deny).toBeUndefined()
})

test('con una spec reciente no pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: RECIENTE })

  await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toEqual([])
})

test('con la spec vieja pregunta una sola vez; Seguir deja pasar y la segunda edición no pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: VIEJA })

  const a = await $.tool.call(editar('C:\\p\\src\\x.ts'))
  const b = await $.tool.call({ tool: 'Write', file_path: 'C:\\p\\src\\y.ts', content: 'x' })

  expect(a.deny).toBeUndefined()
  expect(b.deny).toBeUndefined()
  expect(preguntas).toHaveLength(1)
})

test('carpeta de specs vacía también pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: [] })

  await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toHaveLength(1)
})

test('Cancelar rechaza la llamada con un motivo en español', async ($, on) => {
  preparar(on, { specs: VIEJA, respuesta: 'Cancelar' })

  const r = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(r.deny).toContain('spec-gate')
  expect(r.deny).toContain('spec')
})

test('si la pregunta falla la llamada pasa y la siguiente edición vuelve a preguntar', async ($, on) => {
  const preguntas = preparar(on, { specs: VIEJA, respuesta: 'falla' })

  const a = await $.tool.call(editar('C:\\p\\src\\x.ts'))
  const b = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(a.deny).toBeUndefined()
  expect(b.deny).toBeUndefined()
  expect(preguntas).toHaveLength(2)
})

test('un archivo fuera de la carpeta del proyecto no pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: VIEJA })

  await $.tool.call(editar('D:\\otro\\src\\x.ts'))

  expect(preguntas).toEqual([])
})

test('docs, pruebas y config no cuentan como código de producción', async ($, on) => {
  const preguntas = preparar(on, { specs: VIEJA })

  for (const ruta of ['C:\\p\\docs\\x.md', 'C:\\p\\src\\x.test.ts', 'C:\\p\\plugin.json']) {
    await $.tool.call(editar(ruta))
  }

  expect(preguntas).toEqual([])
})

test('un evento de subagente no pregunta', async ($, on) => {
  const preguntas = preparar(on, { specs: VIEJA })

  await $.tool.call(editar('C:\\p\\src\\x.ts', { agentId: 'a1' }))

  expect(preguntas).toEqual([])
})

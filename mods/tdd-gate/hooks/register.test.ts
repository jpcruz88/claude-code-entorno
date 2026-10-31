import { expect, test } from 'claude-code/testing'

const RAIZ = 'C:\\p'

// Los hooks de la pregunta van antes que el general, que de otro modo la contestaría con un resultado vacío.
function preparar(on: (...args: any[]) => unknown, respuesta: string | 'falla' = 'Seguir sin prueba'): string[] {
  const preguntas: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_: unknown, e: { questions: { question: string }[] }) => {
    const pregunta = e.questions[0]!.question
    preguntas.push(pregunta)
    if (respuesta === 'falla') throw new Error('descartada')
    return { result: { questions: [], answers: { [pregunta]: respuesta } } }
  })
  on('tool.call', () => ({ result: {} }))
  on('session.root', () => ({ value: RAIZ }))
  on('session.id', () => ({ value: 's1' }))
  return preguntas
}

const editar = (ruta: string, extra: object = {}) =>
  ({ tool: 'Edit', file_path: ruta, old_string: 'a', new_string: 'b', ...extra }) as const

test('editar código sin prueba pregunta una sola vez; Seguir deja pasar y la segunda edición no pregunta', async ($, on) => {
  const preguntas = preparar(on)

  const a = await $.tool.call(editar('C:\\p\\src\\x.ts'))
  const b = await $.tool.call({ tool: 'Write', file_path: 'C:\\p\\src\\y.ts', content: 'x' })

  expect(a.deny).toBeUndefined()
  expect(b.deny).toBeUndefined()
  expect(preguntas).toHaveLength(1)
})

test('Cancelar rechaza la llamada con un motivo en español', async ($, on) => {
  preparar(on, 'Cancelar')

  const r = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(r.deny).toContain('tdd-gate')
  expect(r.deny).toContain('prueba')
})

test('editar antes un archivo de prueba desbloquea el código del proyecto', async ($, on) => {
  const preguntas = preparar(on)

  await $.tool.call(editar('C:\\p\\src\\x.test.ts'))
  const r = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toEqual([])
  expect(r.deny).toBeUndefined()
})

test('editar un .md en docs no cuenta como prueba', async ($, on) => {
  const preguntas = preparar(on)

  await $.tool.call(editar('C:\\p\\docs\\x.md'))
  await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toHaveLength(1)
})

test('si la pregunta falla la llamada pasa y la siguiente edición vuelve a preguntar', async ($, on) => {
  const preguntas = preparar(on, 'falla')

  const a = await $.tool.call(editar('C:\\p\\src\\x.ts'))
  const b = await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(a.deny).toBeUndefined()
  expect(b.deny).toBeUndefined()
  expect(preguntas).toHaveLength(2)
})

test('una prueba fuera de la carpeta del proyecto no desbloquea ni pregunta', async ($, on) => {
  const preguntas = preparar(on)

  await $.tool.call(editar('D:\\otro\\x.test.ts'))
  await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toHaveLength(1)
})

test('código fuera de la carpeta del proyecto no pregunta', async ($, on) => {
  const preguntas = preparar(on)

  await $.tool.call(editar('D:\\otro\\src\\x.ts'))

  expect(preguntas).toEqual([])
})

test('un subagente ni pregunta ni cuenta sus pruebas', async ($, on) => {
  const preguntas = preparar(on)

  await $.tool.call(editar('C:\\p\\src\\x.ts', { agentId: 'a1' }))
  await $.tool.call(editar('C:\\p\\src\\x.test.ts', { agentId: 'a1' }))
  await $.tool.call(editar('C:\\p\\src\\x.ts'))

  expect(preguntas).toHaveLength(1)
})

test('docs, pruebas y config no preguntan', async ($, on) => {
  const preguntas = preparar(on)

  for (const ruta of ['C:\\p\\docs\\x.md', 'C:\\p\\plugin.json']) {
    await $.tool.call(editar(ruta))
  }

  expect(preguntas).toEqual([])
})

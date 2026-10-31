import { expect, test } from 'claude-code/testing'

const TOKEN = 'ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0hJ3kL6' // privacidad-ok gitleaks:allow
const BEARER = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ'

// $.ui.ask es una llamada AskUserQuestion que pasa por tool.call: así se responde en las pruebas.
// Este hook va registrado antes que el hook general, que de otro modo contestaría la pregunta con un resultado vacío.
const responder = (respuesta: string, preguntas: string[] = []) =>
  (_: unknown, e: { questions: { question: string }[] }) => {
    const pregunta = e.questions[0]!.question
    preguntas.push(pregunta)
    return { result: { questions: [], answers: { [pregunta]: respuesta } } }
  }

test('Write con un token en content se rechaza sin repetir el token', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Write', file_path: 'C:\\p\\a.ts', content: `const t = '${TOKEN}'` })

  expect(r.deny).toContain('secret-guard')
  expect(r.deny).toContain('GitHub')
  expect(r.deny).not.toContain(TOKEN)
})

test('Edit con secreto en new_string se rechaza', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'x', new_string: TOKEN })

  expect(r.deny).toContain('secret-guard')
})

test('Edit que solo quita el secreto (old_string) pasa', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: TOKEN, new_string: 'process.env.TOKEN' })

  expect(r.deny).toBeUndefined()
})

test('NotebookEdit con secreto en new_source se rechaza', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'NotebookEdit', notebook_path: 'a.ipynb', new_source: TOKEN })

  expect(r.deny).toContain('secret-guard')
})

test('Bash con Bearer token se rechaza', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Bash', command: `curl -H "Authorization: Bearer ${BEARER}" x` })

  expect(r.deny).toContain('secret-guard')
  expect(r.deny).not.toContain(BEARER)
})

test('PowerShell con token de GitHub se rechaza', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'PowerShell', command: `$env:T='${TOKEN}'` })

  expect(r.deny).toContain('secret-guard')
})

test('Bash sin secretos pasa', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(r.deny).toBeUndefined()
})

test('Read de .env pregunta; Permitir deja pasar y no vuelve a preguntar por ese archivo', async ($, on) => {
  const preguntas: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, responder('Permitir', preguntas))
  on('tool.call', () => ({ result: {} }))

  const a = await $.tool.call({ tool: 'Read', file_path: 'C:\\p\\.env' })
  const b = await $.tool.call({ tool: 'Read', file_path: 'C:\\p\\.env' })

  expect(a.deny).toBeUndefined()
  expect(b.deny).toBeUndefined()
  expect(preguntas).toHaveLength(1)
})

test('Read de .env con Cancelar se rechaza', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, responder('Cancelar'))
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Read', file_path: '.env' })

  expect(r.deny).toContain('secret-guard')
})

test('Read de .env con la pregunta rechazada (nadie a quien preguntar) se rechaza', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => { throw new Error('dismissed') })
  on('tool.call', () => ({ result: {} }))

  const r = await $.tool.call({ tool: 'Read', file_path: '.env' })

  expect(r.deny).toContain('secret-guard')
})

test('Read de un archivo común no pregunta', async ($, on) => {
  const preguntas: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, responder('Permitir', preguntas))
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'Read', file_path: 'src/main.ts' })

  expect(preguntas).toEqual([])
})

test('si el hook falla la llamada pasa y sale un toast sin el secreto', async ($, on) => {
  const toasts: string[] = []
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  // Un texto que no es cadena hace fallar al detector dentro del hook.
  const r = await $.tool.call({ tool: 'Bash', command: undefined as unknown as string })

  expect(r.deny).toBeUndefined()
  expect(toasts.some(t => t.includes('secret-guard falló'))).toBe(true)
  expect(toasts.join(' ')).not.toContain(TOKEN)
})

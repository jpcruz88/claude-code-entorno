import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_SESION,
  gitdirDe,
  notarLlamada,
  notarSkill,
  ramaDeHead,
  sesionFilas,
} from '../hooks/sesion-modelo'
import type { Sesion } from '../types'

const llamada = (s: Sesion, tool: string, input: unknown = {}, isError = false) => notarLlamada(s, tool, input, isError)

test('cuenta las herramientas y deja las de MCP aparte, con sus errores', () => {
  let s = DEFAULT_SESION
  s = llamada(s, 'Read', { file_path: '/a' })
  s = llamada(s, 'Read', { file_path: '/b' })
  s = llamada(s, 'Bash', { command: 'ls' })
  s = llamada(s, 'mcp__context7__query-docs', {})
  s = llamada(s, 'mcp__context7__resolve-library-id', {}, true)
  s = llamada(s, 'mcp__claude_ai_Notion__fetch', {})
  expect(s.tools).toEqual({ Read: 2, Bash: 1 })
  expect(s.mcp).toEqual({ context7: { calls: 2, errors: 1 }, claude_ai_Notion: { calls: 1, errors: 0 } })
})

test('el estado de partida no se modifica: cada llamada devuelve uno nuevo', () => {
  const antes = JSON.stringify(DEFAULT_SESION)
  llamada(DEFAULT_SESION, 'Read')
  expect(JSON.stringify(DEFAULT_SESION)).toBe(antes)
})

test('la herramienta Skill no se cuenta como herramienta: sus usos vienen de skill.prompt', () => {
  expect(llamada(DEFAULT_SESION, 'Skill', { skill: 'caveman' }).tools).toEqual({})
})

test('los archivos tocados son los últimos 5, sin repetir, el más reciente al final', () => {
  let s = DEFAULT_SESION
  for (const f of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']) s = llamada(s, 'Edit', { file_path: `C:\\p\\${f}` })
  s = llamada(s, 'Write', { file_path: '/p/c.ts' })
  s = llamada(s, 'NotebookEdit', { notebook_path: '/p/n.ipynb' })
  expect(s.files).toEqual(['d.ts', 'e.ts', 'f.ts', 'c.ts', 'n.ipynb'])
})

test('una edición sin ruta legible no rompe nada', () => {
  expect(llamada(DEFAULT_SESION, 'Edit', { file_path: 5 }).files).toEqual([])
  expect(llamada(DEFAULT_SESION, 'Edit', undefined).files).toEqual([])
})

test('TodoWrite reemplaza la lista de tareas y marca la que está en curso', () => {
  const s = llamada(DEFAULT_SESION, 'TodoWrite', {
    todos: [
      { content: 'A', status: 'completed', activeForm: 'Haciendo A' },
      { content: 'B', status: 'in_progress', activeForm: 'Haciendo B' },
      { content: 'C', status: 'pending', activeForm: 'Haciendo C' },
    ],
  })
  expect(s.todos).toEqual({ total: 3, done: 1, current: 'Haciendo B' })
  expect(llamada(s, 'TodoWrite', { todos: [] }).todos).toEqual({ total: 0, done: 0, current: null })
})

test('TaskCreate y TaskUpdate llevan la cuenta aproximada', () => {
  let s = DEFAULT_SESION
  s = llamada(s, 'TaskCreate', { subject: 'uno', description: 'x' })
  s = llamada(s, 'TaskCreate', { subject: 'dos', description: 'x' })
  s = llamada(s, 'TaskUpdate', { taskId: '1', status: 'in_progress', activeForm: 'Haciendo uno' })
  expect(s.todos).toEqual({ total: 2, done: 0, current: 'Haciendo uno' })
  s = llamada(s, 'TaskUpdate', { taskId: '1', status: 'completed' })
  expect(s.todos.done).toBe(1)
  s = llamada(s, 'TaskUpdate', { taskId: '2', status: 'deleted' })
  expect(s.todos.total).toBe(1)
  s = llamada(s, 'TaskUpdate', { taskId: '1', status: 'completed' })
  expect(s.todos.done).toBeLessThanOrEqual(s.todos.total)
})

test('cuenta los skills usados', () => {
  let s = notarSkill(DEFAULT_SESION, 'superpowers:brainstorming')
  s = notarSkill(s, 'superpowers:brainstorming')
  s = notarSkill(s, 'caveman')
  expect(s.skills).toEqual({ 'superpowers:brainstorming': 2, caveman: 1 })
})

test('ramaDeHead lee la rama o el commit suelto, y gitdirDe sigue un worktree', () => {
  expect(ramaDeHead('ref: refs/heads/main\n')).toBe('main')
  expect(ramaDeHead('ref: refs/heads/feature/x-1\r\n')).toBe('feature/x-1')
  expect(ramaDeHead('0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456')
  expect(ramaDeHead('')).toBe(null)
  expect(ramaDeHead('basura')).toBe(null)
  expect(gitdirDe('gitdir: C:/repo/.git/worktrees/w1\n')).toBe('C:/repo/.git/worktrees/w1')
  expect(gitdirDe('ref: refs/heads/main')).toBe(null)
})

test('sesionFilas arma las filas del panel y omite las vacías', () => {
  expect(sesionFilas(DEFAULT_SESION)).toEqual([])
  let s = DEFAULT_SESION
  for (const t of ['Read', 'Read', 'Read', 'Edit', 'Bash', 'Bash']) s = llamada(s, t, { file_path: '/p/x.ts' })
  s = llamada(s, 'mcp__context7__query-docs', {})
  s = llamada(s, 'mcp__context7__query-docs', {}, true)
  s = notarSkill(s, 'caveman')
  s = llamada(s, 'TodoWrite', { todos: [{ content: 'A', status: 'in_progress', activeForm: 'Haciendo A' }] })
  const filas = Object.fromEntries(sesionFilas(s).map(f => [f.etiqueta, f.valor]))
  expect(filas.tareas).toBe('0/1 listas · ahora: Haciendo A')
  expect(filas.herramientas).toBe('Read 3 · Bash 2 · Edit 1 · TodoWrite 1')
  expect(filas.archivos).toBe('x.ts')
  expect(filas.mcp).toBe('context7 2 (1 error)')
  expect(filas.skills).toBe('caveman ×1')
  // Los hooks no se muestran: eran una fila larga y sin uso.
  expect(Object.keys(filas)).toEqual(['tareas', 'herramientas', 'archivos', 'mcp', 'skills'])
})

test('los errores de MCP se pluralizan y se ordena por uso', () => {
  let s = DEFAULT_SESION
  s = llamada(s, 'mcp__a__t', {}, true)
  s = llamada(s, 'mcp__a__t', {}, true)
  for (let i = 0; i < 3; i += 1) s = llamada(s, 'mcp__b__t', {})
  const mcp = sesionFilas(s).find(f => f.etiqueta === 'mcp')?.valor
  expect(mcp).toBe('b 3 · a 2 (2 errores)')
})

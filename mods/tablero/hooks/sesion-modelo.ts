// Lo que el panel SESIÓN cuenta de la sesión: herramientas, archivos, tareas, servidores MCP y skills,
// como datos puros. Cada función devuelve un estado nuevo; el motor y el dibujo viven en register.tsx.
import type { Sesion } from '../types'

export const DEFAULT_SESION: Sesion = {
  tools: {},
  files: [],
  mcp: {},
  skills: {},
  todos: { total: 0, done: 0, current: null },
  branch: null,
}

const EDITAN = new Set(['Edit', 'Write', 'NotebookEdit'])
const ARCHIVOS_MAX = 5
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
const mas = (m: Record<string, number>, clave: string): Record<string, number> => ({ ...m, [clave]: (m[clave] ?? 0) + 1 })

const tareasDeTodoWrite = (input: Record<string, unknown>, previo: Sesion['todos']): Sesion['todos'] => {
  if (!Array.isArray(input.todos)) return previo
  const todos = input.todos.filter(isObject)
  const enCurso = todos.find(t => t.status === 'in_progress')
  const actual = enCurso ? (typeof enCurso.activeForm === 'string' && enCurso.activeForm ? enCurso.activeForm : typeof enCurso.content === 'string' ? enCurso.content : null) : null
  return { total: todos.length, done: todos.filter(t => t.status === 'completed').length, current: actual }
}

const tareasDeTask = (tool: string, input: Record<string, unknown>, t: Sesion['todos']): Sesion['todos'] => {
  if (tool === 'TaskCreate') return { ...t, total: t.total + 1 }
  const estado = input.status
  if (estado === 'completed') return { ...t, done: Math.min(t.done + 1, t.total) }
  if (estado === 'deleted') {
    const total = Math.max(0, t.total - 1)
    return { ...t, total, done: Math.min(t.done, total) }
  }
  if (estado === 'in_progress') {
    const nombre = typeof input.activeForm === 'string' && input.activeForm ? input.activeForm : typeof input.subject === 'string' ? input.subject : t.current
    return { ...t, current: nombre }
  }
  return t
}

/** Una llamada de herramienta ya resuelta: la cuenta, y lo que deja en archivos, tareas y servidores MCP. */
export const notarLlamada = (s: Sesion, tool: string, input: unknown, isError: boolean): Sesion => {
  const i = isObject(input) ? input : {}
  if (tool.startsWith('mcp__')) {
    const servidor = tool.split('__')[1] || 'mcp'
    const previo = s.mcp[servidor] ?? { calls: 0, errors: 0 }
    return { ...s, mcp: { ...s.mcp, [servidor]: { calls: previo.calls + 1, errors: previo.errors + (isError ? 1 : 0) } } }
  }
  let next: Sesion = tool === 'Skill' ? s : { ...s, tools: mas(s.tools, tool) }
  if (EDITAN.has(tool)) {
    const ruta = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : ''
    const nombre = nombreDe(ruta)
    if (nombre) next = { ...next, files: [...next.files.filter(f => f !== nombre), nombre].slice(-ARCHIVOS_MAX) }
  }
  if (tool === 'TodoWrite') next = { ...next, todos: tareasDeTodoWrite(i, next.todos) }
  if (tool === 'TaskCreate' || tool === 'TaskUpdate') next = { ...next, todos: tareasDeTask(tool, i, next.todos) }
  return next
}

export const notarSkill = (s: Sesion, skill: string): Sesion => ({ ...s, skills: mas(s.skills, skill) })

/** La rama de un `.git/HEAD`, o los 7 primeros caracteres de un commit suelto; null si no se entiende. */
export const ramaDeHead = (texto: string): string | null => {
  const t = texto.trim()
  const rama = /^ref:\s*refs\/heads\/(.+)$/.exec(t)
  if (rama?.[1]) return rama[1].trim()
  return /^[0-9a-f]{40}$/i.test(t) ? t.slice(0, 7) : null
}

/** Donde apunta un `.git` que es un archivo (un worktree); null si no lo es. */
export const gitdirDe = (texto: string): string | null => {
  const m = /^gitdir:\s*(.+)$/m.exec(texto.trim())
  return m?.[1] ? m[1].trim() : null
}

const ordenados = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
const errores = (n: number) => `${n} ${n === 1 ? 'error' : 'errores'}`

export type FilaSesion = { etiqueta: string; valor: string }

/** Las filas del panel SESIÓN; las que no tienen nada que decir no salen. */
export const sesionFilas = (s: Sesion): FilaSesion[] => {
  const filas: FilaSesion[] = []
  if (s.todos.total > 0) filas.push({ etiqueta: 'tareas', valor: `${s.todos.done}/${s.todos.total} listas${s.todos.current ? ` · ahora: ${s.todos.current}` : ''}` })
  const tools = ordenados(s.tools).slice(0, 5)
  if (tools.length > 0) filas.push({ etiqueta: 'herramientas', valor: tools.map(([n, c]) => `${n} ${c}`).join(' · ') })
  if (s.files.length > 0) filas.push({ etiqueta: 'archivos', valor: [...s.files].reverse().join(', ') })
  const mcp = Object.entries(s.mcp).sort((a, b) => b[1].calls - a[1].calls || a[0].localeCompare(b[0]))
  if (mcp.length > 0) {
    filas.push({ etiqueta: 'mcp', valor: mcp.map(([n, v]) => `${n} ${v.calls}${v.errors > 0 ? ` (${errores(v.errors)})` : ''}`).join(' · ') })
  }
  const skills = ordenados(s.skills)
  if (skills.length > 0) filas.push({ etiqueta: 'skills', valor: skills.map(([n, c]) => `${n} ×${c}`).join(' · ') })
  return filas
}

const EXTENSIONES = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'cs', 'java', 'go', 'rs', 'rb', 'php', 'ps1', 'sh', 'sql', 'c', 'cpp', 'h',
])
const CARPETAS_EXCLUIDAS = new Set(['test', 'tests', '__tests__', 'spec', 'docs', '.claude-plugin'])
const NOMBRE_DE_PRUEBA = [/\.(?:test|spec)\./i, /_test\./i, /^test_/i]

function segmentos(ruta: string): string[] {
  return ruta.replace(/\\/g, '/').split('/').filter(s => s !== '')
}

export function esCodigoDeProduccion(ruta: string): boolean {
  const partes = segmentos(ruta)
  const nombre = partes.pop() ?? ''
  const punto = nombre.lastIndexOf('.')
  if (punto < 0 || !EXTENSIONES.has(nombre.slice(punto + 1).toLowerCase())) return false
  if (NOMBRE_DE_PRUEBA.some(r => r.test(nombre))) return false
  return !partes.some(s => CARPETAS_EXCLUIDAS.has(s.toLowerCase()))
}

function normalizar(ruta: string): string {
  return ruta.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function dentroDe(ruta: string, raiz: string): boolean {
  const r = normalizar(ruta)
  const base = normalizar(raiz)
  return r === base || r.startsWith(`${base}/`)
}

const CARPETAS_DE_PRUEBA = new Set(['test', 'tests', '__tests__'])

// Más estricta que la exclusión de producción: `docs` y `spec` no son pruebas.
export function esArchivoDePrueba(ruta: string): boolean {
  const partes = segmentos(ruta)
  const nombre = partes.pop() ?? ''
  if (NOMBRE_DE_PRUEBA.some(r => r.test(nombre))) return true
  return partes.some(s => CARPETAS_DE_PRUEBA.has(s.toLowerCase()))
}

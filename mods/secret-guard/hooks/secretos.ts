export type Hallazgo = { tipo: string; muestra: string }

const CONEXION = /\b(?:server|data source|host|user id|uid|initial catalog|database)\s*=/i

// Cada patrón captura en el grupo 1 el valor que se enmascara; sin grupo, toda la coincidencia.
// `contexto`: el patrón solo cuenta si el texto completo también lo cumple.
const PATRONES: { tipo: string; regex: RegExp; contexto?: RegExp }[] = [
  { tipo: 'clave de AWS', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { tipo: 'token de GitHub', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { tipo: 'token de GitHub', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { tipo: 'clave de Anthropic', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { tipo: 'token de Slack', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { tipo: 'Clave privada', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{20,}/g },
  { tipo: 'Contraseña en cadena de conexión', regex: /(?:^|;)\s*(?:password|pwd)\s*=\s*([^;\s'"(\[\$\{]{4,})/gim, contexto: CONEXION },
  { tipo: 'Bearer token', regex: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g },
]

const EJEMPLO = /example|xxxx|changeme|your[-_]|fake|dummy|test|sample|ejemplo|falso|<[^>]*>|\*\*\*/i

function enmascarar(valor: string): string {
  // Un valor corto no puede mostrar 4 + 4 caracteres sin quedar completo.
  if (valor.length <= 12) return `${valor.slice(0, 2)}…`
  return `${valor.slice(0, 4)}…${valor.slice(-4)}`
}

export function detectarSecreto(texto: string): Hallazgo | undefined {
  for (const { tipo, regex, contexto } of PATRONES) {
    if (contexto && !contexto.test(texto)) continue
    for (const m of texto.matchAll(regex)) {
      const valor = m[1] ?? m[0]
      if (EJEMPLO.test(valor)) continue
      return { tipo, muestra: enmascarar(valor) }
    }
  }
  return undefined
}

const SENSIBLES = /^(?:id_rsa|id_ed25519|credentials|credentials\.json|.+\.pem|.+\.pfx)$/i
const PLANTILLAS_ENV = /^\.env\.(?:example|sample|template)$/i

export function esLecturaSensible(ruta: string): boolean {
  const nombre = ruta.split(/[\\/]/).pop() ?? ''
  if (PLANTILLAS_ENV.test(nombre)) return false
  if (nombre === '.env' || nombre.toLowerCase().startsWith('.env.')) return true
  return SENSIBLES.test(nombre)
}

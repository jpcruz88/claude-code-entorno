export type Hallazgo = { tipo: string; muestra: string }

const CONEXION = /\b(?:server|data source|host|user id|uid|initial catalog|database)\s*=/i

// Cada patrón captura en el grupo 1 el valor que se enmascara; sin grupo, toda la coincidencia.
// `contexto`: el patrón solo cuenta si el texto completo también lo cumple.
// `valorReal`: el valor capturado además debe parecer un secreto y no un marcador, una variable ni código.
const PATRONES: { tipo: string; regex: RegExp; contexto?: RegExp; valorReal?: boolean }[] = [
  { tipo: 'clave de AWS', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { tipo: 'token de GitHub', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { tipo: 'token de GitHub', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { tipo: 'clave de Anthropic', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { tipo: 'token de Slack', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { tipo: 'Clave privada', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{20,}/g },
  { tipo: 'Contraseña en cadena de conexión', regex: /(?:^|;)\s*(?:password|pwd)\s*=\s*([^;\s'"(\[\$\{]{4,})/gim, contexto: CONEXION },
  { tipo: 'Bearer token', regex: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g },
  // Esquemas de bases de datos y colas con usuario:clave@host. El usuario puede ir vacío (redis://:clave@host).
  {
    tipo: 'URL con credenciales',
    regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:@/'"]*:([^\s@/'"]{4,})@/gi,
    valorReal: true,
  },
  // Variables de entorno de estilo MAYÚSCULAS_PASSWORD / _SECRET / _TOKEN (también en YAML y JSON).
  {
    tipo: 'Contraseña en variable',
    regex: /\b[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD)["']?\s*[:=]\s*["']?([^\s'"`;&|,]{8,})/g,
    valorReal: true,
  },
  {
    tipo: 'Secreto en variable',
    regex: /\b[A-Z][A-Z0-9_]*SECRET["']?\s*[:=]\s*["']?([^\s'"`;&|,]{8,})/g,
    valorReal: true,
  },
  {
    tipo: 'Token en variable',
    regex: /\b[A-Z][A-Z0-9_]*TOKEN["']?\s*[:=]\s*["']?([^\s'"`;&|,]{8,})/g,
    valorReal: true,
  },
  { tipo: 'clave de OpenAI', regex: /\bsk-proj-[A-Za-z0-9_-]{20,}/g },
  { tipo: 'clave de Stripe', regex: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
  { tipo: 'clave de Google', regex: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { tipo: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { tipo: 'token de Telegram', regex: /(?<![\w:])\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g },
  { tipo: 'clave secreta de AWS', regex: /\baws_secret_access_key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi },
  { tipo: 'token de npm', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
]

const EJEMPLO = /example|xxxx|changeme|your[-_]|fake|dummy|test|sample|ejemplo|falso|<[^>]*>|\*\*\*/i

// Valores de relleno que nadie usa como secreto real.
const TRIVIAL = /^(?:x{3,}|pass(?:word)?\d?|secret|token|user|usuario|root|admin|guest|postgres|mysql|redis|redacted|none|null|undefined|true|false)$/i
// Marcadores, variables y expresiones de código: ${VAR}, $VAR, $(cmd), <valor>, process.env.X, os.environ[...], f(), NOMBRE_CONSTANTE.
const EXPRESION = /^[$<{%(]|\$[({]|[()\[\]`]|^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$|^[A-Z][A-Z0-9_]*$/

function parecePlaceholder(valor: string): boolean {
  return TRIVIAL.test(valor) || EXPRESION.test(valor)
}

function enmascarar(valor: string): string {
  // Un valor corto no puede mostrar 4 + 4 caracteres sin quedar completo.
  if (valor.length <= 12) return `${valor.slice(0, 2)}…`
  return `${valor.slice(0, 4)}…${valor.slice(-4)}`
}

export function detectarSecreto(texto: string): Hallazgo | undefined {
  for (const { tipo, regex, contexto, valorReal } of PATRONES) {
    if (contexto && !contexto.test(texto)) continue
    for (const m of texto.matchAll(regex)) {
      const valor = m[1] ?? m[0]
      if (EJEMPLO.test(valor)) continue
      if (valorReal && parecePlaceholder(valor)) continue
      return { tipo, muestra: enmascarar(valor) }
    }
  }
  return undefined
}

const SENSIBLES = /^(?:id_rsa|id_ed25519|id_ecdsa|credentials|credentials\.json|\.envrc|\.npmrc|\.netrc|.+\.pem|.+\.pfx|.+\.key)$/i
const PLANTILLAS_ENV = /^\.env\.(?:example|sample|template)$/i

export function esLecturaSensible(ruta: string): boolean {
  const nombre = ruta.split(/[\\/]/).pop() ?? ''
  if (PLANTILLAS_ENV.test(nombre)) return false
  if (nombre === '.env' || nombre.toLowerCase().startsWith('.env.')) return true
  // Un comodín como .env* alcanza a .env y a sus variantes.
  if (nombre.startsWith('.env') && /[*?]/.test(nombre)) return true
  return SENSIBLES.test(nombre)
}

const LECTORES = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat', 'batcat'])
// Prefijos que no cambian qué programa lee: sudo cat .env, env X=1 cat .env.
const PREFIJOS = new Set(['sudo', 'env', 'command', 'builtin', 'time', 'nohup', 'exec', 'nice'])

// Parte un comando de shell en órdenes (separadas por ; & | ( ) ` y saltos de línea) y estas en palabras,
// respetando comillas. Dentro de comillas dobles, `$(` y la comilla invertida abren una orden nueva.
function ordenes(comando: string): string[][] {
  const res: string[][] = []
  let palabras: string[] = []
  let actual = ''
  let hay = false
  let comilla: '"' | "'" | '' = ''
  const palabra = () => { if (hay) palabras.push(actual); actual = ''; hay = false }
  const orden = () => { palabra(); if (palabras.length) res.push(palabras); palabras = [] }
  for (let i = 0; i < comando.length; i++) {
    const c = comando[i]!
    if (comilla === "'") { if (c === "'") comilla = ''; else actual += c; continue }
    if (comilla === '"') {
      if (c === '"') comilla = ''
      else if (c === '`' || (c === '$' && comando[i + 1] === '(')) orden()
      else actual += c
      continue
    }
    if (c === '"' || c === "'") { comilla = c; hay = true; continue }
    if (/\s/.test(c) && c !== '\n') { palabra(); continue }
    if (';&|()`\n'.includes(c)) { orden(); continue }
    if (c === '$' && comando[i + 1] === '(') { orden(); continue }
    actual += c; hay = true
  }
  orden()
  return res
}

// Si el comando lee un archivo sensible con cat, less, more, head, tail o bat, devuelve su ruta.
export function comandoLeeSensible(comando: string): string | undefined {
  for (const palabras of ordenes(comando)) {
    let i = 0
    while (i < palabras.length && (PREFIJOS.has(palabras[i]!) || /^[A-Za-z_]\w*=/.test(palabras[i]!))) i++
    const programa = (palabras[i] ?? '').split('/').pop() ?? ''
    if (!LECTORES.has(programa)) continue
    for (const arg of palabras.slice(i + 1)) {
      if (arg.startsWith('-') || arg === '<') continue
      if (esLecturaSensible(arg)) return arg
    }
  }
  return undefined
}

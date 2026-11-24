// Las conversaciones entre sesiones: qué envía esta sesión a otra (SendMessage o herdr) y quién espera respuesta.
// Solo cálculo; el registro en disco y el dibujo están en register.tsx.

/** Un envío a otra sesión reconocido en una llamada a herramienta. */
export type Envio = {
  canal: 'herdr' | 'claude'
  /** Como lo nombra la llamada: nombre de agente o id de pestaña de herdr, o nombre de sesión de SendMessage. */
  destino: string
  resumen: string
  /** Quien envía se queda esperando la respuesta mientras dura la llamada (`--wait` o `agent wait`). */
  espera: boolean
  /** `herdr agent wait`: no es un mensaje nuevo, solo espera al destino. */
  soloEspera: boolean
}

const MAX_RESUMEN = 60
const OPERADORES = new Set(['&&', '||', ';', '|'])

const resumir = (s: string): string => {
  const linea = s.replace(/\s+/g, ' ').trim()
  return [...linea].length > MAX_RESUMEN ? `${[...linea].slice(0, MAX_RESUMEN - 1).join('')}…` : linea
}

/** Parte un comando de shell en órdenes y cada orden en palabras, respetando comillas simples y dobles. */
const ordenes = (comando: string): string[][] => {
  const res: string[][] = [[]]
  let palabra: string | null = null
  let comilla: '"' | "'" | null = null
  const cerrar = () => {
    if (palabra !== null) res[res.length - 1]!.push(palabra)
    palabra = null
  }
  for (let i = 0; i < comando.length; i++) {
    const c = comando[i]!
    if (comilla) {
      if (c === comilla) comilla = null
      else palabra += c
      continue
    }
    if (c === '"' || c === "'") {
      comilla = c
      palabra ??= ''
      continue
    }
    const dos = comando.slice(i, i + 2)
    if (OPERADORES.has(dos) || OPERADORES.has(c) || c === '\n') {
      cerrar()
      res.push([])
      if (OPERADORES.has(dos)) i++
      continue
    }
    if (/\s/.test(c)) {
      cerrar()
      continue
    }
    palabra = (palabra ?? '') + c
  }
  cerrar()
  return res.filter(o => o.length > 0)
}

/** Las palabras que no son flags: quita `--x` y su valor cuando es un número. */
const sinFlags = (palabras: readonly string[]): string[] => {
  const res: string[] = []
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i]!
    if (p.startsWith('--')) {
      if (/^\d+$/.test(palabras[i + 1] ?? '')) i++
      continue
    }
    res.push(p)
  }
  return res
}

const envioHerdr = (orden: readonly string[]): Envio | null => {
  const [bin, grupo, accion, ...resto] = orden
  if (!bin || !(bin === 'herdr' || bin.endsWith('/herdr'))) return null
  const args = sinFlags(resto)
  const destino = args[0]
  if (!destino) return null
  const conWait = resto.includes('--wait')
  if (grupo === 'agent' && accion === 'prompt' && args.length >= 2) {
    return { canal: 'herdr', destino, resumen: resumir(args.slice(1).join(' ')), espera: conWait, soloEspera: false }
  }
  if (grupo === 'agent' && accion === 'send-keys' && args.length >= 2) {
    return { canal: 'herdr', destino, resumen: resumir(args.slice(1).join(' ')), espera: false, soloEspera: false }
  }
  if (grupo === 'agent' && accion === 'wait') {
    return { canal: 'herdr', destino, resumen: '', espera: true, soloEspera: true }
  }
  if (grupo === 'pane' && accion === 'run' && args.length >= 2) {
    return { canal: 'herdr', destino, resumen: resumir(args.slice(1).join(' ')), espera: false, soloEspera: false }
  }
  return null
}

/** El envío que hace una llamada a herramienta, o null si no le habla a otra sesión. */
export const envioDe = (tool: string, input: unknown): Envio | null => {
  const i = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (tool === 'SendMessage') {
    if (typeof i.to !== 'string' || !i.to) return null
    const texto = typeof i.message === 'string' ? i.message : typeof i.summary === 'string' ? i.summary : ''
    return { canal: 'claude', destino: i.to, resumen: resumir(texto), espera: false, soloEspera: false }
  }
  if (tool !== 'Bash' || typeof i.command !== 'string') return null
  for (const orden of ordenes(i.command)) {
    const envio = envioHerdr(orden)
    if (envio) return envio
  }
  return null
}

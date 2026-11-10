import { bannerDe, type DetalleBanner, type Situacion } from './situacion'

// La disposición de 100 columnas de la propuesta: una rejilla de celdas que se compone a partir de los datos
// de Tablero. Es una función pura: no toca el DOM ni la red; el render la convierte en filas de texto de color.

export const MAPA_ANCHO = 100
export const MAPA_ALTO = 49
/** Con 0 o 1 tarea no hace falta el bus de tarjetas: el mapa baja a 32 filas. */
export const MAPA_ALTO_COMPACTO = 32
/** Desde este ancho el panel dibuja el mapa; entre este y MAPA_ANCHO, en una sola columna apilada. */
export const MAPA_MIN = 40

/** Color de una celda: se resuelve en el render contra la paleta de Tablero. */
export type Tinta = 'fg' | 'mut' | 'lead' | 'jev' | 'enj' | 'ase' | 'warn' | 'box' | 'amb' | 'osc'

/** Una celda de la rejilla. `bg` es el color de fondo (la franja de situación). `e` marca la segunda mitad de un emoji de dos columnas: no se dibuja. */
export type Celda = { c: string; k: Tinta; bg?: Tinta; e?: boolean }

export type FilaJev = { etiqueta: string; valor: number; texto: string; color: Tinta }

export type TarjetaMapa = {
  nombre: string
  modelo: string
  hechos: number
  total: number
  estado: 'R' | 'D' | 'Q' | 'W'
}

export type LimiteMapa = {
  etiqueta: string
  valor: number
  texto: string
  /** Lo que falta para el reseteo, sin espacios: `3h10m`. */
  reinicio?: string
  /** El ritmo de la semana (verde, ámbar, rojo): si está, ocupa el lugar del reinicio. */
  ritmo?: { texto: string; k: Tinta }
}

export type EstadoMapa = {
  costo: string
  ultimoTurno: string | null
  limites: LimiteMapa[]
  permisos: { pendientes: number; denegados: number; modo: string }
  bucles: number
  errores: number
  ediciones: number
  skills: string
  mcp: string
}

export type DatosMapa = {
  tiempo: string
  reloj: string
  rama: string | null
  /** La versión del mod, tal como está en plugin.json. */
  version: string
  situacion: Situacion
  detalle: DetalleBanner
  estado: EstadoMapa
  asesor: { estado: string; consultas: number; permisos: number; ultima: string | null }
  lead: { modelo: string; turno: string | null; ctx: number | null; mas: number; menos: number; respuestas: number; delegando: boolean }
  jev: { filas: FilaJev[]; decisiones: number; tope: string | null }
  tarjetas: TarjetaMapa[]
  registro: string[]
  asesorActivo: boolean
  barra: { hechos: number; total: number }
}

/** Un tramo de una fila: texto seguido del color que comparten sus celdas. */
export type Tramo = { c: string; k: Tinta; bg?: Tinta }

/** Une cada fila de la rejilla en tramos de un mismo color; la mitad de un emoji (`e`) no aporta texto. */
export const filasDeMapa = (g: Celda[][]): Tramo[][] =>
  g.map(fila => {
    const out: Tramo[] = []
    for (const celda of fila) {
      if (celda.e) continue
      const ultimo = out.at(-1)
      if (ultimo && ultimo.k === celda.k && ultimo.bg === celda.bg) ultimo.c += celda.c
      else out.push(celda.bg ? { c: celda.c, k: celda.k, bg: celda.bg } : { c: celda.c, k: celda.k })
    }
    return out
  })

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const LUNA = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
const BL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const EMOJI = /\p{Extended_Pictographic}/u

type Punto = [number, number]

const crearRejilla = (alto: number, ancho: number = MAPA_ANCHO): Celda[][] =>
  Array.from({ length: alto }, () => Array.from({ length: ancho }, () => ({ c: ' ', k: 'fg' as Tinta })))

const linea = (x1: number, y1: number, x2: number, y2: number): Punto[] => {
  const out: Punto[] = []
  if (y1 === y2) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) out.push([x, y1])
  } else {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) out.push([x1, y])
  }
  if (x1 > x2 || y1 > y2) out.reverse()
  return out
}

const poligono = (pts: Punto[]): Punto[] => {
  let out: Punto[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = linea(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    out = out.concat(i > 0 ? seg.slice(1) : seg)
  }
  return out
}

const put = (g: Celda[][], x: number, y: number, s: string, k: Tinta = 'fg', bg?: Tinta) => {
  let col = x
  for (const ch of Array.from(s)) {
    if (EMOJI.test(ch)) {
      if (y >= 0 && y < g.length && col >= 0 && col + 1 < g[y].length) {
        g[y][col] = bg ? { c: ch, k, bg } : { c: ch, k }
        g[y][col + 1] = bg ? { c: '', k, bg, e: true } : { c: '', k, e: true }
      }
      col += 2
    } else {
      if (y >= 0 && y < g.length && col >= 0 && col < g[y].length) g[y][col] = bg ? { c: ch, k, bg } : { c: ch, k }
      col++
    }
  }
}

/** Lo que cabe en `n` columnas; lo demás se corta antes del borde de la caja. */
const recortar = (s: string, n: number): string => Array.from(s).slice(0, n).join('')

/** Letras separadas por un espacio y palabras por tres: `T R A B A J A N D O`. */
const espaciado = (s: string): string => s.split(' ').map(p => Array.from(p).join(' ')).join('   ')

/** Un par etiqueta/valor en una caja que empieza en `x` y mide `w`: la etiqueta a la izquierda y el valor pegado al borde derecho. */
const par = (g: Celda[][], x: number, y: number, w: number, etiqueta: string, valor: string, k: Tinta = 'fg') => {
  put(g, x + 2, y, etiqueta, 'mut')
  put(g, x + w - 3 - Array.from(valor).length, y, valor, k)
}

/** Un paquete ● con su cola • y · que recorre el camino; `t` en segundos. */
const paquete = (g: Celda[][], camino: Punto[], t: number, velocidad: number, fase: number, k: Tinta) => {
  const n = camino.length
  const ciclo = n + 8
  const pos = (((t * velocidad + fase) % ciclo) + ciclo) % ciclo
  const i = Math.floor(pos)
  const pon = (j: number, c: string) => {
    if (j >= 0 && j < n) put(g, camino[j][0], camino[j][1], c, k)
  }
  pon(i, '●')
  pon(i - 1, '•')
  pon(i - 2, '·')
}

const hl = (g: Celda[][], x1: number, x2: number, y: number, ch: string, k: Tinta) => {
  for (let x = x1; x <= x2; x++) put(g, x, y, ch, k)
}
const vl = (g: Celda[][], x: number, y1: number, y2: number, ch: string, k: Tinta) => {
  for (let y = y1; y <= y2; y++) put(g, x, y, ch, k)
}

const caja = (g: Celda[][], x: number, y: number, w: number, h: number, titulo: string, k: Tinta) => {
  hl(g, x + 1, x + w - 2, y, '─', k)
  hl(g, x + 1, x + w - 2, y + h - 1, '─', k)
  vl(g, x, y + 1, y + h - 2, '│', k)
  vl(g, x + w - 1, y + 1, y + h - 2, '│', k)
  put(g, x, y, '┌', k)
  put(g, x + w - 1, y, '┐', k)
  put(g, x, y + h - 1, '└', k)
  put(g, x + w - 1, y + h - 1, '┘', k)
  if (titulo) put(g, x + 2, y, ` ${titulo} `, k)
}

/** Barra de `ancho` celdas con fracción `v` (0..1); el resto son puntos. */
const barra = (g: Celda[][], x: number, y: number, ancho: number, v: number, k: Tinta) => {
  const f = Math.max(0, Math.min(1, v)) * ancho
  const lleno = Math.floor(f)
  const frac = Math.round((f - lleno) * 8)
  for (let i = 0; i < ancho; i++) {
    if (i < lleno) put(g, x + i, y, '█', k)
    else if (i === lleno && frac > 0) put(g, x + i, y, BL[frac], k)
    else put(g, x + i, y, '·', 'mut')
  }
}

const barraPasos = (g: Celda[][], x: number, y: number, ancho: number, hechos: number, total: number, k: Tinta) => {
  const lleno = Math.round((Math.min(hechos, total) / Math.max(1, total)) * ancho)
  for (let i = 0; i < ancho; i++) put(g, x + i, y, i < lleno ? '█' : '░', i < lleno ? k : 'mut')
}

const glifo = (t: TarjetaMapa, idx: number, tiempo: number): [string, Tinta, string] => {
  if (t.estado === 'D') return ['✅', 'jev', 'listo']
  if (t.estado === 'Q') return ['⏳', 'mut', 'en cola']
  if (t.estado === 'W') return ['🔁', 'warn', 'reintenta']
  return [LUNA[(Math.floor(tiempo * 4) + idx) % LUNA.length], 'enj', 'en curso']
}

/** La franja de situación: tres filas (1 a 3) de fondo sólido y texto oscuro encima. Te espera y detenido parpadean. */
const franja = (g: Celda[][], d: DatosMapa, t: number, W: number, vivo: boolean, sp: string) => {
  const b = bannerDe(d.situacion, d.detalle)
  const parpadea = d.situacion === 'espera' || d.situacion === 'detenido'
  const encendido = !parpadea || vivo
  const bg: Tinta | undefined = encendido ? b.tinta : undefined
  const fg: Tinta = encendido ? 'osc' : b.tinta
  for (let y = 1; y <= 3; y++) for (let x = 0; x < W; x++) g[y][x] = bg ? { c: ' ', k: fg, bg } : { c: ' ', k: fg }
  const gl = b.glifo === 'spin' ? sp : b.glifo === 'latido' ? (Math.floor(t / 0.6) % 2 === 0 ? '○' : '●') : b.glifo
  // Con poco ancho, el rótulo va sin espaciar; el detalle se recorta al ancho.
  const largo = `${gl}   ${espaciado(b.rotulo)}`
  const titulo = Array.from(largo).length <= W - 4 ? largo : `${gl} ${b.rotulo}`
  const detalle = recortar(b.detalle, W - 4)
  put(g, Math.floor((W - Array.from(titulo).length) / 2), 2, titulo, fg, bg)
  put(g, Math.floor((W - Array.from(detalle).length) / 2), 3, detalle, fg, bg)
}

/**
 * Compone el mapa para los datos, el instante `t` (segundos desde que empezó la animación) y el ancho del panel.
 * Desde 100 columnas, la rejilla de dos columnas de 100; por debajo, todo apilado al ancho del panel.
 */
export const componerMapa = (d: DatosMapa, t: number, ancho: number = MAPA_ANCHO): Celda[][] =>
  ancho >= MAPA_ANCHO ? componerAncho(d, t) : componerAngosto(d, t, Math.max(MAPA_MIN, Math.floor(ancho)))

const componerAncho = (d: DatosMapa, t: number): Celda[][] => {
  const N = d.tarjetas.length
  const compacto = N <= 1
  const alto = compacto ? MAPA_ALTO_COMPACTO : MAPA_ALTO
  const g = crearRejilla(alto)
  const enCurso = d.tarjetas.filter(x => x.estado === 'R' || x.estado === 'W').length
  const listos = d.tarjetas.filter(x => x.estado === 'D').length
  const enCola = d.tarjetas.filter(x => x.estado === 'Q').length
  const sp = SPIN[Math.floor(t * 10) % SPIN.length]
  // El borde y el parpadeo siguen el mismo pulso: vivo y tenue, medio ciclo cada uno.
  const vivo = Math.floor(t * 1.7) % 2 === 0
  const hayTrabajo = enCurso > 0 || d.asesorActivo || d.situacion === 'trabajando'
  // Los paquetes solo recorren las líneas con trabajo: en reposo, las líneas quedan quietas.
  const paq = (...a: Parameters<typeof paquete>) => {
    if (hayTrabajo) paquete(...a)
  }

  // Cabecera
  put(g, 2, 0, 'TABLERO', 'fg')
  if (d.rama) put(g, 12, 0, `rama ${recortar(d.rama, 40)}`, 'mut')
  put(g, 78, 0, `t ${d.tiempo}`, 'mut')
  put(g, 88, 0, d.reloj, 'mut')

  franja(g, d, t, MAPA_ANCHO, vivo, sp)

  // ESTADO a todo lo ancho: lo que cuesta, cuánto queda y qué pasa con los permisos y los errores.
  const e = d.estado
  caja(g, 0, 5, 100, 6, 'ESTADO', 'mut')
  put(g, 2, 6, 'costo', 'mut')
  put(g, 8, 6, e.costo, 'fg')
  put(g, 2, 7, 'último turno', 'mut')
  put(g, 15, 7, e.ultimoTurno ?? '—', 'fg')
  e.limites.slice(0, 2).forEach((l, i) => {
    const x0 = 26 + i * 26
    put(g, x0, 6, `cupo ${l.etiqueta}`, 'mut')
    barra(g, x0 + 9, 6, 8, l.valor, l.valor >= 0.8 ? 'warn' : 'enj')
    put(g, x0 + 18, 6, l.texto, 'fg')
    if (l.ritmo) {
      put(g, x0, 7, 'ritmo', 'mut')
      put(g, x0 + 6, 7, recortar(l.ritmo.texto, 18), l.ritmo.k)
    } else if (l.reinicio) {
      put(g, x0, 7, 'reinicia', 'mut')
      put(g, x0 + 9, 7, l.reinicio, 'fg')
    }
  })
  put(g, 78, 6, 'permisos', 'mut')
  put(g, 87, 6, `${e.permisos.pendientes} pend.`, e.permisos.pendientes > 0 ? 'amb' : 'fg')
  put(g, 78, 7, `${e.permisos.denegados} den.`, e.permisos.denegados > 0 ? 'warn' : 'fg')
  put(g, 85, 7, recortar(e.permisos.modo, 12), 'mut')
  put(g, 2, 8, 'bucles', 'mut')
  put(g, 9, 8, String(e.bucles), 'fg')
  put(g, 14, 8, 'racha errores', 'mut')
  put(g, 28, 8, String(e.errores), e.errores > 0 ? 'warn' : 'fg')
  put(g, 33, 8, 'ediciones turno', 'mut')
  put(g, 49, 8, String(e.ediciones), 'fg')
  if (e.skills) {
    put(g, 2, 9, 'skills', 'mut')
    put(g, 9, 9, recortar(e.skills, 28), 'fg')
  }
  if (e.mcp) {
    put(g, 40, 9, 'mcp', 'mut')
    put(g, 44, 9, recortar(e.mcp, 52), 'fg')
  }

  // Asesor (izquierda), con la línea hasta el lead
  const kAs: Tinta = d.asesorActivo && !vivo ? 'box' : 'ase'
  caja(g, 0, 12, 44, 5, `ASESOR · ${d.asesor.estado}`, kAs)
  par(g, 0, 13, 44, 'consultas', String(d.asesor.consultas))
  par(g, 0, 14, 44, 'permisos', `${d.asesor.permisos} pend.`)
  put(g, 2, 15, recortar(`última consulta ${d.asesor.ultima ?? '—'}`, 40), 'mut')
  hl(g, 44, 49, 14, '─', 'mut')
  put(g, 50, 14, '▶', 'ase')
  if (d.asesorActivo || enCurso > 0) paq(g, linea(44, 14, 50, 14), t, 6, 0, 'ase')

  // Lead (derecha): el borde respira con trabajo y el spinner gira; en reposo, ○ fijo.
  const trabajaLead = d.lead.delegando || d.situacion === 'trabajando'
  caja(g, 51, 12, 49, 7, 'LEAD · principal', hayTrabajo && !vivo ? 'box' : 'lead')
  put(g, 72, 12, trabajaLead ? sp : '○', 'lead')
  put(g, 53, 13, d.lead.delegando ? 'delegando' : d.situacion === 'trabajando' ? 'trabajando' : 'a la espera', 'lead')
  if (d.lead.turno) put(g, 65, 13, `turno ${d.lead.turno}`, 'mut')
  par(g, 51, 14, 49, 'modelo', recortar(d.lead.modelo, 30))
  put(g, 53, 15, 'contexto', 'mut')
  if (d.lead.ctx === null) put(g, 94, 15, '—', 'mut')
  else {
    barra(g, 83, 15, 8, d.lead.ctx, d.lead.ctx >= 0.8 ? 'warn' : 'enj')
    put(g, 92, 15, `${Math.round(d.lead.ctx * 100)}%`, 'fg')
  }
  put(g, 53, 16, 'líneas', 'mut')
  const mas = `+${d.lead.mas}`
  put(g, 83, 16, mas, 'jev')
  put(g, 83 + mas.length + 1, 16, `−${d.lead.menos}`, 'warn')
  par(g, 51, 17, 49, 'respuestas', String(d.lead.respuestas))

  // Conector lead → JEV
  vl(g, 75, 19, 20, '│', 'mut')
  put(g, 75, 21, '▼', 'mut')
  paq(g, linea(75, 19, 75, 21), t, 7, 0.3, 'lead')

  // JEV (derecha, bajo el lead)
  caja(g, 51, 22, 49, 8, 'JEV · decisiones', 'jev')
  put(g, 53, 23, `${d.jev.decisiones} decisiones`, 'jev')
  put(g, 86, 23, 'umbral 0.80', 'mut')
  d.jev.filas.slice(0, 3).forEach((f, i) => {
    put(g, 53, 24 + i, f.etiqueta, 'fg')
    // Una columna libre entre la etiqueta (hasta la 64) y la barra, que empieza en la 66.
    barra(g, 66, 24 + i, 12, f.valor, f.color)
    put(g, 79, 24 + i, f.texto, f.color)
  })
  if (d.jev.tope) put(g, 53, 27, recortar(d.jev.tope, 44), 'warn')
  put(g, 53, 28, 'sharp → código · split → claude', 'mut')

  // Registro (izquierda, bajo el asesor): tantas filas como entradas, hasta 4.
  caja(g, 0, 17, 44, Math.max(3, Math.min(4, d.registro.length) + 2), 'REGISTRO', 'mut')
  d.registro.slice(-4).forEach((s, i) => put(g, 2, 18 + i, recortar(s, 40), 'fg'))

  // Pie: a la izquierda el estado de las tareas; a la derecha, la versión y el autor.
  const yPie = alto - 1
  if (N === 0) put(g, 2, yPie, 'SIN TAREAS · el lead espera trabajo', 'mut')
  else {
    put(g, 2, yPie, 'subagentes ', 'mut')
    put(g, 13, yPie, `[${d.barra.hechos}/${d.barra.total}]`, 'fg')
    put(g, 23, yPie, ' · asesor ', 'mut')
    put(g, 33, yPie, d.asesorActivo ? '[asesorando]' : '[de guardia]', 'ase')
    put(g, 46, yPie, ' · jev ', 'mut')
    put(g, 53, yPie, `[${d.jev.decisiones}]`, 'jev')
    if (hayTrabajo) put(g, 62, yPie, ` ${sp}`, 'enj')
  }
  const firma = `tablero v${d.version} · desarrollado por `
  put(g, MAPA_ANCHO - 2 - Array.from(firma).length - 2, yPie, firma, 'mut')
  put(g, MAPA_ANCHO - 4, yPie, 'JP', 'lead')

  if (N === 1) {
    // Con una tarea la tarjeta va a la izquierda, bajo el registro.
    const ag = d.tarjetas[0]
    const kc: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : ag.estado === 'Q' ? 'mut' : 'enj'
    caja(g, 0, 25, 44, 6, ag.nombre, kc)
    const [gl, kg, txt] = glifo(ag, 0, t)
    put(g, 2, 26, recortar(ag.modelo, 20), 'fg')
    barraPasos(g, 2, 27, 16, ag.hechos, ag.total, kc)
    put(g, 21, 27, `${Math.min(ag.hechos, ag.total)}/${ag.total}`, 'fg')
    put(g, 2, 28, `${gl} ${txt}`, kg)
    put(g, 2, 29, '▲ de vuelta al lead · revisar y verificar', 'lead')
  }
  if (compacto) return g

  // Con 2 o más tareas: un bus bajo la caja JEV (origen en la columna 75) y una caja por agente, diez filas más abajo.
  const Y = 10
  const OX = 75
  const P = (x: number, y: number, s: string, k: Tinta) => put(g, x, y + Y, s, k)
  const HL = (x1: number, x2: number, y: number, ch: string, k: Tinta) => hl(g, x1, x2, y + Y, ch, k)
  const VL = (x: number, y1: number, y2: number, ch: string, k: Tinta) => vl(g, x, y1 + Y, y2 + Y, ch, k)
  const desplazar = (pts: Punto[]): Punto[] => pts.map(([x, y]) => [x, y + Y] as Punto)
  if (N <= 3) {
    VL(OX, 20, 20, '│', 'mut')
    HL(15, 84, 21, '─', 'mut')
    P(14, 21, '┌', 'mut')
    P(85, 21, '┐', 'mut')
    P(OX, 21, '┼', 'mut')
    paq(g, desplazar(poligono([[OX, 20], [OX, 21], [50, 21], [50, 23]])), t, 7, 0.6, 'jev')
    const xs = [2, 38, 73]
    const bajadas = [14, 50, 85]
    d.tarjetas.forEach((ag, i) => {
      const x0 = xs[i]
      const cx = bajadas[i]
      VL(cx, 22, 23, '│', 'mut')
      P(cx, 23, '▼', 'enj')
      const [gl, kg, txt] = glifo(ag, i, t)
      const kc: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : ag.estado === 'Q' ? 'mut' : 'enj'
      caja(g, x0, 24 + Y, 26, 5, ag.nombre, kc)
      P(x0 + 2, 25, ag.modelo, 'fg')
      barraPasos(g, x0 + 2, 26 + Y, 16, ag.hechos, ag.total, kc)
      P(x0 + 19, 26, `${Math.min(ag.hechos, ag.total)}/${ag.total}`, 'fg')
      P(x0 + 2, 27, `${gl} ${txt}`, kg)
      if (ag.estado === 'R' || ag.estado === 'W') paq(g, desplazar(poligono([[OX, 20], [OX, 21], [cx, 21], [cx, 23]])), t, 7, i * 0.5, 'enj')
    })
    VL(14, 29, 29, '│', 'mut')
    VL(50, 29, 29, '│', 'mut')
    VL(85, 29, 29, '│', 'mut')
    HL(15, 84, 30, '─', 'mut')
    P(14, 30, '└', 'mut')
    P(85, 30, '┘', 'mut')
    P(50, 30, '┼', 'mut')
    VL(50, 31, 32, '│', 'mut')
    paq(g, desplazar(poligono([[14, 29], [14, 30], [50, 30], [50, 31]])), t, 6, 0.9, 'enj')
    paq(g, desplazar(poligono([[85, 29], [85, 30], [50, 30], [50, 31]])), t, 6, 1.4, 'enj')
  } else {
    // Lista: hasta siete agentes, con «+N más» si hay más
    HL(3, 96, 21, '─', 'mut')
    P(2, 21, '┌', 'mut')
    P(97, 21, '┐', 'mut')
    P(OX, 21, '┼', 'mut')
    VL(OX, 20, 20, '│', 'mut')
    paq(g, desplazar(linea(OX, 20, OX, 21)), t, 7, 0.6, 'jev')
    caja(g, 2, 22 + Y, 96, 10, `AGENTES ${N} · ${enCurso} en curso · ${listos} ok · ${enCola} en cola`, 'enj')
    P(OX, 22, '┴', 'enj')
    const filas = N > 8 ? 7 : N
    for (let i = 0; i < filas; i++) {
      const ag = d.tarjetas[i]
      const y = 23 + i
      const [gl, kg, txt] = glifo(ag, i, t)
      P(4, y, gl, kg)
      P(6, y, ag.nombre, 'fg')
      P(25, y, ag.modelo, 'mut')
      const kb: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : 'enj'
      barra(g, 39, y + Y, 12, Math.min(ag.hechos, ag.total) / Math.max(1, ag.total), kb)
      P(52, y, `${Math.min(ag.hechos, ag.total)}/${ag.total}`, 'fg')
      P(58, y, txt, kg)
      if (ag.estado === 'R' || ag.estado === 'W') P(92, y, Math.floor(t * 6 + i) % 2 === 0 ? '▸' : '▹', kg)
    }
    if (N > 8) P(6, 30, `+${N - 7} más · ${enCola} en cola`, 'mut')
    P(50, 31, '┬', 'enj')
    VL(50, 32, 32, '│', 'mut')
    paq(g, desplazar(poligono([[50, 31], [50, 32], [50, 33]])), t, 6, 0.9, 'enj')
  }

  // Vuelta al lead: la caja al fondo, sin línea de regreso (el encabezado ocupa todo el ancho).
  caja(g, 38, 33 + Y, 26, 4, '', 'mut')
  P(50, 33, '┴', 'mut')
  P(40, 34, 'de vuelta al lead', 'lead')
  P(40, 35, 'revisar y verificar', 'fg')
  return g
}

// ---- Disposición apilada (de MAPA_MIN a 99 columnas) ----

/** Un trozo que no se parte: texto de un color o una barra de `w` celdas. */
type Pieza = { t: string; k: Tinta } | { barra: number; w: number; k: Tinta }
const largoPieza = (p: Pieza) => ('t' in p ? Array.from(p.t).length : p.w)
const largoTrozo = (tr: Pieza[]) => tr.reduce((n, p) => n + largoPieza(p), 0)

/**
 * Coloca los trozos uno tras otro desde `x0`, separados por tres espacios, y pasa a la fila siguiente cuando el
 * próximo no cabe antes de `xMax`. Un trozo más largo que la fila entera se recorta. Devuelve las filas usadas.
 */
const fluir = (g: Celda[][], x0: number, y0: number, xMax: number, trozos: Pieza[][]): number => {
  const ancho = xMax - x0 + 1
  let x = x0
  let y = y0
  for (const tr of trozos) {
    const n = largoTrozo(tr)
    if (x > x0 && x + 3 + n - 1 > xMax) {
      x = x0
      y++
    } else if (x > x0) x += 3
    for (const p of tr) {
      const libre = xMax - x + 1
      if (libre <= 0) break
      if ('t' in p) {
        const s = recortar(p.t, libre)
        put(g, x, y, s, p.k)
        x += Array.from(s).length
      } else {
        const w = Math.min(p.w, libre)
        barra(g, x, y, w, p.barra, p.k)
        x += w
      }
    }
    if (n > ancho) x = xMax + 1
  }
  return y - y0 + 1
}

/** Etiqueta a la izquierda y valor pegado al borde derecho; con poco sitio, el valor se recorta. */
const parAjustado = (g: Celda[][], W: number, y: number, etiqueta: string, valor: string, k: Tinta = 'fg') => {
  put(g, 2, y, etiqueta, 'mut')
  const libre = W - 3 - (2 + Array.from(etiqueta).length + 1)
  const v = recortar(valor, Math.max(0, libre))
  put(g, W - 2 - Array.from(v).length, y, v, k)
}

const componerAngosto = (d: DatosMapa, t: number, W: number): Celda[][] => {
  const N = d.tarjetas.length
  const g = crearRejilla(120, W)
  const enCurso = d.tarjetas.filter(x => x.estado === 'R' || x.estado === 'W').length
  const listos = d.tarjetas.filter(x => x.estado === 'D').length
  const enCola = d.tarjetas.filter(x => x.estado === 'Q').length
  const sp = SPIN[Math.floor(t * 10) % SPIN.length]
  const vivo = Math.floor(t * 1.7) % 2 === 0
  const hayTrabajo = enCurso > 0 || d.asesorActivo || d.situacion === 'trabajando'
  const xMax = W - 3
  const iw = W - 4

  // Cabecera: TABLERO, la rama si cabe y el reloj a la derecha.
  const derecha = W >= 56 ? `t ${d.tiempo}  ${d.reloj}` : d.reloj
  put(g, W - 2 - Array.from(derecha).length, 0, derecha, 'mut')
  put(g, 2, 0, 'TABLERO', 'fg')
  const libreRama = W - 2 - Array.from(derecha).length - 2 - 12
  if (d.rama && libreRama >= 10) put(g, 12, 0, recortar(`rama ${d.rama}`, libreRama), 'mut')

  franja(g, d, t, W, vivo, sp)
  let y = 5

  // ESTADO: los mismos datos que a 100 columnas, en trozos que bajan de fila cuando no caben.
  const e = d.estado
  const trozos: Pieza[][] = [[{ t: 'costo ', k: 'mut' }, { t: e.costo, k: 'fg' }]]
  if (e.ultimoTurno) trozos.push([{ t: 'último turno ', k: 'mut' }, { t: e.ultimoTurno, k: 'fg' }])
  for (const l of e.limites.slice(0, 2)) {
    const tr: Pieza[] = [{ t: `cupo ${l.etiqueta} `, k: 'mut' }, { barra: l.valor, w: 8, k: l.valor >= 0.8 ? 'warn' : 'enj' }, { t: ` ${l.texto}`, k: 'fg' }]
    if (l.ritmo) tr.push({ t: ' ritmo ', k: 'mut' }, { t: l.ritmo.texto, k: l.ritmo.k })
    else if (l.reinicio) tr.push({ t: ' reinicia ', k: 'mut' }, { t: l.reinicio, k: 'fg' })
    trozos.push(tr)
  }
  trozos.push([
    { t: 'permisos ', k: 'mut' },
    { t: `${e.permisos.pendientes} pend.`, k: e.permisos.pendientes > 0 ? 'amb' : 'fg' },
    { t: ' ', k: 'mut' },
    { t: `${e.permisos.denegados} den.`, k: e.permisos.denegados > 0 ? 'warn' : 'fg' },
    { t: ` ${e.permisos.modo}`, k: 'mut' },
  ])
  trozos.push([{ t: 'bucles ', k: 'mut' }, { t: String(e.bucles), k: 'fg' }])
  trozos.push([{ t: 'racha errores ', k: 'mut' }, { t: String(e.errores), k: e.errores > 0 ? 'warn' : 'fg' }])
  trozos.push([{ t: 'ediciones turno ', k: 'mut' }, { t: String(e.ediciones), k: 'fg' }])
  // Skills y MCP van cada uno en su fila: son listas largas.
  const estadoFilas = fluir(g, 2, y + 1, xMax, trozos)
  let yIn = y + 1 + estadoFilas
  if (e.skills) {
    put(g, 2, yIn, 'skills ', 'mut')
    put(g, 9, yIn++, recortar(e.skills, iw - 7), 'fg')
  }
  if (e.mcp) {
    put(g, 2, yIn, 'mcp ', 'mut')
    put(g, 6, yIn++, recortar(e.mcp, iw - 4), 'fg')
  }
  caja(g, 0, y, W, yIn - y + 1, 'ESTADO', 'mut')
  y = yIn + 2

  // LEAD: el borde respira con trabajo y el spinner gira; en reposo, ○ fijo.
  const trabajaLead = d.lead.delegando || d.situacion === 'trabajando'
  const yLead = y
  caja(g, 0, yLead, W, 7, '', hayTrabajo && !vivo ? 'box' : 'lead')
  put(g, 2, yLead, ` LEAD · principal ${trabajaLead ? sp : '○'} `, 'lead')
  put(g, 2, yLead + 1, d.lead.delegando ? 'delegando' : d.situacion === 'trabajando' ? 'trabajando' : 'a la espera', 'lead')
  if (d.lead.turno) {
    const tt = `turno ${d.lead.turno}`
    put(g, W - 2 - tt.length, yLead + 1, tt, 'mut')
  }
  parAjustado(g, W, yLead + 2, 'modelo', d.lead.modelo)
  put(g, 2, yLead + 3, 'contexto', 'mut')
  if (d.lead.ctx === null) put(g, W - 3, yLead + 3, '—', 'mut')
  else {
    const pct = `${Math.round(d.lead.ctx * 100)}%`
    put(g, W - 2 - pct.length, yLead + 3, pct, 'fg')
    const bw = Math.min(12, W - 2 - pct.length - 1 - 12)
    barra(g, W - 2 - pct.length - 1 - bw, yLead + 3, bw, d.lead.ctx, d.lead.ctx >= 0.8 ? 'warn' : 'enj')
  }
  put(g, 2, yLead + 4, 'líneas', 'mut')
  const mas = `+${d.lead.mas}`
  const menos = `−${d.lead.menos}`
  const xMenos = W - 2 - Array.from(menos).length
  put(g, xMenos, yLead + 4, menos, 'warn')
  put(g, xMenos - 1 - mas.length, yLead + 4, mas, 'jev')
  parAjustado(g, W, yLead + 5, 'respuestas', String(d.lead.respuestas))
  y = yLead + 7

  // Conector lead → JEV, en el centro.
  const cx = Math.floor(W / 2)
  put(g, cx, y, '▼', 'mut')
  if (hayTrabajo) paquete(g, linea(cx, y - 1, cx, y), t, 7, 0.3, 'lead')
  y += 1

  // JEV: etiqueta a la izquierda, texto pegado a la derecha y la barra en el hueco que quede.
  const yJev = y
  const filasJev = d.jev.filas.slice(0, 3)
  const altoJev = 2 + 1 + filasJev.length + (d.jev.tope ? 1 : 0) + 1
  caja(g, 0, yJev, W, altoJev, 'JEV · decisiones', 'jev')
  put(g, 2, yJev + 1, `${d.jev.decisiones} decisiones`, 'jev')
  if (W >= 50) put(g, W - 2 - 11, yJev + 1, 'umbral 0.80', 'mut')
  filasJev.forEach((f, i) => {
    const yy = yJev + 2 + i
    const txt = f.texto
    const xTxt = W - 2 - Array.from(txt).length
    put(g, 2, yy, recortar(f.etiqueta, 13), 'fg')
    const bw = Math.min(12, xTxt - 1 - 16)
    if (bw >= 3) barra(g, xTxt - 1 - bw, yy, bw, f.valor, f.color)
    put(g, xTxt, yy, txt, f.color)
  })
  let yj = yJev + 2 + filasJev.length
  if (d.jev.tope) put(g, 2, yj++, recortar(d.jev.tope, iw), 'warn')
  put(g, 2, yj, recortar('sharp → código · split → claude', iw), 'mut')
  y = yJev + altoJev + 1

  // ASESOR
  const kAs: Tinta = d.asesorActivo && !vivo ? 'box' : 'ase'
  caja(g, 0, y, W, 5, recortar(`ASESOR · ${d.asesor.estado}`, W - 6), kAs)
  parAjustado(g, W, y + 1, 'consultas', String(d.asesor.consultas))
  parAjustado(g, W, y + 2, 'permisos', `${d.asesor.permisos} pend.`)
  put(g, 2, y + 3, recortar(`última consulta ${d.asesor.ultima ?? '—'}`, iw), 'mut')
  y += 6

  // REGISTRO: tantas filas como entradas, hasta 4.
  const reg = d.registro.slice(-4)
  caja(g, 0, y, W, Math.max(3, reg.length + 2), 'REGISTRO', 'mut')
  reg.forEach((s, i) => put(g, 2, y + 1 + i, recortar(s, iw), 'fg'))
  y += Math.max(3, reg.length + 2) + 1

  // AGENTES: una fila por tarea, hasta siete, con «+N más» si hay más de ocho.
  if (N > 0) {
    const filas = N > 8 ? 7 : N
    const alto = filas + 2 + (N > 8 ? 1 : 0)
    caja(g, 0, y, W, alto, '', 'enj')
    // El título más largo que quepa entero, sin cortar una palabra contra el borde.
    const titulos = [`AGENTES ${N} · ${enCurso} en curso · ${listos} ok · ${enCola} en cola`, `AGENTES ${N} · ${enCurso} en curso · ${listos} ok`, `AGENTES ${N}`]
    const tituloAg = titulos.find(x => Array.from(x).length + 2 <= W - 4) ?? `AGENTES ${N}`
    put(g, 2, y, ` ${tituloAg} `, 'enj')
    for (let i = 0; i < filas; i++) {
      const ag = d.tarjetas[i]
      const yy = y + 1 + i
      const [gl, kg, txt] = glifo(ag, i, t)
      const pasos = `${Math.min(ag.hechos, ag.total)}/${ag.total}`
      const der = W >= 60 ? `${pasos} ${txt}` : pasos
      const xDer = W - 2 - Array.from(der).length
      put(g, xDer, yy, pasos, 'fg')
      if (W >= 60) put(g, xDer + pasos.length + 1, yy, txt, kg)
      put(g, 2, yy, gl, kg)
      const nombreW = Math.min(18, xDer - 1 - 5)
      put(g, 5, yy, recortar(ag.nombre, nombreW), 'fg')
      const xBarra = 5 + nombreW + 1
      const bw = Math.min(12, xDer - 1 - xBarra)
      if (bw >= 4) {
        const kb: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : 'enj'
        barra(g, xBarra, yy, bw, Math.min(ag.hechos, ag.total) / Math.max(1, ag.total), kb)
      }
    }
    if (N > 8) put(g, 5, y + 1 + filas, recortar(`+${N - 7} más · ${enCola} en cola`, iw - 3), 'mut')
    y += alto + 1
  }

  // Pie: el estado de las tareas (si hay) y, en la última fila, la versión y el autor a la derecha.
  if (N === 0) put(g, 2, y++, recortar('SIN TAREAS · el lead espera trabajo', iw), 'mut')
  else {
    fluir(g, 2, y, xMax, [
      [{ t: 'subagentes ', k: 'mut' }, { t: `[${d.barra.hechos}/${d.barra.total}]`, k: 'fg' }],
      [{ t: 'asesor ', k: 'mut' }, { t: d.asesorActivo ? '[asesorando]' : '[de guardia]', k: 'ase' }],
      [{ t: 'jev ', k: 'mut' }, { t: `[${d.jev.decisiones}]`, k: 'jev' }],
    ])
    y = g.findLastIndex(r => r.some(c => c.c.trim() !== '')) + 1
  }
  const firma = W >= 50 ? `tablero v${d.version} · desarrollado por ` : `v${d.version} · `
  put(g, W - 2 - Array.from(firma).length - 2, y, firma, 'mut')
  put(g, W - 4, y, 'JP', 'lead')
  return g.slice(0, y + 1)
}

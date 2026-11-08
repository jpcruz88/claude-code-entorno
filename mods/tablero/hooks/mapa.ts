// La disposición de 100 columnas de la propuesta: una rejilla de celdas que se compone a partir de los datos
// de Tablero. Es una función pura: no toca el DOM ni la red; el render la convierte en filas de texto de color.

export const MAPA_ANCHO = 100
export const MAPA_ALTO = 42

/** Color de una celda: se resuelve en el render contra la paleta de Tablero. */
export type Tinta = 'fg' | 'mut' | 'lead' | 'jev' | 'enj' | 'ase' | 'warn' | 'box'

/** Una celda de la rejilla. `e` marca la segunda mitad de un emoji de dos columnas: no se dibuja. */
export type Celda = { c: string; k: Tinta; e?: boolean }

export type FilaJev = { etiqueta: string; valor: number; texto: string; color: Tinta }

export type TarjetaMapa = {
  nombre: string
  modelo: string
  hechos: number
  total: number
  estado: 'R' | 'D' | 'Q' | 'W'
}

export type DatosMapa = {
  tiempo: string
  reloj: string
  asesor: string[]
  estado: string[]
  /** Barras de los límites de uso (5 h, 7 d): van bajo las líneas de estado, de dos en dos como mucho. */
  limites?: { etiqueta: string; valor: number; texto: string }[]
  lead: { modelo: string; turno: string; delegando: boolean }
  jev: { filas: FilaJev[]; decisiones: number }
  tarjetas: TarjetaMapa[]
  registro: string[]
  asesorActivo: boolean
  barra: { hechos: number; total: number }
}

/** Un tramo de una fila: texto seguido del color que comparten sus celdas. */
export type Tramo = { c: string; k: Tinta }

/** Une cada fila de la rejilla en tramos de un mismo color; la mitad de un emoji (`e`) no aporta texto. */
export const filasDeMapa = (g: Celda[][]): Tramo[][] =>
  g.map(fila => {
    const out: Tramo[] = []
    for (const celda of fila) {
      if (celda.e) continue
      const ultimo = out.at(-1)
      if (ultimo && ultimo.k === celda.k) ultimo.c += celda.c
      else out.push({ c: celda.c, k: celda.k })
    }
    return out
  })

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const LUNA = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
const BL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const EMOJI = /\p{Extended_Pictographic}/u

type Punto = [number, number]

const crearRejilla = (): Celda[][] =>
  Array.from({ length: MAPA_ALTO }, () => Array.from({ length: MAPA_ANCHO }, () => ({ c: ' ', k: 'fg' as Tinta })))

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

const put = (g: Celda[][], x: number, y: number, s: string, k: Tinta = 'fg') => {
  let col = x
  for (const ch of Array.from(s)) {
    if (EMOJI.test(ch)) {
      if (col >= 0 && col + 1 < MAPA_ANCHO && y >= 0 && y < MAPA_ALTO) {
        g[y][col] = { c: ch, k }
        g[y][col + 1] = { c: '', k, e: true }
      }
      col += 2
    } else {
      if (col >= 0 && col < MAPA_ANCHO && y >= 0 && y < MAPA_ALTO) g[y][col] = { c: ch, k }
      col++
    }
  }
}

/** Lo que cabe dentro de una caja de 24 columnas (de la 4 a la 24): el borde derecho queda en la 25. */
const recortar = (s: string): string => Array.from(s).slice(0, 21).join('')

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

/** Compone la rejilla de 100 × 42 para los datos y el instante `t` (segundos desde que empezó la animación). */
export const componerMapa = (d: DatosMapa, t: number): Celda[][] => {
  const g = crearRejilla()
  const N = d.tarjetas.length
  const enCurso = d.tarjetas.filter(x => x.estado === 'R' || x.estado === 'W').length
  const listos = d.tarjetas.filter(x => x.estado === 'D').length
  const enCola = d.tarjetas.filter(x => x.estado === 'Q').length
  const sp = SPIN[Math.floor(t * 10) % SPIN.length]
  const pulso = Math.floor(t * 1.7) % 2 === 0 ? '●' : '○'

  // Cabecera
  put(g, 2, 0, 'TABLERO', 'fg')
  put(g, 11, 0, '· EN CURSO', 'lead')
  put(g, 62, 0, `t ${d.tiempo}`, 'mut')
  put(g, 72, 0, d.reloj, 'mut')

  // Asesor (izquierda, arriba) y estado (izquierda, debajo)
  caja(g, 2, 2, 24, 7, 'ASESOR', 'ase')
  d.asesor.slice(0, 5).forEach((s, i) => put(g, 4, 3 + i, recortar(s), i === 0 ? 'ase' : 'fg'))
  caja(g, 2, 11, 24, 9, 'ESTADO', 'mut')
  d.estado.slice(0, 4).forEach((s, i) => put(g, 4, 13 + i, recortar(s), 'fg'))
  ;(d.limites ?? []).slice(0, 2).forEach((l, i) => {
    const y = 17 + i
    put(g, 4, y, l.etiqueta, 'fg')
    barra(g, 8, y, 12, l.valor, l.valor >= 0.8 ? 'warn' : 'enj')
    put(g, 21, y, l.texto, 'fg')
  })

  // Lead (derecha, arriba) con la línea desde el asesor
  caja(g, 34, 2, 40, 6, 'LEAD · principal', 'lead')
  put(g, 36, 3, d.lead.modelo, 'lead')
  put(g, 70, 3, pulso, 'lead')
  put(g, 36, 4, d.lead.turno, 'fg')
  put(g, 36, 5, d.lead.delegando ? `delegando ${sp}` : 'a la espera', 'lead')
  hl(g, 26, 32, 4, '─', 'mut')
  put(g, 33, 4, '▶', 'ase')
  if (d.asesorActivo || enCurso > 0) paquete(g, linea(26, 4, 33, 4), t, 6, 0, 'ase')

  // Conector lead → JEV
  vl(g, 50, 8, 9, '│', 'mut')
  put(g, 50, 10, '▼', 'mut')
  paquete(g, linea(50, 8, 50, 10), t, 7, 0.3, 'lead')

  // JEV (derecha, medio)
  caja(g, 34, 11, 40, 9, 'JEV · decisiones', 'jev')
  d.jev.filas.slice(0, 3).forEach((f, i) => {
    put(g, 36, 13 + i, f.etiqueta, 'fg')
    barra(g, 48, 13 + i, 12, f.valor, f.color)
    put(g, 61, 13 + i, f.texto, f.color)
  })
  put(g, 48, 16, '┆ = umbral 0.80', 'mut')
  put(g, 36, 17, `${d.jev.decisiones} decisiones`, 'jev')
  put(g, 36, 18, 'sharp → código · split → claude', 'mut')

  if (N <= 3) {
    // Tarjetas: un bus de 14 a 85 y una caja por agente
    vl(g, 50, 20, 20, '│', 'mut')
    hl(g, 15, 84, 21, '─', 'mut')
    put(g, 14, 21, '┌', 'mut')
    put(g, 85, 21, '┐', 'mut')
    put(g, 50, 21, '┼', 'mut')
    paquete(g, linea(50, 20, 50, 21), t, 7, 0.6, 0, 'jev')
    const xs = [2, 38, 73]
    const bajadas = [14, 50, 85]
    d.tarjetas.forEach((ag, i) => {
      const x0 = xs[i]
      const cx = bajadas[i]
      vl(g, cx, 22, 23, '│', 'mut')
      put(g, cx, 23, '▼', 'enj')
      const [gl, kg, txt] = glifo(ag, i, t)
      const kc: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : ag.estado === 'Q' ? 'mut' : 'enj'
      caja(g, x0, 24, 26, 5, ag.nombre, kc)
      put(g, x0 + 2, 25, ag.modelo, 'fg')
      barraPasos(g, x0 + 2, 26, 16, ag.hechos, ag.total, kc)
      put(g, x0 + 19, 26, `${Math.min(ag.hechos, ag.total)}/${ag.total}`, 'fg')
      put(g, x0 + 2, 27, `${gl} ${txt}`, kg)
      if (ag.estado === 'R' || ag.estado === 'W') paquete(g, poligono([[50, 20], [50, 21], [cx, 21], [cx, 23]]), t, 7, i * 0.5, 'enj')
    })
    vl(g, 14, 29, 29, '│', 'mut')
    vl(g, 50, 29, 29, '│', 'mut')
    vl(g, 85, 29, 29, '│', 'mut')
    hl(g, 15, 84, 30, '─', 'mut')
    put(g, 14, 30, '└', 'mut')
    put(g, 85, 30, '┘', 'mut')
    put(g, 50, 30, '┼', 'mut')
    vl(g, 50, 31, 32, '│', 'mut')
    paquete(g, poligono([[14, 29], [14, 30], [50, 30], [50, 31]]), t, 6, 0.9, 'enj')
    paquete(g, poligono([[85, 29], [85, 30], [50, 30], [50, 31]]), t, 6, 1.4, 'enj')
  } else {
    // Lista: hasta siete agentes, con «+N más» si hay más
    hl(g, 3, 96, 21, '─', 'mut')
    put(g, 2, 21, '┌', 'mut')
    put(g, 97, 21, '┐', 'mut')
    put(g, 50, 21, '┼', 'mut')
    vl(g, 50, 20, 20, '│', 'mut')
    paquete(g, linea(50, 20, 50, 21), t, 7, 0.6, 0, 'jev')
    caja(g, 2, 22, 96, 10, `AGENTES ${N} · ${enCurso} en curso · ${listos} ok · ${enCola} en cola`, 'enj')
    put(g, 50, 22, '┴', 'enj')
    const filas = N > 8 ? 7 : N
    for (let i = 0; i < filas; i++) {
      const ag = d.tarjetas[i]
      const y = 23 + i
      const [gl, kg, txt] = glifo(ag, i, t)
      put(g, 4, y, gl, kg)
      put(g, 6, y, ag.nombre, 'fg')
      put(g, 25, y, ag.modelo, 'mut')
      const kb: Tinta = ag.estado === 'D' ? 'jev' : ag.estado === 'W' ? 'warn' : 'enj'
      barra(g, 39, y, 12, Math.min(ag.hechos, ag.total) / Math.max(1, ag.total), kb)
      put(g, 52, y, `${Math.min(ag.hechos, ag.total)}/${ag.total}`, 'fg')
      put(g, 58, y, txt, kg)
      if (ag.estado === 'R' || ag.estado === 'W') put(g, 92, y, Math.floor(t * 6 + i) % 2 === 0 ? '▸' : '▹', kg)
    }
    if (N > 8) put(g, 6, 30, `+${N - 7} más · ${enCola} en cola`, 'mut')
    put(g, 50, 31, '┬', 'enj')
    vl(g, 50, 32, 32, '│', 'mut')
    paquete(g, poligono([[50, 31], [50, 32], [50, 33]]), t, 6, 0.9, 'enj')
  }

  // Vuelta al lead, con la línea que sube por la derecha hasta el lead
  caja(g, 38, 33, 26, 4, '', 'mut')
  put(g, 50, 33, '┴', 'mut')
  put(g, 40, 34, 'de vuelta al lead', 'lead')
  put(g, 40, 35, 'revisar y verificar', 'fg')
  hl(g, 63, 98, 34, '─', 'mut')
  put(g, 99, 34, '┘', 'mut')
  vl(g, 99, 4, 33, '│', 'mut')
  put(g, 99, 3, '┐', 'mut')
  hl(g, 74, 98, 3, '─', 'mut')
  put(g, 74, 3, '◀', 'lead')
  paquete(g, poligono([[63, 34], [99, 34], [99, 3], [74, 3]]), t, 6, 0.2, 'lead')

  // Registro (izquierda, debajo del estado)
  caja(g, 2, 33, 24, 6, 'REGISTRO', 'mut')
  d.registro.slice(-4).forEach((s, i) => put(g, 4, 34 + i, recortar(s), 'fg'))

  // Barra de estado
  put(g, 2, 40, 'subagentes ', 'mut')
  put(g, 13, 40, `[${d.barra.hechos}/${d.barra.total}]`, 'fg')
  put(g, 23, 40, ' · asesor ', 'mut')
  put(g, 34, 40, d.asesorActivo ? '[asesorando]' : '[de guardia]', 'ase')
  put(g, 48, 40, ' · jev ', 'mut')
  put(g, 55, 40, `[${d.jev.decisiones}]`, 'jev')
  put(g, 70, 40, ` ${sp}`, 'enj')
  return g
}

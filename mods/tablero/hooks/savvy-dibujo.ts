// Dibujos del progreso y del panel de agentes (savvy-progress, MIT, johnnyvizz/claude-kit),
// adaptados: en español, sin el nivel «fable» y sin la disposición de derecha a izquierda.
// Cada fila es un SVG, igual que la banda sobre el prompt. Solo cadenas: no toca el motor.
import {
  type AgenteRun,
  type Flujo,
  PALABRAS,
  anchoTexto,
  colorDeNivel,
  ctxOf,
  elapsed,
  etiquetaFlujo,
  fitText,
  fmtCost,
  fmtTime,
  fmtTokens,
  modelName,
  nivelDe,
  nivelDeTarea,
  nombreDeTipo,
  palabraNivel,
  progresoRun,
  ratio,
  ruido,
  type TareaPlanificada,
  MODELO_NIVEL,
  palabraEsfuerzo,
} from './savvy-core'

const ACENTO = '#8f8cf4'
const HECHO = '#5fbf8f'
const ALTO = 22
const ALTO_BARRA = 16
const CRAB_W = 26
// El dibujo del cangrejo ocupa 30 unidades de ancho, con los accesorios.
const CRAB_BOX = 30
const CELDA = 3
const TIPO = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

export const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// --- barra del flujo

export const barraTexto = (f: Flujo, ancho: number): string => {
  const llenas = Math.round(ancho * ratio(f))
  return '█'.repeat(llenas) + '░'.repeat(Math.max(0, ancho - llenas))
}

export const ctxBarra = (pct: number, ancho: number): string => {
  const llenas = Math.round((ancho * pct) / 100)
  return '█'.repeat(llenas) + '░'.repeat(Math.max(0, ancho - llenas))
}

export const rowSvg = (f: Flujo, W: number, trabajando: boolean): string => {
  // El título ocupa lo que necesita, hasta el 40 % de la fila; la barra, el resto.
  const titulo = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BARRA_X = Math.round(16 + anchoTexto(titulo, 13) + 12)
  const BARRA_W = Math.max(60, W - BARRA_X - 46 - CRAB_W)
  const color = f.isFinished ? HECHO : ACENTO
  const y0 = (ALTO - ALTO_BARRA) / 2
  const llenoW = Math.round(BARRA_W * ratio(f))
  const enMarchaW = f.total ? Math.round((BARRA_W * Math.min(f.total, f.done + f.running)) / f.total) : 0

  // Punteado: escaso al principio, denso hacia la punta.
  const columnas = Math.floor(llenoW / CELDA)
  const filas = Math.floor(ALTO_BARRA / CELDA)
  const puntos: string[] = []
  for (let c = 0; c < columnas; c++) {
    const densidad = 0.35 + 0.6 * Math.pow(c / Math.max(1, columnas), 1.2)
    for (let r = 0; r < filas; r++) {
      if (ruido(c, r) < densidad) puntos.push(`<rect class="t${Math.floor(ruido(r, c) * 4)}" x="${c * CELDA + 1}" y="${r * CELDA + 1}" width="2" height="2"/>`)
    }
  }
  // Entregado a los trabajadores y aún no aceptado: una segunda capa tenue.
  const tenues: string[] = []
  for (let c = columnas; c < Math.floor(enMarchaW / CELDA); c++) {
    for (let r = 0; r < filas; r++) {
      if (ruido(c + 7, r + 3) < 0.2) tenues.push(`<rect class="t${Math.floor(ruido(r + 5, c) * 4)}" x="${c * CELDA + 1}" y="${r * CELDA + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const marcas: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BARRA_W * i) / f.total)
    if (x > llenoW + 4) marcas.push(`<rect x="${x}" y="${ALTO_BARRA / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const texto = etiquetaFlujo(f)
  const pastillaW = Math.round(18 + texto.length * 6.6)
  const pastillaX = Math.max(0, Math.min(BARRA_W - pastillaW, llenoW - pastillaW))
  const porcentaje = `${Math.round(ratio(f) * 100)}%`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${ALTO}" viewBox="0 0 ${W} ${ALTO}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
/* Los píxeles titilan en cuatro grupos desfasados; una barra terminada se queda en un brillo lento. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BARRA_W}" height="${ALTO_BARRA}" rx="${ALTO_BARRA / 2}"/></clipPath></defs>
<circle cx="5" cy="${ALTO / 2}" r="4" fill="${color}"/>
<text class="t" x="16" y="${ALTO / 2 + 4.5}" font-family="${TIPO}" font-size="13" font-weight="500">${xml(titulo)}</text>
<g transform="translate(${BARRA_X},${y0})">
<rect class="k" width="${BARRA_W}" height="${ALTO_BARRA}" rx="${ALTO_BARRA / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${puntos.join('')}</g>
<g fill="${color}" opacity="0.45">${tenues.join('')}</g>
<g class="tk">${marcas.join('')}</g>
</g>
<rect x="${pastillaX}" width="${pastillaW}" height="${ALTO_BARRA}" rx="${ALTO_BARRA / 2}" fill="${color}"/>
<text x="${pastillaX + pastillaW / 2}" y="${ALTO_BARRA / 2 + 4}" text-anchor="middle" font-family="${TIPO}" font-size="11" font-weight="600" fill="#ffffff">${xml(texto)}</text>
</g>
<text class="m" x="${W - CRAB_W - 6}" y="${ALTO / 2 + 4.5}" text-anchor="end" font-family="${TIPO}" font-size="12.5" font-variant-numeric="tabular-nums">${porcentaje}</text>
${CRAB_CSS}${crab(W - CRAB_W + 1, 0, 'other', false, trabajando, 0.8)}
</svg>`
}

// --- panel de agentes

const ANCHO_GRILLA = 16
const TESELA_MAX = 4096

export const gridTiles = (H: number): number[] => Array.from({ length: Math.ceil(H / TESELA_MAX) }, (_, i) => Math.min(TESELA_MAX, H - i * TESELA_MAX))

export const gridSvg = (W: number, H: number): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${ANCHO_GRILLA}" height="${ANCHO_GRILLA}" patternUnits="userSpaceOnUse"><circle class="d" cx="${ANCHO_GRILLA / 2}" cy="${ANCHO_GRILLA / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`

export const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Cangrejo de píxeles (inspirado en Clawdy de DockCrab): 24×18 sobre una rejilla de 30×28.
// El cuerpo lleva el barro de la marca; el color del nivel va en el accesorio.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` pone el píxel en un grupo: `bd` (el cuerpo y su disfraz por defecto), `la`/`lb`
// los pares de patas; cualquier otro, un accesorio con su propio movimiento.
type Relleno = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Relleno, x: number, y: number, filas: string[], mapa: Record<string, string>, cls?: string): void =>
  filas.forEach((fila, dy) => [...fila].forEach((ch, dx) => mapa[ch] && f(x + dx, y + dy, 1, 1, mapa[ch] ?? '', cls)))

// `armCls` deja que una pinza levantada viaje con el accesorio que sostiene.
const crabBody = (f: Relleno, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Solo CSS, lo pinta el compositor: sin redibujar. Los periodos dividen un segundo, así que el
// redibujo de cada segundo de una fila en marcha los deja en fase. Todos caminan; cada disfraz
// suma el movimiento de su accesorio.
export const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
@keyframes blink{50%{opacity:.15}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

// Disfraces por nivel. El nivel fable no existe en este mod.
export const COSTUMES: Record<string, (f: Relleno, color: string) => void> = {
  // Pesado: detective con gorra de cazador; la lupa barre y brilla.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Cuidadoso: ingeniero con casco; la llave gira un tornillo.
  careful: (f) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, '#8E929A')
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medio: cocinero; la sartén voltea la tortilla.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Ligero: corredor con casco; corre al doble de paso y la bandera ondea.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explorar: pirata que revisa el código; el sable esgrime.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  other: f => crabBody(f),
}

/** Disfraz de un agente: `Explore` tiene el suyo; el resto, el de su nivel. */
export const costumeOf = (tipo: string): string => (tipo === 'Explore' ? 'explore' : nivelDe(tipo))

export const CRAB_SCALE = 1.1

// El cuerpo y los accesorios van dentro de `bd`, para que un accesorio suba y baje con el cuerpo;
// las patas se mueven aparte. `mirror` lo voltea dentro de su caja para que mire a la izquierda.
export const crab = (x: number, y: number, disfraz: string, atenuado = false, caminando = false, escala = CRAB_SCALE, espejo = false): string => {
  const grupos = new Map<string, string[]>([['bd', []]])
  const f: Relleno = (cx, cy, w, h, c, cls = 'bd') => {
    if (!grupos.has(cls)) grupos.set(cls, [])
    grupos.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const dibujo = COSTUMES[disfraz] ?? ((g: Relleno) => crabBody(g))
  dibujo(f, colorDeNivel(disfraz))
  const grupo = (cls: string) => `<g class="${cls}">${(grupos.get(cls) ?? []).join('')}</g>`
  const accesorios = [...grupos.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const cuerpo = `<g class="bd">${(grupos.get('bd') ?? []).join('')}${accesorios.map(grupo).join('')}</g>`
  const sitio = espejo ? `translate(${x + CRAB_BOX * escala},${y}) scale(${-escala},${escala})` : `translate(${x},${y}) scale(${escala})`
  return `<g transform="${sitio}" opacity="${atenuado ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${disfraz}${caminando ? ' run' : ''}">${cuerpo}${grupo('la')}${grupo('lb')}</g></g>`
}

const crabWidth = (escala: number): number => Math.round(CRAB_BOX * escala * 100) / 100

const rowCrab = (x: number, y: number, disfraz: string, atenuado = false, caminando = false): string =>
  crab(x, y, disfraz, atenuado, caminando, CRAB_SCALE, false)

const svg = (W: number, H: number, cuerpo: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${cuerpo}</svg>`

export const headerSvg = (W: number, titulo: string, t: { cost: number; tokens: number; time: number }): string => {
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = titulo ? 28 : 0
  const casilla = (i: number, k: string, v: string) => `<rect class="tile" x="${i * (tw + gap)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" x="${i * (tw + gap) + 9}" y="${top + 16}" font-family="${TIPO}" font-size="11">${k}</text>
<text class="t" x="${i * (tw + gap) + 9}" y="${top + 33}" font-family="${TIPO}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    titulo ? 72 : 44,
    `${titulo ? `<text class="t" x="0" y="15" font-family="${TIPO}" font-size="14" font-weight="600">${xml(fitText(titulo, 14, W))}</text>` : ''}
${casilla(0, PALABRAS.costo, '≈' + fmtCost(t.cost))}${casilla(1, PALABRAS.tokens, fmtTokens(t.tokens))}${casilla(2, PALABRAS.tiempo, fmtTime(t.time))}`,
  )
}

export const agentSvg = (W: number, a: AgenteRun, ahora: number): string => {
  const nivel = nivelDe(a.type)
  const color = colorDeNivel(nivel)
  const ctx = ctxOf(a)
  const textoW = W - 42 - 22
  const meta = [a.effort ? `${modelName(a.model)} · ${palabraEsfuerzo(a.effort)}` : modelName(a.model)]
  if (a.round > 1) meta.push(`${PALABRAS.ronda} ${a.round}`)
  if (a.status === 'failed') meta.push(PALABRAS.error)
  const progreso = progresoRun(a)
  const estadisticas = `${PALABRAS.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, ahora))}`
  const pasos = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
  const pasosW = Math.max(0, textoW - anchoTexto(estadisticas, 11) - 12)
  // Sin pasos reportados, la barra cae al contexto, en gris.
  const llenoW = Math.round(textoW * (progreso ?? ctx / 100))
  return svg(
    W,
    66,
    `${rowCrab(0, 14, costumeOf(a.type), false, a.status === 'running')}
<text class="t" x="42" y="18" font-family="${TIPO}" font-size="13" font-weight="600">${xml(fitText(a.description || nombreDeTipo(a.type), 13, textoW))}</text>
<text x="42" y="34" font-family="${TIPO}" font-size="11"><tspan fill="${color}">${xml(nivel === 'other' ? nombreDeTipo(a.type) : palabraNivel(nivel))}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
${pasos && pasosW > 30 ? `<text class="t" x="42" y="49" font-family="${TIPO}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(pasos, 11, pasosW))}</text>` : ''}
<text class="s" x="${42 + textoW}" y="49" text-anchor="end" font-family="${TIPO}" font-size="11" font-variant-numeric="tabular-nums">${estadisticas}</text>
<rect class="k" x="42" y="55" width="${textoW}" height="4" rx="2"/><rect${progreso === null ? ' class="m"' : ''} x="42" y="55" width="${llenoW}" height="4" rx="2"${progreso === null ? '' : ` fill="${color}"`}/>
${marcaEstado(W - 8, 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

export const plannedSvg = (W: number, p: TareaPlanificada & { n: number }): string => {
  const nivel = nivelDeTarea(p)
  const color = colorDeNivel(nivel)
  const textoW = W - 42 - 22
  const meta = [nivel in MODELO_NIVEL ? `${MODELO_NIVEL[nivel]?.[0]} · ${palabraEsfuerzo(MODELO_NIVEL[nivel]?.[1] ?? '')}` : '']
  if (p.after.length) meta.push(`${PALABRAS.despues} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${rowCrab(0, 6, nivel, true)}
<text class="s" x="42" y="18" font-family="${TIPO}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textoW))}</text>
<text x="42" y="34" font-family="${TIPO}" font-size="11"><tspan fill="${color}">${xml(palabraNivel(nivel))}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${marcaEstado(W - 8, 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

export const compactSvg = (W: number, lista: AgenteRun[], planificadas: (TareaPlanificada & { n: number })[], t: { cost: number; tokens: number; time: number }): string => {
  const iconos = [
    ...lista.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a.type), c: colorDeNivel(nivelDe(a.type)), s: 'running', dim: false })),
    ...lista.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a.type), c: colorDeNivel(nivelDe(a.type)), s: a.status, dim: false })),
    ...planificadas.map(p => ({ k: nivelDeTarea(p), c: colorDeNivel(p.tier), s: 'planned', dim: true })),
  ]
  const caben = Math.max(1, Math.floor((W - 150) / 36))
  const mostrados = iconos.slice(0, caben)
  const mas = iconos.length - mostrados.length
  const cuerpo = mostrados
    .map((ic, i) => rowCrab(i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${i * 36 + 32}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = mostrados.length * 36 + (mas ? 4 : 0)
  return svg(
    W,
    32,
    `${cuerpo}${mas ? `<text class="s" x="${x}" y="21" font-family="${TIPO}" font-size="12">+${mas}</text>` : ''}
<text class="s" x="${W}" y="21" text-anchor="end" font-family="${TIPO}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

const marcaEstado = (x: number, y: number, estado: string, color: string): string => {
  if (estado === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (estado === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (estado === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

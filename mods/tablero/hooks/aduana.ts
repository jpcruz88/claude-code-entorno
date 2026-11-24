// El avance de las pruebas largas de Aduana (antes el mod aduana-panel).
import type { EstadoAduana } from '../types'

export const FRESCO_MS = 120_000 // sin cambios en 2 minutos: las pruebas ya no corren
export const TERMINADO_MS = 600_000 // una prueba terminada se muestra 10 minutos
const MOSTRAR = 3

/** Barra de `ancho` casillas llena en proporción a hechas/total; nunca se pasa del ancho. */
export function barra(hechas: number, total: number, ancho: number): string {
  const lleno = total <= 0 ? 0 : Math.max(0, Math.min(ancho, Math.round((hechas / total) * ancho)))
  return `${'█'.repeat(lleno)}${'░'.repeat(ancho - lleno)}`
}

export function vigente(estado: EstadoAduana | null, ahora: number): boolean {
  if (estado === null) return false
  return ahora - estado.actualizado < (estado.terminado ? TERMINADO_MS : FRESCO_MS)
}

function minutos(seg: number): string {
  return seg >= 60 ? `${Math.floor(seg / 60)}m${String(seg % 60).padStart(2, '0')}` : `${seg}s`
}

function corto(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto
}

/** Una o dos líneas para la franja: el avance y, si las hay, las corridas en curso. */
export function lineas(estado: EstadoAduana): string[] {
  const fase = estado.fases > 1 ? ` (${estado.fase}/${estado.fases})` : ''
  const fin = estado.terminado ? ' terminado' : ''
  const invalidas = estado.invalidas > 0 ? ` · ${estado.invalidas} inválidas` : ''
  const primera =
    `Aduana · ${estado.titulo}${fase} ${barra(estado.hechas, estado.total, 20)} ` +
    `${estado.hechas}/${estado.total}${fin} · ${estado.costo_usd.toFixed(2)} USD${invalidas}`
  if (estado.en_curso.length === 0) return [primera]
  const vivas = estado.en_curso
    .slice(0, MOSTRAR)
    .map(v => `${v.lado} ${corto(v.tarea, 14)} ${minutos(v.seg)}`)
    .join(' · ')
  const mas = estado.en_curso.length > MOSTRAR ? ` +${estado.en_curso.length - MOSTRAR}` : ''
  return [primera, `${estado.en_curso.length} en curso: ${vivas}${mas}`]
}

export type FilasAduana = {
  titulo: string
  hechas: number
  total: number
  costo: string
  invalidas: number
  enCurso: string | null
  terminado: boolean
}

/** Lo que dibuja la sección Aduana del tablero: lo mismo que `lineas`, por partes. */
export function filasAduana(estado: EstadoAduana): FilasAduana {
  const fase = estado.fases > 1 ? ` (${estado.fase}/${estado.fases})` : ''
  const [, segunda] = lineas(estado)
  return {
    titulo: `${estado.titulo}${fase}`,
    hechas: estado.hechas,
    total: estado.total,
    costo: `${estado.costo_usd.toFixed(2)} USD`,
    invalidas: estado.invalidas,
    enCurso: segunda ?? null,
    terminado: estado.terminado,
  }
}

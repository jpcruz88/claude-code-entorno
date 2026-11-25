import { expect, test } from 'claude-code/testing'

import { componerMapa, filasDeMapa, type DatosMapa, type TarjetaMapa } from '../hooks/mapa'
import { datos } from './datos-mapa'

// Con más de 8 tareas la lista enseña 7: las que están en curso primero y después las más recientes.
// `tarjetas` llega en el orden en que se lanzaron (la más vieja primero).

const filas = (d: DatosMapa, ancho: number) => filasDeMapa(componerMapa(d, 0, ancho)).map(f => f.map(t => t.c).join(''))

const tarea = (i: number, estado: TarjetaMapa['estado']): TarjetaMapa => ({ nombre: `tarea ${i}`, modelo: 'haiku', hechos: 1, total: null, estado })

/** Diez tareas terminadas salvo la 2, la única en curso y una de las más viejas. */
const diez = (): DatosMapa => {
  const d = datos(0)
  const tarjetas = Array.from({ length: 10 }, (_, k) => tarea(k + 1, k + 1 === 2 ? 'R' : 'D'))
  return { ...d, tarjetas, barra: { hechos: 9, total: 10 } }
}

const fila = (fs: string[], i: number) => fs.findIndex(f => new RegExp(`tarea ${i}(?!\\d)`).test(f))

for (const ancho of [66, 100]) {
  test(`${ancho} col: con más de 8 tareas sale la que está en curso aunque sea vieja`, () => {
    const fs = filas(diez(), ancho)
    expect(fila(fs, 2)).toBeGreaterThan(-1)
  })

  test(`${ancho} col: con más de 8 tareas salen las más recientes y las viejas van en «+N más»`, () => {
    const fs = filas(diez(), ancho)
    for (const i of [10, 9, 8, 7, 6, 5]) expect(fila(fs, i)).toBeGreaterThan(-1)
    for (const i of [1, 3, 4]) expect(fila(fs, i)).toBe(-1)
    expect(fs.join('\n')).toContain('+3 más')
  })

  test(`${ancho} col: la que está en curso va arriba y después la más reciente`, () => {
    const fs = filas(diez(), ancho)
    expect(fila(fs, 2)).toBeLessThan(fila(fs, 10))
    expect(fila(fs, 10)).toBeLessThan(fila(fs, 9))
  })
}

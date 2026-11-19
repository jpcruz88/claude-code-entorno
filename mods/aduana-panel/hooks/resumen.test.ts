import { expect, test } from 'claude-code/testing'
import type { EstadoAduana } from '../types'
import { barra, lineas, vigente } from './resumen'

const base: EstadoAduana = {
  titulo: 'Banco de método · Haiku',
  hechas: 9,
  total: 45,
  invalidas: 0,
  costo_usd: 1.5,
  fase: 1,
  fases: 2,
  terminado: false,
  en_curso: [],
  actualizado: 1_000_000,
}

test('la barra se llena en proporción y nunca se pasa del ancho', () => {
  expect(barra(0, 10, 10)).toBe('░░░░░░░░░░')
  expect(barra(5, 10, 10)).toBe('█████░░░░░')
  expect(barra(99, 10, 10)).toBe('██████████')
  expect(barra(3, 0, 4)).toBe('░░░░')
})

test('un estado en curso es vigente dos minutos y uno terminado diez', () => {
  expect(vigente(base, 1_000_000 + 119_000)).toBe(true)
  expect(vigente(base, 1_000_000 + 121_000)).toBe(false)
  const fin = { ...base, terminado: true }
  expect(vigente(fin, 1_000_000 + 599_000)).toBe(true)
  expect(vigente(fin, 1_000_000 + 601_000)).toBe(false)
  expect(vigente(null, 0)).toBe(false)
})

test('la primera línea lleva fase, barra, avance y costo', () => {
  const [primera] = lineas(base)
  expect(primera).toContain('Aduana · Banco de método · Haiku (1/2)')
  expect(primera).toContain('9/45')
  expect(primera).toContain('1.50 USD')
  expect(primera).not.toContain('terminado')
  expect(primera).not.toContain('inválidas')
})

test('una sola fase no muestra la cuenta de fases; terminado e inválidas sí aparecen', () => {
  const [primera] = lineas({ ...base, fases: 1, terminado: true, invalidas: 2 })
  expect(primera).not.toContain('(1/1)')
  expect(primera).toContain('terminado')
  expect(primera).toContain('2 inválidas')
})

test('sin corridas en curso hay una sola línea', () => {
  expect(lineas(base)).toHaveLength(1)
})

test('las corridas en curso salen en una segunda línea, con tres a lo más y el resto contado', () => {
  const vivas = [
    { lado: 'egm', ronda: 1, tarea: 'limites-aviso', modelo: 'haiku', seg: 279 },
    { lado: 'actual', ronda: 1, tarea: 'contar', modelo: 'haiku', seg: 45 },
    { lado: 'fresco', ronda: 2, tarea: 'hilo-exportar', modelo: 'haiku', seg: 5 },
    { lado: 'egm', ronda: 2, tarea: 'otra', modelo: 'haiku', seg: 1 },
  ]
  const [, segunda] = lineas({ ...base, en_curso: vivas })
  expect(segunda).toContain('4 en curso')
  expect(segunda).toContain('egm limites-aviso 4m39')
  expect(segunda).toContain('actual contar 45s')
  expect(segunda).toContain('+1')
  expect(segunda).not.toContain('otra')
})

test('un nombre de tarea largo se acorta con puntos suspensivos', () => {
  const [, segunda] = lineas({
    ...base,
    en_curso: [{ lado: 'egm', ronda: 1, tarea: 'una-tarea-con-nombre-larguisimo', modelo: 'h', seg: 1 }],
  })
  expect(segunda).toContain('una-tarea-con… 1s')
})

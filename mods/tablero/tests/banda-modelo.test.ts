import { expect, test } from 'claude-code/testing'

import { cellWidth } from '../hooks/core'
import { bandaFilas, carpetaCorta, tiempoRestante } from '../hooks/banda-modelo'
import type { BandaEntrada } from '../hooks/banda-modelo'

const MIN = 60_000
const AHORA = Date.parse('2026-10-30T12:00:00Z')

const base: BandaEntrada = {
  cwd: 'C:\\Users\\usuario\\Proyectos\\mods', // privacidad-ok gitleaks:allow
  modelo: 'Sonnet 5.5',
  costoUsd: 1.2,
  contextoPct: 42,
  agentesActivos: 2,
  agentesTotal: 3,
  permisosPendientes: 1,
  permisosDenegados: 0,
  limites: [{ kind: 'five_hour', pct: 63, resetsAt: AHORA + 130 * MIN }],
  ahora: AHORA,
  columnas: 100,
}

const textoDe = (e: BandaEntrada) => bandaFilas(e).map(f => f.tramos.map(t => t.texto).join(''))

test('la banda tiene 4 filas con los datos en español', () => {
  const filas = textoDe(base)
  expect(filas.length).toBe(4)
  expect(filas[0]).toContain('Carpeta')
  expect(filas[0]).toContain('mods')
  expect(filas[1]).toContain('Costo $1.20')
  expect(filas[1]).toContain('Contexto 42%')
  expect(filas[2]).toContain('Subagentes 2/3')
  expect(filas[2]).toContain('Permisos 1 pendiente')
  expect(filas[3]).toContain('5h')
  expect(filas[3]).toContain('63%')
  expect(filas[3]).toContain('se reinicia en 2 h 10 min')
})

test('sin ventanas de uso dice que no están disponibles', () => {
  expect(textoDe({ ...base, limites: [] })[3]).toContain('Uso no disponible en esta cuenta')
})

test('reseteo ausente o pasado muestra solo el porcentaje', () => {
  for (const resetsAt of [null, AHORA - MIN]) {
    const fila = textoDe({ ...base, limites: [{ kind: 'five_hour', pct: 63, resetsAt }] })[3]
    expect(fila).toContain('63%')
    expect(fila).not.toContain('se reinicia')
    expect(fila).not.toContain('NaN')
    expect(fila).not.toContain('-')
  }
})

test('uso mayor a 100 recorta la barra y marca peligro', () => {
  const filas = bandaFilas({ ...base, limites: [{ kind: 'spend_limit', pct: 130, resetsAt: null }] })
  const fila = filas[3]
  expect(fila.tramos.map(t => t.texto).join('')).toContain('130%')
  expect(fila.tramos.some(t => t.tono === 'peligro' && t.texto.includes('130%'))).toBe(true)
  const barras = fila.tramos.map(t => t.texto).join('').match(/[▰▱]/g) ?? []
  expect(barras.length).toBeLessThanOrEqual(20)
})

test('sin costo omite el costo y sin contexto muestra una raya', () => {
  const fila = textoDe({ ...base, costoUsd: null, contextoPct: null })[1]
  expect(fila).not.toContain('Costo')
  expect(fila).not.toContain('NaN')
  expect(fila).toContain('Contexto —')
})

test('en 50 columnas la ruta larga con acentos se recorta por el inicio', () => {
  const cwd = 'C:\\Users\\usuario\\OneDrive - Área de prueba\\Escritorio\\Proyectos\\mods' // privacidad-ok gitleaks:allow
  const filas = textoDe({ ...base, cwd, columnas: 50 })
  for (const f of filas) expect(cellWidth(f)).toBeLessThanOrEqual(50)
  expect(filas[0]).toContain('…')
  expect(filas[0]).toContain('mods')
})

test('permisos: sin pendientes y varios pendientes', () => {
  expect(textoDe({ ...base, permisosPendientes: 0 })[2]).toContain('Permisos sin pendientes')
  const filas = bandaFilas({ ...base, permisosPendientes: 2 })
  const textos = filas[2].tramos
  expect(textos.map(t => t.texto).join('')).toContain('Permisos 2 pendientes')
  expect(textos.some(t => t.tono === 'aviso' && t.texto.includes('2 pendientes'))).toBe(true)
})

test('tiempoRestante formatea minutos, horas y días', () => {
  expect(tiempoRestante(AHORA + 25 * MIN, AHORA)).toBe('25 min')
  expect(tiempoRestante(AHORA + 190 * MIN, AHORA)).toBe('3 h 10 min')
  expect(tiempoRestante(AHORA + (2 * 1440 + 120) * MIN, AHORA)).toBe('2 d 2 h')
  expect(tiempoRestante(null, AHORA)).toBe('')
  expect(tiempoRestante(AHORA - MIN, AHORA)).toBe('')
})

test('carpetaCorta conserva el final de la ruta', () => {
  expect(carpetaCorta('C:\\a\\b\\mods', 40)).toBe('C:\\a\\b\\mods')
  const corta = carpetaCorta('C:\\Users\\usuario\\Proyectos\\mods', 12) // privacidad-ok gitleaks:allow
  expect(corta.startsWith('…')).toBe(true)
  expect(corta.endsWith('mods')).toBe(true)
  expect(cellWidth(corta)).toBeLessThanOrEqual(12)
})

test('el indicador de la fila 3 pulsa solo si hay subagentes activos o permisos pendientes', () => {
  const marca = (e: BandaEntrada) => bandaFilas(e)[2].tramos.find(t => t.texto === '● ')
  expect(marca({ ...base, pulso: 'encendido' })?.tono).toBe('aviso')
  expect(marca({ ...base, pulso: 'apagado' })?.tono).toBe('tenue')
  expect(marca({ ...base, permisosPendientes: 0, pulso: 'encendido' })?.tono).toBe('acento')
  expect(marca({ ...base, agentesActivos: 0, permisosPendientes: 0, pulso: 'encendido' })).toBeUndefined()
})

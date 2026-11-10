import { expect, test } from 'claude-code/testing'

import { lineaLog, resumenJev, textoFilaJev } from '../hooks/jev-modelo'
import type { DecisionJev } from '../hooks/jev-modelo'
import { componerMapa, type Celda } from '../hooks/mapa'
import { datos } from './datos-mapa'

// Los textos de Jev se leen sin glosario: dicen qué pidió Claude, qué hizo Jev y qué tan seguro estaba.

const decision = (extra: Partial<DecisionJev> = {}): DecisionJev => ({
  hora: 0,
  sessionId: 's',
  tipo: 'modelo',
  opcion: 'sonnet',
  confianza: 0.91,
  sharp: true,
  claude: 'haiku',
  aplicada: true,
  descripcion: 'buscar',
  motivo: '',
  ...extra,
})

const texto = (g: Celda[][]) => g.map(r => r.map(c => c.c).join('')).join('\n')

test('registro: Jev cambió lo que pidió Claude', () => {
  expect(lineaLog(decision({ tipo: 'esfuerzo', claude: 'low', opcion: 'medium', confianza: 0.88 }))).toBe('Jev cambió esfuerzo low→medium (88%)')
  expect(lineaLog(decision({ claude: 'claude-haiku-5-5', opcion: 'sonnet', confianza: 0.91 }))).toBe('Jev cambió modelo haiku→sonnet (91%)')
})

test('registro: Jev estaba de acuerdo con Claude', () => {
  expect(lineaLog(decision({ claude: 'haiku', opcion: 'haiku', confianza: 0.98 }))).toBe('Jev dejó modelo haiku (98%)')
})

test('registro: Jev no llegó al 80% y se queda lo de Claude', () => {
  expect(lineaLog(decision({ tipo: 'esfuerzo', claude: 'low', opcion: 'high', confianza: 0.62, sharp: false, aplicada: false }))).toBe(
    'Jev no tocó esfuerzo low (solo 62%)',
  )
})

test('registro: sin elección de Claude, Jev eligió', () => {
  expect(lineaLog(decision({ claude: null, opcion: 'opus', confianza: 0.9 }))).toBe('Jev eligió modelo opus (90%)')
})

test('registro: reintento y sin respuesta', () => {
  expect(lineaLog(decision({ tipo: 'reintento', claude: null, opcion: 'parar_y_preguntar', confianza: 0.85 }))).toBe('Jev decidió: parar y preguntar (85%)')
  expect(lineaLog(decision({ tipo: 'reintento', claude: null, opcion: 'reintentar', confianza: 0.6, sharp: false }))).toBe('Jev no decidió si reintentar (solo 60%)')
  expect(lineaLog(decision({ opcion: null, confianza: null, sharp: false, aplicada: false }))).toBe('Jev no respondió sobre modelo')
})

test('registro: ninguna línea pasa de 40 columnas', () => {
  const larga = lineaLog(decision({ tipo: 'esfuerzo', claude: 'medium', opcion: 'xhigh', confianza: 1 }))
  expect(Array.from(larga).length).toBeLessThanOrEqual(40)
})

test('resumen: cada fila dice qué pasó en la última decisión', () => {
  expect(resumenJev([decision({ claude: 'haiku', opcion: 'sonnet' })]).filas[0]?.estado).toBe('cambio')
  expect(resumenJev([decision({ claude: 'haiku', opcion: 'haiku' })]).filas[0]?.estado).toBe('igual')
  expect(resumenJev([decision({ claude: null, opcion: 'haiku' })]).filas[0]?.estado).toBe('eligio')
  expect(resumenJev([decision({ sharp: false, aplicada: false })]).filas[0]?.estado).toBe('claude')
  expect(resumenJev([]).filas[0]?.estado).toBe(null)
})

test('fila de la caja JEV: porcentaje de seguridad y qué pasó, largo y corto', () => {
  expect(textoFilaJev(0.97, 'cambio')).toEqual({ largo: '97% seguro · lo cambió Jev', corto: '97% · lo cambió Jev' })
  expect(textoFilaJev(0.98, 'igual').largo).toBe('98% seguro · igual a Claude')
  expect(textoFilaJev(0.9, 'eligio').largo).toBe('90% seguro · lo eligió Jev')
  expect(textoFilaJev(0.62, 'claude').largo).toBe('62% seguro · decide Claude')
})

test('mapa (ancho y apilado): JEV como la maqueta, con umbral y sin sharp ni split', () => {
  for (const w of [40, 52, 66, 80, 99, 100]) {
    const s = texto(componerMapa(datos(0), 0, w))
    expect(s).toContain('JEV · decisiones')
    expect(s).toContain('umbral')
    expect(s).toContain('0.80')
    for (const palabra of ['sharp', 'split']) expect(s).not.toContain(palabra)
  }
})

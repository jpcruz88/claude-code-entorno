import { expect, test } from 'claude-code/testing'

import { cellWidth } from '../hooks/core'
import { lineasDeEdicion, modoLabel, partirLinea, restoCompacto, resumenLineas } from '../hooks/resumen-modelo'
import type { ResumenEntrada } from '../hooks/resumen-modelo'

const MIN = 60_000
// Viernes 30 de octubre de 2026, 13:33 hora local.
const AHORA = new Date(2026, 9, 30, 13, 33).getTime()
// Viernes 6 de noviembre de 2026, 04:00 hora local.
const SEMANA = new Date(2026, 10, 6, 4, 0).getTime()

const base: ResumenEntrada = {
  modelo: 'Sonnet 5.5',
  carpeta: 'mods',
  esfuerzo: 'medium',
  contextoPct: 10,
  costoUsd: 0.65,
  lineas: { agregadas: 19, quitadas: 10 },
  inicioSesion: AHORA - 10 * MIN,
  ahora: AHORA,
  limites: [
    { kind: 'five_hour', pct: 1, resetsAt: AHORA + (4 * 60 + 38) * MIN },
    { kind: 'seven_day', pct: 5, resetsAt: SEMANA },
  ],
  modo: 'bypassPermissions',
  agentesActivos: 0,
  agentesTotal: 0,
  permisosPendientes: 0,
}

test('la franja repite las tres líneas del footer, en el mismo orden', () => {
  const filas = resumenLineas(base)
  expect(filas.length).toBe(3)
  expect(filas[0]).toBe('tablero: $0.65 · ctx 10% · uso 1% (4 h 38 min)')
  expect(filas[1]).toBe('Sonnet 5.5 · 📁 mods · eff medium · ctx 10% · $0.65 · $3.90/h · +19 −10 · ⏱ 10m · sesión 1% ↻ 4h38m · semana 5% ↻ 6d14h (vie 04:00)')
  expect(filas[2]).toBe('⏵⏵ bypass permissions on')
})

test('sin un dato, la franja lo omite sin dejar separadores ni NaN', () => {
  const filas = resumenLineas({
    ...base,
    esfuerzo: '',
    contextoPct: null,
    costoUsd: null,
    lineas: { agregadas: 0, quitadas: 0 },
    inicioSesion: null,
    limites: [],
    modo: '',
    carpeta: '',
  })
  expect(filas).toEqual(['Sonnet 5.5'])
})

test('las líneas +/− solo salen si hubo cambios', () => {
  expect(resumenLineas({ ...base, lineas: { agregadas: 0, quitadas: 0 } })[1]).not.toContain('+0')
  expect(resumenLineas({ ...base, lineas: { agregadas: 3, quitadas: 0 } })[1]).toContain('+3 −0')
})

test('el tiempo de sesión usa minutos u horas con minutos', () => {
  expect(resumenLineas({ ...base, inicioSesion: AHORA - 65 * MIN })[1]).toContain('⏱ 1h05m')
  expect(resumenLineas({ ...base, inicioSesion: AHORA - 20_000 })[1]).toContain('⏱ 0m')
})

test('restoCompacto da días y horas, horas y minutos o minutos', () => {
  expect(restoCompacto(AHORA + 25 * MIN, AHORA)).toBe('25m')
  expect(restoCompacto(AHORA + (4 * 60 + 38) * MIN, AHORA)).toBe('4h38m')
  expect(restoCompacto(AHORA + (6 * 1440 + 14 * 60) * MIN, AHORA)).toBe('6d14h')
  expect(restoCompacto(null, AHORA)).toBe('')
  expect(restoCompacto(AHORA - MIN, AHORA)).toBe('')
})

test('el modo de permisos se muestra como en el footer nativo y el modo normal no ocupa línea', () => {
  expect(modoLabel('bypassPermissions')).toBe('⏵⏵ bypass permissions on')
  expect(modoLabel('acceptEdits')).toBe('⏵⏵ accept edits on')
  expect(modoLabel('plan')).toBe('⏸ plan mode on')
  expect(modoLabel('default')).toBe('')
  expect(modoLabel('')).toBe('')
  expect(resumenLineas({ ...base, modo: 'default' }).length).toBe(2)
})

test('un límite de gasto se llama gasto y sin reseteo no inventa tiempo', () => {
  const fila = resumenLineas({ ...base, limites: [{ kind: 'spend_limit', pct: 40, resetsAt: null }] })[1]
  expect(fila).toContain('gasto 40%')
  expect(fila).not.toContain('↻')
})

test('la rama de git va después de la carpeta', () => {
  expect(resumenLineas({ ...base, rama: 'main' })[1]).toContain('📁 mods · ⎇ main · eff medium')
  expect(resumenLineas({ ...base, rama: null })[1]).not.toContain('⎇')
})

test('con el contexto en 80 % o más avisa que conviene compactar', () => {
  expect(resumenLineas({ ...base, contextoPct: 79 })[1]).not.toContain('compactar')
  expect(resumenLineas({ ...base, contextoPct: 80 })[1]).toContain('ctx 80% · ⚠ compactar pronto · $0.65')
  expect(resumenLineas({ ...base, contextoPct: 95 })[1]).toContain('⚠ compactar pronto')
})

test('el costo del último turno y el ritmo de gasto salen cuando hay con qué calcularlos', () => {
  expect(resumenLineas({ ...base, costoUltimoTurno: 0.04 })[1]).toContain('$0.65 · último turno $0.04 · $3.90/h')
  // Con menos de 5 minutos de sesión el ritmo es puro ruido: no se muestra.
  expect(resumenLineas({ ...base, inicioSesion: AHORA - 4 * MIN })[1]).not.toContain('/h')
  expect(resumenLineas({ ...base, costoUsd: 0 })[1]).not.toContain('/h')
  expect(resumenLineas({ ...base, inicioSesion: null })[1]).not.toContain('/h')
})

test('mientras un turno corre se muestra cuánto lleva', () => {
  expect(resumenLineas({ ...base, turnoMs: 80_000 })[1]).toContain('⏱ 10m · ⏱ turno 1m20s · sesión')
  expect(resumenLineas({ ...base, turnoMs: 3_725_000 })[1]).toContain('⏱ turno 1h02m')
  expect(resumenLineas({ ...base, turnoMs: 45_000 })[1]).toContain('⏱ turno 45s')
  expect(resumenLineas({ ...base, turnoMs: null })[1]).not.toContain('turno')
})

test('un límite de uso en 80 % o más lleva ⚠', () => {
  const fila = resumenLineas({ ...base, limites: [{ kind: 'five_hour', pct: 85, resetsAt: AHORA + 30 * MIN }, { kind: 'seven_day', pct: 20, resetsAt: SEMANA }] })[1]
  expect(fila).toContain('⚠ sesión 85% ↻ 30m')
  expect(fila).not.toContain('⚠ semana')
})

test('partirLinea parte por los separadores, sin cortar ninguna pieza, y marca las líneas siguientes con ↳', () => {
  const texto = 'Sonnet 5.5 · 📁 mods · eff medium · ctx 10% · $0.65 · +19 −10 · ⏱ 10m'
  expect(partirLinea(texto, 200)).toEqual([texto])
  const partida = partirLinea(texto, 30)
  expect(partida.length).toBeGreaterThan(1)
  for (const l of partida) expect(cellWidth(l)).toBeLessThanOrEqual(30)
  expect(partida[0]).toBe('Sonnet 5.5 · 📁 mods')
  expect(partida.slice(1).every(l => l.startsWith('↳ '))).toBe(true)
  // Nunca espacios en los bordes de una línea.
  expect(partida.every(l => l === l.trim())).toBe(true)
  // Ninguna pieza se pierde ni se parte a la mitad.
  expect(partida.some(l => l.includes('+19 −10'))).toBe(true)
  expect(partida.some(l => l.includes('⏱ 10m'))).toBe(true)
})

test('partirLinea deja entera una pieza más ancha que la línea y no devuelve líneas vacías', () => {
  const larga = 'semana 5% ↻ 6d14h (vie 04:00)'
  expect(partirLinea(`a · ${larga}`, 10)).toEqual(['a', `↳ ${larga}`])
  expect(partirLinea('', 10)).toEqual([])
})

test('resumenLineas parte cada línea al ancho dado', () => {
  const filas = resumenLineas(base, 40)
  for (const l of filas) expect(cellWidth(l)).toBeLessThanOrEqual(40)
  expect(filas.join('\n')).toContain('(vie 04:00)')
  expect(filas[0]).toBe('tablero: $0.65 · ctx 10%')
  expect(filas[1]).toBe('↳ uso 1% (4 h 38 min)')
})

test('lineasDeEdicion aproxima las líneas de Edit, Write y NotebookEdit', () => {
  expect(lineasDeEdicion('Edit', { old_string: 'a\nb', new_string: 'a\nb\nc\nd' })).toEqual({ agregadas: 4, quitadas: 2 })
  expect(lineasDeEdicion('Edit', { old_string: '', new_string: 'x' })).toEqual({ agregadas: 1, quitadas: 0 })
  expect(lineasDeEdicion('Write', { content: 'uno\ndos\ntres\n' })).toEqual({ agregadas: 3, quitadas: 0 })
  expect(lineasDeEdicion('NotebookEdit', { new_source: 'a\nb' })).toEqual({ agregadas: 2, quitadas: 0 })
  expect(lineasDeEdicion('Read', { file_path: 'x' })).toEqual({ agregadas: 0, quitadas: 0 })
  expect(lineasDeEdicion('Edit', undefined)).toEqual({ agregadas: 0, quitadas: 0 })
  expect(lineasDeEdicion('Edit', { old_string: 5, new_string: null })).toEqual({ agregadas: 0, quitadas: 0 })
})

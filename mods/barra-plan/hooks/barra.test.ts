import { expect, test } from 'claude-code/testing'
import type { Plan } from '../types'
import { aplicar, barra, filas, resumen, tiempo, type Fila } from './barra'

const AHORA = 1_000_000

const nuevo = (extra: Record<string, unknown> = {}, titulo = 'Arreglar login') =>
  aplicar(
    undefined,
    {
      id: 'login',
      title: titulo,
      stages: [
        { name: 'Diagnóstico', steps: [{ title: 'Leer código' }, { title: 'Reproducir' }] },
        { name: 'Cambio', steps: [{ title: 'Parchear' }, { title: 'Probar' }] },
      ],
      ...extra,
    },
    AHORA,
  ) as Plan

const primera = (f: Fila[]): Fila => {
  const x = f[0]
  if (!x) throw new Error('sin fila')
  return x
}

const estados = (plan: Plan) => plan.pasos.map(p => p.status)

test('crear un plan deja el primer paso activo y el plan en curso', () => {
  const plan = nuevo()
  expect(plan.estado).toBe('running')
  expect(plan.pasos.map(p => p.title)).toEqual(['Leer código', 'Reproducir', 'Parchear', 'Probar'])
  expect(estados(plan)).toEqual(['active', 'pending', 'pending', 'pending'])
})

test('next pasa el paso activo a hecho y activa el siguiente', () => {
  const plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA) as Plan
  expect(estados(plan)).toEqual(['done', 'active', 'pending', 'pending'])
})

test('done marca pasos por título y active mueve el foco', () => {
  const plan = aplicar(nuevo(), { id: 'login', done: ['Leer código'], active: 'Parchear' }, AHORA) as Plan
  expect(estados(plan)).toEqual(['done', 'pending', 'active', 'pending'])
})

test('failed deja el paso con error, el plan en error y la nota', () => {
  const plan = aplicar(nuevo(), { id: 'login', failed: 'Leer código', note: 'no existe el archivo' }, AHORA) as Plan
  expect(plan.estado).toBe('error')
  expect(plan.note).toBe('no existe el archivo')
  expect(plan.pasos[0]?.status).toBe('failed')
})

test('state needs_input se guarda con su nota', () => {
  const plan = aplicar(nuevo(), { id: 'login', state: 'needs_input', note: '¿Qué rama?' }, AHORA) as Plan
  expect(plan.estado).toBe('needs_input')
  expect(plan.note).toBe('¿Qué rama?')
})

test('con todos los pasos hechos el plan termina y guarda la hora', () => {
  let plan = nuevo()
  for (let i = 0; i < 4; i++) plan = aplicar(plan, { id: 'login', next: true }, AHORA + 1000 * i) as Plan
  expect(plan.estado).toBe('done')
  expect(plan.endedAt).toBe(AHORA + 3000)
})

test('un paso que no existe es un error que nombra los pasos reales', () => {
  const r = aplicar(nuevo(), { id: 'login', done: ['No existe'] }, AHORA)
  expect(typeof r).toBe('string')
  expect(r as string).toContain('No existe')
  expect(r as string).toContain('Leer código')
})

test('actualizar una barra que no existe pide crearla', () => {
  const r = aplicar(undefined, { id: 'x', next: true }, AHORA)
  expect(r as string).toContain('create it')
})

test('la barra llena en octavos y siempre ocupa las celdas pedidas', () => {
  expect(barra(0, 8)).toBe('░░░░░░░░')
  expect(barra(1, 8)).toBe('████████')
  expect(barra(0.5, 8)).toBe('████░░░░')
  expect(barra(1 / 16, 8)).toBe('▌░░░░░░░')
  expect(barra(0.33, 12)).toHaveLength(12)
})

test('el tiempo lleva los segundos con dos cifras a partir del minuto', () => {
  expect(tiempo(42_000)).toBe('42s')
  expect(tiempo(130_000)).toBe('2m 10s')
  expect(tiempo(184_000)).toBe('3m 04s')
})

test('una línea en curso lleva glifo, título, barra, avance, paso y tiempo', () => {
  const plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA) as Plan
  const fila = primera(filas([plan], 100, AHORA + 130_000))
  expect(fila.texto).toBe('● Arreglar login  ███░░░░░░░░░  1/4  paso: Reproducir  2m 10s')
})

test('en estrecho el título se corta con … y la línea cabe en las columnas', () => {
  const plan = nuevo({}, 'Arreglar el inicio de sesión de la aplicación móvil')
  const fila = primera(filas([plan], 40, AHORA))
  expect(fila.texto.length).toBeLessThanOrEqual(40)
  expect(fila.texto).toContain('…')
  expect(fila.barra).toMatch(/^[█▏▎▍▌▋▊▉░]+$/)
})

test('una terminada se resume en una línea que caduca a los 30 segundos', () => {
  let plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA + 60_000) as Plan
  plan = aplicar(plan, { id: 'login', next: true }, AHORA + 120_000) as Plan
  plan = aplicar(plan, { id: 'login', next: true }, AHORA + 150_000) as Plan
  plan = aplicar(plan, { id: 'login', next: true }, AHORA + 184_000) as Plan
  expect(primera(filas([plan], 100, AHORA + 184_000 + 5_000)).texto).toBe('✓ Arreglar login · 4/4 · 3m 04s')
  expect(filas([plan], 100, AHORA + 184_000 + 31_000)).toEqual([])
})

test('más de tres planes abiertos: tres líneas y un «+N más»', () => {
  const planes = ['a', 'b', 'c', 'd'].map(id => aplicar(undefined, { id, title: id, steps: ['uno'] }, AHORA) as Plan)
  const textos = filas(planes, 100, AHORA).map(f => f.texto)
  expect(textos).toHaveLength(4)
  expect(textos[3]).toBe('+1 más')
})

test('sin planes no hay filas', () => {
  expect(filas([], 100, AHORA)).toEqual([])
})

test('pedir decisión o fallar muestra la nota en una segunda línea', () => {
  const pide = aplicar(nuevo(), { id: 'login', state: 'needs_input', note: '¿Qué rama?' }, AHORA) as Plan
  const fila = primera(filas([pide], 100, AHORA))
  expect(fila.nota).toBe('¿Qué rama?')
  expect(primera(filas([nuevo()], 100, AHORA)).nota).toBeNull()
})

test('la respuesta corta dice avance, estado y paso activo', () => {
  const plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA) as Plan
  expect(resumen(plan)).toBe('login: 1/4, running, active "Reproducir"')
})

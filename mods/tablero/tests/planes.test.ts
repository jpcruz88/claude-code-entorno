import { expect, test } from 'claude-code/testing'
import type { Plan } from '../types'
import { aplicar, barra, filaPlan, resumen, tiempo } from '../hooks/planes'

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

test('la respuesta corta dice avance, estado y paso activo', () => {
  const plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA) as Plan
  expect(resumen(plan)).toBe('login: 1/4, running, active "Reproducir"')
})

test('filaPlan: una pregunta pendiente es «◆ Te espera» con su nota', () => {
  const plan = aplicar(nuevo(), { id: 'login', state: 'needs_input', note: '¿Subo?' }, AHORA) as Plan
  const f = filaPlan(plan, AHORA + 5000)
  expect(f.glifo).toBe('◆')
  expect(f.palabra).toBe('Te espera')
  expect(f.nota).toBe('¿Subo?')
  expect(f.paso).toBe('Leer código')
})

test('filaPlan: en curso, con avance, paso activo y reloj m:ss', () => {
  const plan = aplicar(nuevo(), { id: 'login', next: true }, AHORA) as Plan
  const f = filaPlan(plan, AHORA + 75_000)
  expect(f.palabra).toBe('En curso')
  expect(f.hechos).toBe(1)
  expect(f.total).toBe(4)
  expect(f.paso).toBe('Reproducir')
  expect(f.tiempo).toBe('1:15')
  expect(f.nota).toBeNull()
})

test('filaPlan: hecho lleva ✓ y falló lleva ✗ con su nota', () => {
  let plan = nuevo()
  for (let i = 0; i < 4; i++) plan = aplicar(plan, { id: 'login', next: true }, AHORA) as Plan
  expect(filaPlan(plan, AHORA).glifo).toBe('✓')
  expect(filaPlan(plan, AHORA).palabra).toBe('Hecho')
  const roto = aplicar(nuevo(), { id: 'login', failed: 'Leer código', note: 'sin archivo' }, AHORA) as Plan
  expect(filaPlan(roto, AHORA).glifo).toBe('✗')
  expect(filaPlan(roto, AHORA).palabra).toBe('Falló')
  expect(filaPlan(roto, AHORA).nota).toBe('sin archivo')
})

test('ningún estado usa «?» como símbolo', () => {
  const plan = aplicar(nuevo(), { id: 'login', state: 'needs_input', note: 'x' }, AHORA) as Plan
  expect(filaPlan(plan, AHORA).glifo).not.toBe('?')
})

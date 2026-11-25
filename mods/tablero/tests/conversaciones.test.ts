import { expect, test } from 'claude-code/testing'
import { anotar, destinoHerdr, envioDe, estadoMensaje, filasConversaciones, leerConversaciones, resumenConversaciones, type FilaConversacion, type Mensaje } from '../hooks/conversaciones'

test('SendMessage: destino por to, resumen por el mensaje', () => {
  expect(envioDe('SendMessage', { to: 'Mazda', message: '¿Subo el PR?' })).toEqual({ canal: 'claude', destino: 'Mazda', resumen: '¿Subo el PR?', espera: false, soloEspera: false })
})

test('SendMessage sin destino no es un envío', () => {
  expect(envioDe('SendMessage', { message: 'hola' })).toBeNull()
})

test('herdr agent prompt con --wait, tras cd y &&, con comillas', () => {
  expect(envioDe('Bash', { command: `cd ~/x && herdr agent prompt reviewer "Revisa el diff" --wait --timeout 120000` })).toEqual({
    canal: 'herdr',
    destino: 'reviewer',
    resumen: 'Revisa el diff',
    espera: true,
    soloEspera: false,
  })
})

test('ruta absoluta a herdr y comillas simples', () => {
  expect(envioDe('Bash', { command: `/opt/bin/herdr agent prompt rev 'hola'` })).toMatchObject({ destino: 'rev', resumen: 'hola', espera: false })
})

test('send-keys no guarda lo tecleado (puede ser una contraseña); pane run usa el id de pestaña', () => {
  expect(envioDe('Bash', { command: 'herdr agent send-keys reviewer mi-clave enter' })).toMatchObject({ destino: 'reviewer', resumen: '' })
  expect(envioDe('Bash', { command: 'herdr pane run w5:p2 "just test"' })).toMatchObject({ destino: 'w5:p2', resumen: 'just test', espera: false })
})

test('agent wait solo marca espera', () => {
  expect(envioDe('Bash', { command: 'herdr agent wait reviewer --until blocked --timeout 120000' })).toMatchObject({ destino: 'reviewer', espera: true, soloEspera: true })
})

test('lo que no es un envío: lecturas, otros comandos, otras herramientas', () => {
  expect(envioDe('Bash', { command: 'herdr agent read reviewer --lines 40' })).toBeNull()
  expect(envioDe('Bash', { command: 'echo herdr agent prompt x hola' })).toBeNull()
  expect(envioDe('Bash', { command: 'herdr agent prompt' })).toBeNull()
  expect(envioDe('Read', { file_path: '/a' })).toBeNull()
  expect(envioDe('Bash', {})).toBeNull()
})

test('un resumen largo se recorta a 60 caracteres en una línea', () => {
  const r = envioDe('SendMessage', { to: 'a', message: 'x'.repeat(100) + '\notra' })!
  expect([...r.resumen].length).toBeLessThanOrEqual(60)
  expect(r.resumen).not.toContain('\n')
})

const AHORA = Date.parse('2026-11-24T12:00:00Z')
const msg = (p: Partial<Mensaje>): Mensaje => ({
  id: 't1',
  de: 'yo',
  deNombre: 'yo',
  a: 'rev',
  aNombre: 'reviewer',
  canal: 'herdr',
  resumen: 'Revisa',
  enviado: AHORA - 120_000,
  esperaFin: null,
  espera: false,
  ...p,
})

test('espera respuesta mientras el destino no termine un turno empezado después del envío', () => {
  expect(estadoMensaje(msg({}), () => ({ inicio: AHORA - 300_000, fin: AHORA - 200_000 }), AHORA)).toBe('espera')
  expect(estadoMensaje(msg({}), () => ({ inicio: AHORA - 100_000, fin: AHORA - 60_000 }), AHORA)).toBe('respondio')
})

test('un turno que ya estaba en curso al enviar no cuenta como respuesta', () => {
  expect(estadoMensaje(msg({}), () => ({ inicio: AHORA - 300_000, fin: AHORA - 60_000 }), AHORA)).toBe('espera')
})

test('un turno empezado después del envío que aún no termina no es respuesta', () => {
  expect(estadoMensaje(msg({}), () => ({ inicio: AHORA - 60_000, fin: AHORA - 90_000 }), AHORA)).toBe('espera')
})

test('un registro viejo sin inicio de turno se juzga solo por el fin', () => {
  expect(estadoMensaje(msg({}), () => ({ fin: AHORA - 60_000 }), AHORA)).toBe('respondio')
})

test('el fin de la llamada con --wait cierra la espera', () => {
  expect(estadoMensaje(msg({ espera: true, esperaFin: AHORA - 10_000 }), () => undefined, AHORA)).toBe('respondio')
})

test('sin destino resuelto o con más de 30 min: enviado, nunca espera', () => {
  expect(estadoMensaje(msg({ a: null }), () => undefined, AHORA)).toBe('enviado')
  expect(estadoMensaje(msg({ enviado: AHORA - 31 * 60_000 }), () => undefined, AHORA)).toBe('enviado')
})

test('un registro de sesión sin turnoFin no cierra la espera', () => {
  expect(estadoMensaje(msg({}), () => undefined, AHORA)).toBe('espera')
})

test('filas: lo de esta sesión primero, «esta» en lugar de su nombre, te pidió algo', () => {
  const f = filasConversaciones(
    [msg({ de: 'mz', deNombre: 'Mazda', a: 'yo', aNombre: 'x', id: 't2' }), msg({ de: 'mz', deNombre: 'Mazda', a: 'rev', id: 't3', enviado: AHORA - 1000 }), msg({})],
    'yo',
    () => undefined,
    AHORA,
  )
  expect(f.map(x => `${x.de}→${x.a}:${x.estado}:${x.teToca}`)).toEqual(['Mazda→esta:espera:true', 'esta→reviewer:espera:false', 'Mazda→reviewer:espera:false'])
})

test('fuera de la ventana: respondidos de hace más de 30 min no salen', () => {
  expect(filasConversaciones([msg({ enviado: AHORA - 40 * 60_000 })], 'yo', () => ({ inicio: AHORA - 39.5 * 60_000, fin: AHORA - 39 * 60_000 }), AHORA)).toEqual([])
})

test('resumen de la línea plegada', () => {
  const fila = (p: Partial<FilaConversacion>): FilaConversacion => ({ de: 'esta', a: 'r', estado: 'espera', teToca: false, desde: 0, resumen: '', ...p })
  expect(resumenConversaciones([fila({}), fila({ de: 'Mazda', a: 'esta', teToca: true })])).toBe('1 espera respuesta · 1 te pidió algo')
  expect(resumenConversaciones([fila({}), fila({})])).toBe('2 esperan respuesta')
  expect(resumenConversaciones([fila({ estado: 'respondio' }), fila({ estado: 'enviado' })])).toBe('2 mensajes recientes, sin esperas')
  expect(resumenConversaciones([fila({ estado: 'respondio' })])).toBe('1 mensaje reciente, sin esperas')
})

test('archivos rotos o de más de 24 h se ignoran', () => {
  expect(
    leerConversaciones([{ nombre: 'a.json', texto: '{"x":' }, { nombre: 'b.json', texto: JSON.stringify([msg({ enviado: AHORA - 25 * 3_600_000 })]) }, { nombre: 'c.json', texto: '[{"id":1}]' }], AHORA),
  ).toEqual([])
  expect(leerConversaciones([{ nombre: 'b.json', texto: JSON.stringify([msg({})]) }], AHORA)).toEqual([msg({})])
})

test('anotar reemplaza por id y deja los 20 más nuevos', () => {
  let l: Mensaje[] = []
  for (let i = 0; i < 25; i++) l = anotar(l, msg({ id: `t${i}`, enviado: AHORA - (25 - i) * 1000 }), AHORA)
  expect(l).toHaveLength(20)
  expect(l.some(m => m.id === 't0')).toBe(false)
  expect(anotar(l, msg({ id: 't24', resumen: 'otro' }), AHORA).filter(m => m.id === 't24')).toEqual([msg({ id: 't24', resumen: 'otro' })])
})

test('destinoHerdr lee la sesión y el nombre de pestaña de herdr agent get', () => {
  const salida = JSON.stringify({ result: { agent: { agent_session: { value: 'rev' }, terminal_title_stripped: ' Revisor ' } } })
  expect(destinoHerdr(salida)).toEqual({ id: 'rev', nombre: 'Revisor' })
  expect(destinoHerdr(JSON.stringify({ result: { agent: { agent_session: { value: 'rev' } } } }))).toEqual({ id: 'rev', nombre: 'rev' })
  expect(destinoHerdr('no es json')).toBeNull()
  expect(destinoHerdr('{"result":{}}')).toBeNull()
})

test('el nombre actual de la sesión gana al que tenía la pestaña al enviar', () => {
  const f = filasConversaciones([msg({ aNombre: 'Claude Code' })], 'yo', () => undefined, AHORA, id => (id === 'rev' ? 'Saludo de hola' : undefined))
  expect(f[0]!.a).toBe('Saludo de hola')
  expect(filasConversaciones([msg({ aNombre: 'Claude Code' })], 'yo', () => undefined, AHORA)[0]!.a).toBe('Claude Code')
})

test('un mensaje que empieza por -- es texto, no un flag', () => {
  expect(envioDe('Bash', { command: 'herdr agent prompt rev "--arregla la prueba" --wait' })).toMatchObject({ destino: 'rev', resumen: '--arregla la prueba', espera: true })
})

test('los secretos del texto no se guardan', () => {
  // El valor se arma en tiempo de ejecución para que no parezca un secreto real en el código.
  const valor = ['abc', '123', '456', '789'].join('')
  expect(envioDe('SendMessage', { to: 'a', message: `usa token=${valor} para subir` })!.resumen).not.toContain(valor)
})

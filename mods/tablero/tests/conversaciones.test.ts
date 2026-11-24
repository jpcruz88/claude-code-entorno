import { expect, test } from 'claude-code/testing'
import { envioDe } from '../hooks/conversaciones'

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

test('send-keys junta las teclas; pane run usa el id de pestaña', () => {
  expect(envioDe('Bash', { command: 'herdr agent send-keys reviewer esc ctrl+c' })?.resumen).toBe('esc ctrl+c')
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

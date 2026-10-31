import { expect, test } from 'claude-code/testing'
import { detectarMatarPorNombre } from './patrones'

const PELIGROSOS = [
  'pkill -f cat',
  'killall node',
  'pgrep node | xargs kill',
  'kill -1',
  'kill 0',
  'taskkill /IM node.exe',
  'taskkill //IM node.exe',
  'taskkill /im node.exe /F',
  'taskkill /FI "IMAGENAME eq node.exe"',
  'tskill node',
  'Stop-Process -Name node',
  'Get-Process node | Stop-Process',
  'echo hola\nStop-Process -Name node',
]

const SEGUROS = [
  'taskkill /PID 123',
  'taskkill //PID 123',
  'Stop-Process -Id 5',
  'kill 1234',
  'kill -15 1234',
  'ls',
]

for (const comando of PELIGROSOS) {
  test(`detecta: ${JSON.stringify(comando)}`, () => {
    expect(detectarMatarPorNombre(comando)).toEqual(expect.any(String))
  })
}

for (const comando of SEGUROS) {
  test(`no detecta: ${JSON.stringify(comando)}`, () => {
    expect(detectarMatarPorNombre(comando)).toBeUndefined()
  })
}

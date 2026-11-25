import { expect, mock, test } from 'claude-code/testing'

import { MOD_VERSION } from '../hooks/core'

// El panel muestra esta versión; debe ser una versión semver.
test('el mod expone su versión en formato semver', () => {
  expect(MOD_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})

// MOD_VERSION se copia a mano: si no se sube junto con plugin.json, el pie del mapa dice una versión vieja.
// Las pruebas no leen archivos; la versión de plugin.json llega en `plugin.register`, al cargar el mod.
test('la versión que muestra el panel es la de plugin.json', async ($, on) => {
  mock.clock(on)
  let delManifiesto: string | undefined
  on('plugin.register', (_$, e, next) => {
    if (e.name === 'tablero') delManifiesto = e.version
    return next(e)
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'tablero' } }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true } as never)
  expect(delManifiesto).toBeDefined()
  expect(MOD_VERSION).toBe(delManifiesto)
})

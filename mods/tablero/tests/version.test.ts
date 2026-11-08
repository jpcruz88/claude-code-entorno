import { expect, test } from 'claude-code/testing'

import { MOD_VERSION } from '../hooks/core'

// El panel muestra esta versión; debe ser una versión semver (la de plugin.json se verifica al publicar).
test('el mod expone su versión en formato semver', () => {
  expect(MOD_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})

import { expect, test } from 'claude-code/testing'

import { registrarAgentes } from '../hooks/savvy-registro'

// El host valida las opciones y no pasa null; aun así el registro no debe romperse si llega.
test('registrarAgentes con opciones en null no lanza y registra los manejadores', () => {
  const registrados: string[] = []
  const on = ((nombre: string) => {
    registrados.push(nombre)
  }) as never
  expect(() => registrarAgentes(on, null as never)).not.toThrow()
  expect(registrados.length).toBeGreaterThan(0)
})

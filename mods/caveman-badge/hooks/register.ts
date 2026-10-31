import type { Register } from 'claude-code'
import { etiqueta, siguienteModo, type Modo } from './modo'

export const register: Register = on => {
  let modo: Modo = 'full'

  on('session.start', ($, e, next) => {
    $.ui.status(etiqueta(modo))
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    const nuevo = siguienteModo(modo, e.text)
    if (nuevo !== modo) {
      modo = nuevo
      $.ui.status(etiqueta(modo))
    }
    return next(e)
  })
}

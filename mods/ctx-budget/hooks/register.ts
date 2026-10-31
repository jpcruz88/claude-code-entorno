import type { Register } from 'claude-code'
import { evaluar, type Armado } from './umbrales'

export const register: Register = on => {
  let armado: Armado = {}

  on('session.measure', async ($, e, next) => {
    const r = evaluar(e.context.percent, armado)
    armado = r.armado

    for (const umbral of r.avisar) {
      if (umbral === 70) {
        $.ui.toast('Contexto al 70 %: considera compactar')
      } else {
        const texto = 'Contexto al 85 %: compacta ya'
        // El toast es lo que se lee; notify solo suma el aviso sonoro (terminal_bell no muestra texto).
        $.ui.toast(texto)
        await $.ui.notify(texto, { title: 'ctx-budget' })
      }
    }

    return next(e)
  })
}

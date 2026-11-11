import type { Register } from 'claude-code'
import { evaluar, notaHandoff, type Armado } from './umbrales'

export const register: Register = on => {
  let armado: Armado = {}
  /** Umbral cruzado cuya nota de handoff aún no ha viajado con un mensaje. */
  let pendiente: number | undefined

  on('session.measure', async ($, e, next) => {
    const r = evaluar(e.context.percent, armado)
    armado = r.armado

    for (const umbral of r.avisar) {
      pendiente = umbral
      if (umbral === 70) {
        $.ui.toast('Contexto al 70 %: considera compactar')
      } else {
        const texto = 'Contexto al 85 %: compacta ya'
        // El toast es lo que se lee; notify solo suma el aviso sonoro (terminal_bell no muestra texto).
        $.ui.toast(texto)
        await $.ui.notify(texto, { title: 'ctx-budget' })
      }
    }
    // Bajó del umbral (se compactó): ya no hay contexto completo que guardar.
    if (pendiente !== undefined && !armado[pendiente]) pendiente = undefined

    return next(e)
  })

  // La nota viaja con el siguiente mensaje del usuario: Claude la lee, el usuario no la ve
  // y el texto que escribió queda intacto. Un comando no la gasta.
  on('prompt.submit', ($, e, next) => {
    if (pendiente === undefined || e.command) return next(e)
    const nota = notaHandoff(pendiente)
    pendiente = undefined
    return next({ ...e, context: [...(e.context ?? []), nota] })
  })
}

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Copia de claude-code-entorno: el mod de origen busca versiones nuevas en GitHub cada 6 horas y su botón «Actualizar»
// instala lo que encuentre. Aquí el código de terceros solo cambia con un PR revisado del repo, así que instalado desde
// el marketplace claude-code-entorno no debe consultar GitHub. La primera prueba es el control: desde otro marketplace
// la consulta sí ocurre, así que la prueba detecta la llamada.

const motor = (on: On, marketplace: string) => {
  const reloj = mock.clock(on)
  const pedidas: string[] = []
  let raiz = ''
  const guardado = new Map<string, unknown>()
  on('session.start', (_$, e) => ({ cwd: (e as { cwd?: string }).cwd }))
  on('session.id', () => ({ value: 'sesion-prueba' }))
  on('tool.register', () => ({ value: undefined }))
  on('tool.list', () => ({ value: [] }))
  on('command.register', () => ({ value: undefined }))
  on('config.list', () => ({ value: [] }))
  on('agent.list', () => ({ value: [] }))
  on('store.get', (_$, e) => ({ value: guardado.get(String((e as { key?: string }).key)) }))
  on('store.set', (_$, e) => {
    const { key, value } = e as { key?: string; value?: unknown }
    guardado.set(String(key), value)
    return { value: undefined }
  })
  on('store.delete', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [...guardado.keys()] }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('env.get', (_$, e) => ({ value: (e as { name?: string }).name === 'HOME' ? '/srv/demo' : undefined }))
  on('fs.read', (_$, e) => {
    const ruta = String((e as { path?: string }).path ?? '')
    if (ruta.endsWith('/.claude-plugin/plugin.json')) {
      raiz = ruta.slice(0, -'/.claude-plugin/plugin.json'.length)
      return { value: JSON.stringify({ name: 'plan-progress', version: '1.0.1' }) }
    }
    if (ruta.endsWith('/plugins/installed_plugins.json'))
      return { value: JSON.stringify({ plugins: { [`plan-progress@${marketplace}`]: [{ installPath: raiz }] } }) }
    throw new Error('ENOENT')
  })
  on('http.fetch', (_$, e) => {
    pedidas.push(String((e as { url?: string }).url ?? ''))
    return { value: { ok: true, status: 200, text: '[]', headers: {} } }
  })
  return { reloj, pedidas }
}

test('control: instalado desde otro marketplace, consulta GitHub al arrancar', async ($, on) => {
  const { reloj, pedidas } = motor(on, 'zycck-mods')
  await $.session.start({ cwd: '/srv/demo' } as never)
  await reloj.advance(20_000)
  expect(pedidas.some(u => u.includes('api.github.com'))).toBe(true)
})

test('instalado desde claude-code-entorno, no consulta GitHub', async ($, on) => {
  const { reloj, pedidas } = motor(on, 'claude-code-entorno')
  await $.session.start({ cwd: '/srv/demo' } as never)
  await reloj.advance(31 * 60 * 1000)
  expect(pedidas).toEqual([])
})

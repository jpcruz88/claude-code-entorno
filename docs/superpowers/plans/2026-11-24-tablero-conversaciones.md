# Tablero: Conversaciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una sección «Conversaciones» en el tablero que muestra quién le habla a quién entre sesiones de Claude y quién espera respuesta.

**Architecture:** cada tablero anota los envíos de su sesión principal (`SendMessage` y comandos `herdr agent|pane`) en `~/.claude/tablero/conversaciones/<id>.json`; todos leen todos los archivos en la vuelta de fuentes (10 s). La espera se cierra cuando el destino termina un turno después del envío (`turnoFin` en el registro de Sesiones) o cuando acaba la llamada con `--wait`. La lógica va en un módulo puro `hooks/conversaciones.ts`; `register.tsx` solo cablea y dibuja.

**Tech Stack:** TypeScript del mod (`claude-code` hooks API, `claude-code/testing`), Bun vía `claude plugin test`.

**Spec:** `docs/superpowers/specs/2026-11-24-tablero-conversaciones-design.md`

## Global Constraints

- Versión del mod: `1.4.0` en `mods/tablero/.claude-plugin/plugin.json`, `MOD_VERSION` de `hooks/core.ts` y `.claude-plugin/marketplace.json`.
- Textos en español llano que se entiendan solos: «Conversaciones», «Espera respuesta», «Te pidió algo», «Respondió», «Enviado», «esta» para la sesión propia.
- Ventana visible: mensajes de los últimos 30 min o con espera abierta. Registro: 20 mensajes por sesión, de menos de 24 h.
- La espera caduca a los 30 min. `herdr agent get` con tope de 2 s; si falla, el destino queda sin resolver y sin estado de respuesta.
- Solo la sesión principal (`e.agentId` nulo) registra envíos.
- Tecla `c` abre y pliega la sección. Plegada por defecto.
- A 40 columnas ninguna fila pasa del ancho.
- Antes de pruebas y commits: `find . -name '._*' -not -path './.git/*' -delete`. Commits en español con `Co-Authored-By`.

## Review Focus

1. Comandos de Bash con varias órdenes (`cd x && herdr agent prompt rev "…"`), comillas simples/dobles y ruta absoluta a `herdr`: se reconoce el envío. → prueba en Tarea 1.
2. Un registro de sesión viejo, sin `turnoFin`: sigue siendo válido y la espera no se cierra por él. → prueba en Tarea 2.
3. Un destino sin resolver (herdr caído, nombre desconocido): sale como «○ Enviado», nunca «Espera respuesta». → pruebas en Tareas 2 y 3.
4. El envío se hace a uno mismo (`herdr agent prompt` a su propia pestaña): no se registra. → prueba en Tarea 1 (por id resuelto, Tarea 3).
5. Archivo de conversaciones roto o a medio escribir: se ignora sin tumbar el panel. → prueba en Tarea 2.

---

### Task 1: Reconocer envíos

**Files:**
- Create: `mods/tablero/hooks/conversaciones.ts`
- Test: `mods/tablero/tests/conversaciones.test.ts`

**Interfaces:**
- Produces: `export type Envio = { canal: 'herdr' | 'claude'; destino: string; resumen: string; espera: boolean; soloEspera: boolean }` y `export const envioDe = (tool: string, input: unknown): Envio | null`.
  - `soloEspera: true` para `herdr agent wait` (no es mensaje nuevo; marca espera mientras dura la llamada).
  - `espera: true` si lleva `--wait` o es `agent wait`.
  - `resumen`: texto enviado (o las teclas unidas por espacio), sin comillas, una línea, máximo 60 caracteres.

- [ ] **Step 1: pruebas que fallan**

```ts
test('SendMessage: destino por to, resumen por summary o message', () => {
  expect(envioDe('SendMessage', { to: 'Mazda', message: '¿Subo el PR?' })).toEqual({ canal: 'claude', destino: 'Mazda', resumen: '¿Subo el PR?', espera: false, soloEspera: false })
})
test('herdr agent prompt con --wait, tras cd y &&, con comillas', () => {
  expect(envioDe('Bash', { command: `cd ~/x && herdr agent prompt reviewer "Revisa el diff" --wait --timeout 120000` }))
    .toEqual({ canal: 'herdr', destino: 'reviewer', resumen: 'Revisa el diff', espera: true, soloEspera: false })
})
test('ruta absoluta a herdr y comillas simples', () => {
  expect(envioDe('Bash', { command: `/opt/bin/herdr agent prompt rev 'hola'` })?.destino).toBe('rev')
})
test('send-keys junta las teclas; pane run usa el id de pestaña', () => {
  expect(envioDe('Bash', { command: 'herdr agent send-keys reviewer esc' })?.resumen).toBe('esc')
  expect(envioDe('Bash', { command: 'herdr pane run w5:p2 "just test"' })).toMatchObject({ destino: 'w5:p2', resumen: 'just test', espera: false })
})
test('agent wait solo marca espera', () => {
  expect(envioDe('Bash', { command: 'herdr agent wait reviewer --until blocked' })).toMatchObject({ destino: 'reviewer', espera: true, soloEspera: true })
})
test('lo que no es un envío: lecturas, otros comandos, otras herramientas', () => {
  expect(envioDe('Bash', { command: 'herdr agent read reviewer --lines 40' })).toBeNull()
  expect(envioDe('Bash', { command: 'echo herdr agent prompt x hola' })).toBeNull()
  expect(envioDe('Read', { file_path: '/a' })).toBeNull()
})
test('un resumen largo se recorta a 60 caracteres en una línea', () => {
  const r = envioDe('SendMessage', { to: 'a', message: 'x'.repeat(100) + '\notra' })!
  expect([...r.resumen].length).toBeLessThanOrEqual(60)
  expect(r.resumen).not.toContain('\n')
})
```

- [ ] **Step 2:** `claude plugin test mods/tablero` → fallan (módulo inexistente).
- [ ] **Step 3: implementar `envioDe`.** Partir el comando por `&&`, `;`, `||` y `|`; en cada orden, tokenizar respetando comillas; reconocer cuando el primer token termina en `/herdr` o es `herdr`, seguido de `agent prompt|send-keys|wait <destino>` o `pane run <destino>`. Ignorar los flags (`--x` y su valor numérico) al tomar el texto.
- [ ] **Step 4:** suite en verde.
- [ ] **Step 5:** commit `feat(tablero): reconoce envíos a otras sesiones`.

### Task 2: Registro, estado y filas

**Files:**
- Modify: `mods/tablero/hooks/conversaciones.ts`, `mods/tablero/hooks/sesiones.ts` (`valido` acepta `turnoFin` opcional numérico), `mods/tablero/types/index.d.ts` (`RegistroSesion.turnoFin?: number`).
- Test: `mods/tablero/tests/conversaciones.test.ts`, `mods/tablero/tests/sesiones.test.ts`

**Interfaces:**
- Consumes: `RegistroSesion` (con `turnoFin?`).
- Produces:
  - `export type Mensaje = { id: string; de: string; deNombre: string; a: string | null; aNombre: string; canal: 'herdr' | 'claude'; resumen: string; enviado: number; esperaFin: number | null; espera: boolean }` (`a` = id de sesión resuelto o null; `esperaFin` = fin de la llamada `--wait`, null si sigue o no hubo).
  - `export const leerConversaciones = (textos: readonly { nombre: string; texto: string }[], ahoraMs: number): Mensaje[]` — cada archivo es `Mensaje[]`; descarta rotos, inválidos y de más de 24 h.
  - `export const anotar = (lista: readonly Mensaje[], m: Mensaje, ahoraMs: number): Mensaje[]` — añade o reemplaza por `id`, quita >24 h, deja los 20 más nuevos.
  - `export type EstadoMensaje = 'espera' | 'respondio' | 'enviado'`
  - `export const estadoMensaje = (m: Mensaje, turnoFinDe: (id: string) => number | undefined, ahoraMs: number): EstadoMensaje`
  - `export type FilaConversacion = { de: string; a: string; estado: EstadoMensaje; teToca: boolean; desde: number; resumen: string }` (`de`/`a` ya con «esta» para la propia; `teToca` = alguien espera a esta sesión).
  - `export const filasConversaciones = (todos: readonly Mensaje[], propia: string, turnoFinDe: (id: string) => number | undefined, ahoraMs: number): FilaConversacion[]`
  - `export const resumenConversaciones = (filas: readonly FilaConversacion[]): string`

- [ ] **Step 1: pruebas que fallan**

```ts
const AHORA = Date.parse('2026-11-24T12:00:00Z')
const msg = (p: Partial<Mensaje>): Mensaje => ({ id: 't1', de: 'yo', deNombre: 'yo', a: 'rev', aNombre: 'reviewer', canal: 'herdr', resumen: 'Revisa', enviado: AHORA - 120_000, esperaFin: null, espera: false, ...p })
test('espera respuesta mientras el destino no termine un turno después del envío', () => {
  expect(estadoMensaje(msg({}), () => AHORA - 200_000, AHORA)).toBe('espera')
  expect(estadoMensaje(msg({}), () => AHORA - 60_000, AHORA)).toBe('respondio')
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
  const f = filasConversaciones([msg({ de: 'mz', deNombre: 'Mazda', a: 'yo', aNombre: 'x', id: 't2' }), msg({ de: 'mz', deNombre: 'Mazda', a: 'rev', id: 't3', enviado: AHORA - 1000 }), msg({})], 'yo', () => undefined, AHORA)
  expect(f.map(x => `${x.de}→${x.a}:${x.estado}:${x.teToca}`)).toEqual(['Mazda→esta:espera:true', 'esta→reviewer:espera:false', 'Mazda→reviewer:espera:false'])
})
test('fuera de la ventana: respondidos de hace más de 30 min no salen', () => {
  expect(filasConversaciones([msg({ enviado: AHORA - 40 * 60_000 })], 'yo', () => AHORA - 39 * 60_000, AHORA)).toEqual([])
})
test('resumen de la línea plegada', () => {
  expect(resumenConversaciones([{ de: 'esta', a: 'r', estado: 'espera', teToca: false, desde: 0, resumen: '' }, { de: 'Mazda', a: 'esta', estado: 'espera', teToca: true, desde: 0, resumen: '' }])).toBe('1 espera respuesta · 1 te pidió algo')
})
test('archivos rotos o de más de 24 h se ignoran', () => {
  expect(leerConversaciones([{ nombre: 'a.json', texto: '{"x":' }, { nombre: 'b.json', texto: JSON.stringify([msg({ enviado: AHORA - 25 * 3_600_000 })]) }], AHORA)).toEqual([])
})
test('anotar reemplaza por id y deja los 20 más nuevos', () => {
  let l: Mensaje[] = []
  for (let i = 0; i < 25; i++) l = anotar(l, msg({ id: `t${i}`, enviado: AHORA - (25 - i) * 1000 }), AHORA)
  expect(l).toHaveLength(20)
  expect(anotar(l, msg({ id: 't24', resumen: 'otro' }), AHORA).filter(m => m.id === 't24')).toHaveLength(1)
})
```

En `tests/sesiones.test.ts`: un registro con `turnoFin: AHORA - 1000` es válido y lo conserva; uno sin `turnoFin` sigue siendo válido; `turnoFin: 'x'` lo invalida.

- [ ] **Step 2:** suite → fallan.
- [ ] **Step 3: implementar.** Reglas de `estadoMensaje`: sin `a` → `enviado`; si `esperaFin !== null` → `respondio`; si `turnoFinDe(a) > enviado` → `respondio`; si `ahora - enviado > 30 min` → `enviado`; si no, `espera`. `teToca` = `a === propia && estado === 'espera'`. Nombre de fila: `de === propia ? 'esta' : deNombre`, igual para `a`/`aNombre`. Orden: `teToca`, luego `de === propia`, luego el resto; dentro, más nuevo primero. Ventana: estado `espera` o `ahora - enviado <= 30 min`. Resumen: partes no vacías entre «N espera(n) respuesta» (filas en espera sin `teToca`) y «N te pidió/pidieron algo» (con `teToca`); sin ninguna, «N reciente(s)».
- [ ] **Step 4:** suite en verde.
- [ ] **Step 5:** commit `feat(tablero): registro y estado de las conversaciones`.

### Task 3: Cablear en el tablero

**Files:**
- Modify: `mods/tablero/hooks/register.tsx` (`tool.call`, `turn.complete`, `escribirRegistro`, vuelta de fuentes, átomo nuevo `conversaciones`).
- Test: `mods/tablero/tests/conversaciones-registro.test.tsx` (con el arnés de `tests/unificado.test.tsx`: `mock.clock`, `on('fs.*')`, `on('process.run')`).

**Interfaces:**
- Consumes: `envioDe`, `anotar`, `leerConversaciones`, `Mensaje` (Tareas 1-2).
- Produces: átomo `{ plugin: 'tablero', key: 'conversaciones' }` con `Mensaje[]` de todas las sesiones; archivo `~/.claude/tablero/conversaciones/<id>.json`; `turnoFin` en el registro de Sesiones.

- [ ] **Step 1: pruebas que fallan**
  - `tool.call` Bash `herdr agent prompt reviewer "Hola" --wait` con `process.run(['herdr','agent','get','reviewer'])` devolviendo `{"result":{"agent":{"agent_session":{"value":"rev"}},"pane":{"terminal_title_stripped":"Revisor"}}}`-like JSON → se escribe `conversaciones/abc.json` con un `Mensaje` `{ a: 'rev', aNombre: 'Revisor', espera: true }`, y tras terminar la llamada `esperaFin` es un número.
  - `herdr agent get` que falla o tarda más de 2 s → `a: null`, `aNombre: 'reviewer'`.
  - Destino resuelto igual a la sesión propia → no se escribe nada.
  - `tool.call` de un subagente (`agentId: 'x'`) → no se escribe nada.
  - `SendMessage` `{ to: 'Mazda' }` con una sesión `Mazda` (id `otra`) en el registro de Sesiones → `a: 'otra'`.
  - `turn.complete` del lead → el registro de Sesiones escrito después lleva `turnoFin` igual a la hora del reloj.
- [ ] **Step 2:** suite → fallan.
- [ ] **Step 3: implementar.** En `tool.call`, antes de `next(e)`: si `!e.agentId` y `envioDe(String(e.tool), e)` no es null, resolver destino (herdr: `$.process.run(['herdr','agent','get',destino], { timeoutMs: 2000 })` y leer del JSON el id de sesión en `agent_session.value` y el nombre en `terminal_title_stripped`, mirando dentro de `result`; claude: buscar en `otras` por `nombre`), y si `a !== propia` anotar con `id = e.tool_use_id`, `deNombre` = nombre de la sesión (`linea.session_name`) o carpeta. Tras `next(e)`, si `espera`, reescribir con `esperaFin = ahora`. `soloEspera` reutiliza el último mensaje a ese destino (actualiza `espera`/`esperaFin`) en vez de crear uno. Guardar `turnoFin` en un `let` del módulo en `turn.complete` del lead y escribirlo en `escribirRegistro`. En la vuelta de fuentes, con `cfg.extras.has('sesiones')`, leer la carpeta `conversaciones` y poner el átomo con `leerConversaciones`.
- [ ] **Step 4:** suite en verde (todas, también `unificado`).
- [ ] **Step 5:** commit `feat(tablero): anota y lee las conversaciones entre sesiones`.

### Task 4: Sección Conversaciones en el panel

**Files:**
- Modify: `mods/tablero/hooks/register.tsx` (átomo `plegado` con `conversaciones: true`, `plegar` acepta `'conversaciones'`, nuevo `conversacionesPanel(w)` junto a `sesionesPanel(W)`).
- Test: `mods/tablero/tests/unificado.test.tsx` (extiende `motor` con una opción `conversaciones?: Mensaje[]` servida en `fs.list`/`fs.read` de `/conversaciones`).

**Interfaces:**
- Consumes: `filasConversaciones`, `resumenConversaciones`, `abiertas`/`otras` para `turnoFinDe` (mapa id → `turnoFin` de `otrasNow`, y el propio).

- [ ] **Step 1: pruebas que fallan**
  - Plegada: `/^Conversaciones +1 espera respuesta · 1 te pidió algo/` y un botón con tecla `c` (`key: 'conversaciones-plegar'`).
  - Abierta (`ui.press({ key: 'conversaciones-plegar' })`): filas `/esta → reviewer +◆ Espera respuesta/` y `/Mazda → esta +◆ Te pidió algo .*«¿Subo el PR\?»/`.
  - Sin mensajes en la ventana: no hay texto `/^Conversaciones/`.
  - Teclas: ninguna sección comparte tecla (extender la prueba «Sesiones y Permisos no comparten tecla»).
  - A 40 columnas con la sección abierta ninguna fila pasa de 40 (añadirla a la prueba existente de 40 columnas).
- [ ] **Step 2:** suite → fallan.
- [ ] **Step 3: implementar** copiando la forma de `sesionesPanel`: cabecera «Conversaciones» + resumen atenuado + botón `c`; abierta, hasta 6 filas `de → a`, estado con símbolo y color (`◆` ámbar para espera y te pidió algo, `✓` verde para respondió, `○` atenuado para enviado), tiempo (`fmtDuration` o «hace …») y `«resumen»` recortado al ancho.
- [ ] **Step 4:** suite en verde.
- [ ] **Step 5:** commit `feat(tablero): sección Conversaciones`.

### Task 5: Versión, documentación y prueba real

**Files:**
- Modify: `mods/tablero/.claude-plugin/plugin.json`, `mods/tablero/hooks/core.ts` (`MOD_VERSION`), `.claude-plugin/marketplace.json`, `mods/tablero/CHANGELOG.md` (`## 1.4.0 (tablero)` arriba), `mods/tablero/README.md` (sección Conversaciones con `c`, lee y escribe `~/.claude/tablero/conversaciones/`).

- [ ] **Step 1:** subir a `1.4.0` en los tres sitios; CHANGELOG y README.
- [ ] **Step 2:** `claude plugin test mods/tablero` → 0 fail; `./exportar.sh` → termina con código 0.
- [ ] **Step 3:** commit `feat(tablero): 1.4.0, conversaciones entre sesiones`, push, PR a `main`.
- [ ] **Step 4:** `claude plugin update tablero@claude-code-entorno`; `diff -rq -x .gitignore -x node_modules -x '._*' ~/.claude/plugins/cache/claude-code-entorno/tablero/1.4.0 mods/tablero` sin diferencias.
- [ ] **Step 5: prueba real.** En herdr, abrir una pestaña nueva con `claude --dangerously-skip-permissions` (nombre `prueba-conv`), mandarle `herdr agent prompt prueba-conv "Responde solo: hola" --wait` desde una sesión con 1.4.0 y comprobar en `~/.claude/tablero/conversaciones/<id>.json` el mensaje con `a` resuelto y `esperaFin`; comprobar que el registro de Sesiones de `prueba-conv` tiene `turnoFin` posterior. Cerrar la pestaña de prueba por su id de pestaña. Enseñar la salida real al usuario y pedirle que mire la sección en pantalla.

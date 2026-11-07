# Tablero con Jev: plan de implementación

> **Para agentes que ejecuten este plan:** sub-skill obligatoria: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ir tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar la cuenta.

**Meta:** Jev elige el modelo y el esfuerzo de cada subagente, decide si reintentar o parar ante errores repetidos, y el tablero muestra esas decisiones en una vista en diagrama.

**Arquitectura:** las llamadas a OpenRouter viven en hooks de Python. Jev decide dentro de `guard-subagentes.py`, que después valida el resultado, para no depender del orden entre hooks. Un hook aparte, `jev-reintento.py`, atiende los fallos. Ambos escriben `~/.claude/jev/decisiones.jsonl`, y el mod `tablero` solo lee ese archivo; no usa red.

**Tecnologías:** Python 3.6 o más nuevo con solo la biblioteca estándar (`urllib`, `json`, `http.server` en las pruebas). El mod está en TypeScript/TSX con el motor de mods de Claude Code y `claude-code/testing`.

**Spec:** `docs/superpowers/specs/2026-11-06-tablero-jev-design.md`

## Restricciones globales

- Repo público: nada de rutas de usuario, clientes, correos ni claves en código, pruebas o documentos. Antes de cada commit, `./exportar.sh` debe terminar limpio en privacidad y gitleaks.
- TDD: la prueba primero, verla fallar, luego el código.
- Pruebas de Python: `python3 -m unittest discover -s pruebas`. Pruebas del mod: `claude plugin test mods/tablero`.
- Python sin dependencias externas. Cualquier error propio de un hook deja pasar la acción, nunca la bloquea.
- Fable nunca: ni como opción de Jev ni como modelo permitido.
- Modelos de subagente permitidos: `haiku`, `sonnet`, `opus` (o `claude-<familia>-…`). Esfuerzos permitidos: `low`, `medium`, `high`. `xhigh` y `max` se bloquean.
- Umbral sharp: confianza ≥ **0,80**. Tiempo máximo por llamada a Jev: **2 s**. Ambos configurables.
- A Jev se le envía la descripción más el encargo **completo**. El encargo **nunca** se escribe en `decisiones.jsonl` ni en el tablero. La descripción se guarda recortada a **60** caracteres.
- `decisiones.jsonl` se recorta a sus últimas **2000** líneas. Cada línea lleva `session_id`.
- Clave: primero `OPENROUTER_API_KEY`; si no está, el archivo `~/.claude/jev/clave`, que solo se acepta con permisos `600`. La clave nunca aparece en la salida, los registros ni los mensajes de error.
- Commits en español con Conventional Commits, terminados en `Co-Authored-By: …`. Rama propia, PR y fusión a `main` con las pruebas en verde.
- Los subagentes que construyan esto: `model: "haiku"`, `effort: "medium"`.

## Foco de revisión

1. **Respuesta de Jev rara** (JSON sin el campo esperado, opción fuera de la lista, HTTP 402 por falta de saldo o 429): se trata como «sin respuesta» y pasa lo que eligió Claude. → `test_respuesta_rara_es_sin_respuesta` en la Tarea 2.
2. **Jev elige el mismo modelo y esfuerzo que Claude:** no se reescribe nada, se registra como `aplicada: false`, y no aparece la marca `jev ↑` en la tarjeta. → `test_misma_eleccion_no_reescribe` en la Tarea 3.
3. **Archivo de decisiones corrupto o a medio escribir** (una línea truncada por dos sesiones escribiendo a la vez): el tablero ignora esa línea y sigue. → `ignora líneas rotas` en la Tarea 5.
4. **Workflow con `agent()` en Sonnet u Opus:** el guardián lo deja pasar igual que un `Agent`, y sigue bloqueando Fable, `xhigh` y `max`. Jev no rutea workflows. → `test_workflow_sonnet_pasa` en la Tarea 1.
5. **Encargo enorme** (cientos de KB): se envía igual, porque el usuario eligió el encargo completo, pero se corta a 32.000 caracteres para no pasarse del contexto de Jev (ruling: por encima Jev entra en modo lento), y nunca se registra. → `test_encargo_enorme_se_recorta_y_no_se_registra` en la Tarea 2.

---

### Tarea 0: Prototipo de verificación (desechable)

Resuelve las cuatro incógnitas que la spec dejó abiertas antes de escribir código de producto. No lleva pruebas. El resultado es un documento.

**Archivos:**
- Crear: `docs/superpowers/specs/2026-11-06-tablero-jev-hallazgos.md`

- [ ] **Paso 1: Formato de la Decisions API.** Lee la documentación oficial de OpenRouter para Jev (endpoint, cuerpo para una pregunta `choice` con etiquetas y definiciones, campos de la respuesta: elegido, probabilidades, confianza y costo). Usa como referencia el código de `charlesdove977/claude-x-jev` (MIT). Anota un ejemplo real de petición y de respuesta, con la clave tapada.
- [ ] **Paso 2: ¿Se puede reescribir `model`/`effort` de `Agent` con `updatedInput`?** Prueba en una sesión desechable un hook PreToolUse mínimo que devuelva `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":{…, "model":"sonnet"}}}` y comprueba en el tablero o en el transcript con qué modelo arrancó el subagente. Anota «sí» o «no».
- [ ] **Paso 3: Evento de fallo.** Comprueba si existe `PostToolUseFailure` en la versión instalada (`claude --version`) y qué campos trae (`tool_name`, `error`, `session_id`). Si no existe, anota cómo marca `PostToolUse` un error.
- [ ] **Paso 4: Lectura de la carpeta personal desde el mod.** Comprueba si `$.fs.read` acepta `~/.claude/jev/decisiones.jsonl` o necesita una ruta absoluta, y cómo obtenerla (variable del motor, `$.session` o `userConfig`).
- [ ] **Paso 5: `jev-router` contra `jev-1.14`.** Con la clave del usuario (puesta por el usuario en su terminal, nunca por chat), corre 10 encargos de prueba inventados (5 mecánicos, 3 de funcionalidad, 2 de causa raíz poco clara) contra los dos modelos. Anota precisión frente a la etiqueta esperada, latencia y costo reportado. Elige el modelo por defecto.
- [ ] **Paso 6: Commit** del documento de hallazgos: `docs(tablero): hallazgos del prototipo de Jev`.

**Si el Paso 2 da «no»:** en la Tarea 3, sharp devuelve `deny` con el motivo `Jev (p=0.91): relanza con model="sonnet" effort="high".` en lugar de `updatedInput`.

---

### Tarea 1: Guardián con Haiku, Sonnet y Opus

**Archivos:**
- Modificar: `claude/hooks/guard-subagentes.py`
- Modificar: `claude/rules/modelo.md`
- Probar: `pruebas/test_guard_subagentes.py`

**Interfaces:**
- Produce: `es_modelo_permitido(modelo: str) -> bool` y `ESFUERZOS_PERMITIDOS = ("low", "medium", "high")` en `guard-subagentes.py`.

- [ ] **Paso 1: Pruebas que fallan.** Agrega a `AgentesYSubagentes`:

```python
def test_sonnet_alto_pasa(self):
    self.assertEqual(correr(agente("sonnet", "high")), "")
def test_opus_medio_pasa(self):
    self.assertEqual(correr(agente("claude-opus-5-5", "medium")), "")
def test_xhigh_se_bloquea(self):
    self.assertTrue(negado(correr(agente("opus", "xhigh"))))
def test_fable_se_bloquea(self):
    self.assertTrue(negado(correr(agente("fable", "low"))))
def test_workflow_sonnet_pasa(self):
    guion = "agent('a', {model: 'sonnet', effort: 'high'})"
    self.assertEqual(correr({"tool_name": "Workflow", "tool_input": {"script": guion}}), "")
```

Cambia las pruebas existentes que esperaban bloqueo para `sonnet`/`opus` o para `high`.

- [ ] **Paso 2:** `python3 -m unittest pruebas.test_guard_subagentes -v` → FALLAN las nuevas.
- [ ] **Paso 3:** Implementa `es_modelo_permitido`: acepta `haiku|sonnet|opus` o `claude-(haiku|sonnet|opus)…` y rechaza lo demás. Sube `ESFUERZOS_PERMITIDOS` a `high`. Actualiza los textos de `deny`, `CONSEJO` y el docstring. En `modelo.md`, describe la regla nueva: subagentes en Haiku, Sonnet u Opus con esfuerzo hasta `high`; Jev puede cambiarlos; Fable nunca. La parte de la sesión principal no cambia.
- [ ] **Paso 4:** Corre la suite completa → OK.
- [ ] **Paso 5: Commit** `feat(guardian): permite sonnet y opus hasta esfuerzo alto`.

---

### Tarea 2: Cliente de Jev

**Archivos:**
- Crear: `claude/hooks/jev_cliente.py`
- Probar: `pruebas/test_jev_cliente.py` (con un servidor falso de `http.server` en `127.0.0.1` y un puerto libre)

**Interfaces:**
- Produce:
  - `cargar_config(home: str) -> dict` con claves `umbral` (0.80), `timeout` (2.0), `modelo_jev` (el del Paso 5 de la Tarea 0), `url` (la de la Tarea 0), `definiciones` (dict pregunta → opción → texto). Mezcla los valores por defecto con `~/.claude/jev/config.json` si existe.
  - `leer_clave(home: str, entorno: dict) -> str | None`
  - `decidir(pregunta: str, texto: str, opciones: list[str], config: dict, clave: str) -> dict | None`. Devuelve `{"opcion", "confianza", "probabilidades", "costo", "latencia_ms"}` o `None` si no hay respuesta, hay un error o la opción no está en la lista. Nunca lanza excepciones. La URL puede cambiarse con la variable de entorno `JEV_URL`, solo para las pruebas.
  - `es_sharp(decision: dict, config: dict) -> bool`
  - `registrar(home: str, linea: dict) -> None`: agrega la línea a `~/.claude/jev/decisiones.jsonl` (crea la carpeta con permisos 700) y recorta el archivo a 2000 líneas. Nunca lanza excepciones.
  - Preguntas fijas: `modelo` → `["haiku","sonnet","opus"]`, `esfuerzo` → `["low","medium","high"]`, `reintento` → `["reintentar","cambiar_enfoque","parar_y_preguntar"]`.

- [ ] **Paso 1: Pruebas que fallan:**
  - `test_clave_de_entorno_gana`
  - `test_clave_de_archivo_solo_con_600` (con 644 → `None`)
  - `test_decide_lee_respuesta` (el servidor falso devuelve la forma registrada en los hallazgos → la opción y la confianza correctas)
  - `test_respuesta_rara_es_sin_respuesta` (JSON sin campos, opción `"fable"`, HTTP 402 y HTTP 429 → `None`)
  - `test_timeout_es_sin_respuesta` (el servidor duerme 3 s con `timeout` de 0,5 → `None` en menos de 1 s)
  - `test_sharp_desde_080` (0,80 → `True`, 0,79 → `False`)
  - `test_registrar_recorta_a_2000`
  - `test_encargo_enorme_se_recorta_y_no_se_registra` (el servidor falso recibe como máximo 32.000 caracteres)
  - `test_la_clave_no_sale_en_errores` (forzar un error y revisar que la clave no aparezca en ninguna salida)
- [ ] **Paso 2:** Correrlas → FALLAN.
- [ ] **Paso 3:** Implementa `jev_cliente.py` con el cuerpo de petición de la Tarea 0.
- [ ] **Paso 4:** Corre la suite completa → OK.
- [ ] **Paso 5: Commit** `feat(jev): cliente de la Decisions API con registro local`.

---

### Tarea 3: Ruteo de subagentes con Jev

**Archivos:**
- Modificar: `claude/hooks/guard-subagentes.py`
- Probar: `pruebas/test_guard_subagentes.py` (clase nueva `RuteoConJev`, con servidor falso y `HOME` temporal)

**Interfaces:**
- Consume: todo lo de la Tarea 2 y `es_modelo_permitido` de la Tarea 1.
- Produce: líneas en `decisiones.jsonl` con la forma `{"hora","session_id","tipo":"modelo"|"esfuerzo","opcion","confianza","sharp","claude":<valor de Claude>,"aplicada","descripcion"(≤60),"latencia_ms","costo"}`. Si Jev no responde: `{"tipo":"modelo","opcion":null,"motivo":"sin respuesta",…}`.

Flujo de `revisar_agente`: primero Jev, luego la validación. El texto que recibe Jev es `description + "\n\n" + prompt`. Se hacen dos preguntas, `modelo` y `esfuerzo`, en paralelo con hilos o en una sola petición si la API lo admite. Si la decisión es sharp, se usa la opción de Jev; si no, el valor de Claude. Si el resultado cambia algo, se devuelve `allow` con `updatedInput`, o `deny` con instrucción para relanzar, según la Tarea 0. Después se valida el resultado final con las reglas de la Tarea 1.

- [ ] **Paso 1: Pruebas que fallan:**
  - `test_sharp_reescribe_modelo` (Jev elige `sonnet` con 0,91 y Claude pidió `haiku` → la salida trae `updatedInput.model == "sonnet"` y la línea registrada tiene `aplicada: true`)
  - `test_split_respeta_a_claude` (0,64 → salida vacía; registrada con `sharp: false`, `aplicada: false`)
  - `test_misma_eleccion_no_reescribe`
  - `test_sin_clave_pasa_y_registra_sin_respuesta`
  - `test_jev_caido_no_bloquea` (servidor apagado → salida vacía en menos de 3 s)
  - `test_encargo_no_se_registra` (el prompt `SECRETO-XYZ` no aparece en `decisiones.jsonl`)
  - `test_claude_pide_fable_sigue_bloqueado` aunque Jev responda
- [ ] **Paso 2:** Correrlas → FALLAN.
- [ ] **Paso 3:** Implementa. `session_id` sale de la entrada del hook.
- [ ] **Paso 4:** Corre la suite completa → OK.
- [ ] **Paso 5: Commit** `feat(jev): elige modelo y esfuerzo de cada subagente`.

---

### Tarea 4: Reintentar o parar

**Archivos:**
- Crear: `claude/hooks/jev-reintento.py`
- Modificar: `claude/settings.base.json` (registrar el hook en el evento de fallo de la Tarea 0, matcher `*`, timeout 5)
- Probar: `pruebas/test_jev_reintento.py`

**Interfaces:**
- Consume: la Tarea 2.
- Produce: un estado en `~/.claude/jev/estado.json` con el formato `{session_id: {"herramienta", "error_normal", "cuenta"}}`, más líneas `tipo: "reintento"` en `decisiones.jsonl`.
- `normalizar_error(texto: str) -> str`: quita rutas (`/…` y `C:\…`), números y marcas de tiempo, colapsa espacios y se queda con los primeros 200 caracteres.

Si es el mismo fallo por segunda vez seguida, se le pregunta a Jev `reintento` con el texto del error y el nombre de la herramienta. La salida es `{"hookSpecificOutput":{"hookEventName":<evento>,"additionalContext":…}}`:
- sharp: `Jev (p=0.88): parar y preguntar al usuario. Mismo error dos veces en Bash.`
- split: `Jev sugiere (p=0.61): cambiar de enfoque. Mismo error dos veces en Bash.`

Un éxito de la misma herramienta pone la cuenta en 0. El hook también se registra en `PostToolUse` para ver los éxitos; si la Tarea 0 dice que `PostToolUse` ya trae los errores, basta con un solo registro.

- [ ] **Paso 1: Pruebas que fallan:**
  - `test_normalizar_quita_rutas_y_numeros`
  - `test_primer_fallo_no_pregunta`
  - `test_segundo_igual_pregunta_y_da_nota`
  - `test_exito_reinicia`
  - `test_errores_distintos_no_cuentan`
  - `test_sesiones_separadas`
  - `test_jev_caido_sin_nota`
  - en `test_hooks.py` o `test_config_completa.py`: el hook nuevo está en `settings.base.json` y el instalador copia `jev-reintento.py` y `jev_cliente.py` (sigue el patrón con que esas pruebas verifican `guard-subagentes.py`)
- [ ] **Paso 2:** Correrlas → FALLAN.
- [ ] **Paso 3:** Implementa y registra el hook. Si el instalador copia solo una lista fija de archivos, agrega los dos nuevos (y `instalar.ps1` si aplica, conservando BOM UTF-8 y CRLF).
- [ ] **Paso 4:** Corre la suite completa → OK.
- [ ] **Paso 5: Commit** `feat(jev): decide reintentar o parar ante errores repetidos`.

---

### Tarea 5: Modelo de datos de Jev en el tablero

**Archivos:**
- Crear: `mods/tablero/hooks/jev-modelo.ts`
- Probar: `mods/tablero/tests/jev-modelo.test.ts`

**Interfaces:**
- Produce:
  - `type DecisionJev = { hora: number; sessionId: string; tipo: 'modelo' | 'esfuerzo' | 'reintento'; opcion: string | null; confianza: number | null; sharp: boolean; claude: string | null; aplicada: boolean; descripcion: string }`
  - `leerDecisiones(texto: string, sessionId: string): DecisionJev[]`: una línea por decisión, solo las de la sesión, ignorando líneas rotas.
  - `resumenJev(ds: DecisionJev[]): { total: number; filas: { tipo: string; etiqueta: string; confianza: number | null; sharp: boolean | null }[] }`. Las etiquetas son `qué modelo`, `qué esfuerzo` y `reintentar o parar`. `confianza` es la media de las últimas 20 de ese tipo con respuesta; `sharp` es el de la última.
  - `lineaLog(d: DecisionJev): string`: `qué modelo → sonnet   p=0.91 sharp → código`, `… split → claude` o `sin respuesta`.
  - `marcaTarjeta(d: DecisionJev | undefined): string | null`: `jev ↑ sonnet` o `jev ↓ haiku` cuando `aplicada`; `null` en otro caso. El orden para decidir ↑ o ↓ es haiku < sonnet < opus.

- [ ] **Paso 1:** Pruebas que fallan: `filtra por sesión`, `ignora líneas rotas`, `media de las últimas 20`, `sin respuesta no entra en la media pero sí en el total`, `línea de log sharp y split`, `marca solo si se aplicó`, `misma elección sin marca`.
- [ ] **Paso 2:** `claude plugin test mods/tablero` → FALLAN.
- [ ] **Paso 3:** Implementa, sin red ni procesos.
- [ ] **Paso 4:** `claude plugin test mods/tablero` → 0 fallos.
- [ ] **Paso 5: Commit** `feat(tablero): modelo de las decisiones de Jev`.

---

### Tarea 6: Conectar las decisiones al tablero

**Archivos:**
- Modificar: `mods/tablero/hooks/register.tsx` (un átomo `jev`, la lectura y el log)
- Modificar: `mods/tablero/types/index.d.ts` si hace falta tipar la vista
- Probar: `mods/tablero/tests/jev-registro.test.tsx`

**Interfaces:**
- Consume: la Tarea 5 y la forma de leer la carpeta personal según la Tarea 0.
- Produce: un átomo `{ plugin: 'tablero', key: 'jev' }` con `{ decisiones: DecisionJev[]; vistas: number }` (vistas = cuántas líneas ya pasaron al log), que leen las Tareas 7 y 8.

Se relee `decisiones.jsonl` con `$.fs.read` en `agent.spawn` (después de `next`), en `turn.complete` y en `tool.call` con error. Cada decisión nueva va al log con `say($, 'jev', lineaLog(d), 'info')`. La barra de estado agrega `jev [N decisiones]` cuando N > 0. La tarjeta del subagente guarda la marca de la decisión `modelo` más reciente cuya `descripcion` coincida con la del spawn.

- [ ] **Paso 1:** Pruebas que fallan, con un `$.fs.read` simulado como en las pruebas existentes: `log recibe solo decisiones nuevas`, `sin archivo no falla ni muestra nada`, `barra muestra jev [3 decisiones]`, `tarjeta lleva jev ↑ sonnet`.
- [ ] **Paso 2:** Correr → FALLAN.
- [ ] **Paso 3:** Implementa.
- [ ] **Paso 4:** `claude plugin test mods/tablero` → 0 fallos.
- [ ] **Paso 5: Commit** `feat(tablero): lee y registra las decisiones de Jev`.

---

### Tarea 7: Vista en diagrama y panel JEV

**Archivos:**
- Crear: `mods/tablero/hooks/diagrama.tsx` (la disposición) y `mods/tablero/hooks/panel-jev.tsx` (la caja JEV)
- Modificar: `mods/tablero/hooks/register.tsx` (elegir la disposición) y `mods/tablero/.claude-plugin/plugin.json` (opción `diagrama` en `layout`, `jev` en la lista por defecto de `panels` después de `main`, y la descripción de `auto`)
- Probar: `mods/tablero/tests/diagrama.test.tsx`

**Interfaces:**
- Consume: `resumenJev` (Tarea 5), el átomo `jev` (Tarea 6) y los paneles existentes (`main`, `architect`, `agents`, `log`).

La disposición sigue el boceto de la spec: leyenda, asesor a la izquierda, lead arriba, caja JEV, «delegar a subagentes», tarjetas en abanico con conectores, «de vuelta al lead · revisar y verificar» cuando todas las tarjetas terminaron, y después el log y la barra. `auto` elige `diagrama` cuando el panel acoplado tiene 66 columnas o más; con menos se usa la disposición actual. La caja JEV muestra el total con separador de miles, una fila por tipo con barra de 8 celdas, el valor con dos decimales y `sharp`/`split`, y debajo `sharp → se aplica en código · split → decide Claude`. Sin decisiones muestra `sin decisiones aún`.

- [ ] **Paso 1:** Pruebas que fallan: `auto con 66 columnas usa diagrama`, `auto con 65 usa la disposición apilada`, `caja JEV con tres filas y total 1,382`, `sin decisiones aún`, `vuelta al lead solo con todas las tarjetas terminadas`, `con 66 columnas ninguna línea pasa del ancho`.
- [ ] **Paso 2:** Correr → FALLAN.
- [ ] **Paso 3:** Implementa con los colores y caracteres que ya usa el mod.
- [ ] **Paso 4:** `claude plugin test mods/tablero` → 0 fallos.
- [ ] **Paso 5: Commit** `feat(tablero): vista en diagrama con la capa de decisiones de Jev`.

---

### Tarea 8: Versión, documentación y entrega

**Archivos:**
- Modificar: `mods/tablero/.claude-plugin/plugin.json` (versión 0.3.0), `mods/tablero/CHANGELOG.md` y `mods/tablero/README.md` (qué es Jev; que el mod solo lee `~/.claude/jev/decisiones.jsonl`, sin red; dónde poner la clave sin pegarla en el chat; el costo aproximado)
- Modificar: `README.md` o `docs/GUIA-DE-USO.md` del repo (los hooks nuevos y la regla de modelos)

- [ ] **Paso 1:** Escribe la documentación.
- [ ] **Paso 2:** `./exportar.sh` → pruebas, mods, privacidad y gitleaks limpios. Si falla solo por diferencias de `settings.base.json` ajenas a esta rama, dilo y no las mezcles.
- [ ] **Paso 3: Commit** `docs(tablero): documenta Jev y sube a 0.3.0`, push, PR y fusión a `main`.
- [ ] **Paso 4:** Pide al usuario que reinstale el mod y ponga su clave en `~/.claude/jev/clave` (permisos 600) desde su terminal. Después, lanza un subagente de prueba y verifica en pantalla la caja JEV y la línea `jev` del log.

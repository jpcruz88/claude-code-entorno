# Tablero 1.3.0 unificado: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mod `tablero` muestre todo el estado de la sesión, sin datos repetidos: absorbe `barra-plan`, `aduana-panel` y `caveman-badge`, deja muda la statusline y añade cache, $/h, presupuesto, Git/CI, servicio, Config, Gasto y Sesiones.

**Architecture:**
- La lógica nueva va en módulos puros pequeños bajo `mods/tablero/hooks/` (cálculo y texto, con pruebas unitarias). `register.tsx` solo los conecta a eventos, temporizadores y dibujo.
- Los datos que solo recibe la statusline llegan por un archivo por sesión que escribe `claude/statusline.sh`.
- Las fuentes externas (git, gh, red) corren en temporizadores con tope de tiempo y guardan su último resultado en un `atom`. Al dibujar, el panel nunca espera a la red.

**Tech Stack:** TypeScript/TSX de mods de Claude Code (`claude-code`: `$.process.run`, `$.http.fetch`, `$.fs`, `$.session`, `$.tool`, `$.settings`); pruebas con `claude plugin test`; bash + jq en la statusline, con pruebas en Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-11-24-tablero-unificado-design.md`, con la maqueta `docs/maquetas/tablero-unificado.html`, que es la referencia visual exacta (textos, columnas, colores por rol).

## Global Constraints

- Repo de trabajo: `~/claude-code-entorno`, en la rama `feat/tablero-1.3` creada desde `main`.
- La versión del tablero pasa de `1.2.0` a `1.3.0`, en `mods/tablero/.claude-plugin/plugin.json` y en `.claude-plugin/marketplace.json`.
- Textos en español, con mayúscula inicial en etiquetas y estados.
- Estados: `⠹ En curso`, `◆ Te espera`, `✓ Hecho`, `✗ Falló`, `⠹ Trabajando`, `○ En espera`, `○ Inactiva`. Una pregunta va en la línea siguiente, con `↳ `. Nunca un `?` como símbolo.
- Colores solo por nombre de tema, con la paleta `C` existente: `main`, `agent`, `gate`, `amber`, `warn`, `dim`, `faint`, `text`, `arch`, `cleared`.
- Barras de 20 celdas (`█` lleno, `░` vacío) en Sesión, Planes y Aduana. Umbrales: aviso al 65 %, alerta al 85 % (`tonoUso` existente).
- Topes de tiempo y frecuencia: `git` cada 10 s con tope de 5 s; `gh pr checks` cada 60 s, solo con PR, con tope de 10 s; estado de Claude cada 300 s con tope de 5 s.
- URL de estado: `https://status.claude.com/api/v2/status.json` (campo `status.indicator`: `none|minor|major|critical|maintenance`).
- Archivos:
  - `~/.claude/tablero/linea/<session_id>.json`, que escribe la statusline;
  - `~/.claude/tablero/sesiones/<session_id>.json`, que escribe el tablero.

  Los dos se escriben de forma atómica (temporal + `mv`) y se ignoran pasadas 24 h.
- Nueva opción `extras` en userConfig (string, por omisión `cache,git,ci,servicio,presupuesto,gasto,sesiones`). Nueva opción `presupuestoDiario` (number, por omisión `0`, que oculta la fila Hoy).
- Un fallo de una fuente oculta su fila; nunca lanza ni deja el panel en blanco.
- Antes de cada commit, borrar `._*`: `find . -name '._*' -not -path './.git/*' -delete`.
- Commits en Conventional Commits en español, terminados en `Co-Authored-By: Claude <modelo real> <noreply@anthropic.com>`. Nunca `--no-verify`.

## Review Focus

- **Statusline sin `jq` o con JSON raro.** Debe seguir imprimiendo su aviso de siempre y no romper Jev. La prueba va en la Tarea 1.
- **Sesión sin repo git o sin `gh` instalado.** La fila Git muestra solo lo que tenga, o se oculta, sin errores en el log. Las pruebas van en la Tarea 5.
- **Sin red o con la página de estado devolviendo HTML o 5xx.** La cabecera no muestra el servicio; no sale «sin incidencias» inventado. La prueba va en la Tarea 5.
- **Archivo de otra sesión a medio escribir o de hace 3 días.** Se ignora y no aparece en Sesiones. La prueba va en la Tarea 6.
- **Terminal estrecha (40 columnas) con todo encendido.** Ninguna fila pasa del ancho y las barras encogen como hoy. La prueba va en la Tarea 7.

---

### Task 1: Statusline: archivo por sesión y silencio con tablero

**Files:**
- Modify: `claude/statusline.sh`
- Test: `pruebas/test_statusline.py`

**Interfaces:**
- Produces: el archivo `~/.claude/tablero/linea/<session_id>.json`:
  ```json
  {"actualizado": <epoch s>, "session_id": "…", "session_name": "…|null", "thinking": true|false|null,
   "prompt_cache": {"warm": bool, "ttl": "5m"|"1h", "expires_at": <epoch s>|null, "hit_ratio": <0-1>|null} | null,
   "pr": {"number": n, "url": "…", "review_state": "approved|pending|changes_requested|draft"|null} | null}
  ```

- [ ] **Step 1: Escribe las pruebas que fallan**, en `pruebas/test_statusline.py`, con `HOME` temporal y un `settings.json` falso:
  - `test_escribe_linea_por_sesion`: con stdin `{"session_id":"abc","session_name":"Prueba","thinking":{"enabled":true},"prompt_cache":{"warm":true,"ttl":"5m","expires_at":1900000000,"hit_ratio":0.91},"pr":{"number":41,"url":"u","review_state":"pending"}}`, el archivo `linea/abc.json` existe y tiene `session_name == "Prueba"`, `thinking is True`, `prompt_cache.expires_at == 1900000000` y `pr.number == 41`.
  - `test_silencio_con_tablero`: con `{"enabledPlugins":{"tablero@claude-code-entorno":true}}`, stdout queda vacío, y `jev/limites.json` se sigue escribiendo si llegan `rate_limits`.
  - `test_imprime_sin_tablero`: sin esa clave, stdout contiene el nombre del modelo, como hoy.
  - `test_sin_session_id_no_escribe`: si falta `session_id`, no se crea nada en `linea/`.
- [ ] **Step 2: Corre las pruebas y confirma que fallan.** Comando: `python3 -m unittest pruebas.test_statusline -v`. Esperado: FAIL en las 4 nuevas.
- [ ] **Step 3: Implementa en `claude/statusline.sh`:**
  - Una función `guardar_linea`, con el mismo patrón atómico que `guardar_uso` (`mktemp` en la carpeta, `chmod 700` de la carpeta y `mv -f`).
  - Antes de imprimir: `if jq -e '.enabledPlugins["tablero@claude-code-entorno"] == true' "$HOME/.claude/settings.json" >/dev/null 2>&1; then exit 0; fi`.
- [ ] **Step 4: Corre `python3 -m unittest discover -s pruebas`.** Esperado: OK.
- [ ] **Step 5: Commit** con `feat(statusline): guarda datos por sesión para el tablero y calla con él`.

### Task 2: Planes dentro del tablero (absorbe barra-plan)

**Files:**
- Create: `mods/tablero/hooks/planes.ts`, que mueve `mods/barra-plan/hooks/barra.ts` (`aplicar`, `resumen`, `tiempo`, `barra`, `CAIDA_MS`) sin `filas`.
- Create: `mods/tablero/tests/planes.test.ts`, que porta los casos de `mods/barra-plan/hooks/barra.test.ts` menos los de `filas` y la banda.
- Modify: `mods/tablero/hooks/register.tsx` (`session.start`, `prompt.compose` y `tool.call`) y `mods/tablero/types/index.d.ts` (añade `planes: Plan[]` al estado del tablero y los tipos `Plan` y `EstadoPlan`).

**Interfaces:**
- Produces:
  - `const TOOL = 'mcp__tablero__plan_progress'`.
  - El atom `planes`, `atom({ plugin: 'tablero', key: 'planes' }, [] as Plan[])`.
  - `filaPlan(p: Plan, ahora: number, anchoTitulo: number): { glifo: string; palabra: 'En curso'|'Te espera'|'Falló'|'Hecho'; titulo: string; hechos: number; total: number; paso: string|null; tiempo: string; nota: string|null }` en `planes.ts`.

- [ ] **Step 1: Pruebas que fallan** en `planes.test.ts`: los casos portados, y además:
  - `filaPlan` de un plan `needs_input` con nota `"¿Subo?"` devuelve `palabra: 'Te espera'`, `glifo: '◆'` y `nota: '¿Subo?'`;
  - de uno `running`, `palabra: 'En curso'`;
  - de uno `done`, `glifo: '✓'`.

  En una prueba de registro (`tests/planes-registro.test.tsx`, con el `MockSession` de las pruebas existentes): llamar a `plan_progress` con `{id:'x', title:'Arreglar login', steps:[{title:'A'},{title:'B'}]}` responde con texto que empieza por `x: 0/2`, y la sección de reglas `tablero:planes` está en `prompt.compose` y nombra `mcp__tablero__plan_progress`.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL en los casos nuevos.
- [ ] **Step 3: Implementa.**
  - Mueve el código de `barra.ts`.
  - Registra la herramienta `plan_progress` en `session.start`, con el esquema idéntico al de `mods/barra-plan/hooks/register.tsx:24-43` y la descripción `"Plan con barra de progreso en el tablero, uno por id. Créalo con title y stages; avanza con next, done, active, failed o state."`.
  - Copia `RULES` sustituyendo el nombre de la herramienta, con el id de sección `tablero:planes`.
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: todo en verde.
- [ ] **Step 5: Commit** con `feat(tablero): los planes viven en el tablero (plan_progress)`.

### Task 3: Aduana y Caveman dentro del tablero

**Files:**
- Create: `mods/tablero/hooks/aduana.ts` (mueve `mods/aduana-panel/hooks/resumen.ts`: `vigente`, `FRESCO_MS`, `TERMINADO_MS`) y `mods/tablero/hooks/caveman.ts` (mueve `mods/caveman-badge/hooks/modo.ts`: `siguienteModo`, `Modo`).
- Create: `mods/tablero/tests/aduana.test.ts` y `mods/tablero/tests/caveman.test.ts` (portados de `aduana-panel/hooks/resumen.test.ts` y `caveman-badge/hooks/modo.test.ts`).
- Modify: `register.tsx` (temporizador de Aduana cada 5000 ms con `$.fs.read`, el toast de terminado, y `prompt.submit` actualizando el atom `caveman`) y `types/index.d.ts` (`aduana: EstadoAduana | null`, `caveman: Modo`).

**Interfaces:**
- Produces:
  - `filasAduana(e: EstadoAduana, ahora: number): { titulo: string; hechas: number; total: number; costo: string; invalidas: number; enCurso: string | null; terminado: boolean }`.
  - `etiquetaCaveman(m: Modo): string | null`, que devuelve `'Caveman full'`, `'Caveman lite'`, `'Caveman ultra'` o `null` (apagado).

- [ ] **Step 1: Pruebas que fallan**:
  - los casos portados;
  - `etiquetaCaveman('full') === 'Caveman full'`;
  - `filasAduana` con 3 corridas en curso arma `enCurso` como `"3 en curso: A lectura-pdf 2m05 · …"`, con el mismo formato que `lineas()` hoy.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL.
- [ ] **Step 3: Implementa** moviendo el código. Aduana deja de dibujar en `AbovePrompt` por su cuenta (lo hará la Tarea 7).
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: verde.
- [ ] **Step 5: Commit** con `feat(tablero): absorbe Aduana y el modo caveman`.

### Task 4: Lector de la línea, cache, $/h, presupuesto y cupos

**Files:**
- Create: `mods/tablero/hooks/linea.ts` (lectura y validación del archivo de la Tarea 1), `mods/tablero/hooks/cache.ts` y `mods/tablero/hooks/gasto-dia.ts`.
- Test: `mods/tablero/tests/linea.test.ts`, `cache.test.ts` y `gasto-dia.test.ts`.
- Modify: `register.tsx`:
  - lee `linea/<id>.json` en el mismo ciclo que `limites.json`;
  - suma `cache_read_input_tokens` de los pasos del lead en `turn.step`;
  - acumula los ms de los turnos en `turn.start` y `turn.complete`.
- Modify: `uso.ts`, para el pronóstico del cupo.

**Interfaces:**
- Produces:
  - `leerLinea(texto: string, ahoraS: number): Linea | null`, que devuelve null si el JSON es inválido, si tiene más de 24 h o si falta `session_id`.
  - `textoCache(pc: Linea['prompt_cache'], ahoraS: number): { caliente: boolean; queda: string | null; aviso: boolean; aciertos: number | null }`. `aviso` es true si quedan menos de 60 s.
  - `porHora(costoUsd: number, msTrabajo: number): number | null`, que devuelve null con menos de 60 000 ms.
  - `gastoDelDia(propio: { id: string; costo: number; base: number; dia: string }, otros: RegistroSesion[], hoy: string): number`, que suma `costo - base` de los registros del día `hoy`.
  - `pronosticoCupo(pct: number, fraccionVentana: number | null, reinicioMs: number | null, ahoraMs: number): string`, que devuelve `'Al ritmo actual no se agota'` o `'Al ritmo actual se agota HH:MM'`.

- [ ] **Step 1: Pruebas que fallan**, con números exactos:
  - `textoCache({warm:true, ttl:'5m', expires_at:1000+192, hit_ratio:0.91}, 1000)` → `{caliente:true, queda:'3:12', aviso:false, aciertos:91}`. Con `expires_at: 1000+45` → `aviso:true`. Con `warm:false` → `caliente:false, queda:null`.
  - `porHora(1.38, 30_000)` → `null`; `porHora(2.0, 3_600_000)` → `2`.
  - `pronosticoCupo(40, 0.5, …)` → `'Al ritmo actual no se agota'`. `pronosticoCupo(60, 0.25, reinicio=ahora+3h45m, ahora)` → se agota en `0.25·5h·(100/60) − 0.25·5h = 50 min` → `'Al ritmo actual se agota HH:MM'` con la hora local de `ahora + 50 min`.
  - `gastoDelDia`: dos registros de hoy (`costo 3, base 1`) y (`costo 2, base 0`), más uno de ayer, → `4`.
  - `leerLinea('{"session_id":"a","actualizado":1}', 1+86_401)` → `null`.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL.
- [ ] **Step 3: Implementa las funciones** y conéctalas en `register.tsx`, en atoms de estado nuevos (`linea`, `trabajoMs` y `cacheLeida` por sesión), declarados en `types/index.d.ts`.
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: verde.
- [ ] **Step 5: Commit** con `feat(tablero): cache, costo por hora, presupuesto y pronóstico de cupo`.

### Task 5: Git, CI, servicio de Claude y Config

**Files:**
- Create: `mods/tablero/hooks/git-ci.ts`, `mods/tablero/hooks/servicio.ts` y `mods/tablero/hooks/config-cargada.ts`.
- Test: `mods/tablero/tests/git-ci.test.ts`, `servicio.test.ts`, `config-cargada.test.ts` y `fuentes-registro.test.tsx`.
- Modify: `register.tsx`: temporizadores con los topes de Global Constraints, solo para los extras activos.

**Interfaces:**
- Produces:
  - `parseShortstat(s: string): { archivos: number; mas: number; menos: number }`. Con `''` devuelve todo a 0.
  - `parseSinSubir(s: string): number | null`.
  - `estadoCi(json: string): 'corriendo' | 'pasa' | 'falla' | null`, a partir de `gh pr checks <n> --json bucket`: `fail` gana; si no, `pending`; si todo es `pass` o `skipping`, `pasa`; si la lista está vacía, `null`.
  - `leerServicio(status: number, texto: string): { ok: boolean; texto: string } | null`. Para el indicador `none` devuelve `{ok:true, texto:'Claude sin incidencias'}`. Para `minor`, `major` y `critical`, `{ok:false}` con `'Claude con fallos menores'`, `'Claude con fallos graves'` o `'Claude caído'`. Para `maintenance`, `'Claude en mantenimiento'`. Si no es 2xx o el JSON es inválido, `null`.
  - `contarConfig(x: { claudeMd: number; reglas: number; hooks: number; mcp: number }): string`, por ejemplo `'2 CLAUDE.md · 10 reglas · 33 hooks · 9 MCP'`.

- [ ] **Step 1: Pruebas que fallan**:
  - `parseShortstat(' 3 files changed, 24 insertions(+), 7 deletions(-)')` → `{3,24,7}`; con `' 1 file changed, 2 deletions(-)'` → `{1,0,2}`.
  - `estadoCi('[{"bucket":"pass"},{"bucket":"pending"}]')` → `'corriendo'`.
  - `leerServicio(200, '{"status":{"indicator":"minor"}}')` → `{ok:false, texto:'Claude con fallos menores'}`; `leerServicio(502, '<html>')` → `null`.
  - En `fuentes-registro.test.tsx`, con un mock de `$.process.run` que rechaza (no hay git), la sesión dibuja el panel sin la fila Git y sin lanzar.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL.
- [ ] **Step 3: Implementa.**
  - Git: `$.process.run(['git','diff','--shortstat','HEAD'], {timeoutMs:5000})` y `['git','rev-list','--count','@{u}..HEAD']`.
  - CI: `['gh','pr','checks', String(pr.number), '--json','bucket']`, con `timeoutMs:10000`.
  - Servicio: `$.http.fetch(URL)`, con un tope de 5 s envuelto en una carrera contra `$.clock`.
  - Config:
    - CLAUDE.md: los que existen entre `~/.claude/CLAUDE.md`, `<root>/CLAUDE.md`, `<root>/AGENTS.md` y `<root>/.claude/CLAUDE.md`;
    - reglas: archivos `.md` de `~/.claude/rules` y de `<root>/.claude/rules`;
    - hooks: número total de entradas de `hooks` en `$.settings.read()`;
    - MCP: servidores distintos en los nombres `mcp__<servidor>__…` de `$.tool.list()`.

  Cada resultado va a un atom; si el resultado es `null`, la fila se oculta.
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: verde.
- [ ] **Step 5: Commit** con `feat(tablero): git, CI, estado del servicio y config cargada`.

### Task 6: Gasto y Sesiones

**Files:**
- Create: `mods/tablero/hooks/gasto.ts` y `mods/tablero/hooks/sesiones.ts`.
- Test: `mods/tablero/tests/gasto.test.ts` y `sesiones.test.ts`.
- Modify: `register.tsx`:
  - escribe `sesiones/<id>.json` cuando cambia el estado y como mucho cada 5 s;
  - lee la carpeta cada 10 s;
  - en `turn.complete`, calcula Gasto con `$.session.messages({ last: 400 })`;
  - añade las teclas `g` y `s` como `Button` con `hotkey`, con el mismo patrón que las tarjetas.

**Interfaces:**
- Produces:
  - `RegistroSesion = { id: string; nombre: string | null; carpeta: string; estado: 'trabajando'|'espera'|'inactiva'; desde: number; costo: number; base: number; dia: string; actualizado: number }`.
  - `estadoSesion(x: { trabajando: boolean; permisosPendientes: number; planEspera: boolean }): RegistroSesion['estado']`. `espera` gana sobre `trabajando`.
  - `leerSesiones(textos: { nombre: string; texto: string }[], propia: string, ahoraMs: number): RegistroSesion[]`. Quita la propia, las inválidas y las de más de 24 h, y ordena `espera` antes que `trabajando` antes que `inactiva`.
  - `topGasto(mensajes: SessionMessage[]): { llamada: string; motivo: string; tokens: number }[]`, con hasta 4. Los tokens se estiman como `Math.ceil(texto.length / 4)`. El motivo es `'leído N veces'` para un Read repetido del mismo `file_path` (con los tokens sumados) o `'salida de N líneas'`.
  - `consejoGasto(top): string | null`: si hay un Read repetido, `'Consejo: <archivo> se leyó N veces; pide sus líneas exactas en vez del archivo entero.'`.

- [ ] **Step 1: Pruebas que fallan**:
  - `estadoSesion({trabajando:true, permisosPendientes:1, planEspera:false})` → `'espera'`.
  - `leerSesiones` con un texto `'{"id":'` (cortado) y otro de hace 25 h → `[]`.
  - `topGasto` con tres `Read` de `src/a.ts` y un `Bash` de 900 líneas → primero `{llamada:'Read src/a.ts', motivo:'leído 3 veces'}`.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL.
- [ ] **Step 3: Implementa y conecta.**
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: verde.
- [ ] **Step 5: Commit** con `feat(tablero): secciones Gasto y Sesiones`.

### Task 7: Dibujo unificado (panel y resumen sobre el prompt)

**Files:**
- Modify: `mods/tablero/hooks/register.tsx`:
  - `sesionPanel`, la cabecera de la lista, `agentsPanel` (estados con palabra y mayúscula), `jevPanel` en la lista y `gatePanel` en la lista;
  - las nuevas `planesPanel`, `aduanaPanel`, `gastoPanel` y `sesionesPanel`;
  - el resumen `isMini`;
  - un hook nuevo `ui.render` de `AbovePrompt` que dibuja el resumen solo si el panel no está colocado (se registra con `$.ui.open(...).isPlaced` y con `ui.close`).
- Modify: `mods/tablero/hooks/core.ts` (`statusLabel`: `'En curso' | 'Hecho' | 'Falló' | 'Detenido'`) y `nombres.ts` (`'Explorar'`, `'Propósito general'`, `'Plan'`).
- Modify: las pruebas existentes que fijan textos viejos (`panel-es`, `lista-defecto`, `tablero-agentes`, `resumen-panel`, `menores`, `reloj`, `cabecera`, entre otras). Actualízalas al texto nuevo, sin borrar lo que comprueban.
- Create: `mods/tablero/tests/unificado.test.tsx`.

**Interfaces:**
- Consumes: todo lo producido en las Tareas 2 a 6.
- Produces: el orden de secciones `Sesión, Planes, Agentes, Jev, Aduana, Gasto, Sesiones, Permisos`. Cada sección vacía no ocupa filas, salvo Agentes, que muestra `Aún sin subagentes`.

- [ ] **Step 1: Pruebas que fallan** en `unificado.test.tsx`, dibujando la lista a 108 columnas con datos sembrados:
  - la cabecera contiene `TABLERO`, `○ En espera` y `Caveman full`, y no contiene `Opus`;
  - Sesión tiene las filas `Modelo`, `Contexto`, `Cache`, `Costo`, `Cupo 5 h`, `Cupo 7 d`, `Proyecto`, `Git` y `Config`, con mayúscula, y no contiene `bypassPermissions`, `agentes 0/0` ni `permisos 6`;
  - con `HERDR_ENV=1` no aparece `⎇`; sin él, la rama va en la cabecera;
  - un plan `needs_input` dibuja `◆ Te espera` y la línea `↳ ¿Subo?`;
  - ninguna línea contiene `? ` como símbolo de estado;
  - a 40 columnas ninguna línea pasa de 40 caracteres;
  - con el panel no colocado, `AbovePrompt` devuelve el resumen (como mucho 8 filas, con `Cache`, el plan y los agentes); colocado, devuelve `next(e)`.
- [ ] **Step 2: Corre `claude plugin test mods/tablero`.** Esperado: FAIL en las nuevas.
- [ ] **Step 3: Implementa el dibujo** siguiendo la maqueta línea a línea (las funciones `panel()` y `chat()` de `docs/maquetas/tablero-unificado.html` son la referencia de textos y columnas). Actualiza las pruebas viejas al texto nuevo.
- [ ] **Step 4: Corre `claude plugin test mods/tablero`.** Esperado: todo en verde.
- [ ] **Step 5: Commit** con `feat(tablero): dibujo unificado sin duplicados`.

### Task 8: Retirar los mods absorbidos y documentar

**Files:**
- Delete: `mods/barra-plan/`, `mods/aduana-panel/` y `mods/caveman-badge/`.
- Modify:
  - `.claude-plugin/marketplace.json`: quita las tres entradas y pone el tablero en `1.3.0`;
  - `herramientas/instalar_comun.py`: añade `MODS_RETIRADOS = ["barra-plan", "aduana-panel", "caveman-badge", "plan-progress"]` y, en `mods()`, corre `claude plugin uninstall <n>@claude-code-entorno --scope user` para los que estén instalados (y en `--simular`, solo lo anuncia);
  - `claude/hooks/caveman-activo.py`: el comentario de la línea 30 pasa a nombrar `tablero/hooks/caveman.ts`;
  - `README.md`, `docs/GUIA-DE-USO.md`, `CHANGELOG.md`, `mods/tablero/README.md`, `mods/tablero/CHANGELOG.md` (entrada `1.3.0`) y `mods/tablero/.claude-plugin/plugin.json`: versión `1.3.0`, descripción, `extras` y `presupuestoDiario` en `userConfig`.
- Test: `pruebas/test_instalar.py`.

- [ ] **Step 1: Prueba que falla** en `pruebas/test_instalar.py`: `test_mods_retirados_se_desinstalan_en_simulacion`. Con `--simular` y un `claude` falso que lista `barra-plan@claude-code-entorno` como instalado, la salida contiene `haría: claude plugin uninstall barra-plan@claude-code-entorno`.
- [ ] **Step 2: Corre `python3 -m unittest discover -s pruebas`.** Esperado: FAIL.
- [ ] **Step 3: Implementa, borra y documenta.**
- [ ] **Step 4: Corre `python3 -m unittest discover -s pruebas`, `claude plugin test mods/tablero` y `./exportar.sh`.** Esperado: todo OK y la revisión de privacidad limpia.
- [ ] **Step 5: Commit** con `feat(mods): tablero 1.3.0 absorbe barra-plan, aduana-panel y caveman-badge`.

### Task 9: Instalación real y prueba de punta a punta

- [ ] **Step 1:** `git push -u origin feat/tablero-1.3` y abrir el PR.
- [ ] **Step 2:** Desde `~/claude-code-entorno`:
  1. `claude plugin marketplace update claude-code-entorno`;
  2. `claude plugin update tablero@claude-code-entorno`;
  3. `claude plugin uninstall` de los tres mods retirados;
  4. `cp claude/statusline.sh ~/.claude/statusline.sh`, o el paso del instalador que lo copia.
- [ ] **Step 3:** `diff -rq -x .gitignore -x node_modules ~/.claude/plugins/cache/claude-code-entorno/tablero/1.3.0 mods/tablero` debe salir sin diferencias.
- [ ] **Step 4:** Prueba real: arrancar `claude --plugin-dir mods/tablero` en una sesión de herdr y comprobar:
  - pedirle un plan de 3 pasos y lanzar 2 subagentes, y ver Planes y Agentes;
  - cerrar el panel y ver el resumen sobre el prompt;
  - que la statusline no imprime nada y que `~/.claude/tablero/linea/` tiene el archivo de la sesión.

  Captura con `screencapture` y enseña al usuario la salida real.
- [ ] **Step 5:** Decir al usuario que reinicie Claude una vez y qué mirar.

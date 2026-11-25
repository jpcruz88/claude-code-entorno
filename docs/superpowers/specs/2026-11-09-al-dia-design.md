# Al día: actualizar solo skills, plugins y MCP, y avisarlo en el tablero

Fecha: 2026-11-09. Estado: borrador para revisión del usuario. Revisado por un agente constructor; sus preguntas están resueltas.

## Intención

El usuario nunca sabe si sus skills, plugins y servidores MCP están al día, y no quiere tener que acordarse de mirar. Quiere que el entorno los **actualice solo** y le **diga qué hizo**. El aviso va en el tablero, en una caja propia.

## Metas

1. Una vez al día, al empezar la primera sesión de Claude Code, se actualiza en segundo plano todo lo de terceros que instala el entorno:
   - **Skills**: todas las del lock global `~/.agents/.skill-lock.json`, no solo las de `skills/lista.json`. El usuario quiere todo al día, también lo que instaló a mano. (Decisión de Claude.)
   - **Plugins**: todos los que muestra `claude plugin list`, salvo los del marketplace `claude-code-entorno` (los mods de este repo). Hoy son `superpowers@claude-plugins-official` y `savvy-progress@claude-kit`. Antes se refrescan sus marketplaces. (Decisión de Claude.)
   - **`codebase-memory-mcp`**, el binario local (`codebase-memory-mcp update -y`).
   - **herdr** y sus plugins: `herdr update` y `herdr plugin update` (hoy `permgps/herdr-telegram-agents`).
   - **opencode**: `opencode upgrade`.
   - **Plugins de Neovim** (LazyVim): `nvim --headless "+Lazy! update" +qa`. Cambia `~/.config/nvim/lazy-lock.json` (la copia instalada), no el del repo.
   - **Claude Code**: `claude update`. Ya se actualiza solo, pero el usuario pidió «absolutamente todo»; así también queda en la caja cuando cambia. (Decisión de Claude.)
   - Cada herramienta entra solo si está instalada. Si falta, se salta sin avisar.

   El usuario pidió «todo, absolutamente todo»: todo lo que instala el entorno y tenga forma de actualizarse.
2. **Siempre actualiza**, sin preguntar, aunque cambien las instrucciones de una skill o plugin de terceros. Decisión del usuario.
3. El tablero muestra una caja **AL DÍA** (opción B de la maqueta) con:
   - cada cosa actualizada: nombre, versión o hash de antes → después, y tipo (skill, plugin, MCP, programa);
   - una marca `⚠ cambió texto` cuando cambiaron las instrucciones de algo de terceros;
   - cada fallo con `✗`, y la nota de que sigue la versión anterior;
   - una línea final: cuántas cosas siguen al día y «reinicia Claude para usar lo nuevo».
4. La caja solo aparece si hubo cambios o fallos en las últimas 24 h. Si no, no ocupa espacio.
5. Funciona en Mac y en Windows, igual que el resto del entorno.

## No metas

- **Los mods de este repo** (`mods/*`) no entran: se leen del repo y tienen su propio flujo de versiones (`mods-version.md`).
- `context7` no entra: es remoto (HTTP) y siempre está al día.
- Ghostty y la configuración de terminal no entran: son archivos de configuración del repo, no programas con actualizador. Ghostty se actualiza con su propio actualizador.
- No instala skills ni plugins nuevos, ni quita los que sobran. Solo actualiza lo que ya está instalado.
- No hay aviso en el chat ni notificación de macOS: solo el tablero.

## Anti-metas

- **Frenar el arranque de Claude.** El hook de inicio debe volver al instante. Todo el trabajo va en un proceso aparte.
- **Dejar algo roto.** Si una actualización falla, lo que estaba instalado sigue funcionando y la caja lo dice.
- **Avisos falsos.** La caja solo cuenta lo que de verdad cambió, comparando el antes y el después. Nunca dice «actualizado» porque un comando terminó sin error.
- **Jerga.** Los textos de la caja se entienden sin glosario (regla del usuario para el tablero).
- Correr dos veces a la vez porque se abrieron dos sesiones juntas.

## Cómo funciona (decidido)

### Disparo

- Un hook `SessionStart` (matcher `startup`) en `claude/settings.base.json` lanza `claude/hooks/al-dia.py`.
- El script mira `~/.claude/al-dia/ultima-revision.json`. Si la última revisión empezó hace menos de 24 h, sale sin hacer nada.
- Si la última revisión dejó fallos o pendientes, se reintenta solo eso en la siguiente sesión que abra pasada 1 h, sin esperar las 24 h. (Decisión de Claude.)
- Si toca revisar, se relanza separado del hook (en Mac `start_new_session`, en Windows `DETACHED_PROCESS`) y el hook sale enseguida.
- Un archivo de cerrojo (`~/.claude/al-dia/cerrojo`) evita dos revisiones a la vez. Un cerrojo de más de 1 h se da por muerto.

### Revisión

1. **Foto de antes:** hashes de skills (`skillFolderHash` del lock), versiones de plugins (`claude plugin list`, o los `plugin.json` de la caché) y `codebase-memory-mcp --version`.
2. **Actualizar**, cada paso por separado, con su tiempo límite. Si uno falla, los demás siguen:
   - `claude plugin marketplace update <marketplace>` y luego `claude plugin update <plugin>@<marketplace>`, para cada plugin de terceros;
   - `npx -y skills@<versión fija> update <skill> -g -y`, **una skill por vez**, para saber cuál falló (la versión es la de `SKILLS_CLI` en `herramientas/instalar_comun.py`). (Decisión de Claude.)
   - `codebase-memory-mcp update -y`, solo si está instalado. Si no se puede reemplazar porque está en uso (Windows), no cuenta como `✗`: cuenta como «pendiente, reintento en la próxima sesión». (Decisión de Claude.)
3. **Foto de después** y comparación con la de antes. Así salen los cambios reales.
4. **Cambio de instrucciones (`⚠`):** para cada skill o plugin que cambió, se guarda el diff de sus archivos de texto (`SKILL.md`, agentes, comandos, hooks) en `~/.claude/al-dia/cambios/<fecha>/<nombre>.diff`. Si el diff no está vacío, lleva `⚠`. Así el usuario puede pedirle a Claude que revise qué cambió.
5. **Resultado** en `~/.claude/al-dia/resultado.json`: fecha, lista de cambios (nombre, tipo, antes, después, `cambio_texto`, ruta del diff), lista de fallos (nombre, tipo, resumen corto del error) y cuántas cosas siguen al día. Se escribe de forma atómica (archivo temporal y luego renombrar).

### Tablero

- `register.tsx` lee `~/.claude/al-dia/resultado.json`, como ya hace con `~/.claude/jev/limites.json`.
- La caja es un panel nuevo, `aldia`, que entra en `PANELS_DEFECTO` (`hooks/core.ts`) y en el valor por defecto de `panels` en `plugin.json`. Quien quiera ocultarla lo quita de `panels`. (Decisión de Claude.)
- Un modelo puro nuevo (`hooks/al-dia-modelo.ts`) convierte el JSON en filas de la caja, con pruebas.
- La caja va con el resto del panel, en el lugar que mejor quepa según el ancho (ver lo que se deja al constructor).
- La maqueta aprobada es `aviso-al-dia.html`, opción B (en el scratchpad de la sesión). Esta es la referencia:

```text
┌ AL DÍA · hoy 09:12 ────────────────────────────────────────────┐
│ ↑ superpowers        7.0.0 → 7.1.0   plugin                    │
│ ↑ caveman            a1c3f → e9b20   skill  ⚠ cambió texto     │
│ ↑ codebase-memory    0.6.2 → 0.7.0   MCP                       │
│ ✗ brand-identity     no se pudo bajar · sigue la anterior      │
│ 61 al día · reinicia Claude para usar lo nuevo                 │
└────────────────────────────────────────────────────────────────┘
```

- Colores neón: borde magenta, `↑` verde, `⚠` ámbar, `✗` rojo y texto tenue para el «antes».
- Si los cambios no caben, se muestran los primeros y una línea `+N más`. Primero van los fallos y los que llevan `⚠`.

### Instalador y pruebas

- `instalar.sh`, `instalar.ps1` e `instalar_comun.py` copian `al-dia.py` a `~/.claude/hooks/` y fusionan el hook, igual que los demás hooks.
- `pruebas/test_al_dia.py` cubre lo siguiente con comandos falsos, sin red:
  - salta si no pasaron 24 h;
  - el cerrojo funciona;
  - la comparación antes/después;
  - la marca `⚠` y el diff;
  - un fallo no detiene los demás pasos;
  - el JSON del resultado.
- Pruebas del tablero para el modelo de la caja: vacía, solo cambios, con fallos, recorte con `+N más` y caja oculta después de 24 h.
- El cambio del tablero sigue `mods-version.md` completo: subir versión en `plugin.json` y `MOD_VERSION`, CHANGELOG, actualizar el plugin, comprobar la caché y sincronizar la copia del marketplace.

## Riesgo aceptado

Las skills y plugins de terceros son instrucciones que Claude sigue. Al actualizarlos solos, un cambio malo o malicioso del autor entra sin revisión. El usuario lo aceptó a sabiendas («siempre actualiza»). Lo que lo mitiga es la marca `⚠` y el diff guardado, que dejan ver qué cambió.

## Lo que se deja al constructor

- Dónde va la caja en cada distribución del tablero (dos columnas, apilado, columna), siempre que no tape la franja de situación ni ESTADO.
- La forma exacta de leer las versiones de plugins (salida de `claude plugin list` o archivos de la caché).
- Los tiempos límite de cada paso.
- Cómo encontrar la ruta de `npx` y `claude` cuando el hook corre sin el PATH de la terminal.

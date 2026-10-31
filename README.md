# claude-code-entorno

Mi configuración de [Claude Code](https://code.claude.com) lista para copiar en otra
computadora, con **Windows** o con **Mac**. Un solo comando deja reglas, hooks,
línea de estado, plugins, skills y servidores MCP como los tengo en mi Mac
principal.

Solo trae lo **genérico**: nada de proyectos, clientes, claves ni rutas personales
(ver [Privacidad](#privacidad)).

---

## Que lo instale Claude por ti

Lo más sencillo es pedírselo a Claude Code. Sigue [AGENTS.md](AGENTS.md): primero
te enseña lo que va a hacer, te pregunta lo necesario y solo instala cuando le
dices que sí.

1. **Instala Claude Code**, si no lo tienes:
   - Windows: abre PowerShell (Inicio → escribir `PowerShell`; no hace falta
     abrirla como administrador) y corre:

     ```powershell
     irm https://claude.ai/install.ps1 | iex
     ```

   - Mac: abre la app Terminal y corre:

     ```bash
     curl -fsSL https://claude.ai/install.sh | bash
     ```

   Al terminar, abre una terminal nueva y comprueba que `claude --version` muestra
   un número de versión. Si dice que no encuentra `claude`, sigue lo que indicó el
   instalador sobre el PATH.

2. **Abre Claude Code en tu carpeta de usuario** e inicia sesión con tu cuenta de
   Claude: en Windows, `cd $env:USERPROFILE` y luego `claude`; en Mac, `cd ~` y
   luego `claude`.

3. **Pega este mensaje** en Claude Code:

   ```text
   Instala mi entorno de Claude Code. Si no está git, instálalo (en Windows con winget; en Mac con xcode-select --install). Luego clona https://github.com/jpcruz88/claude-code-entorno en mi carpeta de usuario (o haz git pull si ya está) y sigue su AGENTS.md al pie de la letra.
   ```

4. **Contesta sus preguntas** (en una computadora del trabajo, lo prudente es
   instalar sin las skills de terceros) y acepta las ventanas de «¿Permitir
   cambios?» que abra Windows. Al final te dice qué quedó y qué te toca a ti:
   normalmente poner la clave de Context7 y reiniciar Claude Code.

> No le des tu clave de Context7 a Claude por el chat: te dirá cómo ponerla tú.

---

## Qué incluye

| Qué | Dónde está en el repo | Qué hace |
|---|---|---|
| Ajustes | `claude/settings.base.json` | Modelo, esfuerzo, tema, hooks y línea de estado. Se **suma** a tu `settings.json` sin borrar lo tuyo. |
| Reglas | `claude/rules/` | Instrucciones que Claude lee en todos los proyectos: usar `ctx7` para documentación, matar procesos solo por PID y responder siempre en modo `caveman` (telegráfico, en español) en el chat, sin aplicarlo al código, commits, documentos ni textos para otras personas. Se apaga en una sesión con «stop caveman» o «modo normal». También: desarrollo guiado por pruebas (TDD) en todo cambio de comportamiento del código, con `superpowers:test-driven-development` (primero la prueba que falla) y `superpowers:verification-before-completion` (no decir «terminado» sin correr las pruebas). |
| Hook `guard-kill.py` | `claude/hooks/` | Bloquea comandos que matan procesos en masa (`pkill -f cat`, `killall`, `taskkill /IM`, `Stop-Process -Name`…). |
| Línea de estado | `claude/statusline.sh` | Muestra modelo, carpeta, rama, contexto usado, costo, límites de uso y hora. |
| Plugins | `plugins.txt` | `superpowers`. |
| Mods | `mods/` | Ocho mods de Claude Code, cada uno con su plugin y sus pruebas: `secret-guard` (bloquea escribir secretos), `tdd-gate` y `spec-gate` (avisan si se edita código sin prueba o sin spec), `guard-kill-visible`, `ctx-budget` (avisa al 70 % y 85 % de contexto), `sound-notify`, `caveman-badge` y `tablero` (panel en español sobre el prompt). El repo es su propio marketplace (`.claude-plugin/marketplace.json`). Opcionales: `--sin-mods` / `-SinMods`. |
| Skills | `skills/lista.json` | 48 skills de repositorios públicos de terceros (ver el [aviso](#skills)). Opcionales: `--sin-skills`. |
| Servidores MCP | `mcp/` | `context7` (documentación al día) y `codebase-memory-mcp` (mapa del código). |
| Gitignore global | `git/gitignore_global` | Archivos que no deben entrar a ningún repositorio. |
| herdr | `herdr/config.toml` | Organizador de terminales para agentes, con la paleta Kanagawa, atajos `ctrl+alt`, lazygit, btop y Neovim en ventanas flotantes, avisos y sesión que sobrevive a reinicios. Además: su integración con Claude y su skill. Mac y Linux. Ver [herdr y Telegram](#herdr-y-telegram). |
| Plugins de herdr | `herdr/plugins.txt` | `permgps/herdr-telegram-agents`: controla los agentes desde Telegram. Opcional: `--sin-plugins-herdr`. |
| Ghostty | `ghostty/config` | Terminal con la paleta Kanagawa Wave y JetBrains Mono Nerd Font; abre herdr al arrancar. Solo Mac. |
| Tema de Claude Code | `claude/themes/kanagawa.json` | Tema `custom:kanagawa` para Claude Code, a juego con Ghostty, herdr y Neovim. Hay que abrir una sesión nueva para que lo cargue. |
| Neovim | `nvim/` | [LazyVim](https://www.lazyvim.org) con el tema Kanagawa. Mac y Linux. No pisa una config de Neovim que ya tengas. Opcional: `--sin-nvim`. Ver [Neovim](#neovim). |
| Terminal | `terminal/terminal.sh` | `eza` (`ll` con íconos), `bat` (archivos con colores), `zoxide` (`z` salta a carpetas), `fzf` (buscar archivos) y `atuin` (historial con búsqueda), cargados desde tu `.zshrc`. Mac y Linux. Opcional: `--sin-terminal`. Ver [Terminal y Stats](#terminal-y-stats). |
| OpenCode como respaldo | `opencode/` | Las aliases `cl-go` y `cl-or` abren Claude Code contra OpenCode Go y OpenRouter, por si se acaban los tokens de Claude. Con la variable `OPENCODE_API_KEY` se define `cl-go`; sin ella no se crea. Además instala `/go-modelos`, que dentro de Claude Code enumera los modelos que incluye tu plan. Mac y Linux. Opcional: `--sin-opencode`. Ver [OpenCode como respaldo](#opencode-como-respaldo). |
| Config de OpenCode | *fuera de este repo* | Trae de [`jpcruz88/opencode-config`](https://github.com/jpcruz88/opencode-config) la config global de OpenCode en `~/.config/opencode`: el router que elige modelo por complejidad y el script `gomodel`. Va en un repo aparte **a propósito**: si se copiara aquí, esa config tendría dos fuentes de verdad. Mac y Linux. Opcional: `--sin-opencode-config`. Ver [OpenCode como respaldo](#opencode-como-respaldo). |
| Monitor en la barra de menú | `instalar.sh` | [Stats](https://github.com/exelban/stats) (código abierto): uso de CPU, GPU, RAM y disco en la barra de arriba; arranca al iniciar sesión. Solo Mac. Opcional: `--sin-stats`. |
| Modo servidor | `instalar.sh --servidor` | Mac que se queda encendida: no duerme, se enciende tras un corte de luz y abre Ghostty al iniciar sesión. Solo si lo pides. |
| Conectar dos Macs | `conectar.sh` | Asistente para usar desde esta Mac el herdr (y los agentes) de otra, por SSH: eliges la Mac de una lista de las de tu red. Lo corres tú cuando lo necesites. Ver [Conectar dos Macs](#conectar-dos-macs). |
| Panel de servicios locales | `local-services-panel/` | Página en `http://localhost:8790` con todo lo que corre en la máquina: contenedores de Docker y procesos locales, con estado en vivo y enlaces para entrar a cada servicio. Está en el repo pero el instalador **no** lo arranca: se enciende a mano. Ver [Panel de servicios locales](#panel-de-servicios-locales). |

## Qué NO incluye

- Proyectos, memorias de proyecto, historial ni conversaciones.
- Claves, tokens o contraseñas. Las claves externas —la de Context7
  (`CONTEXT7_API_KEY`), la de OpenCode (`OPENCODE_API_KEY`) y la de OpenRouter
  (`OPENROUTER_API_KEY`)— se guardan **en cada computadora** como variables de
  entorno, nunca en el repo. El verificador de privacidad las rechaza si alguna
  vez se cuela.
- Hooks y skills de trabajos privados o personales, plugins que solo uso en la
  Mac principal, permisos de herramientas concretas.
- Skills que ya llegan solas: las de `superpowers` (vienen con el plugin), las de
  `codebase-memory-mcp` (las pone su instalador), las que trae Claude Code y las
  que se sincronizan con la cuenta de claude.ai.

---

## Instalación en Windows (paso a paso, a mano)

Pensado para que lo siga cualquier persona que esté ayudando, sin Claude. Tarda
unos 15 minutos, casi todo en descargas.

**Antes de empezar:** una cuenta de Claude (la misma de la Mac) e internet. No
hace falta abrir nada como administrador; Windows puede pedir permiso
(ventana azul de «¿Permitir cambios?») al instalar Git y Node.js: hay que
aceptar.

1. **Abrir PowerShell.** Botón Inicio → escribir `PowerShell` → abrir «Windows
   PowerShell» (la normal, no «como administrador»).

2. **Instalar Git** (si no está; para bajar el repo). Escribir y pulsar Enter:

   ```powershell
   winget install --id Git.Git -e --source winget
   ```

   Al terminar, **cerrar PowerShell y abrirlo de nuevo** para que reconozca `git`.

3. **Bajar el repo:**

   ```powershell
   cd $env:USERPROFILE
   git clone https://github.com/jpcruz88/claude-code-entorno.git
   cd claude-code-entorno
   ```

   > Si en vez de `git clone` se descarga el ZIP desde GitHub, después de
   > descomprimirlo hay que correr `Get-ChildItem -Recurse | Unblock-File` dentro de
   > la carpeta; si no, Windows bloquea los scripts descargados.

4. **Ver primero qué va a hacer** (no cambia nada):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Simular
   ```

5. **Instalar:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
   ```

   - Instala con `winget` lo que falte: Git for Windows, Node.js LTS, Python 3,
     jq y uv.
   - Instala unas 48 skills de terceros sin auditar (ver [Skills](#skills)). En una
     computadora del trabajo conviene instalar sin ellas: añadir `-SinSkills` al
     final del comando.
   - Si después de instalar Python dice que no lo encuentra, cerrar PowerShell,
     abrirlo otra vez y repetir este paso (no se duplica nada).
   - Pide la **clave de Context7** si no existe (se saca gratis en
     <https://context7.com/dashboard>). Se puede pulsar Enter y ponerla después
     con este comando, que la pide sin dejarla en el historial:

     ```powershell
     [Environment]::SetEnvironmentVariable('CONTEXT7_API_KEY', (Read-Host 'Clave de Context7'), 'User')
     ```

     Con `-NoInteractivo` (o si no hay una consola que pueda contestar, como
     cuando lo corre un agente) no la pide: avisa y explica cómo ponerla después.

6. **Si no estaba Claude Code**, el instalador lo dice. Instalarlo con:

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

   y repetir el paso 5 (para los plugins y los MCP).

7. **Abrir Claude Code:** cerrar PowerShell, abrir uno nuevo, escribir `claude` e
   iniciar sesión con la cuenta.

8. **Comprobar:**
   - Abajo debe verse la línea de estado (modelo · carpeta · ctx …).
   - `/plugin` → `superpowers` instalado.
   - `/mcp` → `context7` y `codebase-memory-mcp` conectados.
   - `/hooks` → `guard-kill.py` en *PreToolUse*.
   - Pedirle a Claude «corre `taskkill /IM notepad.exe`»: debe responder que el hook
     lo bloqueó.

9. **Claude in Chrome** (opcional): instalar la extensión «Claude» desde la Chrome
   Web Store e iniciar sesión. No lleva configuración en este repo.

### Opciones de `instalar.ps1`

| Opción | Para qué |
|---|---|
| `-Simular` | Muestra lo que haría, sin cambiar nada. |
| `-NoInteractivo` | No pregunta nada (para agentes y scripts): si falta la clave de Context7, la omite y explica cómo ponerla después. Se activa solo si no hay una consola que pueda contestar (entrada redirigida o `powershell -NonInteractive`). |
| `-SinCodebaseMemory` | No instala codebase-memory-mcp ni sus hooks. |
| `-SinSkills` | No instala las skills (son código de terceros; ver [Skills](#skills)). |
| `-SinMods` | No instala los mods de `mods/` (por omisión sí). |
| `-SaltarAvisoPermisos` | Agrega `skipDangerousModePermissionPrompt` (ver [Ajuste opcional](#ajuste-opcional-saltar-el-aviso-de-permisos)). Apagado si no lo pones. |

### Detalles de Windows que conviene saber

- Claude Code usa **Git Bash** para correr la línea de estado y los hooks. Por eso
  se instala Git for Windows. Si Git quedó en un lugar raro, el instalador guarda
  su ruta en `settings.json` como `env.CLAUDE_CODE_GIT_BASH_PATH`.
- En Windows, Claude también tiene la herramienta **PowerShell**; por eso el hook
  vigila `Bash|PowerShell`.
- Los hooks de Python se lanzan con `py -3` (el lanzador oficial de Python). Si no
  existe, con `python`.
- Las skills se **copian** (`--copy`) en lugar de enlazarse: en Windows los enlaces
  simbólicos piden permisos especiales.
- `codebase-memory-mcp` sí tiene versión para Windows (x64 y ARM). Microsoft
  Defender a veces lo marca por error como `Trojan:Script/Wacatac.B!ml`; su autor
  lo documenta como falso positivo. Si la empresa lo bloquea, usar
  `-SinCodebaseMemory`.

---

## Instalación en Mac (u otra computadora con macOS o Linux)

```bash
git clone https://github.com/jpcruz88/claude-code-entorno.git
cd claude-code-entorno
./instalar.sh --simular   # ver qué haría
./instalar.sh             # instalar
```

- En Mac instala lo que falte con **Homebrew** (git, node, python, jq, uv y, para
  herdr, herdr, lazygit, btop, Ghostty y la fuente JetBrains Mono Nerd Font; además,
  eza, bat, zoxide, fzf, atuin y Stats). Si no hay Homebrew, explica cómo ponerlo.
- En Linux usa `apt-get` (pide `sudo`). La versión de Node.js de apt suele ser
  vieja: si avisa, instalar Node.js LTS desde <https://nodejs.org>.
- Opciones:

  | Opción | Para qué |
  |---|---|
  | `--simular` | Muestra lo que haría, sin cambiar nada. |
  | `--no-interactivo` | No pregunta nada (para agentes y scripts): si falta la clave de Context7, la omite y explica cómo ponerla después. Se activa solo si la entrada no es una terminal. En Linux usa `sudo -n`, que falla en vez de esperar una contraseña. |
  | `--sin-codebase-memory` | No instala codebase-memory-mcp ni sus hooks. |
  | `--sin-skills` | No instala las skills de terceros (ver [Skills](#skills)). |
  | `--sin-mods` | No instala los mods de `mods/` (por omisión sí). |
  | `--saltar-aviso-permisos` | Ver [Ajuste opcional](#ajuste-opcional-saltar-el-aviso-de-permisos). Apagado si no lo pones. |
  | `--sin-herdr` | No instala herdr, su config, su skill ni sus plugins, ni Ghostty. |
  | `--sin-ghostty` | No instala Ghostty ni su config (herdr sí). |
  | `--sin-plugins-herdr` | No instala los plugins de herdr (el de Telegram). |
  | `--sin-terminal` | No instala eza, bat, zoxide, fzf ni atuin, ni su archivo para la terminal. |
  | `--sin-nvim` | No instala Neovim ni su config (`nvim/`). |
  | `--sin-stats` | Solo macOS: no instala Stats, el monitor de la barra de menú. |
  | `--servidor` | Solo macOS: la Mac nunca duerme, se enciende sola tras un corte de luz y abre Ghostty al iniciar sesión (ver [Modo servidor](#modo-servidor)). Apagado si no lo pones. |

- Clave de Context7: la pide y ofrece guardarla en `~/.zshrc` (o `~/.bashrc`).
  A mano: `echo "export CONTEXT7_API_KEY='<tu-clave>'" >> ~/.zshrc`.

---

## Qué hace cada instalador, en orden

1. **Avisa si la empresa tiene políticas de Claude Code** (managed settings). Las
   busca en las rutas oficiales:
   - Windows: `C:\Program Files\ClaudeCode\managed-settings.json` (y
     `managed-settings.d\`, `managed-mcp.json`), y en el registro
     `HKLM\SOFTWARE\Policies\ClaudeCode` y `HKCU\SOFTWARE\Policies\ClaudeCode`.
   - Mac: `/Library/Application Support/ClaudeCode/` y el perfil
     `com.anthropic.claudecode` en `/Library/Managed Preferences/`.
   - Linux: `/etc/claude-code/`.
2. Instala los programas que falten.
3. Instala **codebase-memory-mcp** con su instalador oficial, si falta, en una
   versión fija (`v0.12.0`, no la rama en desarrollo).
4. Pide la clave de Context7, si falta (en modo no interactivo no la pide: avisa
   y explica cómo ponerla después).
5. Copia reglas, hook, línea de estado y comandos (`claude/commands/`) a la carpeta
   `.claude` de tu usuario. Si ya
   había un archivo distinto, antes guarda una copia `.bak-<fecha>`.
6. **Fusiona** `settings.base.json` con tu `settings.json`
   (`herramientas/fusionar_settings.py`): guarda antes una copia
   `settings.json.bak-<fecha>`, no cambia ningún valor que ya tengas (te avisa si
   difiere) y agrega los hooks sin repetirlos.
7. Instala el plugin (`claude plugin install … --scope user`), las skills
   (`npx -y skills@1.7.2 add <dueño/repo@skill> -g -y -a claude-code`, con la
   versión del instalador de skills fija) y registra los MCP
   (`claude mcp add-json --scope user …`).
8. **herdr** (si está instalado): copia `herdr/config.toml` (con copia
   `.bak-<fecha>` si ya había otro), instala su integración con Claude
   (`herdr integration install claude`), su skill (`herdrdev/herdr@herdr`, salvo
   con `--sin-skills`) y los plugins de `herdr/plugins.txt`
   (`herdr plugin install … --yes`), y recarga la config si herdr está abierto.
9. **Ghostty** (solo Mac, si está o se acaba de instalar): copia `ghostty/config`
   con la ruta de herdr de esa computadora.
10. **Neovim** (Mac y Linux): copia `nvim/` a `~/.config/nvim`, salvo que ya tengas
    ahí una config tuya (entonces avisa y no la toca).
11. **Terminal** (Mac y Linux): copia `terminal/terminal.sh` a
    `~/.config/claude-code-entorno/` y agrega a tu `~/.zshrc` (o `~/.bashrc`, según
    tu shell) una línea que lo carga, solo la primera vez.
12. **OpenCode** (Mac y Linux): copia `opencode/opencode.sh` a
    `~/.config/claude-code-entorno/` y `opencode/opencode-go-modelos` a
    `~/.local/bin/`, y agrega al rc la línea que carga el primero. Solo define las
    aliases `cl-go` y `cl-or` si su variable de entorno existe; no pide ni escribe
    claves. Ver [OpenCode como respaldo](#opencode-como-respaldo).
13. **Config de OpenCode** (Mac y Linux): trae [`jpcruz88/opencode-config`](https://github.com/jpcruz88/opencode-config)
    a `~/.config/opencode` — clon, `git pull` si ya estaba, o conversión de una
    carpeta que ya existiera (sin tocar sus archivos sin seguimiento, como
    `service.json`) — y enlaza `gomodel` en `~/.local/bin/`. Solo lee y sincroniza:
    no edita ese repo. Ver [OpenCode como respaldo](#opencode-como-respaldo).
14. Copia el gitignore global si no tienes uno y lo activa si no hay otro activo.

En Mac, antes del paso 5, `instalar.sh` también instala con Homebrew las
herramientas de terminal y Stats (ver [Terminal y Stats](#terminal-y-stats)).

Con `--servidor`, `instalar.sh` además ajusta la energía y los ítems de inicio
antes del paso 5 (ver [Modo servidor](#modo-servidor)).

**Se puede correr cuantas veces haga falta**: lo que ya está se salta. Los pasos 5
a 12 los hace `herramientas/instalar_comun.py`, el mismo en Windows, Mac y Linux.
En Windows, `instalar.ps1` no instala herdr: si no lo tienes, el paso 8 se salta
con un aviso.

### Qué necesita internet o sesión

| Paso | Internet | Sesión de Claude |
|---|---|---|
| Programas (winget / brew / apt) | sí | no |
| codebase-memory-mcp | sí (GitHub) | no |
| Plugin `superpowers` | sí (GitHub) | no |
| Skills (`npx skills add`) | sí (npm y GitHub) | no |
| Registrar MCP | no | no |
| herdr, su skill y sus plugins | sí (Homebrew, npm y GitHub) | no |
| Usar Claude Code después | sí | **sí** (`claude` → iniciar sesión) |

---

## Los ajustes, uno por uno (`settings.base.json`)

| Clave | Valor | Qué hace |
|---|---|---|
| `model` | `opus` | Modelo por omisión. |
| `modelSettings` | `claude-opus-5-5` → `effortLevel: xhigh` | Esfuerzo de razonamiento alto para ese modelo. |
| `statusLine` | `~/.claude/statusline.sh` | Línea de estado de abajo (en Windows: `bash ~/.claude/statusline.sh`). |
| `hooks.PreToolUse` `Bash\|PowerShell` | `guard-kill.py` | Revisa cada comando antes de correrlo y bloquea los que matan procesos en masa. |
| `hooks.PreToolUse` `Grep\|Glob` | `cbm-code-discovery-gate` | Agrega contexto del mapa de código de codebase-memory-mcp. Nunca bloquea. |
| `hooks.SessionStart` | `cbm-session-reminder` | Al abrir, limpiar o compactar una sesión, recuerda a Claude usar codebase-memory-mcp. |
| `enabledPlugins` | `superpowers` | Activa el plugin. |
| `theme` | `dark` | Tema oscuro. |
| `tui` | `fullscreen` | Interfaz a pantalla completa. |
| `cleanupPeriodDays` | `3650` | Guarda el historial de sesiones 10 años (por omisión se borra a los 30 días). |
| `agentPushNotifEnabled` | `true` | Notificaciones cuando un agente termina o necesita algo. |

Los hooks de codebase-memory-mcp solo se agregan si está instalado (en Windows
también). Si su instalador ya los creó, no se duplican.

### Ajuste opcional: saltar el aviso de permisos

`skipDangerousModePermissionPrompt` **no viene activado**. Solo se agrega si lo
pides al instalar (`--saltar-aviso-permisos` en Mac/Linux, `-SaltarAvisoPermisos`
en Windows).

⚠️ **Riesgo:** quita la advertencia que Claude Code muestra antes de entrar al modo
que acepta todo sin pedir permiso (`--dangerously-skip-permissions`). En ese modo
Claude puede borrar, instalar o ejecutar cualquier cosa sin preguntarte; la
advertencia es la última oportunidad de pensarlo. Actívalo solo si usas ese modo a
menudo y entiendes lo que implica. Para quitarlo, borra la clave de
`~/.claude/settings.json`.

## Hook `guard-kill.py`

- Corre con `python` o `python3` (3.6 o más nuevo), sin nada extra.
- **macOS y Linux**: ante `pkill`, `killall`, `pgrep … | xargs kill`,
  `kill $(pgrep …)` o `ps … | grep … | xargs kill`, pregunta a `pgrep` qué
  procesos atraparía. Si incluye apps o procesos del sistema, una terminal, otra
  sesión de Claude o más de 10 procesos, lo bloquea. Bloquea siempre
  `kill -9 -1`, `kill -- -1` y `kill 0`.
- **Windows**: bloquea `taskkill /IM`, `taskkill /FI` (salvo `PID eq <n>`),
  `tskill <nombre>`, `Stop-Process -Name`, `Get-Process <nombre> | Stop-Process`,
  `(Get-Process x).Kill()` y `wmic process … delete`, también dentro de
  `powershell -Command`, `-EncodedCommand` o `cmd /c`.
- Por PID siempre deja pasar: `kill 1234`, `taskkill /PID 1234`,
  `Stop-Process -Id 1234`.
- Si el propio hook falla, deja pasar el comando (nunca frena el trabajo por un
  error suyo).

## Línea de estado

Ejemplo: `Opus · 📁 demo · ⎇ main* · eff xhigh · ctx 8% · cache 91% · $0.01 ·
+156 −23 · ⏱ 1h15m · sesión 24% ↻ 2h13m · semana 41% ↻ 3d4h (lun 14:28) · 🕐 10:26`

Funciona igual en Mac, Linux y Git Bash de Windows. Solo necesita `jq` (en
Windows: `winget install jqlang.jq`) y `git` para la rama. Todos los cálculos los
hace `jq`, así que no depende de `bc`, de `date -r` (que solo existe en Mac) ni
del idioma del sistema: los días salen en español siempre.

## Servidores MCP

- **context7** (`mcp/context7.json`): servidor remoto
  `https://mcp.context7.com/mcp` con la cabecera `CONTEXT7_API_KEY:
  ${CONTEXT7_API_KEY}`. Claude Code reemplaza `${CONTEXT7_API_KEY}` por el valor
  de la variable de entorno al arrancar: **la variable debe existir antes de
  abrir Claude Code**.
- **codebase-memory-mcp** (`mcp/codebase-memory-mcp.json`): programa local. Se
  instala con [su instalador oficial](https://github.com/DeusData/codebase-memory-mcp)
  (`install.sh` en Mac/Linux, `install.ps1` en Windows) en la versión publicada
  **v0.12.0**: el instalador sale de esa etiqueta y el binario de
  `https://github.com/DeusData/codebase-memory-mcp/releases/download/v0.12.0`,
  verificado con el `checksums.txt` de esa misma release. El instalador además
  configura su MCP, sus hooks y su skill; si ya lo registró, este repo no lo
  repite. Para cambiar de versión se edita `CBM_VERSION` en `instalar.sh` y
  `$CbmVersion` en `instalar.ps1`.
- **Claude in Chrome**: no es un MCP que se configure aquí; basta instalar la
  extensión de Chrome e iniciar sesión.

## Skills

> ⚠️ **Las skills son código de terceros sin auditar.** Cada una es una carpeta
> de instrucciones (y a veces scripts) escrita por otra persona u organización.
> Claude las lee y puede seguir lo que digan, y sus dueños pueden cambiarlas en
> cualquier momento. Este repo no revisa su contenido: solo guarda de dónde salen.
> Si la computadora es del trabajo o no quieres ese riesgo, instala **sin skills**:
> `./instalar.sh --sin-skills` o `instalar.ps1 -SinSkills`. Puedes agregar después
> solo las que revises con `npx -y skills@1.7.2 add <dueño/repo@skill> -g -y -a claude-code`.

`skills/lista.json` tiene cada skill con su origen (`dueño/repo@skill`). Sale de
una **lista de permitidas** (`skills_permitidas` en `herramientas/filtros.json`):
solo esas se exportan. Si en la Mac principal usas una skill que no está en la
lista, `exportar.sh` avisa («nueva skill usada: …») y no la lleva hasta que la
agregues. Cada origen debe ser un repositorio **público** de GitHub con su nombre
actual (los renombrados se corrigen en `origenes_renombrados`). La versión del
instalador de skills está fija (`skills@1.7.2`) en `herramientas/instalar_comun.py`.

## Git: gitignore global

`git/gitignore_global` lista archivos del sistema (`.DS_Store`, `Thumbs.db`…),
de editores, secretos (`.env`), dependencias y cachés. El instalador lo copia a
`~/.gitignore_global` y lo activa con:

```bash
git config --global core.excludesfile ~/.gitignore_global
```

(solo si no tenías ya otro configurado; si lo tenías, no lo toca).

Los archivos `._algo` no están: los crea una Mac al escribir en discos que no
son de Mac (USB, exFAT) y en Windows no aparecen. Si trabajas en un disco así,
ponlos en el `.gitignore` de ese proyecto (como hace este repo).

---

## herdr y Telegram

[herdr](https://herdr.dev) organiza terminales en espacios de trabajo, pestañas y
paneles, y reconoce los agentes que corren en ellos (Claude, Codex…): la barra
lateral muestra cuál trabaja, cuál espera tu respuesta y cuál terminó. Los paneles
siguen corriendo aunque cierres la ventana, y tras reiniciar la Mac vuelven los
espacios, las pestañas, lo que se veía en cada panel y cada Claude en su
conversación.

### Lo que deja `herdr/config.toml`

- **Aspecto:** paleta Kanagawa (Wave, igual que Ghostty, Claude Code y Neovim), estados con símbolos, rama de git
  y hora con iconos en la barra de pestañas, nombre del agente en el borde de cada
  panel dividido.
- **Atajos directos** (sin `ctrl+b`): `ctrl+alt+h/j/k/l` mueve entre paneles,
  `ctrl+alt+d` / `ctrl+alt+shift+d` divide a la derecha / abajo, `ctrl+alt+c`
  pestaña nueva, `ctrl+alt+[` / `ctrl+alt+]` pestaña anterior / siguiente,
  `ctrl+alt+z` amplía, `ctrl+alt+g` busca un agente, `ctrl+alt+p` / `ctrl+alt+n`
  agente anterior / siguiente. Los de prefijo siguen igual; `ctrl+b ?` los muestra
  todos.
- **Ventanas flotantes:** `ctrl+b alt+g` abre lazygit y `ctrl+b alt+t` abre btop.
- **Avisos:** notificación de macOS y sonido cuando un agente termina o necesita tu
  respuesta en otro espacio.
- **Historial de paneles** (`pane_history`): guarda lo que se veía en cada panel
  para mostrarlo tras un reinicio. Se guarda en disco, en
  `~/.config/herdr/session-history.json`, y puede incluir claves o tokens que
  hayan salido en pantalla.

Para cambiar algo, edita `~/.config/herdr/config.toml` y recárgalo con
`ctrl+b shift+r`. El repo guarda su propia copia: pasa el cambio a
`herdr/config.toml` a mano (`exportar.sh` avisa si difieren).

### Telegram (`permgps/herdr-telegram-agents`)

Un grupo de Telegram con un tema por agente: lo que escribes en el tema le llega
al agente, sus preguntas te llegan con botones y `/status`, `/new` y `/options`
funcionan en el tema General. Es un plugin de la comunidad, no de herdr: se
descarga como binario firmado y verificado. Solo se conecta a Telegram y a GitHub
(para buscar versiones nuevas) y solo se actualiza si pulsas «Update».

El instalador lo instala, pero **el bot se configura a mano en cada
computadora** (el token nunca va en el repo):

1. En Telegram, @BotFather → `/newbot` → copia el token. **Un bot por
   computadora**: dos no pueden usar el mismo a la vez.
2. Crea un grupo y activa **Temas** en su configuración.
3. En un panel de herdr: `herdr plugin action invoke permgps.telegram-agents.setup`.
   Pega el token en la ventana (no se ve), abre el enlace del bot y pulsa
   **Start**.
4. Añade el bot al grupo como administrador con **Manage topics**, **Delete
   messages** y **Pin messages** (como tú, no como administrador anónimo) y
   confirma el grupo en la ventana.
5. Comprueba con `herdr plugin action invoke permgps.telegram-agents.status`:
   debe decir `telegram=ready`.

⚠️ Quien entre en tu Telegram puede dar órdenes a tus agentes y aprobar sus
permisos: activa la verificación en dos pasos de Telegram.

### Modo servidor

Para una Mac que se queda encendida (una Mac mini, por ejemplo), `--servidor`:

- `sudo pmset -a sleep 0 autorestart 1`: la Mac nunca entra en reposo (la pantalla
  sí se apaga) y se enciende sola cuando vuelve la luz. Pide tu contraseña; en modo
  no interactivo no la pide y explica cómo hacerlo tú.
- Agrega Ghostty a los ítems de inicio: al iniciar sesión se abre Ghostty, que
  abre herdr, que arranca el bot de Telegram.

Mientras la Mac duerme, todo se congela: herdr, los agentes y el bot. Con FileVault
activado, tras un reinicio la Mac espera tu contraseña; todo arranca cuando inicias
sesión. Para deshacerlo: `sudo pmset -a sleep 1 autorestart 0` y quita Ghostty en
Ajustes del Sistema → General → Ítems de inicio.

## Neovim

`instalar.sh` instala Neovim y `tree-sitter-cli` con Homebrew y copia `nvim/` a
`~/.config/nvim`: [LazyVim](https://www.lazyvim.org) con el tema Kanagawa, el mismo
de Ghostty, herdr y Claude Code. Si ya tienes una config en `~/.config/nvim`, no la
toca.

- **Primera vez:** abre `nvim`; descarga solo los plugins y los parsers de sintaxis
  (tarda un minuto).
- **En herdr:** `nvim` en cualquier panel, o `ctrl+b` y luego `alt+e` para abrirlo en
  una ventana flotante en la carpeta del panel (como lazygit con `alt+g`).
- **Atajos de LazyVim:** `Espacio` abre el menú; `Espacio e` explorador, `Espacio
  Espacio` buscar archivo, `Espacio /` buscar texto.
- **macOS 27:** el SDK 27 trae un archivo que el enlazador actual no entiende y
  rompe la compilación de los parsers. `nvim/lua/config/options.lua` usa el SDK
  26.5 solo dentro de Neovim, si está instalado.
- **Windows:** todavía no se instala (Neovim lee otra carpeta allí).

---

## Conectar dos Macs

Con herdr puedes trabajar en otra Mac desde esta: sus espacios y agentes aparecen
en tu herdr junto a los de esta Mac («Local») y siguen corriendo allá aunque
cierres esta Mac o se corte la conexión. Va por SSH, y `./conectar.sh` es un
asistente que te guía: pregunta qué quieres hacer y a qué Mac te conectas.

Cada Mac tiene un papel:

| | La Mac que controlas | La Mac desde la que controlas |
|---|---|---|
| Qué es | Donde corren los agentes; por ejemplo, la Mac mini siempre encendida (`--servidor`). | La que tienes delante; por ejemplo, la portátil. |
| En el asistente | Opción **2**: dice si acepta conexiones y cómo activarlas. No cambia nada. | Opción **1**: eliges la otra Mac de una lista; crea tu llave SSH, la copia allá y agrega la otra Mac a herdr. |

Las dos necesitan herdr, que instala `./instalar.sh`. Para controlar cada una
desde la otra, haz los pasos también al revés.

### Paso a paso

1. **En la Mac que vas a controlar**, corre `./conectar.sh` en la carpeta del repo
   y elige **2**. Si dice que no acepta conexiones, activa Ajustes del Sistema →
   General → Compartir → **Inicio de sesión remoto** y vuelve a correrlo.
2. **En la Mac desde la que vas a controlar**, corre `./conectar.sh` y elige **1**.
   Busca en tu red las Macs que aceptan conexiones y te las muestra con su nombre
   y su dirección: elige su número. Si no sale, puedes escribir su dirección a
   mano (la muestra la opción 2 en la otra Mac).
3. Te pregunta tu usuario en esa Mac (Enter si es el mismo que en esta) y te
   enseña un resumen: desde qué Mac y a cuál te vas a conectar. Si dices que sí,
   te pide una sola vez la contraseña de la otra Mac (la de iniciar sesión en
   ella).
4. Abre herdr: los espacios y agentes de la otra Mac aparecen junto a los de
   «Local».

`./conectar.sh` se puede repetir: lo que ya está hecho se salta. Si algo falla,
te dice qué revisar. La opción **3** muestra las Macs que esta controla y te deja
quitar una (allá todo sigue corriendo).

| Para | Comando |
|---|---|
| Abrir el asistente | `./conectar.sh` |
| Controlar una Mac sin preguntas (para scripts) | `./conectar.sh <usuario>@<mac>.local` |
| Ver las Macs que esta controla | `herdr machine list` |
| Abrir solo la otra Mac en esta terminal | `herdr --remote <usuario>@<mac>.local` |

### Desde fuera de casa

La dirección `.local` solo funciona si las dos Macs están en la misma red. Desde
fuera hace falta una VPN entre las dos, por ejemplo WireGuard en tu router o
Tailscale. No abras el puerto 22 de tu router a internet.

### Seguridad

- La llave de esta Mac (`~/.ssh/id_ed25519`) se crea sin contraseña, para que
  herdr se reconecte solo. La protege el cifrado del disco (FileVault), pero
  cualquiera que use esta Mac con tu sesión abierta puede entrar a la otra.
- Para quitarle el acceso a una Mac: en la Mac que trabaja, borra de
  `~/.ssh/authorized_keys` la línea que termina con la dirección de la Mac que
  quieres quitar.
- herdr no guarda contraseñas ni llaves: usa las de SSH.

## Universal Control

Universal Control es la función de macOS que deja mover el cursor y el teclado de
una Mac a otra, cada una con su monitor. Cuando falla, nada en los Ajustes del
Sistema dice por qué: la causa está en los registros del sistema. `universal-control.sh`
automatiza esa revisión. Cada vez que inicias sesión en la Mac que tiene el teclado
y el mouse, revisa las dos Macs y **solo avisa si algo impide que funcione**,
diciendo qué hacer. Si todo está bien, no dice nada.

Solo mira: nunca cambia ajustes, nunca reinicia nada y nunca detiene procesos.
Aquí la **Mac que manda** es la que tiene el teclado y el mouse (se instala en
ella) y la **Mac que recibe** es la otra, a la que entra por SSH.

### Requisitos

En las dos Macs:

1. La misma cuenta de Apple.
2. La misma versión de macOS, incluso en el último número.
3. Wi-Fi y Bluetooth encendidos. Wi-Fi tiene que estar encendido aunque la Mac use
   cable.
4. Handoff encendido.
5. Las opciones de Universal Control encendidas (Ajustes del Sistema → Pantallas →
   Avanzado).
6. Compartir Internet **apagado**.
7. Un monitor conectado en cada una.

Y además:

8. La Mac que recibe acepta conexiones por SSH (Ajustes del Sistema → General →
   Compartir → Sesión remota; en versiones anteriores de macOS se llama «Inicio de
   sesión remoto»), tu llave ya está copiada allá y el usuario
   con el que entras es **administrador**. Sin eso el programa no puede leer los
   registros de esa Mac.

### Paso a paso

Todo se hace en la Mac que manda, en la carpeta del repo.

1. **Activa Universal Control** en las dos Macs, como en los requisitos 3 a 6.
2. **Deja la llave SSH.** Si aún no entras a la otra Mac sin contraseña, corre
   `./conectar.sh` (ver «Conectar dos Macs») o haz un `ssh-copy-id` a mano.
3. **Dile cuál es la otra Mac:**

   ```bash
   ./universal-control.sh --configurar <usuario>@<mac>.local
   ```

   Antes de guardar entra a esa Mac por SSH, sin contraseña y sin preguntar nada,
   para leer su nombre. Si no puede entrar, no guarda nada y te explica qué
   revisar y cómo dejar la llave. Se usa el nombre `.local` y no la IP porque la IP
   cambia al reiniciar.
4. **Instala el aviso al iniciar sesión:**

   ```bash
   ./universal-control.sh --instalar
   ```

   Crea una tarea de inicio de sesión de macOS (launchd) que corre el programa cada
   vez que entras. Repetir el comando da el mismo resultado.
5. **Para quitarlo:**

   ```bash
   ./universal-control.sh --quitar
   ```

   Descarga la tarea y borra su archivo. Sale bien aunque no hubiera nada instalado.
6. **Para correrlo a mano** y ver el reporte completo en la terminal:

   ```bash
   ./universal-control.sh
   ```

   Escribe una línea por revisión y por Mac, y al final «Universal Control listo.»
   o «No quedó: …» con la causa. Sale con 0 si está listo, 1 si no, y 2 si falta
   configurar o usaste mal el comando.

| Para | Comando |
|---|---|
| Revisar a mano | `./universal-control.sh` |
| Ver el estado solo de esta Mac | `./universal-control.sh --estado` |
| Guardar la otra Mac | `./universal-control.sh --configurar <usuario>@<mac>.local` |
| Instalar el aviso al iniciar sesión | `./universal-control.sh --instalar` |
| Quitar el aviso al iniciar sesión | `./universal-control.sh --quitar` |
| Ver la ayuda completa | `./universal-control.sh --ayuda` |

### Qué hace al iniciar sesión

La tarea corre `./universal-control.sh --al-iniciar`, que no abre nada, no pregunta
nada y no se queda esperando una entrada. Las dos Macs tienen que estar prendidas,
con la sesión iniciada. Como cada una puede tardar en arrancar, repite la revisión
cada 15 segundos durante hasta 5 minutos, hasta que las dos se hayan unido:

- **Si todo está bien**, no muestra nada. Solo escribe el reporte en un archivo.
- **Si algo falla al terminar la espera**, manda **una** notificación de macOS con
  la causa más importante y qué hacer.
- **Si la otra Mac no responde** (apagada, sin red o esperando su contraseña de
  inicio), también avisa.
- **Si no has configurado la otra Mac**, avisa «Falta configurar Universal Control»
  y no espera.

Los registros de Universal Control son los que deciden si hay aviso. Si dicen que
las dos Macs ya formaron un grupo, no avisa, aunque algún ajuste se vea mal o no se
haya podido leer; eso queda solo en el reporte. Los ajustes sirven para explicar la
causa cuando el grupo no se formó. Si quieres otros tiempos, puedes cambiarlos con
las variables `UC_ESPERA` (segundos de espera, 300 por omisión) y `UC_INTERVALO`
(segundos entre revisiones, 15 por omisión). Solo cambian los tiempos cuando corres
`--al-iniciar` a mano; la tarea instalada siempre usa 300 s y 15 s.

La tarea guarda la ruta del programa. Si mueves la carpeta del repo, vuelve a correr
`./universal-control.sh --instalar`.

### Qué hacer con cada aviso

Si hay varias fallas, el programa reporta solo la primera de esta lista, porque las
de abajo suelen ser consecuencia de las de arriba:

| Aviso | Qué pasa y qué hacer |
|---|---|
| «… no responde: ¿está prendida y con sesión iniciada?» | No hay conexión por SSH con la otra Mac. Prende la Mac, inicia sesión (con FileVault no responde hasta que pones la contraseña) y revisa que tenga Sesión remota (Inicio de sesión remoto en versiones anteriores de macOS) y que la llave siga copiada. |
| «… no aceptó la llave SSH: corre ./conectar.sh …» | La otra Mac sí respondió, pero rechazó tu llave («Permission denied») o su huella ya no coincide («Host key verification failed»). El reporte trae la línea de error de SSH. Corre `./conectar.sh <usuario>@<mac>.local` para dejar la llave de nuevo. |
| «No puedo leer los registros de …: el usuario … tiene que ser administrador» | El usuario con el que entras por SSH no es administrador y no puede leer los registros. Usa otro usuario con `--configurar` o hazlo administrador. |
| «… no tiene sesión iniciada en una cuenta de Apple» | Entra con tu cuenta de Apple en esa Mac. |
| «Las dos Mac tienen cuentas de Apple distintas» | Entra con la misma cuenta en las dos. |
| «Versiones distintas: <versión> en <esta Mac>, <versión> en <la otra>. Actualiza la que va atrás» | Una Mac tiene otra versión de macOS. Actualiza la que va atrás. |
| «Apaga Compartir Internet en …» | Ajustes del Sistema → General → Compartir → Compartir Internet. |
| «Enciende … en …» | Wi-Fi, Bluetooth, Handoff o Universal Control están apagados. Enciéndelo. |
| «… no tiene monitor» | Conecta un monitor a esa Mac. |
| «Inicia sesión en …» | La sesión de la otra Mac está bloqueada o cerrada. Desbloquéala. |
| «… no ve a … por Bluetooth: reinicia …» | Una Mac no detecta a la otra como disponible. Reinicia la Mac que nombra el aviso. |
| «Las Mac no se unieron: reinicia las dos» | Todo lo demás está bien, pero no se formó el grupo. Reinicia las dos. |

### Lo que aprendimos

Configurarlo costó una tarde, con estos hallazgos:

- **Compartir Internet con el interruptor encendido cuenta como encendido, aunque
  no tenga ningún puerto marcado.** En ese caso el sistema sigue con el proceso
  `InternetSharing` corriendo y Universal Control no funciona. Apaga el interruptor
  principal.
- **Con versiones distintas de macOS, la Mac vieja nunca detectó a la nueva.** Antes
  de buscar otras causas, deja las dos en la misma versión.
- **Cuando una Mac no ve a la otra por Bluetooth, reiniciar la que no se ve lo
  arregla.** Una Mac con casi 5 días sin reiniciarse tras su actualización no
  avisaba por Bluetooth: la otra la veía solo por Wi-Fi, y eso no basta para saber
  si está activa. Al reiniciarla, las dos formaron un grupo. Apagar y prender
  Handoff no cambió nada.
- **En zsh, `log` es un comando interno.** Si lees los registros a mano, usa la ruta
  completa. El programa mira los mensajes del subsistema de Universal Control del
  arranque actual (`--last boot`), no los de antes de un reinicio:

  ```bash
  /usr/bin/log show --info --last boot --predicate 'subsystem == "com.apple.universalcontrol"'
  ```

  El último mensaje `Selected circle` de cada Mac lista a los equipos que están en
  el mismo grupo. Si salen los dos, el cursor puede cruzar.
- **El teclado y el mouse tienen que estar conectados solo a la Mac que manda.** Si
  uno de los dos se queda conectado a la otra Mac, por ejemplo después de cambiarlo
  de canal para usarla un momento, Universal Control le da el control a la Mac donde
  está ese dispositivo. El cursor salta solo a la otra pantalla cada vez que lo
  mueves. Regrésalo a la Mac que manda y, si usa un receptor USB, desconéctalo de la
  otra.
- **La cuenta de Apple se compara sin mostrarla.** El programa solo dice si es igual
  o distinta en las dos Macs: no imprime ni guarda el correo ni el número de la
  cuenta. Para comparar usa una huella con una sal distinta en cada revisión,
  así no se puede deshacer.

### Dónde quedan los archivos

| Qué | Dónde |
|---|---|
| Configuración (la otra Mac) | `~/.config/claude-code-entorno/universal-control.conf` |
| Último reporte, con fecha y hora | `~/Library/Logs/claude-code-entorno/universal-control.log` |
| Errores de la tarea de inicio de sesión | `~/Library/Logs/claude-code-entorno/universal-control.errores.log` |
| Tarea de inicio de sesión | `~/Library/LaunchAgents/com.claude-code-entorno.universal-control.plist` |

El reporte se reemplaza en cada inicio de sesión: guarda solo el último intento.
Estos archivos viven en tu carpeta de usuario, fuera del repo.

## Terminal y Stats

### Terminal

`terminal/terminal.sh` se carga en cada terminal nueva y se salta lo que no esté
instalado:

| Escribe | Qué hace |
|---|---|
| `ll`, `la` | Lista archivos con íconos y estado de git (`eza`); `la` incluye los ocultos. |
| `lt` | Árbol de carpetas, dos niveles. |
| `z <parte del nombre>` | Salta a una carpeta que ya visitaste (`zoxide`); `zi` la eliges de una lista. |
| `ctrl+t` | Busca un archivo y lo pega en el comando (`fzf`, con vista previa). |
| `alt+c` | Entra a una subcarpeta (`fzf`). |
| `ctrl+r` | Busca en el historial de todas tus terminales (`atuin`; en bash, el de `fzf`). La flecha arriba sigue como siempre. |
| `bat <archivo>` | Muestra un archivo con colores, con el tema de VS Code. |

No cambia `ls` ni `cat`: Claude Code y los scripts los usan y esperan su salida de
siempre. Para pasar a atuin el historial que ya tenías: `atuin import auto` (se
queda en tu computadora; atuin solo sincroniza si creas una cuenta).

### Stats

CPU, GPU, RAM y disco en la barra de arriba. El instalador le enciende esos cuatro
y le apaga la red (`defaults write eu.exelban.Stats …`), solo si todavía no los
tenía: si después cambias algo, no lo pisa. Lo agrega a los ítems de inicio y lo
abre. Haz clic en un número para ver el detalle; en el engrane cambias el estilo o
activas más módulos (temperatura, red). El `SSD` es el espacio ocupado del disco.

## OpenCode como respaldo

Sucede: se acaban los tokens de Claude, o la cuenta queda temporalmente bloqueada,
o Anthropic tiene un mal día. Este paso deja Claude Code listo para seguir
trabajando contra otro proveedor sin cambiar de herramienta ni perder el contexto
de lo que estabas haciendo.

`opencode/opencode.sh` se carga en cada terminal nueva y define dos aliases:

| Escribe | Qué hace |
|---|---|
| `cl-go` | Claude Code contra [OpenCode Go](https://opencode.ai/console), con tus modelos incluidos. |
| `cl-or` | Claude Code contra OpenRouter, con su catálogo completo. |

`cl-go` necesita `OPENCODE_API_KEY` y `cl-or` necesita `OPENROUTER_API_KEY`. **Las
claves no están en el repo**: cada alias se define solo si su variable existe en
esa computadora, así que sin clave no hay alias y nada se rompe. Las pones tú, en
cada máquina:

```bash
export OPENCODE_API_KEY="…"    # de https://opencode.ai/console
export OPENROUTER_API_KEY="…"  # de https://openrouter.ai/keys
```

Ponlas en un archivo que no esté en el repo (`~/.config/secrets.env`, por ejemplo)
y cárgalas desde tu `.zshrc`; nunca dentro de este repo.

Dentro de Claude Code, `/go-modelos` enumera los modelos que trae tu plan de Go
con sus capacidades y costos, para elegir con `/model <modelo>`.

Dos detalles que conviene saber:

- Los alias arrancan Claude con `--dangerously-skip-permissions`. Si prefieres que
  te pregunte antes de cada acción, quítalo de `opencode/opencode.sh`.
- El modelo de cada alias lo fija `opencode/opencode.sh` con tres variables
  `ANTHROPIC_DEFAULT_*_MODEL`; sin ellas, `/model` pide modelos que el endpoint no
  sirve. Puedes cambiarlas a gusto.

### La config de OpenCode vive en su propio repo

`~/.config/opencode` recibe su contenido de
[`jpcruz88/opencode-config`](https://github.com/jpcruz88/opencode-config), que
trae **el router de modelos por complejidad** (clasifica cada mensaje y cambia el
modelo antes de arrancar el turno) y el script **`gomodel`**.

Está en un repo aparte a propósito: si se copiara dentro de este repo, esa config
tendría **dos fuentes de verdad** y habría que actualizarla en los dos sitios. El
paso del instalador solo clona o hace `git pull`; nunca edita ese repo.

Funciona en los tres casos que se pueden encontrar en una máquina:

| Situación | Qué hace |
|---|---|
| No hay `~/.config/opencode` | `git clone` |
| Ya es un clon | `git pull --ff-only` |
| Hay archivos pero no es un clon (p. ej. solo `service.json`) | lo convierte en clon con `git init` + `fetch` + `reset --hard` |

En el tercer caso **no toca los archivos sin seguimiento**: git no los modifica, así
que `service.json` (la contraseña local) y `auth.json` quedan igual, y encima su
`.gitignore` los excluye del repo. También fija el upstream para que la próxima
corrida pueda hacer `pull`.

Si ya existe un `opencode.json` sin extensión que no venga de ese repo, **no lo
borra**: avisa, porque puede mandar sobre el `opencode.jsonc` que sí está gestionado.

### Qué manda cada herramienta

`opencode-config` y este repo se reparten los temas sin pisarse:

| Herramienta | Vive en | Sirve para |
|---|---|---|
| `gomodel` | `opencode-config` | ver tu **cuota** (5 h / semana / mes), los **topes** por modelo y **lanzar** OpenCode con un modelo concreto. Desde la terminal. |
| `/go-modelos` | este repo | ver **qué puede hacer** cada modelo: contexto, modalidades, razonamiento, herramientas y costos. Desde dentro de Claude Code. |
| Router `auto-model` | `opencode-config` | elegir modelo por complejidad antes de cada turno. |
| `cl-go` / `cl-or` | este repo | abrir **Claude Code** contra OpenCode Go u OpenRouter. |

Para no instalar ninguna de las dos: `--sin-opencode` (las aliases y `/go-modelos`)
y `--sin-opencode-config` (el router y `gomodel`).

## Panel de servicios locales

`local-services-panel/` es una página que muestra todo lo que corre en la máquina
y te deja entrar a cada servicio: los contenedores de Docker y los procesos
locales, con estado en vivo cada 10 segundos.

Nace de un problema concreto: con Supabase, contenedores y varios scripts en
marcha, no había un solo lugar para ver qué está levantado, en qué puerto y si
responde. Lo descubre solo — no hay lista de servicios, puertos ni URLs escrita en
el código: si levantas un contenedor nuevo aparece solo, y si lo paras desaparece.

```bash
node local-services-panel/server.js
# → Panel de servicios locales → http://localhost:8790
```

No hace falta `npm install`: usa solo módulos nativos de Node 18 o más reciente.
Renombrar, fijar y ocultar servicios se guardan en un `state.json` (ignorado por
git) junto al servidor.

**El instalador no lo arranca ni lo pone al iniciar sesión**: está aquí porque es
otra herramienta del entorno, y se enciende a mano cuando la necesitas.

Si lo abres desde otro equipo de tu red, ten en cuenta que el servidor escucha en
`0.0.0.0`: cualquiera que alcance el puerto ve la lista de tus servicios y sus
puertos. Para usarlo solo en esta máquina, edita `HOST` en
`local-services-panel/server.js`. Detalles en
`local-services-panel/README.md`.

## Mantenerlo al día

En la **Mac principal**, cuando cambie algo de la configuración:

```bash
cd claude-code-entorno
./exportar.sh          # regenera el repo y revisa privacidad
git diff               # revisar qué cambió
git add -A && git commit -m "Actualiza la configuración" && git push
```

En las **otras computadoras**:

```bash
git pull
./instalar.sh                                   # Mac / Linux
powershell -ExecutionPolicy Bypass -File .\instalar.ps1   # Windows
```

(o pedirle a Claude Code: «Actualiza mi entorno de Claude Code siguiendo el
AGENTS.md de ~/claude-code-entorno»).

### Qué hace `exportar.sh`

1. Lee (sin modificar nada) `~/.claude/settings.json`, las reglas, la lista de
   skills usadas (solo la clave `skillUsage` de `~/.claude.json`) y
   `~/.agents/.skill-lock.json`.
2. Aplica las **listas de permitidos** de `herramientas/filtros.json` (claves y
   hooks de settings, reglas y skills) y reescribe `claude/settings.base.json`,
   `claude/rules/` y `skills/lista.json`. Lo que no esté en esas listas no sale, y
   las reglas o skills nuevas solo se avisan. No borra nada ni toca el resto del
   repo (README, `AGENTS.md`, `CLAUDE.md`, instaladores, pruebas).
3. Comprueba **sin credenciales** que cada repositorio de origen de las skills sea
   público y conserve su nombre; si no, termina con error.
4. Compara el hook y la línea de estado de la Mac con los del repo y avisa si
   difieren. El repo guarda versiones **portables** (funcionan en Windows), así que
   esos dos no se sobrescriben: un cambio en ellos se hace en el repo.
5. Corre las pruebas, **gitleaks** (archivos actuales y todo el historial, con
   `--log-opts=--all`) y una búsqueda propia de datos privados
   (`herramientas/revisar_privacidad.py`) en el contenido y los nombres de los
   archivos, el historial y los mensajes de commit: rutas personales, discos,
   claves (`sk-`, `ghp_`…), `CONTEXT7_API_KEY=` con valor, IPs, correos,
   teléfonos y la lista de términos privados. También exige que el autor y el
   committer de cada commit sean la identidad acordada (la de
   `git config --local user.name/user.email` del repo). Si encuentra algo,
   **termina con error**.

La lista de términos privados (nombres de clientes, teléfono…) **no está en el
repo**, porque sería publicarlos: vive en
`../claude-code-entorno-privado/terminos-privados.txt`, junto al repo, o donde
diga la variable `ENTORNO_TERMINOS_PRIVADOS`. Un término por línea.

---

## Si la empresa bloquea algo

Las políticas de la empresa (managed settings) **mandan** sobre este repo. El
instalador avisa si las encuentra y qué claves importantes traen:

| Si la política tiene… | Qué pasa | Qué hacer |
|---|---|---|
| `disableAllHooks` | No corre ningún hook **ni la línea de estado**. | Nada que hacer desde aquí; pedir excepción a TI si hace falta. |
| `allowManagedHooksOnly` | Solo corren los hooks de la empresa: `guard-kill.py` no. | Seguir la regla `matar-procesos.md` (Claude la lee igual). |
| `strictKnownMarketplaces` | Solo se instalan plugins de marketplaces aprobados. | Pedir a TI que aprueben `anthropics/claude-plugins-official`, o vivir sin `superpowers`. |
| `allowedMcpServers` / `allowManagedMcpServersOnly` / `managed-mcp.json` | Solo cargan los MCP permitidos. | Pedir que permitan `https://mcp.context7.com/*`. Mientras, la regla `context7.md` usa el comando `npx ctx7`, que no necesita MCP. |
| `deniedMcpServers` | Esos MCP no cargan. | Igual que arriba. |
| `allowManagedPermissionRulesOnly` | Se ignoran los permisos propios. | Este repo no trae permisos; no afecta. |

Otros bloqueos comunes:

- **No deja correr scripts de PowerShell**: usar siempre
  `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`. Si ni así (política
  de grupo), hacer los pasos a mano: copiar `claude\rules`, `claude\hooks` y
  `claude\statusline.sh` a `%USERPROFILE%\.claude\` y correr
  `py -3 herramientas\instalar_comun.py --plataforma windows --python-hooks "py -3"`.
- **No hay winget o está bloqueado**: instalar a mano Git for Windows, Node.js LTS,
  Python 3 y jq desde sus páginas, y volver a correr el instalador.
- **Proxy de la empresa** (fallan npm o GitHub): definir `HTTPS_PROXY` y
  `npm config set proxy …` con los datos que dé TI.
- **El antivirus borra codebase-memory-mcp**: instalar con `-SinCodebaseMemory`
  (o `--sin-codebase-memory`).

---

## Privacidad

Este repo es **público**. Nunca debe tener claves, tokens, rutas con nombres de
usuario, IPs, nombres de equipos o clientes, ni contenido de memorias de
proyecto. Para cuidarlo:

- La exportación usa **listas de lo permitido** para todo lo que sale de la Mac:
  claves y hooks de settings, plugins (`plugins.txt`), reglas y skills. Lo que no
  esté en esas listas se queda fuera; las reglas y skills nuevas solo se avisan.
- Las skills solo se aceptan si su repositorio es público sin credenciales.
- `exportar.sh` no deja terminar si gitleaks o la revisión propia encuentran algo
  (contenido, nombres de archivo, historial, mensajes, autor y committer).
- Las claves van como variables de entorno en cada computadora
  (`${CONTEXT7_API_KEY}` en la plantilla).

## Pruebas

```bash
python3 -m unittest discover -s pruebas -v
```

Prueban el hook (casos permitidos y bloqueados en Bash y PowerShell), la línea de
estado (con un JSON como el que manda Claude Code), la fusión de settings, la
exportación, la revisión de privacidad y los instaladores en modo no interactivo:
`instalar.sh` se corre de verdad con `HOME` en una carpeta temporal y un `claude`
de mentira (sin internet ni tocar tu configuración); el paso de herdr se prueba
igual, con `herdr` y `npx` de mentira (`pruebas/test_herdr.py`); el paso de Stats,
con `brew`, `defaults`, `osascript` y `open` de mentira (así no tocan tus
preferencias); `terminal/terminal.sh` se carga en zsh y bash con herramientas de
mentira (`pruebas/test_terminal.py`); `conectar.sh` y su asistente, con `ssh`,
`ssh-keygen`, `ssh-copy-id`, `dns-sd` y `herdr` de mentira (no se conecta a
ninguna Mac ni crea llaves reales, `pruebas/test_conectar.py`); `universal-control.sh`,
con `ssh`, `log`, `defaults`, `osascript`, `launchctl` y otros comandos de mentira (no
toca tu configuración ni se conecta a ninguna Mac, `pruebas/test_universal_control.py`);
en los `.sh` se revisa que ninguna variable quede pegada a «», tildes o eñes, que el bash de
macOS lee mal en una terminal con UTF-8 (`pruebas/test_scripts_shell.py`); y de
`instalar.ps1` se revisa que conserve el BOM y los finales CRLF. No necesitan
instalar nada; las de la línea de estado necesitan `bash` y `jq`, y las de
`instalar.sh` se omiten en Windows o si falta alguno de los programas que
instalaría.

## Estructura

```
├── AGENTS.md / CLAUDE.md          instrucciones para el agente que instala
├── instalar.sh / instalar.ps1     instaladores (Mac-Linux / Windows)
├── exportar.sh                    regenera el repo desde la Mac principal
├── conectar.sh                    asistente para controlar el herdr de otra Mac (SSH)
├── universal-control.sh           revisa si dos Mac pueden usar Universal Control y avisa si falla
├── plugins.txt                    plugins a instalar
├── mods/                          mods de Claude Code (plugins propios, con pruebas)
├── .claude-plugin/marketplace.json marketplace de este repo (lista los mods)
├── claude/
│   ├── settings.base.json         ajustes genéricos
│   ├── statusline.sh              línea de estado
│   ├── hooks/guard-kill.py        hook contra kills masivos
│   ├── themes/kanagawa.json       tema de Claude Code
│   ├── rules/                     reglas globales
│   └── commands/                  comandos propios (por ejemplo /go-modelos)
├── skills/lista.json              skills y su origen
├── mcp/                           plantillas de servidores MCP
├── git/gitignore_global           gitignore global
├── herdr/                         config de herdr y plugins de herdr (Telegram)
├── ghostty/config                 config de Ghostty (con {{RUTA_HERDR}})
├── nvim/                          config de Neovim (LazyVim con el tema Kanagawa)
├── terminal/terminal.sh           eza, bat, zoxide, fzf y atuin para zsh y bash
├── opencode/                      OpenCode como respaldo: aliases cl-go/cl-or y su script
├── local-services-panel/          página que muestra todo lo que corre en la máquina
├── herramientas/                  scripts de apoyo (fusión, exportación, privacidad)
└── pruebas/                       pruebas automáticas
```

## Licencia

[MIT](LICENSE).

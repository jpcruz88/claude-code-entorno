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
| Reglas | `claude/rules/` | Instrucciones que Claude lee en todos los proyectos: usar `ctx7` para documentación, matar procesos solo por PID y responder siempre en modo `caveman` (telegráfico, en español) en el chat, sin aplicarlo al código, commits, documentos ni textos para otras personas. Se apaga en una sesión con «stop caveman» o «modo normal». |
| Hook `guard-kill.py` | `claude/hooks/` | Bloquea comandos que matan procesos en masa (`pkill -f cat`, `killall`, `taskkill /IM`, `Stop-Process -Name`…). |
| Línea de estado | `claude/statusline.sh` | Muestra modelo, carpeta, rama, contexto usado, costo, límites de uso y hora. |
| Plugins | `plugins.txt` | `superpowers`. |
| Skills | `skills/lista.json` | 48 skills de repositorios públicos de terceros (ver el [aviso](#skills)). Opcionales: `--sin-skills`. |
| Servidores MCP | `mcp/` | `context7` (documentación al día) y `codebase-memory-mcp` (mapa del código). |
| Gitignore global | `git/gitignore_global` | Archivos que no deben entrar a ningún repositorio. |

## Qué NO incluye

- Proyectos, memorias de proyecto, historial ni conversaciones.
- Claves, tokens o contraseñas. La clave de Context7 se guarda **en cada
  computadora** como variable de entorno (`CONTEXT7_API_KEY`), nunca en el repo.
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

- En Mac instala lo que falte con **Homebrew** (git, node, python, jq, uv). Si no
  hay Homebrew, explica cómo ponerlo.
- En Linux usa `apt-get` (pide `sudo`). La versión de Node.js de apt suele ser
  vieja: si avisa, instalar Node.js LTS desde <https://nodejs.org>.
- Opciones:

  | Opción | Para qué |
  |---|---|
  | `--simular` | Muestra lo que haría, sin cambiar nada. |
  | `--no-interactivo` | No pregunta nada (para agentes y scripts): si falta la clave de Context7, la omite y explica cómo ponerla después. Se activa solo si la entrada no es una terminal. En Linux usa `sudo -n`, que falla en vez de esperar una contraseña. |
  | `--sin-codebase-memory` | No instala codebase-memory-mcp ni sus hooks. |
  | `--sin-skills` | No instala las skills de terceros (ver [Skills](#skills)). |
  | `--saltar-aviso-permisos` | Ver [Ajuste opcional](#ajuste-opcional-saltar-el-aviso-de-permisos). Apagado si no lo pones. |

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
5. Copia reglas, hook y línea de estado a la carpeta `.claude` de tu usuario. Si ya
   había un archivo distinto, antes guarda una copia `.bak-<fecha>`.
6. **Fusiona** `settings.base.json` con tu `settings.json`
   (`herramientas/fusionar_settings.py`): guarda antes una copia
   `settings.json.bak-<fecha>`, no cambia ningún valor que ya tengas (te avisa si
   difiere) y agrega los hooks sin repetirlos.
7. Instala el plugin (`claude plugin install … --scope user`), las skills
   (`npx -y skills@1.7.2 add <dueño/repo@skill> -g -y -a claude-code`, con la
   versión del instalador de skills fija) y registra los MCP
   (`claude mcp add-json --scope user …`).
8. Copia el gitignore global si no tienes uno y lo activa si no hay otro activo.

**Se puede correr cuantas veces haga falta**: lo que ya está se salta. Los pasos 5
a 8 los hace `herramientas/instalar_comun.py`, el mismo en Windows, Mac y Linux.

### Qué necesita internet o sesión

| Paso | Internet | Sesión de Claude |
|---|---|---|
| Programas (winget / brew / apt) | sí | no |
| codebase-memory-mcp | sí (GitHub) | no |
| Plugin `superpowers` | sí (GitHub) | no |
| Skills (`npx skills add`) | sí (npm y GitHub) | no |
| Registrar MCP | no | no |
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
de mentira (sin internet ni tocar tu configuración), y de `instalar.ps1` se revisa
que conserve el BOM y los finales CRLF. No necesitan instalar nada; las de la
línea de estado necesitan `bash` y `jq`, y las de `instalar.sh` se omiten en
Windows o si falta alguno de los programas que instalaría.

## Estructura

```
├── AGENTS.md / CLAUDE.md          instrucciones para el agente que instala
├── instalar.sh / instalar.ps1     instaladores (Mac-Linux / Windows)
├── exportar.sh                    regenera el repo desde la Mac principal
├── plugins.txt                    plugins a instalar
├── claude/
│   ├── settings.base.json         ajustes genéricos
│   ├── statusline.sh              línea de estado
│   ├── hooks/guard-kill.py        hook contra kills masivos
│   └── rules/                     reglas globales
├── skills/lista.json              skills y su origen
├── mcp/                           plantillas de servidores MCP
├── git/gitignore_global           gitignore global
├── herramientas/                  scripts de apoyo (fusión, exportación, privacidad)
└── pruebas/                       pruebas automáticas
```

## Licencia

[MIT](LICENSE).

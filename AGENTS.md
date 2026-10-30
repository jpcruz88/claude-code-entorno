# Guía para el agente que instala este entorno

Este archivo es para un agente (Claude Code u otro) al que el usuario le pidió
instalar este entorno en su computadora. Si en cambio te pidieron modificar el
repo, ve a [Si vas a modificar el repo](#si-vas-a-modificar-el-repo).

## Qué es y cuál es tu tarea

`claude-code-entorno` es la configuración de Claude Code del usuario: reglas, el
hook `guard-kill.py`, la línea de estado, el plugin `superpowers`, skills de
terceros y los servidores MCP `context7` y `codebase-memory-mcp`. En Mac, además,
herdr (con su plugin de Telegram) y Ghostty. El instalador
(`instalar.ps1` en Windows, `instalar.sh` en Mac) lo deja todo listo y se puede
correr las veces que haga falta: lo que ya está se salta.

Tu tarea: instalarlo con la confirmación del usuario, comprobar que quedó bien y
decirle qué le toca hacer a él.

**Esta sesión no tendrá nada de lo que instales** (reglas, hook, plugin, skills,
MCP) hasta que el usuario cierre y vuelva a abrir Claude Code. No intentes usarlo
ahora.

## Reglas

1. **Primero simula y enseña el plan.** Corre el instalador en modo simulación,
   resume al usuario en pocas líneas lo que haría y no instales nada hasta que lo
   confirme.
2. **Pregunta antes de instalar** (en el mismo mensaje del plan):
   - ¿Instalo las ~48 skills de terceros? Son código sin auditar; en una
     computadora del trabajo lo prudente es no instalarlas (`-SinSkills` en
     Windows, `--sin-skills` en Mac).
   - ¿Instalo codebase-memory-mcp? Es un programa que se descarga de GitHub y
     algunos antivirus de empresa lo marcan como falso positivo. Si no:
     `-SinCodebaseMemory` / `--sin-codebase-memory`.
   - Solo en Mac: ¿instalo herdr y Ghostty? Si no: `--sin-herdr`. ¿Y el plugin de
     Telegram de herdr (código de la comunidad)? Si no: `--sin-plugins-herdr`.
   - ¿Instalo las herramientas de terminal (eza, bat, zoxide, fzf y atuin) y las
     cargo desde su `.zshrc`? Si no: `--sin-terminal`.
   - ¿Instalo OpenCode como respaldo (`cl-go` y `cl-or`, por si se acaban los tokens
     de Claude)? No cambia nada si no lo usa: las aliases solo se crean si define su
     variable de entorno. Si no: `--sin-opencode`.
   - ¿Traigo la config de OpenCode de `jpcruz88/opencode-config` a
     `~/.config/opencode` (router de modelos por complejidad y `gomodel`)? Solo
     clona o hace `git pull` en un repo aparte de este, sin editar nada y sin
     credenciales; si la carpeta ya existiera, conserva sus archivos sin
     seguimiento como `service.json`. Si no: `--sin-opencode-config`.
   - Solo en Mac: ¿pongo Stats (CPU, GPU, RAM y disco en la barra de menú)? Si no:
     `--sin-stats`.
   - Solo en Mac: ¿esta Mac se queda siempre encendida (una Mac mini, no un
     portátil)? Solo si dice que sí: `--servidor` (no duerme, se enciende tras un
     corte de luz y abre Ghostty al iniciar sesión).
3. **Las claves externas y el token del bot de Telegram nunca pasan por ti.** Tres
   claves van en variables de entorno de cada computadora, **nunca en el repo ni en
   el chat**: `CONTEXT7_API_KEY`, `OPENCODE_API_KEY` (para la alias `cl-go`) y
   `OPENROUTER_API_KEY` (para `cl-or`). Sin ellas el instalador no falla: `context7`
   marca error en `/mcp` y las aliases simplemente no se crean. No pidas ninguna
   clave, no la escribas en archivos ni en comandos y no la enseñes. Si el usuario
   pega una igual, no la uses y recomiéndale revocarla: la de Context7 en
   <https://context7.com/dashboard>, la de OpenCode en <https://opencode.ai/console>,
   la de OpenRouter en <https://openrouter.ai/keys>. El token del bot de Telegram
   lo pega el usuario en la ventana de configuración del plugin (README, «herdr y
   Telegram»); si lo pega en el chat, no lo uses y recomiéndale revocarlo en
   @BotFather (`/revoke`).
4. **Instala siempre en modo no interactivo** (`-NoInteractivo` /
   `--no-interactivo`): el instalador no pregunta nada y, si falta la clave de
   Context7, la omite con un aviso.
5. **No uses `-SaltarAvisoPermisos` / `--saltar-aviso-permisos`** salvo que el
   usuario lo pida de forma explícita: quita una advertencia de seguridad (ver
   README).
6. **No edites `~/.claude/settings.json` a mano.** El instalador lo fusiona sin
   borrar lo que ya hay y antes guarda una copia `settings.json.bak-<fecha>`.
7. **Si algo falla, para y enséñalo.** Muestra al usuario el error exacto (las
   líneas `ERROR:` y `AVISO:` y el resumen final del instalador). No improvises
   cambios en el sistema: ni permisos, ni políticas, ni registro, ni antivirus,
   ni proxy. Volver a correr el instalador es seguro.
8. **Procesos: solo por PID.** Si tienes que detener uno, usa su PID concreto
   (`Stop-Process -Id <PID>`, `taskkill /PID <PID>`, `kill <PID>`); nunca por
   nombre ni por patrón.
9. **Windows pedirá permiso.** Avisa al usuario, antes de instalar, de que pueden
   salir ventanas de «¿Quieres permitir que esta aplicación haga cambios en el
   dispositivo?» (al instalar Git, Node.js o Python) y de que tiene que aceptarlas:
   mientras no lo haga, el instalador espera.

## Instalación en Windows

Los comandos son de PowerShell: córrelos con la herramienta PowerShell de Claude
Code. Si no la tienes, guarda cada comando en un archivo `.ps1` temporal y córrelo
con `powershell -NoProfile -ExecutionPolicy Bypass -File <archivo>`.

Cada comando hereda el PATH con el que arrancó Claude Code, así que no ve lo que
se acaba de instalar con winget. Cuando haga falta, empieza el comando refrescando
el PATH:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
```

### 1. Comprobar lo básico

```powershell
winget --version; git --version; claude --version
```

- Si falta `winget`: pide al usuario que instale «Instalador de aplicación» (App
  Installer) desde la Microsoft Store y para hasta que lo haga.
- Si falta `git`: instálalo, refresca el PATH y vuelve a comprobar.

  ```powershell
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  ```

- Si `claude --version` no responde, no pasa nada: el instalador también lo busca
  en `$env:USERPROFILE\.local\bin`.

### 2. Bajar o actualizar el repo

```powershell
$repo = Join-Path $env:USERPROFILE 'claude-code-entorno'; if (Test-Path (Join-Path $repo '.git')) { git -C $repo pull --ff-only } else { git clone https://github.com/jpcruz88/claude-code-entorno.git $repo }
```

Si la carpeta existe pero no es un repo de git, o `git pull` falla, enséñale el
error al usuario y para.

### 3. Simular y enseñar el plan

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-code-entorno\instalar.ps1" -Simular -NoInteractivo
```

Resume al usuario: qué programas instalaría con winget, si hay políticas de la
empresa (líneas «Hay una política de la empresa»; ver README, «Si la empresa
bloquea algo»), qué agrega a `settings.json`, el plugin, cuántas skills y qué MCP.
Hazle las preguntas de la regla 2, avísale de las ventanas de permiso (regla 9)
y de que tarda unos 10 minutos. Espera su confirmación.

### 4. Instalar

Con sus respuestas, quitando `-SinSkills` o `-SinCodebaseMemory` si dijo que sí:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\claude-code-entorno\instalar.ps1" -NoInteractivo -SinSkills -SinCodebaseMemory
```

- Tarda unos 10 minutos (más con skills). Córrelo en segundo plano o con el
  tiempo de espera máximo de tu herramienta; no lo dejes con el de 2 minutos.
- Si se corta o termina a medias, repite el mismo comando: lo que ya quedó no se
  repite.
- Si dice que no encuentra Python u otro programa recién instalado, refresca el
  PATH y repite el mismo comando. Si sigue igual, pide al usuario que cierre y
  vuelva a abrir Claude Code, y repítelo en la sesión nueva.
- Al final imprime un «Resumen» con lo pendiente y los problemas. Termina con
  código 0 si todo salió bien y 1 si hubo algún problema (regla 7).

### 5. Verificar

Empieza refrescando el PATH y comprueba, uno por uno:

1. **Plugin:** `claude plugin list` muestra `superpowers@claude-plugins-official`.
2. **MCP:** `claude mcp list` muestra `context7` y, si se eligió,
   `codebase-memory-mcp`. Sin clave, `context7` puede salir conectado (con
   límites de uso más bajos) o con un aviso de configuración: las dos cosas son
   normales hasta que el usuario ponga la clave y reinicie; no intentes arreglarlo.
3. **Ajustes:** deben salir una línea con `statusLine` y otra con `guard-kill.py`.

   ```powershell
   Select-String -Path "$env:USERPROFILE\.claude\settings.json" -Pattern '"statusLine"', 'guard-kill.py'
   ```

4. **Hook:** pásale el ejemplo del repo (un `taskkill /IM notepad.exe`). Debe
   imprimir un JSON con `"permissionDecision": "deny"`; si no imprime nada, el hook
   no bloquea y hay que decírselo al usuario. Si no existe `py`, usa `python`.

   ```powershell
   Get-Content "$env:USERPROFILE\claude-code-entorno\pruebas\datos\hook-taskkill.json" -Raw | py -3 "$env:USERPROFILE\.claude\hooks\guard-kill.py"
   ```

5. **Pruebas del repo:** deben terminar en `OK` (las que no aplican a Windows
   salen como `skipped`).

   ```powershell
   Set-Location "$env:USERPROFILE\claude-code-entorno"; py -3 -m unittest discover -s pruebas
   ```

### 6. Cierre

Dile al usuario, en pocas líneas:

- **Qué quedó instalado:** programas, reglas, hook, línea de estado, plugin,
  skills (sí o no) y MCP.
- **Qué se omitió y por qué**, y los problemas del resumen del instalador, si los
  hubo.
- **Lo que le toca a él:**
  1. Si faltaba la clave de Context7: sacarla en <https://context7.com/dashboard>
     y, en una ventana de PowerShell aparte (no en este chat), correr esto, que se
     la pide sin dejarla en el historial:

     ```powershell
     [Environment]::SetEnvironmentVariable('CONTEXT7_API_KEY', (Read-Host 'Clave de Context7'), 'User')
     ```

  2. Cerrar Claude Code y todas las terminales, abrir una nueva y entrar otra vez
     con `claude`.
  3. Comprobar en Claude Code que se ve la línea de estado abajo, y revisar
     `/plugin` (superpowers), `/mcp` (context7 y codebase-memory-mcp conectados) y
     `/hooks` (`guard-kill.py` en PreToolUse).

## Instalación en Mac

Los mismos pasos, con `instalar.sh`:

1. **Comprobar:** `git --version; claude --version; brew --version`.
   - Si falta `git`: corre `xcode-select --install`. Abre una ventana de Apple;
     pide al usuario que la acepte y te avise cuando termine.
   - Si falta Homebrew y el instalador lo necesita (porque falta node, python, jq
     o uv): no lo instales tú, porque pide la contraseña del usuario. Pídele que
     corra esto en la app Terminal y te avise al terminar:

     ```bash
     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
     ```

2. **Bajar o actualizar el repo:**

   ```bash
   if [ -d ~/claude-code-entorno/.git ]; then git -C ~/claude-code-entorno pull --ff-only; else git clone https://github.com/jpcruz88/claude-code-entorno.git ~/claude-code-entorno; fi
   ```

3. **Simular, enseñar el plan y preguntar** (reglas 1 y 2):

   ```bash
   bash ~/claude-code-entorno/instalar.sh --simular --no-interactivo
   ```

4. **Instalar**, quitando `--sin-skills` o `--sin-codebase-memory` si el usuario
   dijo que sí (en segundo plano o con tiempo de espera largo; repetirlo es seguro):

   ```bash
   bash ~/claude-code-entorno/instalar.sh --no-interactivo --sin-skills --sin-codebase-memory
   ```

5. **Verificar:** `claude plugin list` y `claude mcp list` como en Windows, y:

   ```bash
   grep -E '"statusLine"|guard-kill.py' ~/.claude/settings.json
   python3 ~/.claude/hooks/guard-kill.py < ~/claude-code-entorno/pruebas/datos/hook-taskkill.json
   cd ~/claude-code-entorno && python3 -m unittest discover -s pruebas
   ```

   El hook debe imprimir `"permissionDecision": "deny"` y las pruebas terminar en
   `OK`. Si se instaló herdr: `herdr integration status` debe decir
   `claude: current` y `herdr plugin list` mostrar `permgps.telegram-agents`.

6. **Cierre:** igual que en Windows. Para la clave de Context7, el usuario corre
   esto en una ventana de Terminal aparte (zsh, la de siempre en Mac); se la pide
   sin mostrarla:

   ```bash
   read -rs 'k?Clave de Context7: ' && echo && echo "export CONTEXT7_API_KEY='$k'" >> ~/.zshrc && unset k
   ```

   Si se instaló el plugin de Telegram y el resumen dice que falta configurarlo,
   explícale los pasos del README («herdr y Telegram»): crear un bot propio para
   esta computadora, un grupo con Temas y correr él mismo
   `herdr plugin action invoke permgps.telegram-agents.setup` en un panel de herdr.
   Si usó `--servidor` y el resumen dice que pmset necesita su contraseña, que
   corra él `sudo pmset -a sleep 0 autorestart 1` en una terminal.
   Si quiere usar desde esta Mac el herdr de otra, explícale «Conectar dos Macs»
   del README: corre él `./conectar.sh`, un asistente que le pregunta qué Mac
   controlar y le pide la contraseña de la otra Mac. Tú solo puedes correr
   `./conectar.sh` sin nada: sin terminal no pregunta, no cambia nada y muestra la
   dirección de esta Mac.

## Cómo actualizar después

Cuando el usuario pida actualizar el entorno:

1. `git pull --ff-only` en la carpeta del repo (paso 2).
2. Simular, enseñar lo que cambia e instalar con `-NoInteractivo` /
   `--no-interactivo` y **las mismas opciones** que eligió la primera vez
   (pregúntaselas si no las sabes). Lo que ya está se salta; si un archivo cambió,
   antes se guarda una copia `.bak-<fecha>`.
3. Verificar y cerrar como arriba.

## Si vas a modificar el repo

Esto no es para instalar, sino para quien mantiene el repo:

- Es **público**: nada de clientes, claves, rutas personales ni datos privados.
  Antes de cada commit, `./exportar.sh` debe terminar limpio (pruebas, revisión de
  privacidad y gitleaks).
- Pruebas: `python3 -m unittest discover -s pruebas`. Los instaladores se prueban
  solo con `HOME` en una carpeta temporal, nunca contra la configuración real.
- `instalar.ps1` debe conservar el BOM (UTF-8) y los finales de línea CRLF: sin
  BOM, PowerShell 5.1 rompe las tildes. Lo comprueba `pruebas/test_instalar.py`.
- Los mensajes de commit terminan solo con la línea `Co-Authored-By`, sin la
  línea `Claude-Session`.

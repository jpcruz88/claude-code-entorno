#!/usr/bin/env bash
# Instala este entorno de Claude Code en macOS o Linux (en Windows: instalar.ps1).
#
#   ./instalar.sh --simular   # muestra lo que haría, sin cambiar nada
#   ./instalar.sh             # instala
#
# Opciones:
#   --simular                solo muestra lo que haría
#   --no-interactivo         no pregunta nada (para agentes y scripts): si falta la
#                            clave de Context7 la omite y explica cómo ponerla después.
#                            Es automático cuando la entrada no es una terminal.
#   --sin-codebase-memory    no instala codebase-memory-mcp ni sus hooks
#   --sin-skills             no instala las skills (código de terceros; ver README)
#   --sin-mods               no instala los mods de mods/ (por omisión sí; ver README)
#   --saltar-aviso-permisos  agrega skipDangerousModePermissionPrompt (quita un aviso
#                            de seguridad; apagado por omisión, ver README)
#   --sin-herdr              no instala herdr (ni su config, skill, plugins) ni Ghostty
#   --sin-ghostty            no instala Ghostty ni su config (sí herdr)
#   --sin-plugins-herdr      no instala los plugins de herdr (el de Telegram)
#   --sin-terminal           no instala eza, bat, zoxide, fzf ni atuin, ni su archivo
#                            para la terminal
#   --sin-stats              (macOS) no instala Stats, el monitor de CPU, GPU, RAM y
#                            disco en la barra de menú
#   --servidor               (macOS) la Mac nunca duerme, se enciende sola tras un
#                            corte de luz y abre Ghostty al iniciar sesión. Para una
#                            Mac que se queda encendida (no para un portátil)
#   --ayuda                  muestra esta ayuda
#
# Se puede correr las veces que haga falta: lo que ya está instalado se deja igual.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# codebase-memory-mcp: versión publicada fija (no la rama main). El instalador
# oficial sale de la etiqueta de esa versión y descarga el binario de su release,
# que verifica con el checksums.txt de la misma release.
CBM_VERSION="v0.12.0"
URL_CBM="https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/${CBM_VERSION}/install.sh"
URL_CBM_RELEASE="https://github.com/DeusData/codebase-memory-mcp/releases/download/${CBM_VERSION}"
SIMULAR=0
SIN_CBM=0
SIN_SKILLS=0
SIN_MODS=0
SALTAR_AVISO=0
SIN_HERDR=0
SIN_GHOSTTY=0
SIN_PLUGINS_HERDR=0
SIN_STATS=0
SIN_TERMINAL=0
SERVIDOR=0
NO_INTERACTIVO=0
MOTIVO_NO_INTERACTIVO="opción --no-interactivo"

# Ayuda: el comentario del principio, hasta la primera línea que no lo es.
uso() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"; }

for arg in "$@"; do
  case "$arg" in
    --simular) SIMULAR=1 ;;
    --no-interactivo) NO_INTERACTIVO=1 ;;
    --sin-codebase-memory) SIN_CBM=1 ;;
    --sin-skills) SIN_SKILLS=1 ;;
    --sin-mods) SIN_MODS=1 ;;
    --saltar-aviso-permisos) SALTAR_AVISO=1 ;;
    --sin-herdr) SIN_HERDR=1 ;;
    --sin-ghostty) SIN_GHOSTTY=1 ;;
    --sin-plugins-herdr) SIN_PLUGINS_HERDR=1 ;;
    --sin-stats) SIN_STATS=1 ;;
    --sin-terminal) SIN_TERMINAL=1 ;;
    --servidor) SERVIDOR=1 ;;
    -h|--ayuda|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $arg"; uso; exit 2 ;;
  esac
done

# Sin terminal en la entrada (un agente, un script, una tubería) nadie puede
# contestar: se comporta igual que con --no-interactivo.
if [ "$NO_INTERACTIVO" = 0 ] && [ ! -t 0 ]; then
  NO_INTERACTIVO=1
  MOTIVO_NO_INTERACTIVO="la entrada no es una terminal"
fi

paso()  { printf '\n==> %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
aviso() { printf '    AVISO: %s\n' "$*"; }
tiene() { command -v "$1" >/dev/null 2>&1; }
# Ejecuta un comando, o solo lo muestra si es una simulación.
hacer() {
  if [ "$SIMULAR" = 1 ]; then info "[simular] haría: $*"; return 0; fi
  info "\$ $*"
  "$@"
}

SO="$(uname -s)"
paso "Claude Code: instalación del entorno (${SO})"
info "Carpeta personal: $HOME"
info "Repo: $REPO"
[ "$SIMULAR" = 1 ] && info "Modo simulación: no se cambia nada."
[ "$NO_INTERACTIVO" = 1 ] && info "Modo no interactivo (${MOTIVO_NO_INTERACTIVO}): no se pregunta nada."

# ---------------------------------------------------------------------------
paso "Políticas de la empresa (managed settings)"
claves_relevantes() {
  local contenido="$1" k
  for k in disableAllHooks allowManagedHooksOnly strictKnownMarketplaces \
           allowManagedMcpServersOnly allowedMcpServers deniedMcpServers \
           allowManagedPermissionRulesOnly enabledPlugins; do
    grep -q "$k" <<<"$contenido" && info "  contiene «${k}»"
  done
  return 0
}
rutas=()
if [ "$SO" = Darwin ]; then
  base="/Library/Application Support/ClaudeCode"
  rutas+=("/Library/Managed Preferences/com.anthropic.claudecode.plist"
          "/Library/Managed Preferences/$(id -un)/com.anthropic.claudecode.plist")
else
  base="/etc/claude-code"
fi
rutas+=("$base/managed-settings.json" "$base/managed-settings.d" "$base/managed-mcp.json")
politicas=0
for r in "${rutas[@]}"; do
  [ -e "$r" ] || continue
  politicas=1
  aviso "Hay una política de la empresa: $r"
  if [ -d "$r" ]; then
    claves_relevantes "$(cat "$r"/*.json 2>/dev/null)"
  elif [[ "$r" == *.plist ]]; then
    claves_relevantes "$(plutil -p "$r" 2>/dev/null)"
  else
    claves_relevantes "$(cat "$r" 2>/dev/null)"
  fi
done
if [ "$politicas" = 1 ]; then
  aviso "Esas políticas mandan sobre lo que instale este script (hooks, plugins o MCP"
  aviso "pueden quedar bloqueados). Ver README, «Si la empresa bloquea algo»."
else
  info "No hay políticas de empresa en esta máquina."
fi

# ---------------------------------------------------------------------------
paso "Programas necesarios: git, Node.js, Python 3, jq y uv"
python_ok() { python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; }
node_ok()   { tiene node && node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)' >/dev/null 2>&1; }
git_ok()    { git --version >/dev/null 2>&1; }

faltan=()
git_ok    || faltan+=(git)
node_ok   || faltan+=(node)
python_ok || faltan+=(python)
tiene jq  || faltan+=(jq)
tiene uv  || faltan+=(uv)

if [ ${#faltan[@]} = 0 ]; then
  info "Ya están todos."
elif [ "$SO" = Darwin ]; then
  if ! tiene brew; then
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      [ -x "$b" ] && eval "$("$b" shellenv)" && break
    done
  fi
  if ! tiene brew; then
    aviso "Faltan: ${faltan[*]} y no está Homebrew. Instálalo primero (pide tu contraseña):"
    info '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    info "y vuelve a correr ./instalar.sh"
    [ "$SIMULAR" = 1 ] || exit 1
  else
    hacer brew install "${faltan[@]}" || { aviso "brew install falló"; exit 1; }
  fi
else
  if tiene apt-get; then
    apt=()
    for p in "${faltan[@]}"; do
      case "$p" in
        node) apt+=(nodejs npm) ;;
        python) apt+=(python3) ;;
        uv) ;;
        *) apt+=("$p") ;;
      esac
    done
    if [ ${#apt[@]} -gt 0 ]; then
      sudo_=(sudo)
      # Sin nadie que escriba la contraseña, «sudo -n» falla en vez de quedarse esperando.
      [ "$NO_INTERACTIVO" = 1 ] && sudo_=(sudo -n env DEBIAN_FRONTEND=noninteractive)
      if ! { hacer "${sudo_[@]}" apt-get update \
             && hacer "${sudo_[@]}" apt-get install -y "${apt[@]}" curl; }; then
        aviso "apt-get falló."
        if [ "$NO_INTERACTIVO" = 1 ]; then
          aviso "Si fue porque sudo pide contraseña, corre tú en una terminal:"
          info "sudo apt-get install -y ${apt[*]} curl"
          aviso "y vuelve a correr este instalador."
        fi
        exit 1
      fi
    fi
    if [[ " ${faltan[*]} " == *" uv "* ]]; then
      if [ "$SIMULAR" = 1 ]; then
        info "[simular] haría: curl -LsSf https://astral.sh/uv/install.sh | sh"
      else
        curl -LsSf https://astral.sh/uv/install.sh | sh || aviso "no se pudo instalar uv"
      fi
    fi
    if [ "$SIMULAR" = 0 ] && ! node_ok; then
      aviso "La versión de Node.js de apt es muy vieja (hace falta la 18 o más nueva)."
      aviso "Instala la LTS desde https://nodejs.org o con NodeSource y vuelve a correr esto."
    fi
  else
    aviso "Faltan: ${faltan[*]}. Instálalos con el gestor de paquetes de tu sistema."
    [ "$SIMULAR" = 1 ] || exit 1
  fi
fi

if ! python_ok; then
  aviso "Sin Python 3 no puedo seguir (los pasos siguientes son un script de Python)."
  exit 1
fi

# ---------------------------------------------------------------------------
paso "herdr, lazygit, btop y Ghostty"
ghostty_app() {
  [ -d /Applications/Ghostty.app ] || [ -d "$HOME/Applications/Ghostty.app" ] || tiene ghostty
}
fuente_nerd() {
  local f
  for f in "$HOME/Library/Fonts"/JetBrainsMonoNerdFont-Regular.* /Library/Fonts/JetBrainsMonoNerdFont-Regular.*; do
    [ -e "$f" ] && return 0
  done
  return 1
}
herdr_ok() { tiene herdr || [ -x "$HOME/.local/bin/herdr" ]; }
CON_GHOSTTY=0
if [ "$SIN_HERDR" = 1 ]; then
  info "Se omite (--sin-herdr)."
elif [ "$SO" = Darwin ]; then
  formulas=() casks=()
  herdr_ok    || formulas+=(herdr)
  tiene lazygit || formulas+=(lazygit)
  tiene btop  || formulas+=(btop)
  if [ "$SIN_GHOSTTY" = 0 ]; then
    ghostty_app || casks+=(ghostty)
    fuente_nerd || casks+=(font-jetbrains-mono-nerd-font)
  fi
  if [ ${#formulas[@]} = 0 ] && [ ${#casks[@]} = 0 ]; then
    info "Ya están todos."
  elif ! tiene brew; then
    aviso "Faltan: ${formulas[*]} ${casks[*]} y no está Homebrew; se omiten (ver arriba cómo instalarlo)."
  else
    [ ${#formulas[@]} = 0 ] || hacer brew install "${formulas[@]}" || aviso "brew install falló"
    [ ${#casks[@]} = 0 ] || hacer brew install --cask "${casks[@]}" || aviso "brew install --cask falló"
  fi
  if [ "$SIN_GHOSTTY" = 0 ] && { ghostty_app || [ "$SIMULAR" = 1 ]; }; then CON_GHOSTTY=1; fi
else
  if herdr_ok; then
    info "herdr ya está."
  elif [ "$SIMULAR" = 1 ]; then
    info "[simular] haría: curl -fsSL https://herdr.dev/install.sh | sh"
  else
    curl -fsSL https://herdr.dev/install.sh | sh || aviso "no se pudo instalar herdr"
  fi
  for p in lazygit btop; do
    tiene "$p" || aviso "Falta $p (lo usan las ventanas flotantes de herdr): instálalo con tu gestor de paquetes."
  done
  [ "$SIN_GHOSTTY" = 0 ] && tiene ghostty && CON_GHOSTTY=1
fi

# ---------------------------------------------------------------------------
paso "Herramientas de terminal (eza, bat, zoxide, fzf y atuin)"
herramientas=(eza bat zoxide fzf atuin)
if [ "$SIN_TERMINAL" = 1 ]; then
  info "Se omite (--sin-terminal)."
else
  faltan=()
  for h in "${herramientas[@]}"; do tiene "$h" || faltan+=("$h"); done
  if [ ${#faltan[@]} = 0 ]; then
    info "Ya están todas."
  elif [ "$SO" != Darwin ]; then
    aviso "Faltan ${faltan[*]}: instálalas con tu gestor de paquetes (la terminal se las salta)."
  elif ! tiene brew; then
    aviso "Faltan ${faltan[*]} y no está Homebrew; se omiten (ver arriba cómo instalarlo)."
  else
    hacer brew install "${faltan[@]}" || aviso "brew install falló"
  fi
fi

# ---------------------------------------------------------------------------
if [ "$SO" = Darwin ]; then
  paso "Monitor en la barra de menú (Stats)"
  # Dónde está <Nombre>.app (CARPETA_APPS solo la cambian las pruebas).
  ruta_app() {
    local d
    for d in "${CARPETA_APPS:-/Applications}" "$HOME/Applications"; do
      [ -d "$d/$1.app" ] && { echo "$d/$1.app"; return 0; }
    done
    return 1
  }
  # instalar_app <Nombre> <cask>: la instala con brew si falta. Falla si no quedó.
  instalar_app() {
    if ruta_app "$1" >/dev/null; then
      info "$1 ya está."
    elif ! tiene brew; then
      aviso "Falta $1 y no está Homebrew; se omite (ver arriba cómo instalarlo)."
    else
      hacer brew install --cask "$2" \
        || aviso "brew install --cask $2 falló (si pide tu contraseña, córrelo tú en una terminal)"
    fi
    ruta_app "$1" >/dev/null || [ "$SIMULAR" = 1 ]
  }
  # iniciar_app <Nombre>: la agrega a los ítems de inicio y la abre si no está abierta.
  iniciar_app() {
    local app
    app="$(ruta_app "$1" || echo "/Applications/$1.app")"
    if osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null | grep -q "$1"; then
      info "al día: $1 ya está en los ítems de inicio."
    elif [ "$SIMULAR" = 1 ]; then
      info "[simular] haría: agregar $1 a los ítems de inicio"
    else
      osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$app\", hidden:true}" >/dev/null \
        && info "$1: agregada a los ítems de inicio." \
        || aviso "No pude agregar $1 a los ítems de inicio (macOS puede pedir permiso de Automatización)."
    fi
    pgrep -xq "$1" || hacer open -a "$app" || aviso "No pude abrir $1."
  }

  if [ "$SIN_STATS" = 1 ]; then
    info "Se omite (--sin-stats)."
  elif instalar_app Stats stats; then
    # CPU, GPU, RAM y disco a la vista; la red, apagada. Solo se escriben los que
    # falten, para no pisar lo que cambies después en los ajustes de Stats.
    escritos=0
    for modulo in CPU_state:true GPU_state:true RAM_state:true Disk_state:true Network_state:false; do
      defaults read eu.exelban.Stats "${modulo%%:*}" >/dev/null 2>&1 && continue
      hacer defaults write eu.exelban.Stats "${modulo%%:*}" -bool "${modulo#*:}" && escritos=1
    done
    [ "$escritos" = 0 ] && info "al día: módulos de Stats"
    if [ "$escritos" = 1 ] && pgrep -xq Stats; then
      info "Stats ya estaba abierto: ciérralo y ábrelo para ver los módulos nuevos."
    fi
    iniciar_app Stats
  fi
fi

# ---------------------------------------------------------------------------
if [ "$SERVIDOR" = 1 ]; then
  paso "Modo servidor (no dormir, encenderse tras un corte de luz, Ghostty al iniciar sesión)"
  if [ "$SO" != Darwin ]; then
    aviso "--servidor solo existe en macOS; se omite."
  else
    if pmset -g batt 2>/dev/null | grep -q InternalBattery; then
      aviso "Esta Mac tiene batería: sin reposo gastará más. Pensado para una Mac que se queda enchufada."
    fi
    dormir="$(pmset -g | awk '$1 == "sleep" { print $2 }')"
    reiniciar="$(pmset -g | awk '$1 == "autorestart" { print $2 }')"
    if [ "$dormir" = 0 ] && [ "$reiniciar" = 1 ]; then
      info "al día: sleep 0 autorestart 1"
    elif [ "$SIMULAR" = 1 ]; then
      info "[simular] haría: sudo pmset -a sleep 0 autorestart 1"
    elif [ "$NO_INTERACTIVO" = 1 ]; then
      if ! hacer sudo -n pmset -a sleep 0 autorestart 1 2>/dev/null; then
        aviso "pmset necesita tu contraseña. Corre tú en una terminal:"
        info "sudo pmset -a sleep 0 autorestart 1"
      fi
    else
      hacer sudo pmset -a sleep 0 autorestart 1 || aviso "pmset falló"
    fi
    info "La pantalla sigue apagándose sola; solo la Mac deja de dormir."
    info "Ítems de inicio (Ajustes del Sistema > General): Ghostty abre herdr y su bot."
    if ! ghostty_app && [ "$SIMULAR" = 0 ]; then
      aviso "No está Ghostty; no lo agrego a los ítems de inicio."
    elif osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null | grep -q Ghostty; then
      info "al día: Ghostty ya está en los ítems de inicio."
    else
      hacer osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/Ghostty.app", hidden:false}' >/dev/null \
        || aviso "No pude agregar Ghostty a los ítems de inicio (macOS puede pedir permiso de Automatización)."
    fi
    if fdesetup status 2>/dev/null | grep -q "is On"; then
      info "FileVault está activado: tras un reinicio, la Mac espera tu contraseña y herdr"
      info "arranca cuando inicias sesión."
    fi
  fi
fi

# ---------------------------------------------------------------------------
paso "Claude Code"
if ! tiene claude && [ -x "$HOME/.local/bin/claude" ]; then
  export PATH="$HOME/.local/bin:$PATH"
fi
if tiene claude; then
  info "Instalado: $(claude --version 2>/dev/null | head -1)"
else
  aviso "No encontré el comando claude. Instálalo con:"
  info "curl -fsSL https://claude.ai/install.sh | bash"
  aviso "Sigo con lo demás; los plugins y los MCP quedarán pendientes."
fi

# ---------------------------------------------------------------------------
paso "codebase-memory-mcp"
SUPONER_CBM=0
ruta_cbm() {
  command -v codebase-memory-mcp 2>/dev/null && return 0
  [ -x "$HOME/.local/bin/codebase-memory-mcp" ] && echo "$HOME/.local/bin/codebase-memory-mcp"
}
if [ "$SIN_CBM" = 1 ]; then
  info "Se omite (--sin-codebase-memory)."
elif r="$(ruta_cbm)" && [ -n "$r" ]; then
  info "Ya instalado: $r"
else
  info "No está instalado. Uso su instalador oficial, versión $CBM_VERSION: descarga el"
  info "binario de la release, lo verifica y configura Claude Code (su MCP, hooks y skill)."
  if [ "$SIMULAR" = 1 ]; then
    info "[simular] haría: curl -fsSL $URL_CBM -o <temporal>/install.sh"
    info "[simular] haría: CBM_DOWNLOAD_URL=$URL_CBM_RELEASE bash <temporal>/install.sh"
    SUPONER_CBM=1
  else
    tmp="$(mktemp -d)"
    if curl -fsSL "$URL_CBM" -o "$tmp/install.sh" \
       && CBM_DOWNLOAD_URL="$URL_CBM_RELEASE" bash "$tmp/install.sh"; then
      info "codebase-memory-mcp instalado."
    else
      aviso "No se pudo instalar codebase-memory-mcp; sigo sin él."
      SIN_CBM=1
    fi
    rm -rf "$tmp"
  fi
fi

# ---------------------------------------------------------------------------
paso "Clave de Context7 (variable CONTEXT7_API_KEY)"
case "$(basename "${SHELL:-bash}")" in
  zsh) rc="$HOME/.zshrc" ;;
  *) rc="$HOME/.bashrc" ;;
esac
explicar_clave() {
  info "Sácala gratis en https://context7.com/dashboard y guárdala así:"
  info "  echo \"export CONTEXT7_API_KEY='<tu-clave>'\" >> $rc"
  info "Luego abre una terminal nueva. Sin la clave, context7 marca error en /mcp."
}
if [ -n "${CONTEXT7_API_KEY:-}" ]; then
  info "Ya está definida."
elif grep -qs 'CONTEXT7_API_KEY=' "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.zprofile" \
       "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; then
  info "Ya está en tu archivo de inicio de la terminal; se carga al abrir una nueva."
elif [ "$SIMULAR" = 1 ]; then
  aviso "No está definida."
  explicar_clave
elif [ "$NO_INTERACTIVO" = 1 ]; then
  aviso "No está definida. Modo no interactivo: no la pido; queda pendiente."
  explicar_clave
  info "O vuelve a correr ./instalar.sh (con las mismas opciones) en tu terminal: te la"
  info "pide sin mostrarla en pantalla."
else
  read -r -s -p "    Pega tu clave de Context7 (Enter para omitir): " clave
  echo
  if [ -n "$clave" ]; then
    read -r -p "    ¿La guardo en $rc? (s/N) " resp
    if [[ "$resp" =~ ^[sS] ]]; then
      printf '\n# Clave de Context7 para Claude Code (la usa el MCP context7)\nexport CONTEXT7_API_KEY=%q\n' \
        "$clave" >> "$rc"
      export CONTEXT7_API_KEY="$clave"
      info "Guardada en $rc."
    else
      explicar_clave
    fi
  else
    explicar_clave
  fi
  unset clave
fi

# ---------------------------------------------------------------------------
args=(--plataforma unix --python-hooks python3)
[ "$SIMULAR" = 1 ] && args+=(--simular)
[ "$SIN_CBM" = 1 ] && args+=(--sin-codebase-memory)
[ "$SUPONER_CBM" = 1 ] && args+=(--suponer-codebase-memory)
[ "$SIN_SKILLS" = 1 ] && args+=(--sin-skills)
[ "$SIN_MODS" = 1 ] && args+=(--sin-mods)
[ "$SALTAR_AVISO" = 1 ] && args+=(--saltar-aviso-permisos)
[ "$SIN_HERDR" = 1 ] && args+=(--sin-herdr)
[ "$SIN_PLUGINS_HERDR" = 1 ] && args+=(--sin-plugins-herdr)
[ "$CON_GHOSTTY" = 1 ] && args+=(--ghostty)
[ "$SIN_TERMINAL" = 1 ] && args+=(--sin-terminal)
python3 "$REPO/herramientas/instalar_comun.py" "${args[@]}"

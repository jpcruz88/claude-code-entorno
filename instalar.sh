#!/usr/bin/env bash
# Instala este entorno de Claude Code en macOS o Linux (en Windows: instalar.ps1).
#
#   ./instalar.sh --simular   # muestra lo que haría, sin cambiar nada
#   ./instalar.sh             # instala
#
# Opciones:
#   --simular               solo muestra lo que haría
#   --sin-codebase-memory   no instala codebase-memory-mcp ni sus hooks
#   --sin-skills            no instala las skills (lo más lento: ~50 descargas)
#   --ayuda                 muestra esta ayuda
#
# Se puede correr las veces que haga falta: lo que ya está instalado se deja igual.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL_CBM="https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh"
SIMULAR=0
SIN_CBM=0
SIN_SKILLS=0

uso() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

for arg in "$@"; do
  case "$arg" in
    --simular) SIMULAR=1 ;;
    --sin-codebase-memory) SIN_CBM=1 ;;
    --sin-skills) SIN_SKILLS=1 ;;
    -h|--ayuda|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $arg"; uso; exit 2 ;;
  esac
done

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

# ---------------------------------------------------------------------------
paso "Políticas de la empresa (managed settings)"
claves_relevantes() {
  local contenido="$1" k
  for k in disableAllHooks allowManagedHooksOnly strictKnownMarketplaces \
           allowManagedMcpServersOnly allowedMcpServers deniedMcpServers \
           allowManagedPermissionRulesOnly enabledPlugins; do
    grep -q "$k" <<<"$contenido" && info "  contiene «$k»"
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
      hacer sudo apt-get update && hacer sudo apt-get install -y "${apt[@]}" curl \
        || { aviso "apt-get falló"; exit 1; }
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
  info "No está instalado. Uso su instalador oficial: descarga el binario y configura"
  info "Claude Code (su MCP, sus hooks y su skill)."
  if [ "$SIMULAR" = 1 ]; then
    info "[simular] haría: curl -fsSL $URL_CBM -o <temporal>/install.sh && bash <temporal>/install.sh"
    SUPONER_CBM=1
  else
    tmp="$(mktemp -d)"
    if curl -fsSL "$URL_CBM" -o "$tmp/install.sh" && bash "$tmp/install.sh"; then
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
elif [ "$SIMULAR" = 1 ] || [ ! -t 0 ]; then
  aviso "No está definida."
  explicar_clave
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
python3 "$REPO/herramientas/instalar_comun.py" "${args[@]}"

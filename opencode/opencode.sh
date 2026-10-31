# OpenCode como respaldo de Claude Code.
# Lo carga ~/.zshrc (o ~/.bashrc) con una línea que agrega el instalador.
#
# Existe por si se acaban los tokens de Claude: OpenCode Go da acceso a otros
# modelos (Claude Haiku, GPT, GLM, Kimi, Qwen…) desde el mismo Claude Code,
# con otra cuenta y otro saldo. No cambia nada si no lo usas.
#
#   cl-go    Claude Code contra OpenCode Go; usa OPENCODE_API_KEY
#   cl-or    Claude Code contra OpenRouter; usa OPENROUTER_API_KEY
#
# Ninguna clave vive aquí: cada alias se define solo si su variable de entorno
# existe. La pones tú en cada computadora, nunca en el repo:
#
#   export OPENCODE_API_KEY="…"    # de https://opencode.ai/console
#   export OPENROUTER_API_KEY="…"  # de https://openrouter.ai/keys
#
# Los alias arrancan Claude sin el aviso de permisos que trae por defecto. Si
# prefieres que lo pregunte, quita --dangerously-skip-permissions de abajo.

case $- in *i*) ;; *) return 0 ;; esac  # solo en terminales interactivas

if command -v claude >/dev/null 2>&1; then
  if [ -n "${OPENCODE_API_KEY:-}" ]; then
    # Los alias de modelo son necesarios: sin ellos, /model y las tareas de fondo
    # piden modelos que el endpoint de Go no sirve. Puedes cambiarlos tú.
    alias cl-go='ANTHROPIC_BASE_URL="https://opencode.ai/inference/go/anthropic" \
ANTHROPIC_AUTH_TOKEN="$OPENCODE_API_KEY" \
ANTHROPIC_DEFAULT_OPUS_MODEL="minimax-m3" \
ANTHROPIC_DEFAULT_SONNET_MODEL="minimax-m3" \
ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-haiku-5-5" \
claude --dangerously-skip-permissions'
  fi

  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    alias cl-or='ANTHROPIC_BASE_URL="https://openrouter.ai/api" \
ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY" \
ANTHROPIC_API_KEY="" \
claude --dangerously-skip-permissions'
  fi
fi

# OpenCode como respaldo de Claude Code, versión para PowerShell (Windows).
# Lo carga tu perfil de PowerShell con una línea que agrega instalar.ps1.
# Es la misma idea que opencode/opencode.sh en Mac y Linux.
#
#   cl-go    Claude Code contra OpenCode Go; usa OPENCODE_API_KEY
#   cl-or    Claude Code contra OpenRouter; usa OPENROUTER_API_KEY
#
# Ninguna clave vive aquí: cada comando se define solo si su variable de entorno
# existe. La pones tú en cada computadora, nunca en el repo:
#
#   [Environment]::SetEnvironmentVariable('OPENCODE_API_KEY', '…', 'User')
#   [Environment]::SetEnvironmentVariable('OPENROUTER_API_KEY', '…', 'User')
#
# Las variables solo valen mientras corre Claude: al salir se restauran las que
# había. Arrancan Claude sin el aviso de permisos; si prefieres que lo pregunte,
# quita --dangerously-skip-permissions de abajo.

function Invoke-ClaudeConEntorno([hashtable]$Variables, [object[]]$Resto) {
  $previas = @{}
  foreach ($nombre in $Variables.Keys) {
    $previas[$nombre] = [Environment]::GetEnvironmentVariable($nombre, 'Process')
    [Environment]::SetEnvironmentVariable($nombre, $Variables[$nombre], 'Process')
  }
  try {
    & claude --dangerously-skip-permissions @Resto
  } finally {
    foreach ($nombre in $previas.Keys) {
      [Environment]::SetEnvironmentVariable($nombre, $previas[$nombre], 'Process')
    }
  }
}

if (Get-Command claude -ErrorAction SilentlyContinue) {
  if ($env:OPENCODE_API_KEY) {
    # Los alias de modelo son necesarios: sin ellos, /model y las tareas de fondo
    # piden modelos que el endpoint de Go no sirve. Puedes cambiarlos tú.
    function cl-go {
      Invoke-ClaudeConEntorno @{
        ANTHROPIC_BASE_URL             = 'https://opencode.ai/inference/go/anthropic'
        ANTHROPIC_AUTH_TOKEN           = $env:OPENCODE_API_KEY
        ANTHROPIC_DEFAULT_OPUS_MODEL   = 'minimax-m3'
        ANTHROPIC_DEFAULT_SONNET_MODEL = 'minimax-m3'
        ANTHROPIC_DEFAULT_HAIKU_MODEL  = 'claude-haiku-5-5'
      } $args
    }
  }

  if ($env:OPENROUTER_API_KEY) {
    # ANTHROPIC_API_KEY vacía (en Windows, quitarla) para que no mande sobre el token.
    function cl-or {
      Invoke-ClaudeConEntorno @{
        ANTHROPIC_BASE_URL   = 'https://openrouter.ai/api'
        ANTHROPIC_AUTH_TOKEN = $env:OPENROUTER_API_KEY
        ANTHROPIC_API_KEY    = $null
      } $args
    }
  }
}

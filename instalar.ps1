#Requires -Version 5.1
<#
.SYNOPSIS
  Instala este entorno de Claude Code en Windows (en macOS o Linux: instalar.sh).

.DESCRIPTION
  1. Avisa si la empresa tiene políticas de Claude Code (managed settings).
  2. Instala con winget lo que falte: Git for Windows, Node.js LTS, Python 3, jq y uv.
  3. Instala codebase-memory-mcp con su instalador oficial (si falta).
  4. Pide la clave de Context7 si la variable CONTEXT7_API_KEY no existe.
  5. Copia reglas, hooks y statusline a %USERPROFILE%\.claude, fusiona settings.json
     (con respaldo), instala plugins, skills y MCP (herramientas\instalar_comun.py).

  Se puede correr las veces que haga falta: lo que ya está se deja igual.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Simular
  Muestra lo que haría, sin cambiar nada.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1
  Instala.
#>
[CmdletBinding()]
param(
  # Solo muestra lo que haría.
  [switch]$Simular,
  # No instala codebase-memory-mcp ni sus hooks.
  [switch]$SinCodebaseMemory,
  # No instala las skills (son código de terceros; ver README).
  [switch]$SinSkills,
  # Agrega skipDangerousModePermissionPrompt: quita un aviso de seguridad (ver README).
  [switch]$SaltarAvisoPermisos
)

# 'Continue' a propósito: en PowerShell 5.1, con 'Stop', cualquier texto que un
# programa escriba en stderr (winget, npx, claude…) se vuelve un error que corta todo.
$ErrorActionPreference = 'Continue'
$Repo = $PSScriptRoot

if ($env:OS -ne 'Windows_NT') {
  Write-Host 'Este instalador es para Windows. En macOS o Linux usa: ./instalar.sh'
  exit 1
}
# codebase-memory-mcp: versión publicada fija (no la rama main). El instalador
# oficial sale de la etiqueta de esa versión y descarga el binario de su release,
# que verifica con el checksums.txt de la misma release.
$CbmVersion = 'v0.12.0'
$UrlCbm = "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/$CbmVersion/install.ps1"
$UrlCbmRelease = "https://github.com/DeusData/codebase-memory-mcp/releases/download/$CbmVersion"

function Paso([string]$Texto) { Write-Host ''; Write-Host "==> $Texto" -ForegroundColor Cyan }
function Info([string]$Texto) { Write-Host "    $Texto" }
function Aviso([string]$Texto) { Write-Host "    AVISO: $Texto" -ForegroundColor Yellow }

function Tiene([string]$Comando) {
  return [bool](Get-Command $Comando -ErrorAction SilentlyContinue)
}

# Vuelve a leer el PATH del sistema y del usuario (winget lo cambia, pero esta
# ventana no se entera sola).
function Actualizar-Path {
  $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$maquina;$usuario;$env:Path"
}

Paso 'Claude Code: instalación del entorno (Windows)'
Info "Carpeta personal: $env:USERPROFILE"
Info "Repo: $Repo"
if ($Simular) { Info 'Modo simulación: no se cambia nada.' }

# ---------------------------------------------------------------------------
Paso 'Políticas de la empresa (managed settings)'
$programFiles = $env:ProgramW6432
if (-not $programFiles) { $programFiles = $env:ProgramFiles }
$basePoliticas = Join-Path $programFiles 'ClaudeCode'
$encontradas = @()
foreach ($nombre in @('managed-settings.json', 'managed-settings.d', 'managed-mcp.json')) {
  $ruta = Join-Path $basePoliticas $nombre
  if (Test-Path -LiteralPath $ruta) { $encontradas += $ruta }
}
foreach ($clave in @('HKLM:\SOFTWARE\Policies\ClaudeCode', 'HKCU:\SOFTWARE\Policies\ClaudeCode')) {
  if (Test-Path -LiteralPath $clave) { $encontradas += $clave }
}
$relevantes = @('disableAllHooks', 'allowManagedHooksOnly', 'strictKnownMarketplaces',
  'allowManagedMcpServersOnly', 'allowedMcpServers', 'deniedMcpServers',
  'allowManagedPermissionRulesOnly', 'enabledPlugins')
foreach ($ruta in $encontradas) {
  Aviso "Hay una política de la empresa: $ruta"
  $contenido = ''
  try {
    if ($ruta -like 'HK*') {
      $props = Get-ItemProperty -LiteralPath $ruta
      $contenido = ($props.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
    } elseif (Test-Path -LiteralPath $ruta -PathType Container) {
      $contenido = (Get-ChildItem -LiteralPath $ruta -Filter '*.json' | ForEach-Object {
          Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
    } else {
      $contenido = Get-Content -LiteralPath $ruta -Raw
    }
  } catch {
    Info '  (no se pudo leer; puede que necesite permisos de administrador)'
  }
  foreach ($k in $relevantes) {
    if ($contenido -and $contenido.Contains($k)) { Info "  contiene «$k»" }
  }
}
if ($encontradas.Count -gt 0) {
  Aviso 'Esas políticas mandan sobre lo que instale este script (hooks, plugins o MCP'
  Aviso 'pueden quedar bloqueados). Ver README, «Si la empresa bloquea algo».'
} else {
  Info 'No hay políticas de empresa en esta máquina.'
}

# ---------------------------------------------------------------------------
Paso 'Programas necesarios: Git, Node.js LTS, Python 3, jq y uv'

# Python: «python» puede ser el atajo de la Microsoft Store, que no es Python de
# verdad. Se prueba que responda con la versión 3.
function Buscar-Python {
  foreach ($candidato in @(@('py', '-3'), @('python'), @('python3'))) {
    $exe = $candidato[0]
    if (-not (Tiene $exe)) { continue }
    $argumentos = @()
    if ($candidato.Count -gt 1) { $argumentos += $candidato[1] }
    $argumentos += @('-c', 'import sys; print(sys.executable) if sys.version_info >= (3, 8) else None')
    try {
      $salida = & $exe @argumentos 2>$null
      if ($LASTEXITCODE -eq 0 -and $salida) {
        return [pscustomobject]@{ Exe = ([string]$salida).Trim(); Hooks = ($candidato -join ' ') }
      }
    } catch { }
  }
  # Instalado pero fuera del PATH (pasa con el instalador de python.org)
  $lugares = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python3*\python.exe'),
    (Join-Path $programFiles 'Python3*\python.exe')
  )
  foreach ($patron in $lugares) {
    $exe = Get-ChildItem -Path $patron -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
    if ($exe) {
      # Git Bash (que lanza los hooks) necesita barras normales; las comillas las
      # pone instalar_comun.py (PowerShell 5.1 las pierde al pasarlas a un programa)
      return [pscustomobject]@{ Exe = $exe.FullName; Hooks = ($exe.FullName -replace '\\', '/') }
    }
  }
  return $null
}

$programas = @(
  [pscustomobject]@{ Nombre = 'Git for Windows'; Id = 'Git.Git'; Listo = { Tiene 'git' } },
  [pscustomobject]@{ Nombre = 'Node.js LTS'; Id = 'OpenJS.NodeJS.LTS'; Listo = { (Tiene 'node') -and (Tiene 'npx') } },
  [pscustomobject]@{ Nombre = 'Python 3'; Id = 'Python.Python.3.13'; Listo = { [bool](Buscar-Python) } },
  [pscustomobject]@{ Nombre = 'jq'; Id = 'jqlang.jq'; Listo = { Tiene 'jq' } },
  [pscustomobject]@{ Nombre = 'uv'; Id = 'astral-sh.uv'; Listo = { Tiene 'uv' } }
)
$faltan = @($programas | Where-Object { -not (& $_.Listo) })
if ($faltan.Count -eq 0) {
  Info 'Ya están todos.'
} elseif (-not (Tiene 'winget')) {
  Aviso ('Faltan: ' + (($faltan | ForEach-Object { $_.Nombre }) -join ', ') + ' y no está winget.')
  Aviso 'Instala «App Installer» desde la Microsoft Store (trae winget) o instala esos programas a mano.'
  if (-not $Simular) { exit 1 }
} else {
  foreach ($p in $faltan) {
    $argumentos = @('install', '--id', $p.Id, '-e', '--source', 'winget',
      '--accept-package-agreements', '--accept-source-agreements')
    if ($Simular) {
      Info ("[simular] haría: winget " + ($argumentos -join ' '))
      continue
    }
    Info ("$ winget " + ($argumentos -join ' '))
    & winget @argumentos
    if ($LASTEXITCODE -ne 0) { Aviso "winget no pudo instalar $($p.Nombre) (código $LASTEXITCODE)." }
  }
  if (-not $Simular) { Actualizar-Path }
}

$python = Buscar-Python
if (-not $python -and $Simular) {
  Info '[simular] Sin Python todavía. Con Python instalado seguiría con: codebase-memory-mcp,'
  Info 'clave de Context7, reglas, hooks, statusline, settings.json, plugins, skills y MCP.'
  exit 0
}
if (-not $python) {
  Aviso 'Sin Python 3 no puedo seguir (los pasos siguientes son un script de Python).'
  Aviso 'Si acabas de instalarlo, cierra esta ventana, abre otra y vuelve a correr el instalador.'
  exit 1
}
Info "Python: $($python.Exe)"

# Git Bash: Claude Code lo usa para los hooks y la statusline. Lo encuentra solo
# si está en el lugar de siempre o si git está en el PATH; si no, se le indica.
$gitBash = $null
$gitBashFijo = Join-Path $programFiles 'Git\bin\bash.exe'
if (-not (Test-Path -LiteralPath $gitBashFijo)) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    $candidato = Join-Path (Split-Path (Split-Path $git.Source -Parent) -Parent) 'bin\bash.exe'
    if (Test-Path -LiteralPath $candidato) { $gitBash = $candidato }
  }
  if (-not $gitBash -and -not $Simular) {
    Aviso 'No encontré Git Bash (bash.exe). Los hooks y la statusline lo necesitan.'
  }
}
if ($gitBash) { Info "Git Bash: $gitBash (se guardará en CLAUDE_CODE_GIT_BASH_PATH)" }

# ---------------------------------------------------------------------------
Paso 'Claude Code'
$claudeLocal = Join-Path $env:USERPROFILE '.local\bin'
if (-not (Tiene 'claude') -and (Test-Path -LiteralPath (Join-Path $claudeLocal 'claude.exe'))) {
  $env:Path = "$claudeLocal;$env:Path"
}
if (Tiene 'claude') {
  Info ('Instalado: ' + ((& claude --version 2>$null) | Select-Object -First 1))
} else {
  Aviso 'No encontré el comando claude. Instálalo en PowerShell con:'
  Info 'irm https://claude.ai/install.ps1 | iex'
  Aviso 'Sigo con lo demás; los plugins y los MCP quedarán pendientes.'
}

# ---------------------------------------------------------------------------
Paso 'codebase-memory-mcp'
$suponerCbm = $false
$cbmLocal = Join-Path $env:LOCALAPPDATA 'Programs\codebase-memory-mcp\codebase-memory-mcp.exe'
if ($SinCodebaseMemory) {
  Info 'Se omite (-SinCodebaseMemory).'
} elseif ((Tiene 'codebase-memory-mcp') -or (Test-Path -LiteralPath $cbmLocal)) {
  Info 'Ya instalado.'
} else {
  Info "No está instalado. Uso su instalador oficial, versión ${CbmVersion}: descarga el"
  Info 'binario para Windows de la release, lo verifica y configura Claude Code.'
  if ($Simular) {
    Info "[simular] haría: descargar $UrlCbm, Unblock-File y ejecutarlo"
    Info "[simular]        con CBM_DOWNLOAD_URL=$UrlCbmRelease"
    $suponerCbm = $true
  } else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cbm-' + [guid]::NewGuid().ToString('N'))
    $instaladorCbm = Join-Path $tmp 'install.ps1'
    try {
      New-Item -ItemType Directory -Path $tmp -ErrorAction Stop | Out-Null
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $UrlCbm -OutFile $instaladorCbm -UseBasicParsing -ErrorAction Stop
      Unblock-File -LiteralPath $instaladorCbm -ErrorAction Stop
      $env:CBM_DOWNLOAD_URL = $UrlCbmRelease
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $instaladorCbm
      if ($LASTEXITCODE -ne 0) { throw "el instalador terminó con código $LASTEXITCODE" }
      Actualizar-Path
      Info 'codebase-memory-mcp instalado.'
    } catch {
      Aviso "No se pudo instalar codebase-memory-mcp ($($_.Exception.Message)); sigo sin él."
      Aviso 'Si el antivirus lo bloqueó, mira la nota del README sobre falsos positivos.'
      $SinCodebaseMemory = $true
    } finally {
      Remove-Item Env:\CBM_DOWNLOAD_URL -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# ---------------------------------------------------------------------------
Paso 'Clave de Context7 (variable CONTEXT7_API_KEY)'
function Explicar-Clave {
  Info 'Sácala gratis en https://context7.com/dashboard y guárdala como variable de'
  Info 'entorno de tu usuario. En PowerShell:'
  Info '  [Environment]::SetEnvironmentVariable(''CONTEXT7_API_KEY'', ''<tu-clave>'', ''User'')'
  Info 'o en «Editar las variables de entorno de esta cuenta» (búscalo en Inicio).'
  Info 'Luego cierra y vuelve a abrir la terminal. Sin la clave, context7 marca error en /mcp.'
}
$claveUsuario = [Environment]::GetEnvironmentVariable('CONTEXT7_API_KEY', 'User')
$claveMaquina = [Environment]::GetEnvironmentVariable('CONTEXT7_API_KEY', 'Machine')
if ($env:CONTEXT7_API_KEY -or $claveUsuario -or $claveMaquina) {
  Info 'Ya está definida.'
} elseif ($Simular -or -not [Environment]::UserInteractive -or [Console]::IsInputRedirected) {
  Aviso 'No está definida.'
  Explicar-Clave
} else {
  $segura = Read-Host '    Pega tu clave de Context7 (Enter para omitir)' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($clave) {
    $resp = Read-Host '    ¿La guardo como variable de entorno de tu usuario? (s/N)'
    if ($resp -match '^[sS]') {
      [Environment]::SetEnvironmentVariable('CONTEXT7_API_KEY', $clave, 'User')
      $env:CONTEXT7_API_KEY = $clave
      Info 'Guardada. Las terminales que abras desde ahora ya la verán.'
    } else {
      Explicar-Clave
    }
  } else {
    Explicar-Clave
  }
  $clave = $null
}

# ---------------------------------------------------------------------------
$argumentos = @((Join-Path $Repo 'herramientas\instalar_comun.py'), '--plataforma', 'windows',
  '--python-hooks', $python.Hooks)
if ($Simular) { $argumentos += '--simular' }
if ($SinCodebaseMemory) { $argumentos += '--sin-codebase-memory' }
if ($suponerCbm) { $argumentos += '--suponer-codebase-memory' }
if ($SinSkills) { $argumentos += '--sin-skills' }
if ($SaltarAvisoPermisos) { $argumentos += '--saltar-aviso-permisos' }
if ($gitBash) { $argumentos += @('--git-bash', $gitBash) }
& $python.Exe @argumentos
exit $LASTEXITCODE

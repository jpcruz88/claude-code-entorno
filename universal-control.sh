#!/usr/bin/env bash
# Revisa si dos Mac pueden usar Universal Control: lo que una Mac necesita (cuenta,
# Wi-Fi, Bluetooth, Handoff, monitor...) y lo que Universal Control mismo dice en sus
# registros. Solo mira: nunca cambia ajustes, nunca reinicia nada y nunca detiene procesos.
#
#   ./universal-control.sh
#       Sin opciones: revisa esta Mac y la otra (la que dejó --configurar, por ssh), imprime
#       una línea por revisión y por Mac y, al final, «Universal Control listo.» (sale con 0)
#       o «No quedó: <causa>» (sale con 1). Sin configuración dice cómo configurar y sale con 2.
#       Que un ajuste salga mal (⚠️) no impide que esté listo: manda lo que dicen los registros.
#
#   ./universal-control.sh --estado [<sal>]
#       Imprime el estado de esta Mac, una clave=valor por línea, y sale con 0. La sal es
#       opcional: la revisión a mano usa una distinta en cada corrida, la misma en las dos
#       Mac, para que la huella de la cuenta no se pueda revertir. Las claves:
#         nombre, macos          nombre en Ajustes del Sistema y versión de macOS
#         cuenta                 huella (12 primeros hex del sha256 de <sal> y el ID de la
#                                Cuenta de Apple), vacío si no hay cuenta o ? si no se
#                                pudo leer; el ID nunca se imprime
#         wifi, bluetooth        1 encendido, 0 apagado, ? no se pudo leer
#         handoff                1 activado, 0 desactivado
#         universal_control      1 activado, 0 desactivado
#         compartir_internet     1 encendido (bloquea Universal Control), 0 apagado
#         monitores              cuántas pantallas ve el sistema (0 = ninguna), o ?
#         admin                  1 si el usuario es administrador, 0 si no, ? si no se supo
#         sesion                 último estado de sesión que vio Universal Control
#                                (p. ej. unlocked), o ?
#         id                     ID propio de Universal Control, o vacío
#         grupo                  IDs del último «Selected circle», separados por coma
#         excluidos              IDs excluidos en ese mismo bloque, o vacío
#
#   ./universal-control.sh --configurar <usuario>@<mac>.local
#       Guarda cuál es la otra Mac. Antes entra a ella por ssh (sin contraseña, sin
#       preguntar nada) para leer su nombre; si no puede, no guarda nada, sale con 1,
#       muestra el error de ssh y explica qué revisar y cómo dejar la llave. La
#       configuración queda en ~/.config/claude-code-entorno/universal-control.conf
#       (DESTINO y NOMBRE).
#
#   ./universal-control.sh --al-iniciar
#       El modo que corre solo al iniciar sesión. Repite la revisión cada UC_INTERVALO
#       segundos (15 por omisión) hasta que esté listo o pasen UC_ESPERA segundos (300 por
#       omisión), para dar tiempo a que las dos Mac se unan. No imprime nada. Al terminar
#       guarda el reporte del último intento, con la fecha y hora en la primera línea, en
#       ~/Library/Logs/claude-code-entorno/universal-control.log (cada vez lo reemplaza).
#       Si quedó listo no avisa y sale con 0; si no, manda una sola notificación con la
#       causa y sale con 1. Sin configuración avisa «Falta configurar Universal Control»
#       y sale con 2, sin esperar.
#
#   ./universal-control.sh --instalar
#       Crea la tarea de inicio de sesión de macOS (launchd) que corre --al-iniciar cada vez
#       que entras: escribe ~/Library/LaunchAgents/com.claude-code-entorno.universal-control.plist
#       y la carga con launchctl. Los errores de la tarea van a
#       ~/Library/Logs/claude-code-entorno/universal-control.errores.log. Repetirlo da el
#       mismo resultado. Sin configuración dice cómo configurar y sale con 2.
#
#   ./universal-control.sh --quitar
#       Descarga la tarea de inicio de sesión y borra su plist. Sale con 0 aunque no
#       hubiera nada instalado.
#
# Opciones (sin ninguna se hace la revisión de arriba):
#   --estado [<sal>]      estado de esta Mac (ver arriba)
#   --configurar <dir>    guarda la otra Mac (ver arriba)
#   --al-iniciar          revisión al iniciar sesión, solo avisa si falla (ver arriba)
#   --instalar            crea la tarea de inicio de sesión (ver arriba)
#   --quitar              quita la tarea de inicio de sesión (ver arriba)
#   --ayuda               muestra esta ayuda
#
# Códigos de salida: 0 listo, 1 no listo, 2 falta configurar o el uso es incorrecto.
#
# Si un comando falta o falla, la clave sale como ? o vacía; nunca se aborta.
set -uo pipefail

CONF="$HOME/.config/claude-code-entorno/universal-control.conf"
REPORTE="$HOME/Library/Logs/claude-code-entorno/universal-control.log"
ETIQUETA="com.claude-code-entorno.universal-control"
PLIST="$HOME/Library/LaunchAgents/${ETIQUETA}.plist"
ERRORES_LOG="${REPORTE%/*}/universal-control.errores.log"
# Todo ssh va sin preguntar nada, sin esperar más de 5 segundos para conectar y sin quedarse
# colgado si la red se cae a media sesión (3 avisos sin respuesta, uno cada 5 segundos).
SSH_OPCIONES=(-o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=3)
# Sal de la huella de la cuenta (ver --estado). Vacía, la huella no lleva sal.
SAL=""

uso() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"; }
tiene() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Una función por clave: cada una imprime solo su valor.

# Huella del ID de la Cuenta de Apple (12 hex del sha256 de SAL y el ID). Nada si se leyó
# bien y no hay sesión; ? si no se pudo leer la carpeta de cuentas o falló shasum.
huella_cuenta() {
  local dsid="" archivo nombre huella ilegible=0
  local carpeta="$HOME/Library/Application Support/iCloud/Accounts"
  if [ -d "$carpeta" ] && { [ ! -r "$carpeta" ] || [ ! -x "$carpeta" ]; }; then
    ilegible=1
  else
    for archivo in "$carpeta"/*; do
      nombre="${archivo##*/}"
      case "$nombre" in
        ''|*[!0-9]*) continue ;;
      esac
      dsid="$nombre"
      break
    done
  fi
  if [ -z "$dsid" ]; then
    dsid="$(defaults read "$HOME/Library/Preferences/MobileMeAccounts" Accounts 2>/dev/null \
            | sed -n 's/^ *AccountDSID = "*\([0-9][0-9]*\)"*;.*/\1/p' | head -1)"
  fi
  if [ -z "$dsid" ]; then
    [ "$ilegible" = 0 ] || echo "?"
    return 0
  fi
  huella="$(printf %s "${SAL}${dsid}" | shasum -a 256 | cut -c1-12)" && [ -n "$huella" ] \
    || { echo "?"; return 0; }
  echo "$huella"
}

wifi() {
  local interfaz
  interfaz="$(networksetup -listallhardwareports 2>/dev/null \
              | awk '/Hardware Port: (Wi-Fi|AirPort)/ { getline; print $2; exit }')"
  if [ -z "$interfaz" ]; then echo "?"; return 0; fi
  case "$(networksetup -getairportpower "$interfaz" 2>/dev/null)" in
    *On) echo 1 ;;
    *Off) echo 0 ;;
    *) echo "?" ;;
  esac
}

bluetooth() {
  case "$(system_profiler SPBluetoothDataType 2>/dev/null | awk -F': ' '/State:/ { print $2; exit }')" in
    On) echo 1 ;;
    Off) echo 0 ;;
    *) echo "?" ;;
  esac
}

handoff() {
  local anuncia recibe
  anuncia="$(defaults -currentHost read com.apple.coreservices.useractivityd ActivityAdvertisingAllowed 2>/dev/null)"
  recibe="$(defaults -currentHost read com.apple.coreservices.useractivityd ActivityReceivingAllowed 2>/dev/null)"
  if [ "$anuncia" = "0" ] || [ "$recibe" = "0" ]; then echo 0; else echo 1; fi
}

# Cada clave cuenta como apagada si vale 1 por equipo (`-currentHost`, donde la guarda
# macOS 27) o en el dominio global (macOS anteriores). Si no está en ninguno, está encendida.
universal_control() {
  local clave
  for clave in Disable DisableMagicEdges DisableAutoConnect; do
    if [ "$(defaults -currentHost read com.apple.universalcontrol "$clave" 2>/dev/null)" = "1" ] \
      || [ "$(defaults read com.apple.universalcontrol "$clave" 2>/dev/null)" = "1" ]; then
      echo 0
      return 0
    fi
  done
  echo 1
}

# Solo cuenta el «Enabled» del primer nivel (4 espacios); los de los subdiccionarios no.
compartir_internet() {
  local nat
  nat="$(defaults read /Library/Preferences/SystemConfiguration/com.apple.nat NAT 2>/dev/null \
         | sed -n 's/^    Enabled = \([0-9]\);.*/\1/p' | head -1)"
  if pgrep -x InternetSharing >/dev/null 2>&1 || [ "$nat" = "1" ]; then echo 1; else echo 0; fi
}

# Si system_profiler falla da ?: solo un 0 explícito significa «sin monitor».
monitores() {
  local salida
  salida="$(system_profiler SPDisplaysDataType 2>/dev/null)" || { echo "?"; return 0; }
  printf '%s\n' "$salida" | grep -c "Resolution:"
}

# 1 o 0 solo si `id` respondió; si falla, ?.
admin() {
  local grupos
  grupos="$(id -Gn 2>/dev/null)" && [ -n "$grupos" ] || { echo "?"; return 0; }
  case " ${grupos} " in
    *" admin "*) echo 1 ;;
    *) echo 0 ;;
  esac
}

# Los registros de Universal Control del arranque actual (`--last boot`: los de antes de un
# reinicio traerían un círculo viejo), leídos en orden con una sola llamada a `log`. Imprime sesion, id, grupo y excluidos.
#   - "Login Status: 'x' -> 'y'" deja sesion=y.
#   - "IDS <ID>: ... Device Found" (también «Ineligible Device Found») anota <ID>.
#   - "Excluded the following unavailable devices: [..]" queda pendiente hasta el
#     siguiente "Selected circle: [..]", que fija grupo y excluidos y vacía lo pendiente.
#   - id es el primer ID de grupo que no apareció como dispositivo encontrado.
estado_registros() {
  log show --last boot --info --style compact \
    --predicate 'subsystem == "com.apple.universalcontrol" && (category IN {"CIRC","LOGN"} || eventMessage CONTAINS "Device Found")' \
    2>/dev/null | awk '
    function lista(texto, desde,    resto) {
      resto = substr(texto, index(texto, desde) + length(desde))
      sub(/\].*$/, "", resto)
      return resto
    }
    /Login Status: / && match($0, /-> \047[^\047]*\047/) {
      sesion = substr($0, RSTART + 4, RLENGTH - 5)
    }
    /Device Found/ && match($0, /IDS [^ :]+: /) {
      encontrados[substr($0, RSTART + 4, RLENGTH - 6)] = 1
    }
    /Excluded the following unavailable devices: \[/ {
      pendiente = lista($0, "unavailable devices: [")
    }
    /Selected circle: \[/ {
      grupo = lista($0, "Selected circle: [")
      excluidos = pendiente
      pendiente = ""
    }
    END {
      n = split(grupo, ids, ",")
      for (i = 1; i <= n; i++) {
        if (ids[i] != "" && !(ids[i] in encontrados)) { id = ids[i]; break }
      }
      print "sesion=" (sesion == "" ? "?" : sesion)
      print "id=" id
      print "grupo=" grupo
      print "excluidos=" excluidos
    }'
}

estado_local() {
  echo "nombre=$(scutil --get ComputerName 2>/dev/null)"
  echo "macos=$(sw_vers -productVersion 2>/dev/null)"
  echo "cuenta=$(huella_cuenta)"
  echo "wifi=$(wifi)"
  echo "bluetooth=$(bluetooth)"
  echo "handoff=$(handoff)"
  echo "universal_control=$(universal_control)"
  echo "compartir_internet=$(compartir_internet)"
  echo "monitores=$(monitores)"
  echo "admin=$(admin)"
  estado_registros
}

# Lee la configuración línea por línea (nunca con `source`) y deja DESTINO y NOMBRE.
# Devuelve 1 si falta el archivo, no trae DESTINO o la dirección no es válida (en ese caso
# DESTINO conserva lo guardado, para que quien llama pueda distinguirlo).
leer_conf() {
  local clave valor
  DESTINO=""
  NOMBRE=""
  [ -f "$CONF" ] || return 1
  while IFS='=' read -r clave valor || [ -n "$clave" ]; do
    case "$clave" in
      DESTINO) DESTINO="$valor" ;;
      NOMBRE) NOMBRE="$valor" ;;
    esac
  done < "$CONF"
  [ -n "$DESTINO" ] && direccion_valida "$DESTINO"
}

# Una dirección usuario@equipo: sin espacios ni saltos de línea (meterían líneas ajenas
# en el archivo) y sin guion al principio (ssh lo tomaría por una opción).
direccion_valida() {
  case "$1" in
    -*|*[[:space:]]*|@*|*@) return 1 ;;
    *@*) return 0 ;;
    *) return 1 ;;
  esac
}

# Guarda la otra Mac, pero solo si se puede entrar a ella sin contraseña.
configurar() {
  local destino="$1" nombre errores causa
  if ! direccion_valida "$destino"; then
    echo "La dirección «${destino}» no sirve: debe ser <usuario>@<mac>.local"
    uso
    return 2
  fi
  errores="$(mktemp "${TMPDIR:-/tmp}/universal-control.XXXXXX")" || return 1
  if ! nombre="$(ssh "${SSH_OPCIONES[@]}" "$destino" scutil --get ComputerName </dev/null 2>"$errores")"; then
    # Lo que ssh dijo de verdad (la última línea no vacía): host que no existe, Mac
    # apagada, tiempo agotado, llave rechazada...
    causa="$(awk 'NF { ultima = $0 } END { print ultima }' "$errores")"
    rm -f "$errores"
    echo "No pude entrar a ${destino} por ssh sin contraseña. No guardé nada."
    [ -z "$causa" ] || echo "    ${causa}"
    echo "Revisa que la otra Mac esté prendida, con Sesión remota, y que tu llave esté copiada:"
    echo "  1. ./conectar.sh ${destino}"
    echo "     (o, a mano: ssh-copy-id ${destino})"
    echo "  2. ./universal-control.sh --configurar ${destino}"
    return 1
  fi
  rm -f "$errores"
  nombre="$(printf '%s\n' "$nombre" | head -1)"
  mkdir -p "${CONF%/*}" || return 1
  printf 'DESTINO=%s\nNOMBRE=%s\n' "$destino" "$nombre" > "${CONF}.$$" \
    && mv "${CONF}.$$" "$CONF" || { rm -f "${CONF}.$$"; return 1; }
  echo "Guardé la otra Mac: ${nombre} (${destino})"
}

# ---------------------------------------------------------------------------
# Revisión a mano: pide el estado de las dos Mac y decide si están listas.

# Claves de --estado. Cada estado (L = esta Mac, R = la otra) se carga en variables
# L_<clave> / R_<clave>; L_hay_<clave> / R_hay_<clave> valen 1 si la clave llegó.
CLAVES_ESTADO="nombre macos cuenta wifi bluetooth handoff universal_control compartir_internet monitores admin sesion id grupo excluidos"

# cargar_estado <L|R> <archivo>: lee clave=valor línea por línea (sin source ni eval) y
# ignora lo que no sea una clave conocida.
cargar_estado() {
  local prefijo="$1" archivo="$2" clave valor
  for clave in $CLAVES_ESTADO; do
    printf -v "${prefijo}_${clave}" %s ""
    printf -v "${prefijo}_hay_${clave}" %s ""
  done
  while IFS='=' read -r clave valor || [ -n "$clave" ]; do
    case " ${CLAVES_ESTADO} " in
      *" ${clave} "*)
        printf -v "${prefijo}_${clave}" %s "$valor"
        printf -v "${prefijo}_hay_${clave}" %s 1 ;;
    esac
  done < "$archivo"
}

# valor <L|R> <clave> / hay <L|R> <clave>: el valor de una clave y si llegó.
valor() { local variable="${1}_${2}"; printf %s "${!variable}"; }
hay() { local variable="${1}_hay_${2}"; [ -n "${!variable}" ]; }

# El grupo como conjunto: IDs únicos, ordenados, cada uno seguido de coma.
conjunto() { printf '%s\n' "$1" | tr ',' '\n' | sed '/^$/d' | LC_ALL=C sort -u | tr '\n' ','; }

# Las dos Mac están unidas. Con el ID de cada una (id), basta con que el último grupo de cada
# una contenga el ID de la otra: una Mac puede ver además un iPad y tener un grupo mayor.
# Si falta algún ID (o son el mismo), los grupos tienen que ser iguales, con al menos dos IDs.
grupos_unidos() {
  local a b sin_comas
  a="$(conjunto "$L_grupo")"
  b="$(conjunto "$R_grupo")"
  [ -n "$a" ] && [ -n "$b" ] || return 1
  if [ -n "$L_id" ] && [ -n "$R_id" ] && [ "$L_id" != "$R_id" ]; then
    case ",${a}" in *",${R_id},"*) ;; *) return 1 ;; esac
    case ",${b}" in *",${L_id},"*) ;; *) return 1 ;; esac
    return 0
  fi
  [ "$a" = "$b" ] || return 1
  sin_comas="${a//,/}"
  [ $(( ${#a} - ${#sin_comas} )) -ge 2 ]
}

# Cómo llamar a cada Mac en los mensajes.
nombre_de() {
  if [ "$1" = "L" ]; then
    printf %s "${L_nombre:-esta Mac}"
  else
    printf %s "${R_nombre:-${NOMBRE:-${DESTINO#*@}}}"
  fi
}

# Decide si están listas y, si no, la causa. Usa L_*, R_*, SSH_CODIGO y SSH_LLAVE; deja LISTO
# y CAUSA.
# Las claves ausentes o con ? no disparan causas específicas: solo los valores explícitos.
evaluar() {
  local mac nombre otro usuario clave etiqueta
  LISTO=0
  CAUSA=""
  if [ "$SSH_CODIGO" = "255" ]; then
    if [ "$SSH_LLAVE" = "1" ]; then
      CAUSA="$(nombre_de R) no aceptó la llave SSH: corre ./conectar.sh ${DESTINO}"
    else
      CAUSA="$(nombre_de R) no responde: ¿está prendida y con sesión iniciada?"
    fi
    return 0
  fi
  # Mandan los registros: si dicen que están unidas, un administrador en 0 es solo una línea ⚠️.
  if grupos_unidos; then
    LISTO=1
    return 0
  fi
  # Solo un 0 explícito: si `id` falló (?) o no llegó, no se sabe.
  for mac in L R; do
    if [ "$(valor "$mac" admin)" = "0" ]; then
      if [ "$mac" = "L" ]; then usuario="${USER:-$(id -un)}"; else usuario="${DESTINO%@*}"; fi
      CAUSA="No puedo leer los registros de $(nombre_de "$mac"): el usuario ${usuario} tiene que ser administrador"
      return 0
    fi
  done
  # 4.1: cuenta vacía.
  for mac in L R; do
    if hay "$mac" cuenta && [ -z "$(valor "$mac" cuenta)" ]; then
      CAUSA="$(nombre_de "$mac") no tiene sesión iniciada en una cuenta de Apple"
      return 0
    fi
  done
  # 4.2: cuentas distintas.
  # (un ? es que no se pudo leer: no se compara.)
  if [ -n "$L_cuenta" ] && [ -n "$R_cuenta" ] && [ "$L_cuenta" != "?" ] && [ "$R_cuenta" != "?" ] \
     && [ "$L_cuenta" != "$R_cuenta" ]; then
    CAUSA="Las dos Mac tienen cuentas de Apple distintas"
    return 0
  fi
  # 4.3: versiones distintas (solo si las dos la trajeron).
  if [ -n "$L_macos" ] && [ -n "$R_macos" ] && [ "$L_macos" != "$R_macos" ]; then
    CAUSA="Versiones distintas: ${L_macos} en $(nombre_de L), ${R_macos} en $(nombre_de R). Actualiza la que va atrás"
    return 0
  fi
  # 4.4: Compartir Internet.
  for mac in L R; do
    if [ "$(valor "$mac" compartir_internet)" = "1" ]; then
      CAUSA="Apaga Compartir Internet en $(nombre_de "$mac")"
      return 0
    fi
  done
  # 4.5: ajustes apagados (cada Mac, en el orden de la tabla).
  for mac in L R; do
    for clave in wifi bluetooth handoff universal_control; do
      if [ "$(valor "$mac" "$clave")" = "0" ]; then
        case "$clave" in
          wifi) etiqueta="Wi-Fi" ;;
          bluetooth) etiqueta="Bluetooth" ;;
          handoff) etiqueta="Handoff" ;;
          *) etiqueta="Universal Control" ;;
        esac
        CAUSA="Enciende ${etiqueta} en $(nombre_de "$mac")"
        return 0
      fi
    done
  done
  # 4.6: sin monitor.
  for mac in L R; do
    if [ "$(valor "$mac" monitores)" = "0" ]; then
      CAUSA="$(nombre_de "$mac") no tiene monitor"
      return 0
    fi
  done
  # 4.7: la sesión de la otra Mac.
  if hay R sesion && [ "$R_sesion" != "unlocked" ] && [ "$R_sesion" != "?" ]; then
    CAUSA="Inicia sesión en $(nombre_de R)"
    return 0
  fi
  # 4.8: una Mac excluyó a la otra.
  nombre="$(nombre_de L)"
  otro="$(nombre_de R)"
  if [ -n "$L_id" ]; then
    case ",${R_excluidos}," in
      *",${L_id},"*)
        CAUSA="${otro} no ve a ${nombre} por Bluetooth: reinicia ${nombre}"
        return 0 ;;
    esac
  fi
  if [ -n "$R_id" ]; then
    case ",${L_excluidos}," in
      *",${R_id},"*)
        CAUSA="${nombre} no ve a ${otro} por Bluetooth: reinicia ${otro}"
        return 0 ;;
    esac
  fi
  # 4.9
  CAUSA="Las Mac no se unieron: reinicia las dos"
}

# chequeo <Mac> <valor> <bueno> <qué> <si está bien> <si está mal>: una línea del reporte.
# Un fallo es ❌ (o ⚠️ si ya está listo); lo que no se pudo leer es ⚠️.
chequeo() {
  local nombre="$1" actual="$2" bueno="$3"
  case "$actual" in
    "$bueno") echo "✅ ${nombre}: $4 $5" ;;
    ''|'?') echo "⚠️ ${nombre}: no se pudo leer $4" ;;
    *) echo "${MARCA_MAL} ${nombre}: $4 $6" ;;
  esac
}

# El reporte: una línea por revisión y por Mac. Nunca imprime la huella de la cuenta.
reporte() {
  local mac nombre monitores
  MARCA_MAL="❌"
  [ "$LISTO" = 1 ] && MARCA_MAL="⚠️"
  if [ "$SSH_CODIGO" = "255" ]; then
    if [ "$SSH_LLAVE" = "1" ]; then
      echo "❌ $(nombre_de R): no aceptó la llave SSH"
    else
      echo "❌ $(nombre_de R): no responde"
    fi
    [ -z "$SSH_ERROR" ] || echo "    ${SSH_ERROR}"
  else
    for mac in L R; do
      nombre="$(nombre_de "$mac")"
      chequeo "$nombre" "$(valor "$mac" admin)" 1 "usuario" "administrador" "sin ser administrador"
      chequeo "$nombre" "$(valor "$mac" wifi)" 1 "Wi-Fi" "encendido" "apagado"
      chequeo "$nombre" "$(valor "$mac" bluetooth)" 1 "Bluetooth" "encendido" "apagado"
      chequeo "$nombre" "$(valor "$mac" handoff)" 1 "Handoff" "activado" "desactivado"
      chequeo "$nombre" "$(valor "$mac" universal_control)" 1 "Universal Control" "activado" "desactivado"
      chequeo "$nombre" "$(valor "$mac" compartir_internet)" 0 "Compartir Internet" "apagado" "encendido"
      monitores="$(valor "$mac" monitores)"
      case "$monitores" in
        ''|*[!0-9]*) ;;
        0) ;;
        *) monitores=1 ;;
      esac
      chequeo "$nombre" "$monitores" 1 "monitor" "conectado" "no conectado"
      if hay "$mac" cuenta && [ -z "$(valor "$mac" cuenta)" ]; then
        echo "${MARCA_MAL} ${nombre}: sin cuenta de Apple"
      elif [ "$(valor "$mac" cuenta)" = "?" ]; then
        echo "⚠️ ${nombre}: no se pudo leer la cuenta de Apple"
      fi
    done
    chequeo "$(nombre_de R)" "$R_sesion" unlocked "sesión" "iniciada" "sin iniciar"
    if [ -n "$L_cuenta" ] && [ -n "$R_cuenta" ] && [ "$L_cuenta" != "?" ] && [ "$R_cuenta" != "?" ]; then
      if [ "$L_cuenta" = "$R_cuenta" ]; then
        echo "✅ Las dos Mac: misma cuenta de Apple"
      else
        echo "${MARCA_MAL} Las dos Mac: cuentas distintas"
      fi
    fi
    if [ -n "$L_macos" ] && [ -n "$R_macos" ]; then
      if [ "$L_macos" = "$R_macos" ]; then
        echo "✅ Las dos Mac: misma versión de macOS (${L_macos})"
      else
        echo "${MARCA_MAL} Las dos Mac: versiones distintas (${L_macos} y ${R_macos})"
      fi
    fi
    if grupos_unidos; then
      echo "✅ Las dos Mac: Universal Control las unió en un grupo"
    else
      echo "❌ Las dos Mac: Universal Control no las unió en un grupo"
    fi
  fi
  if [ "$LISTO" = 1 ]; then
    echo "Universal Control listo."
  else
    echo "No quedó: ${CAUSA}"
  fi
}

# Ruta absoluta de este script. Siempre se calcula: ninguna SCRIPT del entorno cuenta.
ruta_script() {
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
}

# Una revisión completa de las dos Mac. Imprime el reporte y deja LISTO (1 o 0) y CAUSA.
# Devuelve 0 si está listo y 1 si no. Necesita DESTINO y NOMBRE (leer_conf).
# Cada vuelta empieza limpia: nunca queda a medias el resultado de la anterior.
revisar_una_vez() {
  local local_archivo remoto_archivo errores_archivo
  LISTO=0
  CAUSA=""
  SSH_CODIGO=""
  SSH_ERROR=""
  SSH_LLAVE=0
  SCRIPT="$(ruta_script)"
  TEMPORAL="$(mktemp -d "${TMPDIR:-/tmp}/universal-control.XXXXXX")" || TEMPORAL=""
  if [ -z "$TEMPORAL" ]; then
    CAUSA="No pude crear archivos temporales"
    echo "No quedó: ${CAUSA}"
    return 1
  fi
  trap 'rm -rf "$TEMPORAL"' EXIT
  local_archivo="${TEMPORAL}/local"
  remoto_archivo="${TEMPORAL}/remoto"
  errores_archivo="${TEMPORAL}/errores"
  # La sal de esta corrida, la misma para las dos Mac: sin ella, 12 hex del sha256 de un ID
  # de unos 10 dígitos se podrían revertir por fuerza bruta.
  SAL="$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
  [ -n "$SAL" ] || SAL="${RANDOM}${RANDOM}${RANDOM}"
  estado_local > "$local_archivo" 2>/dev/null
  # ssh sale con 255 si no pudo conectar; con otro código se usa lo que haya llegado.
  ssh "${SSH_OPCIONES[@]}" "$DESTINO" "bash -s -- --estado ${SAL}" < "$SCRIPT" > "$remoto_archivo" \
    2> "$errores_archivo"
  SSH_CODIGO=$?
  SAL=""
  # Lo que ssh dijo (la última línea no vacía, sin caracteres de control: pudo venir de la otra
  # Mac) va al reporte. 255 también es una llave rechazada, que no es lo mismo que «no responde».
  SSH_ERROR="$(awk 'NF { ultima = $0 } END { print ultima }' "$errores_archivo" 2>/dev/null \
               | LC_ALL=C tr -d '\000-\037\177')"
  if grep -Eq 'Permission denied|Host key verification failed' "$errores_archivo" 2>/dev/null; then
    SSH_LLAVE=1
  fi
  cargar_estado L "$local_archivo"
  cargar_estado R "$remoto_archivo"
  rm -rf "$TEMPORAL"
  evaluar
  reporte
  [ "$LISTO" = 1 ]
}

# Manda una notificación de macOS. El texto va solo como argumento, nunca dentro del
# programa de osascript: así las comillas, tildes y eñes no pueden romperlo. Va después de
# `--` porque osascript toma como opción propia (-e ...) un argumento que empiece con «-», y
# varias causas empiezan con el nombre de la otra Mac, que viene de ella misma.
notificar() {
  osascript -e 'on run argv' \
    -e 'display notification (item 1 of argv) with title "Universal Control"' \
    -e 'end run' -- "$1" >/dev/null 2>&1
}

# Imprime el primer argumento si es un entero >= 0; si no, el segundo.
numero_o() {
  case "$1" in
    ''|*[!0-9]*) echo "$2" ;;
    *) echo "$((10#$1))" ;;
  esac
}

# El modo de inicio de sesión (ver la ayuda). Sale con 0, 1 o 2.
al_iniciar() {
  local espera intervalo inicio transcurrido pausa parcial carpeta
  espera="$(numero_o "${UC_ESPERA:-}" 300)"
  intervalo="$(numero_o "${UC_INTERVALO:-}" 15)"
  [ "$intervalo" -ge 1 ] || intervalo=1
  if ! leer_conf; then
    notificar "Falta configurar Universal Control: corre ./universal-control.sh --configurar"
    return 2
  fi
  # El reporte de cada intento se escribe aparte y solo el último pasa a su lugar. Si no
  # se puede escribir, la revisión sigue igual: lo único que se pierde es el archivo.
  carpeta="${REPORTE%/*}"
  parcial="${REPORTE}.nuevo"
  if ! { mkdir -p "$carpeta" && : > "$parcial"; } 2>/dev/null; then
    parcial=/dev/null
  fi
  inicio=$SECONDS
  while :; do
    { date "+%Y-%m-%d %H:%M:%S"; revisar_una_vez; } > "$parcial"
    [ "$LISTO" = 1 ] && break
    transcurrido=$((SECONDS - inicio))
    [ "$transcurrido" -lt "$espera" ] || break
    pausa=$((espera - transcurrido))
    [ "$pausa" -le "$intervalo" ] || pausa=$intervalo
    sleep "$pausa"
  done
  if [ "$parcial" != /dev/null ]; then
    mv -f "$parcial" "$REPORTE" 2>/dev/null || rm -f "$parcial"
  fi
  [ "$LISTO" = 1 ] && return 0
  notificar "$CAUSA"
  return 1
}

# Escapa lo que no puede ir tal cual dentro de un texto XML.
escapar_xml() {
  printf %s "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' \
                       -e 's/"/\&quot;/g' -e "s/'/\\&apos;/g"
}

# Escribe el plist de la tarea de inicio de sesión en el archivo $1.
escribir_plist() {
  local archivo="$1" ruta errores
  ruta="$(escapar_xml "$(ruta_script)")"
  errores="$(escapar_xml "$ERRORES_LOG")"
  printf '%s\n' \
    '<?xml version="1.0" encoding="UTF-8"?>' \
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
    '<plist version="1.0">' \
    '<dict>' \
    '  <key>Label</key>' \
    "  <string>${ETIQUETA}</string>" \
    '  <key>ProgramArguments</key>' \
    '  <array>' \
    '    <string>/bin/bash</string>' \
    "    <string>${ruta}</string>" \
    '    <string>--al-iniciar</string>' \
    '  </array>' \
    '  <key>RunAtLoad</key>' \
    '  <true/>' \
    '  <key>EnvironmentVariables</key>' \
    '  <dict>' \
    '    <key>PATH</key>' \
    '    <string>/usr/bin:/bin:/usr/sbin:/sbin</string>' \
    '  </dict>' \
    '  <key>StandardErrorPath</key>' \
    "  <string>${errores}</string>" \
    '</dict>' \
    '</plist>' > "$archivo"
}

# Crea la tarea de inicio de sesión: escribe el plist, lo valida y lo carga.
instalar() {
  local uid temporal lint carga
  if ! leer_conf; then
    echo "Falta configurar: ./universal-control.sh --configurar <usuario>@<mac>.local"
    return 2
  fi
  uid="$(id -u 2>/dev/null)"
  if [ -z "$uid" ]; then
    echo "No pude saber tu número de usuario (id -u). No instalé nada."
    return 1
  fi
  if ! mkdir -p "${PLIST%/*}" "${ERRORES_LOG%/*}"; then
    echo "No pude crear las carpetas de la tarea. No instalé nada."
    return 1
  fi
  temporal="${PLIST}.$$"
  if ! escribir_plist "$temporal"; then
    rm -f "$temporal"
    echo "No pude escribir ${PLIST}. No instalé nada."
    return 1
  fi
  if tiene plutil && ! lint="$(plutil -lint "$temporal" 2>&1)"; then
    rm -f "$temporal"
    echo "El plist quedó mal y no lo cargué:"
    echo "    ${lint}"
    return 1
  fi
  if ! mv -f "$temporal" "$PLIST"; then
    rm -f "$temporal"
    echo "No pude guardar ${PLIST}. No instalé nada."
    return 1
  fi
  # Si ya estaba cargada se descarga primero (puede fallar si no lo estaba: no importa).
  launchctl bootout "gui/${uid}/${ETIQUETA}" >/dev/null 2>&1
  if ! carga="$(launchctl bootstrap "gui/${uid}" "$PLIST" 2>&1)"; then
    echo "No pude cargar la tarea con launchctl:"
    echo "    ${carga}"
    return 1
  fi
  echo "Instalé la tarea de inicio de sesión: ${PLIST}"
  echo "Va a revisar Universal Control cada vez que entres."
}

# Quita la tarea de inicio de sesión. Sale con 0 aunque no hubiera nada.
quitar() {
  local uid
  uid="$(id -u 2>/dev/null)"
  if [ -n "$uid" ]; then
    launchctl bootout "gui/${uid}/${ETIQUETA}" >/dev/null 2>&1
  fi
  rm -f "$PLIST"
  echo "Quité la tarea de inicio de sesión."
}

MODO=""
ARGUMENTO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --estado)
      MODO="estado"
      # Una sal opcional: cualquier cosa que no empiece con «-».
      case "${2:-}" in
        ''|-*) ;;
        *) SAL="$2"; shift ;;
      esac ;;
    --al-iniciar) MODO="al_iniciar" ;;
    --instalar) MODO="instalar" ;;
    --quitar) MODO="quitar" ;;
    --configurar)
      MODO="configurar"
      if [ $# -lt 2 ]; then echo "Falta la dirección: --configurar <usuario>@<mac>.local"; uso; exit 2; fi
      ARGUMENTO="$2"
      shift ;;
    --ayuda|-h|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $1"; uso; exit 2 ;;
  esac
  shift
done

case "$MODO" in
  estado) estado_local; exit 0 ;;
  configurar) configurar "$ARGUMENTO"; exit $? ;;
  al_iniciar) al_iniciar; exit $? ;;
  instalar) instalar; exit $? ;;
  quitar) quitar; exit 0 ;;
  *)
    if ! leer_conf; then
      if [ -n "$DESTINO" ]; then
        echo "La dirección guardada no es válida: corre ./universal-control.sh --configurar <usuario>@<mac>.local"
      else
        echo "Falta configurar: ./universal-control.sh --configurar <usuario>@<mac>.local"
      fi
      exit 2
    fi
    revisar_una_vez
    exit $? ;;
esac

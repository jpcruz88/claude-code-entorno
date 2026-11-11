#!/bin/sh
# Abre herdr, pero antes espera a los discos externos que usa la sesión guardada.
#
# Uso: esperar-discos.sh <ruta de herdr> [argumentos de herdr…]
#
# Al iniciar sesión, la terminal puede abrirse antes de que un disco externo termine
# de montarse. herdr restaura entonces sus pestañas, no encuentra las carpetas, las
# marca con «Saved directory is unavailable» y no lo vuelve a intentar.
#
# Variables:
#   HERDR_ESPERA_DISCOS  segundos máximos de espera (120; 0 no espera)
#   HERDR_RAIZ_DISCOS    carpeta donde se montan los discos (/Volumes)

herdr="$1"
[ -n "$herdr" ] || { echo "uso: esperar-discos.sh <ruta de herdr> [argumentos]" >&2; exit 2; }
shift

espera="${HERDR_ESPERA_DISCOS:-120}"
raiz="${HERDR_RAIZ_DISCOS:-/Volumes}"
sesion="${XDG_CONFIG_HOME:-$HOME/.config}/herdr/session.json"

# Discos de la sesión guardada que todavía no están montados, uno por línea.
faltantes() {
  [ -f "$sesion" ] || return 0
  grep -o '"cwd": *"[^"]*"' "$sesion" 2>/dev/null | sed 's/^"cwd": *"//; s/"$//' |
    while IFS= read -r carpeta; do
      case "$carpeta" in
        "$raiz"/*) resto="${carpeta#"$raiz"/}"; echo "${resto%%/*}" ;;
      esac
    done | sort -u |
    while IFS= read -r disco; do
      [ -n "$disco" ] && [ ! -d "$raiz/$disco" ] && echo "$disco"
    done
  return 0
}

en_linea() { printf '%s' "$1" | tr '\n' ',' | sed 's/,/, /g'; }

faltan="$(faltantes)"
case "$espera" in ''|*[!0-9]*) espera=120 ;; esac

# Con el servidor ya abierto las pestañas ya se restauraron: esperar no cambia nada.
if [ -n "$faltan" ] && [ "$espera" -gt 0 ] &&
   ! "$herdr" status server 2>/dev/null | grep -q 'status: running'; then
  echo "Esperando el disco externo: $(en_linea "$faltan") (hasta $espera s; Ctrl+C para no esperar)"
  seguir=1
  trap 'seguir=0' INT
  paso=0
  while [ "$seguir" = 1 ] && [ -n "$faltan" ] && [ "$paso" -lt "$espera" ]; do
    sleep 1
    paso=$((paso + 1))
    faltan="$(faltantes)"
  done
  trap - INT
  if [ -n "$faltan" ]; then
    echo "No apareció: $(en_linea "$faltan"). Sus pestañas quedarán sin carpeta."
    sleep 2
  fi
fi

exec "$herdr" "$@"

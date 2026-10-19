#!/usr/bin/env bash
# Conecta el herdr de esta Mac con el de otra, por SSH: ves y usas los agentes de
# la otra Mac desde aquí, y siguen trabajando allá aunque cierres esta.
#
#   ./conectar.sh
#       En la Mac A LA QUE te vas a conectar: dice su dirección y si acepta
#       conexiones. No cambia nada.
#   ./conectar.sh <usuario>@<otra-mac>.local
#       En la Mac DESDE la que trabajas: crea tu llave SSH, la copia a la otra Mac
#       (pide su contraseña una vez) y agrega la otra Mac a herdr.
#
# Opciones:
#   --nombre "<nombre>"   cómo se llama la otra Mac en herdr (por omisión, su nombre
#                         en Ajustes del Sistema)
#   --ayuda               muestra esta ayuda
#
# Puedes correrlo las veces que quieras: lo que ya está hecho se salta.
set -uo pipefail

uso() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"; }
paso()  { printf '\n==> %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
aviso() { printf '    AVISO: %s\n' "$*"; }
tiene() { command -v "$1" >/dev/null 2>&1; }

DESTINO=""
NOMBRE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --nombre) NOMBRE="${2:-}"; shift ;;
    --ayuda|-h|--help) uso; exit 0 ;;
    -*) echo "Opción desconocida: $1"; uso; exit 2 ;;
    *) DESTINO="$1" ;;
  esac
  shift
done

USUARIO="${USER:-$(id -un)}"
if tiene scutil; then
  NOMBRE_EQUIPO="$(scutil --get ComputerName 2>/dev/null)"
  DIRECCION="$USUARIO@$(scutil --get LocalHostName 2>/dev/null).local"
else
  NOMBRE_EQUIPO="$(hostname)"
  DIRECCION="$USUARIO@$(hostname)"
fi

# ---------------------------------------------------------------------------
# Sin destino: estás en la Mac a la que te vas a conectar. Solo mira, no cambia nada.
if [ -z "$DESTINO" ]; then
  paso "Esta Mac"
  info "Nombre:    $NOMBRE_EQUIPO"
  info "Dirección: $DIRECCION"

  paso "¿Acepta conexiones?"
  if nc -z 127.0.0.1 22 >/dev/null 2>&1; then
    info "Sí: «Inicio de sesión remoto» está activado."
  else
    aviso "No. Actívalo en Ajustes del Sistema → General → Compartir → «Inicio de sesión remoto»."
    info "Después vuelve a correr ./conectar.sh para comprobarlo."
  fi

  paso "Para conectarte a esta Mac"
  info "En la Mac desde la que vas a trabajar, en la carpeta de este repo, corre:"
  info "./conectar.sh $DIRECCION"

  if tiene herdr; then
    paso "Macs que esta ya puede abrir en herdr"
    herdr machine list 2>&1 | sed 's/^/    /'
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Con destino: estás en la Mac desde la que vas a trabajar.
if ! tiene herdr; then
  echo "ERROR: falta herdr en esta Mac. Instálalo primero con ./instalar.sh"
  exit 1
fi

no_llega() {
  aviso "No pude entrar a $DESTINO. Revisa:"
  info "- Que la otra Mac esté encendida y en tu misma red (desde fuera de casa, hace falta una VPN)."
  info "- Que tenga «Inicio de sesión remoto» activado: corre ./conectar.sh allá y te lo dice."
  info "- Que la dirección esté bien escrita: ./conectar.sh allá te muestra la exacta."
  exit 1
}
# Entra sin pedir nada. accept-new guarda la huella de la otra Mac la primera vez.
entra() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$DESTINO" "$@"
}

paso "1. Tu llave SSH"
LLAVE="$HOME/.ssh/id_ed25519"
if [ -f "$LLAVE.pub" ]; then
  info "al día: $LLAVE.pub"
else
  # Sin contraseña, para que herdr se reconecte solo; la protege FileVault.
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  ssh-keygen -q -t ed25519 -N "" -C "$DIRECCION" -f "$LLAVE" || { aviso "ssh-keygen falló"; exit 1; }
  info "Creada: $LLAVE.pub"
fi

paso "2. Entrar a $DESTINO sin contraseña"
if entra true >/dev/null 2>&1; then
  info "al día: ya entra sin contraseña."
else
  info "Copio tu llave a $DESTINO. Te pide la contraseña de esa Mac (la de iniciar sesión), solo esta vez."
  ssh-copy-id -i "$LLAVE.pub" "$DESTINO" || no_llega
  entra true >/dev/null 2>&1 || no_llega
  info "Listo: ya entra sin contraseña."
fi

paso "3. Agregarla a herdr"
if herdr machine list --json 2>/dev/null | grep -qF "\"$DESTINO\""; then
  info "al día: $DESTINO ya está en herdr."
else
  if [ -z "$NOMBRE" ]; then
    NOMBRE="$(entra 'scutil --get ComputerName 2>/dev/null || hostname' 2>/dev/null)"
    [ -n "$NOMBRE" ] || NOMBRE="${DESTINO#*@}"
  fi
  # Si allá falta herdr o tiene otra versión, herdr pregunta antes de instalarlo.
  herdr machine add "$DESTINO" --label "$NOMBRE" || { aviso "herdr machine add falló"; exit 1; }
fi

paso "Listo"
info "En herdr, los espacios y agentes de la otra Mac aparecen junto a los de «Local»."
info "Siguen corriendo allá aunque cierres esta Mac o se corte la conexión."
info "Para abrir solo la otra Mac en esta terminal: herdr --remote $DESTINO"

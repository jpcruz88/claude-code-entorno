#!/usr/bin/env bash
# Conecta el herdr de esta Mac con el de otra, por SSH: ves y usas los agentes de
# la otra Mac desde aquí, y siguen trabajando allá aunque cierres esta.
#
#   ./conectar.sh
#       Asistente: eliges si esta Mac va a controlar otra (y cuál, de una lista
#       de las Macs de tu red), si otra va a controlar esta, o quitar una.
#   ./conectar.sh <usuario>@<otra-mac>.local
#       Sin preguntas: esta Mac pasa a controlar esa. Crea tu llave SSH, la copia
#       a la otra Mac (pide su contraseña una vez) y agrega la otra Mac a herdr.
#
# Opciones:
#   --nombre "<nombre>"   cómo se llama la otra Mac en herdr (por omisión, su nombre
#                         en Ajustes del Sistema)
#   --asistente           abre el asistente aunque la entrada no sea una terminal
#   --ayuda               muestra esta ayuda
#
# Sin terminal (un agente, un script), ./conectar.sh sin nada solo muestra la
# dirección de esta Mac y no cambia nada. Puedes correrlo las veces que quieras:
# lo que ya está hecho se salta.
set -uo pipefail

uso() { awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"; }
paso()  { printf '\n==> %s\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
aviso() { printf '    AVISO: %s\n' "$*"; }
tiene() { command -v "$1" >/dev/null 2>&1; }
# Muestra la pregunta y deja la respuesta en RESPUESTA (vacía si no hay más entrada).
preguntar() {
  printf '    %s ' "$1"
  RESPUESTA=""
  IFS= read -r RESPUESTA || true
  [ -t 0 ] || echo
}

DESTINO=""
NOMBRE=""
ASISTENTE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --nombre) NOMBRE="${2:-}"; shift ;;
    --asistente) ASISTENTE=1 ;;
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

requiere_herdr() {
  tiene herdr && return 0
  echo "ERROR: falta herdr en esta Mac. Instálalo primero con ./instalar.sh"
  exit 1
}

# ---------------------------------------------------------------------------
# Para que otra Mac controle esta: solo mira, no cambia nada.
esta_mac() {
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

  paso "Para controlar esta Mac desde otra"
  info "En la otra Mac, en la carpeta de este repo, corre ./conectar.sh y elige 1:"
  info "esta Mac sale en la lista. O directo, sin preguntas:"
  info "./conectar.sh $DIRECCION"

  if tiene herdr; then
    paso "Macs que esta ya controla"
    herdr machine list 2>&1 | sed 's/^/    /'
  fi
}

# ---------------------------------------------------------------------------
# Esta Mac pasa a controlar DESTINO.
conectar() {
  requiere_herdr

  no_llega() {
    aviso "No pude entrar a $DESTINO. Revisa:"
    info "- Que la otra Mac esté encendida y en tu misma red (desde fuera de casa, hace falta una VPN)."
    info "- Que tenga «Inicio de sesión remoto» activado: corre ./conectar.sh allá, elige 2 y te lo dice."
    info "- Que la dirección esté bien escrita: ./conectar.sh allá (opción 2) te muestra la exacta."
    exit 1
  }
  # Entra sin pedir nada. accept-new guarda la huella de la otra Mac la primera vez.
  entra() {
    ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$DESTINO" "$@"
  }

  paso "1. Tu llave SSH"
  local llave="$HOME/.ssh/id_ed25519"
  if [ -f "$llave.pub" ]; then
    info "al día: $llave.pub"
  else
    # Sin contraseña, para que herdr se reconecte solo; la protege FileVault.
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -q -t ed25519 -N "" -C "$DIRECCION" -f "$llave" || { aviso "ssh-keygen falló"; exit 1; }
    info "Creada: $llave.pub"
  fi

  paso "2. Entrar a $DESTINO sin contraseña"
  if entra true >/dev/null 2>&1; then
    info "al día: ya entra sin contraseña."
  else
    info "Copio tu llave a $DESTINO. Te pide la contraseña de esa Mac (la de iniciar sesión), solo esta vez."
    ssh-copy-id -i "$llave.pub" "$DESTINO" || no_llega
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
}

# ---------------------------------------------------------------------------
# Asistente

# Macs de la red que anuncian SSH por Bonjour (las que tienen «Inicio de sesión
# remoto»), menos esta. Una por línea: <dirección>\t<nombre>.
buscar_macs() {
  tiene dns-sd || return 0
  # dns-sd no termina solo: perl lo lee 3 segundos y lo cierra (sin ruido de bash).
  perl -e 'my $s = shift; my $p = open(my $f, "-|", @ARGV) or exit 0;
           $SIG{ALRM} = sub { kill "TERM", $p; exit 0 }; alarm $s; print while <$f>' \
       3 dns-sd -Z _ssh._tcp local 2>/dev/null \
    | awk '$2 == "SRV" { n = $1; sub(/\._ssh\._tcp$/, "", n); h = $6; sub(/\.$/, "", h); print h "\t" n }' \
    | perl -pe 's/\\(\d{3})/chr($1)/ge; s/\\(.)/$1/g' \
    | awk -F'\t' -v propia="${DIRECCION#*@}" 'tolower($1) != tolower(propia) && !visto[$1]++'
}

# Deja en DESTINO <usuario>@<dirección>; si falta el usuario, lo pregunta.
destino_con_usuario() {
  case "$1" in
    *@*) DESTINO="$1" ;;
    *) preguntar "Usuario en esa Mac (Enter = $USUARIO; lo muestra ./conectar.sh allá, opción 2):"
       DESTINO="${RESPUESTA:-$USUARIO}@$1" ;;
  esac
}

elegir_destino() {
  paso "Macs de tu red que aceptan conexiones"
  info "Buscando…"
  local direcciones=() nombres=() d n i
  while IFS=$'\t' read -r d n; do direcciones+=("$d"); nombres+=("$n"); done < <(buscar_macs)

  if [ ${#direcciones[@]} = 0 ]; then
    aviso "No encontré ninguna."
    info "En la Mac que quieres controlar, corre ./conectar.sh y elige 2: te dice cómo"
    info "activar «Inicio de sesión remoto». Después vuelve a correr ./conectar.sh aquí."
    preguntar "O escribe su dirección (<nombre-de-la-mac>.local; Enter para salir):"
    [ -n "$RESPUESTA" ] || return 1
    destino_con_usuario "$RESPUESTA"
    return 0
  fi

  for i in "${!direcciones[@]}"; do info "$((i + 1))) ${nombres[$i]} (${direcciones[$i]})"; done
  info "m) Escribir la dirección a mano"
  preguntar "¿Cuál quieres controlar desde esta Mac? (Enter para salir):"
  case "$RESPUESTA" in
    "") return 1 ;;
    m|M)
      preguntar "Dirección (<nombre-de-la-mac>.local):"
      [ -n "$RESPUESTA" ] || return 1
      destino_con_usuario "$RESPUESTA" ;;
    *)
      if [[ "$RESPUESTA" =~ ^[0-9]+$ ]] && [ "$RESPUESTA" -ge 1 ] && [ "$RESPUESTA" -le ${#direcciones[@]} ]; then
        i=$((RESPUESTA - 1))
        [ -n "$NOMBRE" ] || NOMBRE="${nombres[$i]}"
        destino_con_usuario "${direcciones[$i]}"
      else
        aviso "No entendí «${RESPUESTA}»."
        return 1
      fi ;;
  esac
}

confirmar() {
  paso "Resumen"
  info "Desde:           esta Mac («${NOMBRE_EQUIPO}»)"
  info "Vas a controlar: «${NOMBRE:-${DESTINO#*@}}» ($DESTINO)"
  preguntar "¿Seguir? (S/n):"
  case "$RESPUESTA" in
    ""|s|S|si|sí|Si|Sí|SI|SÍ) return 0 ;;
    *) return 1 ;;
  esac
}

quitar() {
  requiere_herdr
  paso "Macs que esta controla"
  if [ "$(herdr machine list --json 2>/dev/null | tr -d '[:space:]')" = "[]" ]; then
    info "Ninguna todavía."
    return 0
  fi
  herdr machine list 2>&1 | sed 's/^/    /'
  preguntar "Escribe el id de la que quieres quitar (Enter para no quitar ninguna):"
  [ -n "$RESPUESTA" ] || { info "No se quitó ninguna."; return 0; }
  herdr machine remove "$RESPUESTA" || { aviso "herdr machine remove falló"; exit 1; }
  info "Quitada de herdr. Allá todo sigue corriendo."
}

asistente() {
  paso "¿Qué quieres hacer?"
  info "1) Controlar desde esta Mac («${NOMBRE_EQUIPO}») el herdr de otra Mac"
  info "2) Preparar esta Mac («${NOMBRE_EQUIPO}») para que otra la controle"
  info "3) Ver o quitar las Macs que esta controla"
  preguntar "Elige 1, 2 o 3 (Enter para salir):"
  case "$RESPUESTA" in
    1)
      requiere_herdr
      if elegir_destino && confirmar; then conectar
      else info "No se cambió nada."
      fi ;;
    2) esta_mac ;;
    3) quitar ;;
    "") info "No se cambió nada." ;;
    *) aviso "No entendí «${RESPUESTA}»."; exit 2 ;;
  esac
}

# ---------------------------------------------------------------------------
if [ -n "$DESTINO" ]; then
  conectar
elif [ "$ASISTENTE" = 1 ] || [ -t 0 ]; then
  asistente
else
  esta_mac
fi

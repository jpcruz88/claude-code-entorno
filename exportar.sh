#!/usr/bin/env bash
# Regenera este repo desde el Claude Code de ESTA Mac y revisa que no se cuele
# nada privado. Solo LEE la configuración real (~/.claude, la clave skillUsage de
# ~/.claude.json y ~/.agents/.skill-lock.json); escribe solo dentro del repo.
#
#   ./exportar.sh            muestra qué cambiaría en el repo (no escribe nada)
#   ./exportar.sh --aplicar  escribe los cambios en el repo y corre las revisiones
#
# Por defecto trabaja en una copia del repo y te enseña las diferencias. Con
# --aplicar escribe en el repo, corre las pruebas de cada mod, la revisión de
# datos privados y gitleaks. Si algo falla, termina con error: corrige y vuelve a
# correrlo antes de hacer commit. Después: git add -A && git commit && git push.
set -uo pipefail
# Sin __pycache__: las pruebas no deben dejar archivos que gitleaks revise después.
export PYTHONDONTWRITEBYTECODE=1

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO" || exit 1

paso() { printf '\n==> %s\n' "$*"; }

APLICAR=0
if [ "${1:-}" = "--aplicar" ]; then
  APLICAR=1
elif [ -n "${1:-}" ]; then
  echo "Uso: ./exportar.sh [--aplicar]"; exit 2
fi

if [ "$APLICAR" = 0 ]; then
  # Modo seguro: la exportación corre en una copia y solo se muestran las diferencias.
  COPIA="$(mktemp -d)"
  trap 'rm -rf "$COPIA"' EXIT
  # Con .git: la copia necesita la identidad y el historial para las revisiones.
  rsync -a --exclude='._*' --exclude='__pycache__' "$REPO/" "$COPIA/"
  if ! bash "$COPIA/exportar.sh" --aplicar >"$COPIA/.salida" 2>&1; then
    # Revisiones fallidas en la copia: se muestran igual para corregirlas.
    tail -n 40 "$COPIA/.salida"
  fi
  paso "Diferencias que dejaría la exportación (no se escribió nada en el repo)"
  diff -rq --exclude=.git --exclude=.salida --exclude='._*' --exclude='__pycache__' "$REPO" "$COPIA" || true
  echo
  echo "Para aplicarlo: ./exportar.sh --aplicar"
  exit 0
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "AVISO: exportar.sh está pensado para la Mac donde vive la configuración original."
fi
for f in "$HOME/.claude/settings.json" "$HOME/.claude.json" "$HOME/.agents/.skill-lock.json"; do
  [ -f "$f" ] || { echo "ERROR: falta $f; ¿es esta la Mac correcta?"; exit 1; }
done
command -v python3 >/dev/null || { echo "ERROR: falta python3"; exit 1; }

paso "Exportando la configuración (solo lectura)"
python3 "$REPO/herramientas/exportar.py" --repo "$REPO" --verificar-origenes || { echo "ERROR: falló la exportación"; exit 1; }

paso "Pruebas"
python3 -m unittest discover -s "$REPO/pruebas" 2>&1 | tail -n 3
estado_pruebas=${PIPESTATUS[0]}

fallo=0
paso "Pruebas de los mods (mods/)"
for carpeta in "$REPO"/mods/*/; do
  salida_mod=$(claude plugin test "$carpeta" 2>&1)
  echo "$(basename "$carpeta"): $(echo "$salida_mod" | grep -E ' [0-9]+ fail$' | tail -n 1)"
  echo "$salida_mod" | grep -q ' 0 fail$' || { echo "$salida_mod" | tail -n 5; fallo=1; }
done
if ! command -v claude >/dev/null; then
  echo "ERROR: falta el comando claude para probar los mods."
  fallo=1
fi

paso "Revisión propia de datos privados"
python3 "$REPO/herramientas/revisar_privacidad.py" --repo "$REPO" --historial || fallo=1

paso "gitleaks"
if ! command -v gitleaks >/dev/null; then
  echo "ERROR: falta gitleaks (brew install gitleaks)."
  fallo=1
else
  # Archivos tal como están ahora (incluye lo que aún no tiene commit)
  gitleaks detect --no-git --source "$REPO" --no-banner --redact || fallo=1
  # Todo el historial de commits, si ya hay alguno
  if git -C "$REPO" rev-parse --verify -q HEAD >/dev/null; then
    gitleaks detect --source "$REPO" --log-opts="--all" --no-banner --redact || fallo=1
  fi
fi

paso "Cambios en el repo"
git -C "$REPO" status --short

if [ "$fallo" != 0 ]; then
  echo
  echo "ERROR: la revisión de privacidad encontró algo. No hagas commit hasta corregirlo."
  exit 1
fi
if [ "$estado_pruebas" != 0 ]; then
  echo
  echo "ERROR: fallaron las pruebas (python3 -m unittest discover -s pruebas -v)."
  exit 1
fi
echo
echo "Todo limpio. Si los cambios están bien: git add -A && git commit -m '…' && git push"

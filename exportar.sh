#!/usr/bin/env bash
# Regenera este repo desde el Claude Code de ESTA Mac y revisa que no se cuele
# nada privado. Solo LEE la configuración real (~/.claude, la clave skillUsage de
# ~/.claude.json y ~/.agents/.skill-lock.json); escribe solo dentro del repo.
#
#   ./exportar.sh
#
# Al final corre gitleaks y una búsqueda propia de datos privados. Si alguna
# encuentra algo, termina con error: revisa, corrige y vuelve a correrlo antes de
# hacer commit. Después: git add -A && git commit && git push.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO" || exit 1

paso() { printf '\n==> %s\n' "$*"; }

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

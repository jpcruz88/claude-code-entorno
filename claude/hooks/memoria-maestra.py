#!/usr/bin/env python3
"""La memoria de Claude Code vive en un repo privado de tu cuenta de GitHub.

Modos (los llama la configuración de hooks):
- inicio  (SessionStart): si esta computadora no tiene memoria maestra, pide a Claude
  que pregunte al usuario si la crea. Si ya la tiene, trae los últimos cambios.
- fin     (Stop): si la memoria cambió, la comitea y la sube al repo privado.
- configurar: crea (o enlaza) la memoria maestra. Sin --aplicar solo muestra el plan.

Cómo queda: la carpeta de memoria del proyecto se vuelve un enlace a
~/memoria-maestra/memoria, que es un clon del repo privado. Así cada cambio de Claude
queda en el clon y el hook de fin lo sube. Si el usuario no quiere memoria maestra,
no pasa nada: el hook de inicio solo pregunta, y Claude sigue normal.

Funciona con python3 (3.6 o más nuevo), sin dependencias. Un error propio nunca debe
frenar el trabajo: en los modos inicio y fin se ignora.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

NOMBRE_REPO = "memoria-maestra"
CLON_POR_OMISION = Path.home() / NOMBRE_REPO
TRAILER = "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
PREGUNTA = (
    "Memoria maestra: esta computadora todavía no tiene una memoria maestra privada. "
    "Antes de seguir, pregúntale al usuario, en una frase, si quiere crearla: un repo "
    "PRIVADO en su cuenta de GitHub donde se guarda su memoria de Claude (lo que no puede "
    "ir al repo público). Si dice que sí, corre: "
    "python3 ~/.claude/hooks/memoria-maestra.py configurar --aplicar . Si dice que no, no lo "
    "vuelvas a preguntar en esta sesión y sigue normal."
)


def config_path():
    return Path(os.environ.get("MEMORIA_MAESTRA_CONFIG",
                               str(Path.home() / ".claude" / "memoria-maestra.json")))


def carpeta_memoria(cwd, base=None):
    """Carpeta de memoria que Claude Code usa para un proyecto (ruta codificada)."""
    if base is None:
        base = Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude")))
    codificado = re.sub(r"[^A-Za-z0-9]", "-", str(cwd))
    return Path(base) / "projects" / codificado / "memory"


def slug_proyecto(cwd):
    """Nombre legible y estable del proyecto: la última carpeta, en minúsculas y con guiones."""
    nombre = Path(str(cwd)).name or "proyecto"
    limpio = re.sub(r"[^a-z0-9]+", "-", nombre.lower()).strip("-")
    return limpio or "proyecto"


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, text=True)


def _identidad(cwd):
    """Identidad para commit: la de git del usuario, o una de respaldo si no hay."""
    if git(cwd, "config", "user.email").stdout.strip():
        return []
    return ["-c", "user.name=Memoria maestra", "-c", "user.email=memoria@localhost"]


def _commit_y_subir(clon, mensaje):
    git(clon, "add", "-A", "--", "memoria")
    if git(clon, "diff", "--cached", "--quiet").returncode == 0:
        return False
    cmd = ["git", "-C", str(clon)] + _identidad(clon) + ["commit", "-q", "-m", mensaje,
                                                          "-m", TRAILER]
    subprocess.run(cmd, capture_output=True, text=True)
    git(clon, "pull", "-q", "--rebase", "origin", "HEAD")
    git(clon, "push", "-q", "origin", "HEAD")
    return True


def _enlazar(memoria, destino):
    """Enlaza la carpeta de memoria a `destino`, mezclando lo local sin pisar el remoto."""
    memoria = Path(memoria)
    if memoria.is_symlink() and memoria.resolve() == destino.resolve():
        return
    destino.mkdir(parents=True, exist_ok=True)
    if memoria.is_symlink():
        memoria.unlink()
    elif memoria.exists():
        for archivo in memoria.glob("*.md"):
            if not (destino / archivo.name).exists():
                shutil.copy2(str(archivo), str(destino / archivo.name))
        respaldo = memoria.with_name(memoria.name + ".bak-" +
                                     datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
        memoria.rename(respaldo)
    memoria.parent.mkdir(parents=True, exist_ok=True)
    memoria.symlink_to(destino, target_is_directory=True)


def configurar(memoria, clon, remoto, config, proyecto="principal"):
    """Clona el repo privado, mezcla la memoria local y enlaza la carpeta de memoria.

    Es idempotente: una segunda corrida no repite ni rompe nada.
    """
    memoria, clon, config = Path(memoria), Path(clon), Path(config)
    if not clon.exists():
        clon.mkdir(parents=True)
        git(clon, "init", "-q", "-b", "main")
        git(clon, "remote", "add", "origin", remoto)
        git(clon, "fetch", "-q", "origin")
        if git(clon, "rev-parse", "--verify", "-q", "origin/main").returncode == 0:
            git(clon, "checkout", "-q", "-B", "main", "origin/main")
    _enlazar(memoria, clon / "memoria" / proyecto)
    _commit_y_subir(clon, "memoria: configura la memoria maestra")
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(json.dumps({"remoto": remoto, "clon": str(clon),
                                  "memoria": str(memoria)}, indent=2) + "\n", encoding="utf-8")


def enlazar_proyecto(cwd, clon, base=None):
    """Enlaza la memoria del proyecto `cwd` con el repo privado (crea su carpeta si falta)."""
    destino = Path(clon) / "memoria" / slug_proyecto(cwd)
    _enlazar(carpeta_memoria(cwd, base), destino)


def sincronizar(clon):
    """Sube los cambios de la memoria al repo privado (si los hay)."""
    clon = Path(clon)
    if not (clon / ".git").exists():
        return
    _commit_y_subir(clon, "memoria: actualiza")


def traer(clon):
    """Trae los últimos cambios del repo privado al empezar."""
    clon = Path(clon)
    if (clon / ".git").exists():
        git(clon, "pull", "-q", "--ff-only", "origin", "HEAD")


PIDE_HANDOFF = (
    "Al cerrar la sesión, o cuando el usuario diga que cierra, actualiza handoff.md en la "
    "carpeta de memoria de este proyecto: qué se hizo, qué sigue, decisiones y archivos "
    "tocados. Así la próxima sesión retoma sin que el usuario repita el contexto."
)


def ruta_handoff(cwd, base=None):
    return carpeta_memoria(cwd, base) / "handoff.md"


def resumen_git(cwd):
    """Estado de git del proyecto: rama, últimos commits y cambios sin commitear. '' si no hay git."""
    if git(cwd, "rev-parse", "--is-inside-work-tree").returncode != 0:
        return ""
    rama = git(cwd, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    commits = git(cwd, "log", "-5", "--format=- %h %s").stdout.strip()
    cambios = git(cwd, "status", "--short").stdout.strip()
    partes = ["Rama: %s" % rama, "", "Últimos commits:", commits or "(ninguno)"]
    if cambios:
        partes += ["", "Cambios sin commitear:", cambios]
    return "\n".join(partes) + "\n"


def escribir_handoff_auto(cwd, base=None):
    """Guarda el estado de git en handoff-auto.md. Sin cambios no reescribe el archivo."""
    texto = resumen_git(cwd)
    if not texto:
        return
    destino = carpeta_memoria(cwd, base) / "handoff-auto.md"
    if destino.exists() and destino.read_text(encoding="utf-8") == texto:
        return
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8")


def texto_inicio(cwd, base=None):
    """Lo que Claude lee al abrir: handoff de la sesión anterior y estado de git."""
    partes = []
    manual = ruta_handoff(cwd, base)
    if manual.exists():
        partes.append("Handoff de la sesión anterior (handoff.md):\n" +
                      manual.read_text(encoding="utf-8"))
    auto = carpeta_memoria(cwd, base) / "handoff-auto.md"
    if auto.exists():
        partes.append("Estado de git al cierre (handoff-auto.md):\n" +
                      auto.read_text(encoding="utf-8"))
    if not partes:
        return ""
    return "\n\n".join(partes) + "\n\n" + PIDE_HANDOFF


def leer_config():
    try:
        return json.loads(config_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _leer_datos():
    try:
        return json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}


def _emitir(contexto):
    if contexto:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart",
                                                 "additionalContext": contexto}}))


def modo_inicio():
    datos = _leer_datos()
    cwd = datos.get("cwd") or os.getcwd()
    cfg = leer_config()
    if cfg is None:
        _emitir("\n\n".join(x for x in [PREGUNTA, texto_inicio(cwd)] if x))
        return
    traer(cfg.get("clon", ""))
    enlazar_proyecto(cwd, cfg.get("clon", ""))
    _emitir(texto_inicio(cwd))


def modo_fin():
    datos = _leer_datos()
    cwd = datos.get("cwd") or os.getcwd()
    escribir_handoff_auto(cwd)
    cfg = leer_config()
    if cfg is not None:
        sincronizar(cfg.get("clon", ""))


def modo_configurar(argumentos):
    cwd = os.getcwd()
    memoria = Path(argumentos.memoria) if argumentos.memoria else carpeta_memoria(cwd)
    clon = CLON_POR_OMISION
    if not argumentos.aplicar:
        print("Plan (no se cambia nada sin --aplicar):")
        print("  1. Crear el repo privado %s en tu cuenta de GitHub (si no existe)." % NOMBRE_REPO)
        print("  2. Clonarlo en %s." % clon)
        print("  3. Mezclar la memoria de %s y enlazar la carpeta." % memoria)
        print("  4. Subir la memoria al repo privado.")
        return 0
    remoto = argumentos.remoto
    if not remoto:
        login = subprocess.run(["gh", "api", "user", "-q", ".login"], capture_output=True,
                               text=True).stdout.strip()
        if not login:
            print("Falta iniciar sesión en GitHub: corre `gh auth login` y vuelve a intentar.")
            return 1
        slug = "%s/%s" % (login, NOMBRE_REPO)
        if subprocess.run(["gh", "repo", "view", slug], capture_output=True).returncode != 0:
            r = subprocess.run(["gh", "repo", "create", slug, "--private", "--description",
                                "Memoria de Claude Code (privada)"], capture_output=True, text=True)
            if r.returncode != 0:
                print("No pude crear el repo privado: " + r.stderr.strip())
                return 1
        remoto = "https://github.com/%s.git" % slug
    configurar(memoria, clon, remoto, config_path())
    print("Memoria maestra lista: %s (privado). Carpeta enlazada: %s" % (clon, memoria))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Memoria maestra privada de Claude Code.")
    sub = p.add_subparsers(dest="modo", required=True)
    sub.add_parser("inicio")
    sub.add_parser("fin")
    c = sub.add_parser("configurar")
    c.add_argument("--aplicar", action="store_true")
    c.add_argument("--memoria", default=None, help="carpeta de memoria a enlazar")
    c.add_argument("--remoto", default=None, help="URL de un repo privado ya existente")
    a = p.parse_args(argv)
    try:
        if a.modo == "inicio":
            modo_inicio()
        elif a.modo == "fin":
            modo_fin()
        else:
            return modo_configurar(a)
    except SystemExit:
        raise
    except Exception as e:  # nunca frenar el trabajo por un fallo propio
        if a.modo == "configurar":
            print("Error: %s" % e)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

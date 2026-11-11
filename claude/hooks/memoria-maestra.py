#!/usr/bin/env python3
"""La memoria de Claude Code vive en un repo privado de tu cuenta de GitHub.

Modos (los llama la configuración de hooks):
- inicio  (SessionStart): si esta computadora no tiene memoria maestra, pide a Claude
  que pregunte al usuario si la crea. Si ya la tiene, trae los últimos cambios.
- fin     (Stop): si la memoria cambió, la comitea y la sube al repo privado. Antes de
  comitear aparta los archivos que parecen tener una clave (no los sube). Si el rebase
  choca, lo aborta y no empuja. Cualquier problema queda como aviso para el usuario: en el
  momento (systemMessage) y otra vez al abrir la siguiente sesión.
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
# No afirma un modelo concreto: el hook no sabe con cuál se trabajó.
TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>"
TOPE_ESCANEO = 2 * 1024 * 1024  # bytes que se leen de cada archivo al buscar claves
# Patrones de claves y tokens. El nombre es lo único que se muestra: nunca el secreto.
SECRETOS = [
    ("clave sk-", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("clave sk_live_", re.compile(r"\bsk_live_[A-Za-z0-9]{16,}")),
    ("token ghp_ de GitHub", re.compile(r"\bghp_[A-Za-z0-9]{30,}")),
    ("token github_pat_", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}")),
    ("clave AKIA de AWS", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("token xox de Slack", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("clave AIza de Google", re.compile(r"\bAIza[0-9A-Za-z_-]{35}")),
    ("llave privada PEM", re.compile(r"-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}")),
    ("token JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("URL de base de datos con clave", re.compile(r"\bpostgres(?:ql)?://[^\s:/@]+:[^\s@/]+@")),
    ("token de bot de Telegram", re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b")),
]
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
    """Nombre legible y estable del proyecto: la última carpeta, en minúsculas y con guiones.

    Riesgo conocido: dos proyectos con la misma última carpeta (por ejemplo ~/a/app y
    ~/b/app) comparten la misma carpeta en el repo privado. No se cambia el cálculo porque
    rompería el enlace de las memorias que ya existen.
    """
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


def buscar_secreto(contenido):
    """Nombre del tipo de clave que aparece en el texto, o None si no hay ninguna."""
    for tipo, patron in SECRETOS:
        if patron.search(contenido):
            return tipo
    return None


def _apartar_secretos(clon):
    """Saca del commit los archivos preparados que parecen tener una clave. Devuelve avisos."""
    r = git(clon, "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR")
    avisos = []
    for ruta in [x for x in r.stdout.split("\0") if x]:
        try:
            with open(os.path.join(str(clon), ruta), "rb") as f:
                contenido = f.read(TOPE_ESCANEO).decode("utf-8", "replace")
        except OSError:
            continue
        tipo = buscar_secreto(contenido)
        if tipo:
            git(clon, "reset", "-q", "--", ruta)
            avisos.append("no subí %s porque parece tener un secreto (%s). Quítalo de ese "
                          "archivo y se subirá en la próxima sesión." % (ruta, tipo))
    return avisos


def _rebase_en_curso(clon):
    for nombre in ("rebase-merge", "rebase-apply"):
        ruta = git(clon, "rev-parse", "--git-path", nombre).stdout.strip()
        if ruta and Path(clon, ruta).exists():
            return True
    return False


def _commit_y_subir(clon, mensaje):
    """Comitea y sube la memoria. Devuelve la lista de avisos para el usuario ([] si todo bien)."""
    if git(clon, "add", "-A", "--", "memoria").returncode != 0:
        return ["no pude preparar los cambios. Revisa la carpeta %s (git status)." % clon]
    avisos = _apartar_secretos(clon)
    if git(clon, "diff", "--cached", "--quiet").returncode == 0:
        return avisos
    cmd = ["git", "-C", str(clon)] + _identidad(clon) + ["commit", "-q", "-m", mensaje,
                                                          "-m", TRAILER]
    if subprocess.run(cmd, capture_output=True, text=True).returncode != 0:
        return avisos + ["no pude hacer commit. Revisa la carpeta %s (git status)." % clon]
    if git(clon, "pull", "-q", "--rebase", "origin", "HEAD").returncode != 0:
        if _rebase_en_curso(clon):
            git(clon, "rebase", "--abort")
            return avisos + ["tus cambios chocan con los del repo privado y no subí nada. "
                             "Revisa la carpeta %s: resuelve con `git pull --rebase` y "
                             "luego `git push`." % clon]
        # Otro fallo (por ejemplo, el remoto aún vacío): se intenta subir igual.
    if git(clon, "push", "-q", "origin", "HEAD").returncode != 0:
        return avisos + ["no pude subir la memoria al repo privado. Revisa la carpeta %s "
                         "(git status y git push)." % clon]
    return avisos


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
    avisos = _commit_y_subir(clon, "memoria: configura la memoria maestra")
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(json.dumps({"remoto": remoto, "clon": str(clon),
                                  "memoria": str(memoria)}, indent=2) + "\n", encoding="utf-8")
    return avisos


def enlazar_proyecto(cwd, clon, base=None):
    """Enlaza la memoria del proyecto `cwd` con el repo privado (crea su carpeta si falta)."""
    destino = Path(clon) / "memoria" / slug_proyecto(cwd)
    _enlazar(carpeta_memoria(cwd, base), destino)


def sincronizar(clon):
    """Sube los cambios de la memoria al repo privado (si los hay). Devuelve los avisos."""
    clon = Path(clon)
    if not (clon / ".git").exists():
        return []
    return _commit_y_subir(clon, "memoria: actualiza")


def ruta_aviso():
    """Aviso pendiente para el usuario, junto a la configuración."""
    return config_path().with_name("memoria-maestra-aviso.txt")


def texto_aviso(avisos):
    return "Memoria maestra: " + " ".join(avisos)


def guardar_aviso(avisos):
    """Guarda el aviso para repetirlo al abrir la próxima sesión; sin avisos, lo borra."""
    ruta = ruta_aviso()
    if avisos:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(texto_aviso(avisos) + "\n", encoding="utf-8")
    elif ruta.exists():
        ruta.unlink()


def tomar_aviso():
    """Lee y borra el aviso pendiente. '' si no hay."""
    ruta = ruta_aviso()
    try:
        texto = ruta.read_text(encoding="utf-8").strip()
        ruta.unlink()
    except OSError:
        return ""
    return ("Dile esto al usuario al empezar, tal cual y en una frase: " + texto) if texto else ""


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
    _emitir("\n\n".join(x for x in [tomar_aviso(), texto_inicio(cwd)] if x))


def modo_fin():
    datos = _leer_datos()
    cwd = datos.get("cwd") or os.getcwd()
    escribir_handoff_auto(cwd)
    cfg = leer_config()
    if cfg is not None:
        avisos = sincronizar(cfg.get("clon", ""))
        guardar_aviso(avisos)
        if avisos:
            print(json.dumps({"systemMessage": texto_aviso(avisos)}, ensure_ascii=False))


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
    for aviso in configurar(memoria, clon, remoto, config_path()):
        print("Aviso: " + aviso)
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

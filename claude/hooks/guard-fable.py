#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow|Bash|PowerShell|Write|Edit): impide elegir el modelo Fable.

Regla general del usuario (~/.claude/rules/nunca-fable.md): Claude nunca usa Fable por su
cuenta; solo si el usuario lo pide de forma explícita y lo confirma.

Excepción: los subagentes. En Agent y Task, Fable lo decide guard-subagentes.py, que lo
baja según el uso de la cuenta (jev_limites). Este hook lo deja pasar ahí solo si ese
guardián está instalado a su lado; si falta, lo bloquea como antes.

Qué revisa:
- Agent / Task: el parámetro `model` (por ejemplo "fable" o "claude-fable-5-1"), solo si
  falta guard-subagentes.py.
- Workflow: el script (inline, o el archivo de `scriptPath`) con `model: 'fable'` en algún agent().
- Bash / PowerShell: `--model fable`, `--fallback-model fable`, `ANTHROPIC_MODEL=…fable` y
  `model="claude-fable-…"` dentro de un comando (llamadas a la API, scripts de una línea).
  También `claude config set model …` con un nombre de la familia Fable.
- Write / Edit: el contenido nuevo cuando fija un modelo (`model: fable`, `"model": "fable"`,
  `model="claude-fable-…"`), por ejemplo en settings.json, agentes o código.
  También las variables de modelo en JSON o YAML (la clave ANTHROPIC_MODEL con `:`). En un
  Edit se mira el archivo tras aplicar la edición: cambiar solo el nombre del modelo cuenta.
  Quedan fuera las reglas, los hooks y la memoria de Claude, y dentro de un repo sus docs/,
  claude/rules/ y pruebas/ (solo .md y archivos de prueba, nunca settings*.json ni scripts),
  donde se HABLA de Fable sin elegirlo.

Además protege la configuración de Jev: ~/.claude/jev/config.json y ~/.claude/jev/clave solo
los cambia el usuario. Se bloquean Write, Edit y NotebookEdit sobre esos archivos y los
comandos evidentes que los escriben (`> …`, `>> …`, tee, cp/install/ln/rsync con ese destino,
mv, rm, `sed -i`, dd of=…; en PowerShell Set-Content, Out-File, Copy-Item y parecidos). Las
lecturas y el resto de la carpeta (limites.json, decisiones.jsonl) no se tocan. Va en este
hook porque ya corre en Write, Edit, Bash y PowerShell; este bloqueo no se levanta con
CLAUDE_PERMITIR_FABLE.

Cómo se autoriza: solo el usuario, al arrancar la sesión con la variable de entorno
CLAUDE_PERMITIR_FABLE=1 (por ejemplo `CLAUDE_PERMITIR_FABLE=1 claude`). Claude no puede
ponerla, porque el hook hereda el entorno con el que se abrió la sesión.

Funciona con `python3` (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import json
import os
import posixpath
import re
import shlex
import sys

# `model: fable`, `"model": "claude-fable-5-1"`, `model='fable'`, `model = fable`
MODELO_FABLE = re.compile(r"""["'\\]*\bmodel["'\\]*\s*[:=]\s*["'\\]*[\w./:-]*fable""", re.I)
# `--model fable`, `--model=claude-fable-5-1`, `--fallback-model fable`, `--advisor fable`
OPCION_FABLE = re.compile(r"""--(?:model|fallback-model|advisor-model|advisor)(?:\s+|=)["'\\]*[\w./:-]*fable""", re.I)
# `ANTHROPIC_MODEL=fable`, `ANTHROPIC_DEFAULT_OPUS_MODEL=…fable`, `CLAUDE_CODE_SUBAGENT_MODEL=fable`
# También en JSON o YAML: la clave entre comillas y `:` en vez de `=`.
VARIABLE_FABLE = re.compile(r"""\b(?:ANTHROPIC_[A-Z_]*MODEL|CLAUDE_CODE_[A-Z_]*MODEL)["'\\]*\s*[:=]\s*["'\\]*[\w./:-]*fable""", re.I)
# `claude config set [-g|--global] model <nombre>`
CONFIG_FABLE = re.compile(r"""\bconfig\s+set\s+(?:-{1,2}\w+\s+)*model\s+["'\\]*[\w./:-]*fable""", re.I)
# Un texto que es solo el nombre de un modelo: `opus`, `"claude-sonnet-5-5"`, `haiku[1m]`.
SOLO_MODELO = re.compile(r"""^\s*["'\\]*(?:claude-[\w.-]+|haiku|sonnet|opus|default|opusplan)(?:\[\w+\])?["'\\]*\s*$""", re.I)
# Rutas donde se escribe SOBRE Fable sin elegirlo.
RUTAS_LIBRES = ("/.claude/rules/", "/.claude/hooks/", "/memory/")
# Dentro de un repo: documentación, reglas y pruebas (solo .md y archivos de prueba).
CARPETAS_LIBRES_EN_REPO = ("claude/rules/", "docs/", "pruebas/")
ARCHIVO_DE_PRUEBA = re.compile(r"^(?:test_.*\.py|.*_test\.py|.*\.(?:test|spec)\.[jt]sx?)$", re.I)
TOPE_SCRIPT = 512 * 1024
# Archivos de Jev que solo cambia el usuario (no limites.json ni decisiones.jsonl).
ARCHIVO_DE_JEV = re.compile(r"/\.claude/jev/(?:config\.json|clave)(?![\w.-])")
REDIRECCION = re.compile(r"""(?:>>?|>\|)\s*["']?([^\s;|&<>"']+)""")
SEPARADORES = re.compile(r"[;&|\n]+")
ENVOLTORIOS = {"sudo", "doas", "command", "nohup", "env", "exec", "time", "nice"}
ESCRIBE_DESTINO = {"cp", "install", "ln", "rsync", "gcp"}  # el último argumento es el destino
ESCRIBE_CUALQUIERA = {"tee", "mv", "rm", "truncate", "shred", "unlink"}
EDITA_EN_SITIO = {"sed", "gsed", "perl"}
CMDLETS_QUE_ESCRIBEN = re.compile(
    r"\b(?:set-content|add-content|out-file|clear-content|copy-item|move-item|remove-item|"
    r"new-item|rename-item|sc|ac|cpi|mi|ri|del|cp|mv|rm)\b|>", re.I)
CONSEJO_JEV = ("Solo el usuario cambia ~/.claude/jev/config.json y ~/.claude/jev/clave (la "
               "configuración y la clave de Jev). Si hace falta un cambio, dile al usuario qué "
               "cambiar y deja que lo haga él; no intentes rodear este bloqueo.")
TOPE_ARCHIVO = 2 * 1024 * 1024

CONSEJO = ("Regla general del usuario (~/.claude/rules/nunca-fable.md): Claude nunca usa el modelo "
           "Fable por su cuenta; solo si el usuario lo pide de forma explícita y lo confirma. "
           "Usa otro modelo (por ejemplo sonnet u opus) y dilo con claridad. Si el usuario YA lo "
           "pidió y lo confirmó, es él quien debe arrancar la sesión con CLAUDE_PERMITIR_FABLE=1 "
           "(por ejemplo `CLAUDE_PERMITIR_FABLE=1 claude`); no intentes rodear este bloqueo.")


def deny(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "%s %s" % (motivo, CONSEJO),
    }}))
    sys.exit(0)


def deny_jev(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "%s %s" % (motivo, CONSEJO_JEV),
    }}))
    sys.exit(0)


def texto(valor):
    return valor if isinstance(valor, str) else ""


def es_archivo_de_jev(ruta):
    """¿La ruta (de archivo o de un argumento de comando) es config.json o clave de Jev?"""
    normal = posixpath.normpath(ruta.strip("\"'").replace("\\", "/"))
    return bool(ARCHIVO_DE_JEV.search(normal))


def _palabras(segmento):
    try:
        palabras = shlex.split(segmento)
    except ValueError:
        palabras = segmento.split()
    while palabras and (palabras[0] in ENVOLTORIOS or "=" in palabras[0]
                        or (palabras[0].startswith("-") and len(palabras) > 1)):
        palabras = palabras[1:]  # sudo, env VAR=…, nice -n 10 …
    return palabras


def comando_escribe_en_jev(cmd):
    for destino in REDIRECCION.findall(cmd):
        if es_archivo_de_jev(destino):
            return True
    for segmento in SEPARADORES.split(cmd):
        palabras = _palabras(segmento)
        if not palabras:
            continue
        programa = os.path.basename(palabras[0]).lower()
        args = [a for a in palabras[1:] if not a.startswith("-")]
        if programa in ESCRIBE_DESTINO and args and es_archivo_de_jev(args[-1]):
            return True
        if programa in ESCRIBE_CUALQUIERA and any(es_archivo_de_jev(a) for a in args):
            return True
        en_sitio = any(a.startswith("--in-place") or (a.startswith("-") and not a.startswith("--")
                                                        and "i" in a[1:]) for a in palabras[1:])
        if programa in EDITA_EN_SITIO and en_sitio and any(es_archivo_de_jev(a) for a in args):
            return True
        if programa == "dd" and any(a.startswith("of=") and es_archivo_de_jev(a[3:]) for a in args):
            return True
    return False


def proteger_jev(herramienta, entrada):
    """Deniega que el agente cambie config.json o clave de Jev. Las lecturas pasan."""
    if herramienta in ("Write", "Edit", "NotebookEdit"):
        ruta = texto(entrada.get("file_path") or entrada.get("path") or entrada.get("notebook_path"))
        if ruta and es_archivo_de_jev(os.path.abspath(os.path.expanduser(ruta))):
            deny_jev("Bloqueado: %s es un archivo de configuración de Jev." % ruta)
    elif herramienta == "Bash":
        cmd = texto(entrada.get("command"))
        if ".claude" in cmd and comando_escribe_en_jev(cmd):
            deny_jev("Bloqueado: el comando escribe en la configuración de Jev.")
    elif herramienta == "PowerShell":
        cmd = texto(entrada.get("command")).replace("\\", "/")
        if es_archivo_de_jev(cmd) or any(es_archivo_de_jev(p) for p in cmd.split()):
            if CMDLETS_QUE_ESCRIBEN.search(cmd):
                deny_jev("Bloqueado: el comando escribe en la configuración de Jev.")


def hay_guardian_de_topes():
    """¿Está guard-subagentes.py junto a este hook? Es quien baja Fable según el uso."""
    try:
        aqui = os.path.dirname(os.path.abspath(__file__))
        return os.path.isfile(os.path.join(aqui, "guard-subagentes.py"))
    except Exception:
        return False


def revisar_agente(entrada):
    modelo = texto(entrada.get("model"))
    if "fable" in modelo.lower() and not hay_guardian_de_topes():
        deny("El agente pide model=%r." % modelo)


def revisar_workflow(entrada):
    guion = texto(entrada.get("script"))
    ruta = texto(entrada.get("scriptPath"))
    if ruta and not guion:
        try:
            with open(os.path.expanduser(ruta), "r", encoding="utf-8", errors="replace") as f:
                guion = f.read(TOPE_SCRIPT)
        except OSError:
            guion = ""
    if MODELO_FABLE.search(guion):
        deny("El script del workflow fija un agente con modelo Fable.")


def revisar_comando(entrada):
    cmd = texto(entrada.get("command"))
    if (OPCION_FABLE.search(cmd) or VARIABLE_FABLE.search(cmd) or MODELO_FABLE.search(cmd)
            or CONFIG_FABLE.search(cmd)):
        deny("El comando elige el modelo Fable.")


def raiz_de_repo(ruta):
    """Carpeta del repo git que contiene `ruta` (con .git, carpeta o archivo); None si no hay."""
    carpeta = os.path.dirname(ruta)
    while True:
        if os.path.exists(os.path.join(carpeta, ".git")):
            return carpeta
        padre = os.path.dirname(carpeta)
        if padre == carpeta:
            return None
        carpeta = padre


def es_ruta_libre(ruta):
    """Rutas donde se HABLA de Fable sin elegirlo: reglas, hooks y memoria de Claude, y en un
    repo sus docs/, claude/rules/ y pruebas/ (solo .md y archivos de prueba, nunca settings*)."""
    normal = ruta.replace("\\", "/")
    if any(r in normal for r in RUTAS_LIBRES):
        return True
    nombre = os.path.basename(normal)
    if not nombre or nombre.lower().startswith("settings"):
        return False
    absoluta = os.path.abspath(os.path.expanduser(ruta))
    raiz = raiz_de_repo(absoluta)
    if raiz is None:
        return False
    relativa = os.path.relpath(absoluta, raiz).replace(os.sep, "/")
    if not relativa.startswith(CARPETAS_LIBRES_EN_REPO):
        return False
    if nombre.lower().endswith(".md"):
        return True
    return relativa.startswith("pruebas/") and bool(ARCHIVO_DE_PRUEBA.match(nombre))


def fija_fable(contenido):
    return len(MODELO_FABLE.findall(contenido)) + len(VARIABLE_FABLE.findall(contenido))


def edicion_fija_fable(entrada, ruta):
    """¿El Edit deja en el archivo una fijación nueva? Mira el resultado de aplicarlo.

    Si no se puede leer el archivo, mira el contexto: cambiar el nombre de otro modelo por
    uno de la familia Fable cuenta como fijarlo.
    """
    viejo, nuevo = texto(entrada.get("old_string")), texto(entrada.get("new_string"))
    if "fable" not in nuevo.lower():
        return False
    try:
        with open(os.path.expanduser(ruta), "r", encoding="utf-8", errors="replace") as f:
            antes = f.read(TOPE_ARCHIVO)
    except (OSError, ValueError):
        antes = None
    if antes is None or not viejo or viejo not in antes:
        return bool(SOLO_MODELO.match(viejo))
    veces = -1 if entrada.get("replace_all") is True else 1
    despues = antes.replace(viejo, nuevo, veces)
    return fija_fable(despues) > fija_fable(antes)


def revisar_archivo(entrada):
    ruta = texto(entrada.get("file_path") or entrada.get("path") or entrada.get("notebook_path"))
    if es_ruta_libre(ruta):
        return
    nuevo = "\n".join(texto(entrada.get(k)) for k in ("content", "new_string", "new_source"))
    if fija_fable(nuevo) or (ruta and "old_string" in entrada and edicion_fija_fable(entrada, ruta)):
        deny("El contenido que se escribe en %s fija el modelo Fable." % (ruta or "un archivo"))


REVISORES = {
    "Agent": revisar_agente, "Task": revisar_agente, "Workflow": revisar_workflow,
    "Bash": revisar_comando, "PowerShell": revisar_comando,
    "Write": revisar_archivo, "Edit": revisar_archivo, "NotebookEdit": revisar_archivo,
}


def main():
    try:
        crudo = sys.stdin.buffer.read() if hasattr(sys.stdin, "buffer") else sys.stdin.read()
        if isinstance(crudo, bytes):
            crudo = crudo.decode("utf-8", "replace")
        datos = json.loads(crudo)
    except Exception:
        return
    if not isinstance(datos, dict):
        return
    herramienta = datos.get("tool_name")
    entrada = datos.get("tool_input")
    if not isinstance(entrada, dict):
        return
    try:
        proteger_jev(herramienta, entrada)  # va antes del permiso de Fable: no lo levanta
    except SystemExit:
        raise
    except Exception:
        pass  # ante un fallo del guardián, no bloquear el trabajo normal
    if os.environ.get("CLAUDE_PERMITIR_FABLE") == "1":
        return
    revisor = REVISORES.get(herramienta)
    if revisor is None:
        return
    try:
        revisor(entrada)
    except SystemExit:
        raise
    except Exception:
        pass  # ante un fallo del guardián, no bloquear el trabajo normal


if __name__ == "__main__":
    main()

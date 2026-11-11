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
- Write / Edit: el contenido nuevo cuando fija un modelo (`model: fable`, `"model": "fable"`,
  `model="claude-fable-…"`), por ejemplo en settings.json, agentes o código.
  También las variables de modelo en JSON o YAML (la clave ANTHROPIC_MODEL con `:`). En un
  Edit se mira el archivo tras aplicar la edición: cambiar solo el nombre del modelo cuenta.
  Quedan fuera las reglas, los hooks y la memoria de Claude, y dentro de un repo sus docs/,
  claude/rules/ y pruebas/ (solo .md y archivos de prueba, nunca settings*.json ni scripts),
  donde se HABLA de Fable sin elegirlo.

Cómo se autoriza: solo el usuario, al arrancar la sesión con la variable de entorno
CLAUDE_PERMITIR_FABLE=1 (por ejemplo `CLAUDE_PERMITIR_FABLE=1 claude`). Claude no puede
ponerla, porque el hook hereda el entorno con el que se abrió la sesión.

Funciona con `python3` (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import json
import os
import re
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


def texto(valor):
    return valor if isinstance(valor, str) else ""


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
    if os.environ.get("CLAUDE_PERMITIR_FABLE") == "1":
        return
    try:
        crudo = sys.stdin.buffer.read() if hasattr(sys.stdin, "buffer") else sys.stdin.read()
        if isinstance(crudo, bytes):
            crudo = crudo.decode("utf-8", "replace")
        datos = json.loads(crudo)
    except Exception:
        return
    if not isinstance(datos, dict):
        return
    revisor = REVISORES.get(datos.get("tool_name"))
    entrada = datos.get("tool_input")
    if revisor is None or not isinstance(entrada, dict):
        return
    try:
        revisor(entrada)
    except SystemExit:
        raise
    except Exception:
        pass  # ante un fallo del guardián, no bloquear el trabajo normal


if __name__ == "__main__":
    main()

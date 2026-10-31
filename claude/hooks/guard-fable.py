#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow|Bash|PowerShell|Write|Edit): impide elegir el modelo Fable.

Regla general del usuario (~/.claude/rules/nunca-fable.md): Claude nunca usa Fable por su
cuenta; solo si el usuario lo pide de forma explícita y lo confirma.

Qué revisa:
- Agent / Task: el parámetro `model` (por ejemplo "fable" o "claude-fable-5-1").
- Workflow: el script (inline, o el archivo de `scriptPath`) con `model: 'fable'` en algún agent().
- Bash / PowerShell: `--model fable`, `--fallback-model fable`, `ANTHROPIC_MODEL=…fable` y
  `model="claude-fable-…"` dentro de un comando (llamadas a la API, scripts de una línea).
- Write / Edit: el contenido nuevo cuando fija un modelo (`model: fable`, `"model": "fable"`,
  `model="claude-fable-…"`), por ejemplo en settings.json, agentes o código.
  Quedan fuera las reglas, los hooks y la memoria de Claude, donde se HABLA de Fable sin elegirlo.

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
VARIABLE_FABLE = re.compile(r"""\b(?:ANTHROPIC_[A-Z_]*MODEL|CLAUDE_CODE_[A-Z_]*MODEL)\s*=\s*["'\\]*[\w./:-]*fable""", re.I)
# Rutas donde se escribe SOBRE Fable sin elegirlo.
RUTAS_LIBRES = ("/.claude/rules/", "/.claude/hooks/", "/memory/")
TOPE_SCRIPT = 512 * 1024

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


def revisar_agente(entrada):
    modelo = texto(entrada.get("model"))
    if "fable" in modelo.lower():
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
    if OPCION_FABLE.search(cmd) or VARIABLE_FABLE.search(cmd) or MODELO_FABLE.search(cmd):
        deny("El comando elige el modelo Fable.")


def revisar_archivo(entrada):
    ruta = texto(entrada.get("file_path") or entrada.get("path") or entrada.get("notebook_path"))
    if any(r in ruta.replace("\\", "/") for r in RUTAS_LIBRES):
        return
    nuevo = "\n".join(texto(entrada.get(k)) for k in ("content", "new_string", "new_source"))
    if MODELO_FABLE.search(nuevo) or VARIABLE_FABLE.search(nuevo):
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

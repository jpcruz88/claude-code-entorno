#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow): todo agente o subagente usa Haiku con esfuerzo medio.

Regla del usuario (~/.claude/rules/modelo.md): cualquier agente o subagente usa
claude-haiku-5-5 con esfuerzo medio. Ningún otro modelo, y ningún esfuerzo más alto que
medio. Se acepta «low», que no es más alto.

Qué revisa:
- Agent / Task: el parámetro `model` debe ser haiku (o claude-haiku-…) y el `effort`,
  medium o low. Si falta cualquiera de los dos, se bloquea: hay que ponerlo explícito.
- Workflow: el script debe fijar haiku en cada agent() y nunca un esfuerzo mayor que medio.

Funciona con python3 (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import json
import re
import sys

ESFUERZOS_PERMITIDOS = ("low", "medium")
# `model: 'haiku'`, `model: "claude-haiku-5-5"`, `model = haiku`
MODELO_EN_GUION = re.compile(r"""\bmodel["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
# `effort: 'high'`, `effort = medium`
ESFUERZO_EN_GUION = re.compile(r"""\beffort["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
LLAMADA_AGENTE = re.compile(r"\bagent\s*\(")

CONSEJO = ("Regla del usuario (~/.claude/rules/modelo.md): todo agente o subagente usa "
           "claude-haiku-5-5 con esfuerzo medio, sin otro modelo ni esfuerzo mayor. Vuelve a "
           "llamarlo con model=\"haiku\" y effort=\"medium\".")


def deny(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "%s %s" % (motivo, CONSEJO),
    }}))
    sys.exit(0)


def texto(valor):
    return valor if isinstance(valor, str) else ""


def es_haiku(modelo):
    return modelo.lower() == "haiku" or modelo.lower().startswith("claude-haiku")


def revisar_agente(entrada):
    modelo = texto(entrada.get("model")).strip()
    esfuerzo = texto(entrada.get("effort")).strip().lower()
    if not modelo:
        deny("El agente no fija model; debe ser haiku.")
    if not es_haiku(modelo):
        deny("El agente pide model=%r; solo se permite haiku." % modelo)
    if not esfuerzo:
        deny("El agente no fija effort; debe ser medium (o low).")
    if esfuerzo not in ESFUERZOS_PERMITIDOS:
        deny("El agente pide effort=%r; el máximo permitido es medium." % esfuerzo)


def revisar_workflow(entrada):
    guion = texto(entrada.get("script"))
    if not guion:
        return  # sin script inline no hay nada que revisar aquí
    llamadas = len(LLAMADA_AGENTE.findall(guion))
    modelos = [m.strip() for m in MODELO_EN_GUION.findall(guion)]
    if any(not es_haiku(m) for m in modelos if m):
        deny("El script del workflow fija un agente con un modelo distinto de haiku.")
    if sum(1 for m in modelos if m and es_haiku(m)) < llamadas:
        deny("Hay agent() sin model=\"haiku\" explícito en el workflow.")
    for esfuerzo in (e.strip().lower() for e in ESFUERZO_EN_GUION.findall(guion)):
        if esfuerzo and esfuerzo not in ESFUERZOS_PERMITIDOS:
            deny("El script del workflow pide effort=%r; el máximo es medium." % esfuerzo)


REVISORES = {"Agent": revisar_agente, "Task": revisar_agente, "Workflow": revisar_workflow}


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

#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow): los subagentes usan Haiku, Sonnet u Opus, con esfuerzo hasta high.

Regla: cualquier agente o subagente usa haiku, sonnet u opus (o su id completo, como
claude-opus-5-5), con esfuerzo low, medium o high. Se bloquean xhigh, max y cualquier otro
modelo, Fable incluido. Fable nunca se permite.

Qué revisa:
- Agent / Task: el parámetro `model` debe ser haiku, sonnet u opus (o claude-<familia>-…)
  y el `effort`, low, medium o high. Si falta cualquiera de los dos, se bloquea: hay que
  ponerlo explícito.
- Workflow: el script debe fijar un modelo permitido en cada agent() y nunca un esfuerzo
  mayor que high.

Funciona con python3 (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import json
import re
import sys

ESFUERZOS_PERMITIDOS = ("low", "medium", "high")
MODELOS_PERMITIDOS = ("haiku", "sonnet", "opus")
# `model: 'haiku'`, `model: "claude-haiku-5-5"`, `model = haiku`
MODELO_EN_GUION = re.compile(r"""\bmodel["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
# `effort: 'high'`, `effort = medium`
ESFUERZO_EN_GUION = re.compile(r"""\beffort["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
LLAMADA_AGENTE = re.compile(r"\bagent\s*\(")

CONSEJO = ("Regla (~/.claude/rules/modelo.md): los agentes y subagentes usan haiku, sonnet u "
           "opus, con esfuerzo low, medium o high; nunca Fable ni xhigh o max. Vuelve a "
           "llamarlo con un modelo permitido y un esfuerzo permitido.")


def deny(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "%s %s" % (motivo, CONSEJO),
    }}))
    sys.exit(0)


def texto(valor):
    return valor if isinstance(valor, str) else ""


def es_modelo_permitido(modelo):
    m = modelo.lower()
    return m in MODELOS_PERMITIDOS or any(m.startswith("claude-" + f) for f in MODELOS_PERMITIDOS)


def revisar_agente(entrada):
    modelo = texto(entrada.get("model")).strip()
    esfuerzo = texto(entrada.get("effort")).strip().lower()
    if not modelo:
        deny("El agente no fija model; debe ser haiku, sonnet u opus.")
    if not es_modelo_permitido(modelo):
        deny("El agente pide model=%r; solo se permiten haiku, sonnet y opus." % modelo)
    if not esfuerzo:
        deny("El agente no fija effort; debe ser low, medium o high.")
    if esfuerzo not in ESFUERZOS_PERMITIDOS:
        deny("El agente pide effort=%r; el máximo permitido es high." % esfuerzo)


def revisar_workflow(entrada):
    guion = texto(entrada.get("script"))
    if not guion:
        return  # sin script inline no hay nada que revisar aquí
    llamadas = len(LLAMADA_AGENTE.findall(guion))
    modelos = [m.strip() for m in MODELO_EN_GUION.findall(guion)]
    if any(not es_modelo_permitido(m) for m in modelos if m):
        deny("El script del workflow fija un agente con un modelo no permitido "
             "(solo haiku, sonnet u opus).")
    if sum(1 for m in modelos if m and es_modelo_permitido(m)) < llamadas:
        deny("Hay agent() sin model explícito (haiku, sonnet u opus) en el workflow.")
    for esfuerzo in (e.strip().lower() for e in ESFUERZO_EN_GUION.findall(guion)):
        if esfuerzo and esfuerzo not in ESFUERZOS_PERMITIDOS:
            deny("El script del workflow pide effort=%r; el máximo es high." % esfuerzo)


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

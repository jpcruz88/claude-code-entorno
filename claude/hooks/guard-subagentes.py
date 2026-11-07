#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow): los subagentes usan Haiku, Sonnet u Opus, con esfuerzo hasta high.

Regla: cualquier agente o subagente usa haiku, sonnet u opus (o su id completo, como
claude-opus-5-5), con esfuerzo low, medium o high. Se bloquean xhigh, max y cualquier otro
modelo, Fable incluido. Fable nunca se permite.

Qué revisa:
- Agent / Task: el parámetro `model` debe ser haiku, sonnet u opus (o claude-<familia>-…)
  y el `effort`, low, medium o high. Si falta cualquiera de los dos, se bloquea: hay que
  ponerlo explícito.
- Jev (solo Agent / Task): si Claude pidió un modelo y un esfuerzo válidos, Jev elige
  ambos. Si Jev está seguro (confianza ≥ umbral), su elección reemplaza la de Claude y se
  devuelve con `updatedInput`. Cada decisión queda en ~/.claude/jev/decisiones.jsonl sin
  el encargo. Cualquier fallo de Jev deja pasar lo que eligió Claude.
- Workflow: el script debe fijar un modelo permitido en cada agent() y nunca un esfuerzo
  mayor que high. Jev no rutea workflows.

Funciona con python3 (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import datetime
import json
import os
import re
import sys
import threading

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import jev_cliente
except Exception:
    jev_cliente = None  # sin Jev el guardián funciona como antes

ESFUERZOS_PERMITIDOS = ("low", "medium", "high")
MODELOS_PERMITIDOS = ("haiku", "sonnet", "opus")
OPCIONES_JEV = {"modelo": list(MODELOS_PERMITIDOS), "esfuerzo": list(ESFUERZOS_PERMITIDOS)}
DESCRIPCION_MAX = 60
# `model: 'haiku'`, `model: "claude-haiku-5-5"`, `model = haiku`
MODELO_EN_GUION = re.compile(r"""\bmodel["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
# `effort: 'high'`, `effort = medium`
ESFUERZO_EN_GUION = re.compile(r"""\beffort["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
LLAMADA_AGENTE = re.compile(r"\bagent\s*\(")
# `claude-opus-5-5`: la familia seguida de guion; `claude-opusxyz` no cuenta
RE_ID_DE_FAMILIA = re.compile(r"claude-(?:%s)(?:-.*)?" % "|".join(MODELOS_PERMITIDOS))

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


def allow(entrada_actualizada):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": "Jev ajustó el modelo o el esfuerzo del agente.",
        "updatedInput": entrada_actualizada,
    }}))


def texto(valor):
    return valor if isinstance(valor, str) else ""


def es_modelo_permitido(modelo):
    """`haiku`, `sonnet`, `opus` o un id completo de esa familia (`claude-opus-5-5`)."""
    m = modelo.lower()
    return m in MODELOS_PERMITIDOS or RE_ID_DE_FAMILIA.fullmatch(m) is not None


def familia_de_modelo(modelo):
    """`claude-haiku-5-5` y `haiku` son la misma familia."""
    m = modelo.lower()
    for familia in MODELOS_PERMITIDOS:
        if m == familia or m.startswith("claude-" + familia):
            return familia
    return m


def validar_agente(modelo, esfuerzo):
    if not modelo:
        deny("El agente no fija model; debe ser haiku, sonnet u opus.")
    if not es_modelo_permitido(modelo):
        deny("El agente pide model=%r; solo se permiten haiku, sonnet y opus." % modelo)
    if not esfuerzo:
        deny("El agente no fija effort; debe ser low, medium o high.")
    if esfuerzo not in ESFUERZOS_PERMITIDOS:
        deny("El agente pide effort=%r; el máximo permitido es high." % esfuerzo)


def _comparable(tipo, valor):
    return familia_de_modelo(valor) if tipo == "modelo" else valor.lower()


def _resolver(tipo, valor_claude, decision, config, descripcion, session_id, hora):
    """Devuelve (valor final, línea de registro) para un tipo de pregunta."""
    base = {"hora": hora, "session_id": session_id, "tipo": tipo, "claude": valor_claude,
            "descripcion": descripcion[:DESCRIPCION_MAX]}
    if decision is None:
        linea = dict(base, opcion=None, confianza=None, sharp=False, aplicada=False,
                     latencia_ms=None, costo=None, motivo="sin respuesta")
        return valor_claude, linea
    sharp = jev_cliente.es_sharp(decision, config)
    opcion = decision["opcion"]
    cambia = sharp and _comparable(tipo, opcion) != _comparable(tipo, valor_claude)
    linea = dict(base, opcion=opcion, confianza=decision["confianza"], sharp=sharp,
                 aplicada=cambia, latencia_ms=decision.get("latencia_ms"),
                 costo=decision.get("costo"))
    return (opcion if cambia else valor_claude), linea


def _preguntar_en_paralelo(encargo, config, clave):
    resultados = {}

    def preguntar(tipo):
        try:
            resultados[tipo] = jev_cliente.decidir(tipo, encargo, OPCIONES_JEV[tipo], config, clave)
        except Exception:
            resultados[tipo] = None

    hilos = [threading.Thread(target=preguntar, args=(t,), daemon=True) for t in OPCIONES_JEV]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join(float(config["timeout"]) + 0.5)
    return {t: resultados.get(t) for t in OPCIONES_JEV}


def rutear_con_jev(entrada, modelo, esfuerzo, session_id):
    """Pregunta a Jev por modelo y esfuerzo y devuelve los valores finales. Nunca lanza."""
    if jev_cliente is None:
        return modelo, esfuerzo
    try:
        home = os.path.expanduser("~")
        config = jev_cliente.cargar_config(home)
        clave = jev_cliente.leer_clave(home, os.environ)
        descripcion = texto(entrada.get("description"))
        encargo = descripcion + "\n\n" + texto(entrada.get("prompt"))
        decisiones = _preguntar_en_paralelo(encargo, config, clave) if clave else {}
        hora = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        finales, lineas = {}, []
        for tipo, valor in (("modelo", modelo), ("esfuerzo", esfuerzo)):
            finales[tipo], linea = _resolver(tipo, valor, decisiones.get(tipo), config,
                                             descripcion, session_id, hora)
            lineas.append(linea)
        for linea in lineas:
            jev_cliente.registrar(home, linea)
        return finales["modelo"], finales["esfuerzo"]
    except Exception:
        return modelo, esfuerzo


def revisar_agente(entrada, session_id=None):
    """Devuelve la entrada reescrita si Jev cambió algo; None si pasa tal cual."""
    modelo = texto(entrada.get("model")).strip()
    esfuerzo = texto(entrada.get("effort")).strip().lower()
    validar_agente(modelo, esfuerzo)  # antes de consultar a Jev: Fable nunca llega a Jev
    final_modelo, final_esfuerzo = rutear_con_jev(entrada, modelo, esfuerzo, session_id)
    validar_agente(final_modelo, final_esfuerzo)
    cambios = {}
    if final_modelo != modelo:
        cambios["model"] = final_modelo
    if final_esfuerzo != esfuerzo:
        cambios["effort"] = final_esfuerzo
    if not cambios:
        return None
    return dict(entrada, **cambios)


def revisar_workflow(entrada, session_id=None):
    guion = texto(entrada.get("script"))
    if not guion:
        return None  # sin script inline no hay nada que revisar aquí
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
    return None


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
    sesion = datos.get("session_id")
    if not isinstance(sesion, str):
        sesion = None
    try:
        actualizada = revisor(entrada, sesion)
    except SystemExit:
        raise
    except Exception:
        return  # ante un fallo del guardián, no bloquear el trabajo normal
    if actualizada is not None:
        allow(actualizada)


if __name__ == "__main__":
    main()

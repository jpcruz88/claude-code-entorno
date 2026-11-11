#!/usr/bin/env python3
"""PreToolUse(Agent|Task|Workflow): los subagentes usan Haiku, Sonnet, Opus o Fable, con tope por uso.

Regla: cualquier agente o subagente usa haiku, sonnet, opus o fable (o su id completo, como
claude-opus-5-5), con esfuerzo low, medium, high o xhigh. Se bloquean max y cualquier otro
modelo. xhigh y Fable nunca se bloquean en Agent / Task: si el tope de uso (jev_limites) no
los permite, se bajan con `updatedInput`. Fable solo pasa con mucho margen de uso; sin dato
de uso baja a opus. En un Workflow, Fable y xhigh se bloquean, porque no se pueden bajar.

Qué revisa:
- Agent / Task: el parámetro `model` debe ser haiku, sonnet, opus o fable (o
  claude-<familia>-…) y el `effort`, low, medium, high o xhigh. Si falta cualquiera de los
  dos, se bloquea: hay que ponerlo explícito.
- Jev (solo Agent / Task): si Claude pidió un modelo y un esfuerzo válidos, Jev elige
  ambos. Si Jev está seguro (confianza ≥ umbral), su elección reemplaza la de Claude y se
  devuelve con `updatedInput`. Cada decisión queda en ~/.claude/jev/decisiones.jsonl sin
  el encargo. Cualquier fallo de Jev deja pasar lo que eligió Claude.
- Tope de uso (solo Agent / Task): tras Jev, jev_limites calcula el modelo y el esfuerzo
  máximos según ~/.claude/jev/limites.json. Si la elección final los supera, se baja con
  `updatedInput` y queda una línea `tope` en decisiones.jsonl. Nunca hace deny; cualquier
  fallo equivale a sin tope.
- Fork (Agent / Task con subagent_type "fork"): ignora model y effort y hereda el modelo de
  la sesión, así que ni Jev ni el tope lo pueden bajar. Si el modelo de la sesión (el que
  traiga la entrada del hook, ANTHROPIC_MODEL o la clave `model` de ~/.claude/settings.json)
  es de la familia más capaz, se bloquea y se propone un agente normal con modelo explícito.
  Si no se puede saber el modelo, pasa.
- Workflow: el script (en línea o el archivo de `scriptPath`) debe fijar haiku, sonnet u
  opus en cada agent() y nunca un esfuerzo mayor que high (un workflow no se puede bajar con
  el tope, así que Fable y xhigh se bloquean). Los comentarios // y /* */ no cuentan. Jev no
  rutea workflows.

Funciona con python3 (3.6 o más nuevo), sin dependencias. Si algo falla dentro del
guardián, deja pasar la acción: un error propio nunca debe frenar el trabajo normal.
"""
import datetime
import json
import os
import re
import sys
import threading
import time

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import jev_cliente
except Exception:
    jev_cliente = None  # sin Jev el guardián funciona como antes

try:
    import jev_limites
except Exception:
    jev_limites = None  # sin el módulo de topes el guardián funciona sin topes

ESFUERZOS_PERMITIDOS = ("low", "medium", "high", "xhigh")
ESFUERZO_MAX_WORKFLOW = "high"  # un workflow no se puede bajar con updatedInput
MODELOS_PERMITIDOS = ("haiku", "sonnet", "opus", "fable")
MODELOS_WORKFLOW = ("haiku", "sonnet", "opus")  # un workflow no se puede bajar con updatedInput
MODELO_SIN_TOPES = "opus"  # sin poder calcular el tope, Fable baja a este
OPCIONES_JEV = {"modelo": list(MODELOS_PERMITIDOS), "esfuerzo": list(ESFUERZOS_PERMITIDOS)}
DESCRIPCION_MAX = 60
TOPE_SCRIPT = 512 * 1024  # bytes que se leen de un scriptPath
FAMILIA_MAS_CAPAZ = "fable"  # un fork con esta familia se salta el tope
# `model: 'haiku'`, `model: "claude-haiku-5-5"`, `model = haiku`
MODELO_EN_GUION = re.compile(r"""\bmodel["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
# `effort: 'high'`, `effort = medium`
ESFUERZO_EN_GUION = re.compile(r"""\beffort["'\\]*\s*[:=]\s*["'\\]*([\w./:-]*)""", re.I)
LLAMADA_AGENTE = re.compile(r"\bagent\s*\(")
# `claude-opus-5-5`: la familia seguida de guion; `claude-opusxyz` no cuenta
RE_ID_DE_FAMILIA = re.compile(r"claude-(%s)(?:-.*)?" % "|".join(MODELOS_PERMITIDOS))

CONSEJO = ("Regla (~/.claude/rules/modelo.md): los agentes y subagentes usan haiku, sonnet, "
           "opus o fable, con esfuerzo low, medium, high o xhigh (el tope de uso puede "
           "bajarlos); nunca max. En un workflow, solo haiku, sonnet u opus y esfuerzo hasta "
           "high. Vuelve a llamarlo con un modelo permitido y un esfuerzo permitido.")


def deny(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "%s %s" % (motivo, CONSEJO),
    }}))
    sys.exit(0)


def razon_del_ajuste(por_jev, por_tope):
    """Dice quién cambió el modelo o el esfuerzo: Jev, el tope de uso o los dos."""
    if por_jev and por_tope:
        return "Jev y el tope de uso ajustaron el modelo o el esfuerzo del agente."
    if por_tope:
        return "Tope de uso ajustó el modelo o el esfuerzo del agente."
    return "Jev ajustó el modelo o el esfuerzo del agente."


def allow(entrada_actualizada, por_jev=True, por_tope=False):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": razon_del_ajuste(por_jev, por_tope),
        "updatedInput": entrada_actualizada,
    }}))


def texto(valor):
    return valor if isinstance(valor, str) else ""


def es_modelo_permitido(modelo, permitidos=MODELOS_PERMITIDOS):
    """Una familia de `permitidos` o un id completo de esa familia (`claude-opus-5-5`)."""
    m = modelo.lower()
    if m in permitidos:
        return True
    encontrada = RE_ID_DE_FAMILIA.fullmatch(m)
    return encontrada is not None and encontrada.group(1) in permitidos


def familia_de_modelo(modelo):
    """`claude-haiku-5-5` y `haiku` son la misma familia."""
    m = modelo.lower()
    for familia in MODELOS_PERMITIDOS:
        if m == familia or m.startswith("claude-" + familia):
            return familia
    return m


def validar_agente(modelo, esfuerzo):
    if not modelo:
        deny("El agente no fija model; debe ser haiku, sonnet, opus o fable.")
    if not es_modelo_permitido(modelo):
        deny("El agente pide model=%r; solo se permiten haiku, sonnet, opus y fable." % modelo)
    if not esfuerzo:
        deny("El agente no fija effort; debe ser low, medium, high o xhigh.")
    if esfuerzo not in ESFUERZOS_PERMITIDOS:
        deny("El agente pide effort=%r; el máximo permitido es xhigh." % esfuerzo)


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


def _sin_topes(modelo, esfuerzo):
    """Sin poder calcular el tope, xhigh baja a high y Fable a opus (exigen conocer el uso)."""
    if familia_de_modelo(modelo) == "fable":
        modelo = MODELO_SIN_TOPES
    return modelo, ("high" if esfuerzo == "xhigh" else esfuerzo)


def aplicar_tope_de_uso(entrada, modelo, esfuerzo, session_id):
    """Baja modelo y esfuerzo al tope vigente y registra la línea `tope`. Nunca lanza."""
    if jev_limites is None:
        return _sin_topes(modelo, esfuerzo)
    try:
        home = os.path.expanduser("~")
        ahora = time.time()
        limites = jev_limites.leer_limites(home, ahora)
        config = jev_cliente.cargar_config(home) if jev_cliente is not None else {}
        tope = jev_limites.calcular_tope(limites, ahora, config)
        nuevo_modelo, nuevo_esfuerzo = jev_limites.aplicar_tope(modelo, esfuerzo, tope)
        if (nuevo_modelo, nuevo_esfuerzo) == (modelo, esfuerzo):
            return modelo, esfuerzo
    except Exception:
        return _sin_topes(modelo, esfuerzo)  # un fallo al leer o calcular: sin tope, sin xhigh
    try:
        motivo = tope.get("motivo")
        if nuevo_modelo != modelo and not motivo:  # el tope no recorta opus, pero sí Fable
            motivo = "tope: %s → %s" % (familia_de_modelo(modelo), nuevo_modelo)
        if nuevo_esfuerzo != esfuerzo and "esfuerzo" not in (motivo or ""):
            motivo = "%s; esfuerzo %s → %s" % (motivo or "tope", esfuerzo, nuevo_esfuerzo)
        if jev_cliente is not None:
            jev_cliente.registrar(home, {
                "hora": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                "session_id": session_id, "tipo": "tope", "opcion": nuevo_modelo,
                "claude": modelo, "aplicada": True, "motivo": motivo,
                "descripcion": texto(entrada.get("description"))[:DESCRIPCION_MAX]})
    except Exception:
        pass
    return nuevo_modelo, nuevo_esfuerzo


def revisar_agente(entrada, session_id=None):
    """Devuelve (entrada reescrita, por_jev, por_tope) si algo cambió; None si pasa tal cual."""
    modelo = texto(entrada.get("model")).strip()
    esfuerzo = texto(entrada.get("effort")).strip().lower()
    validar_agente(modelo, esfuerzo)  # antes de consultar a Jev: lo no permitido nunca llega a Jev
    final_modelo, final_esfuerzo = rutear_con_jev(entrada, modelo, esfuerzo, session_id)
    validar_agente(final_modelo, final_esfuerzo)
    tras_jev = (final_modelo, final_esfuerzo)
    final_modelo, final_esfuerzo = aplicar_tope_de_uso(entrada, final_modelo, final_esfuerzo,
                                                       session_id)
    por_jev = tras_jev != (modelo, esfuerzo)
    por_tope = (final_modelo, final_esfuerzo) != tras_jev
    cambios = {}
    if final_modelo != modelo:
        cambios["model"] = final_modelo
    if final_esfuerzo != esfuerzo:
        cambios["effort"] = final_esfuerzo
    if not cambios:
        return None
    return dict(entrada, **cambios), por_jev, por_tope


def ruta_de_ajustes():
    return os.path.join(os.path.expanduser("~"), ".claude", "settings.json")


def modelo_de_sesion(datos, ajustes=None):
    """Modelo de la sesión: la entrada del hook, ANTHROPIC_MODEL o settings.json. '' si no se sabe."""
    modelo = datos.get("model")
    if isinstance(modelo, dict):
        modelo = modelo.get("id") or modelo.get("display_name")
    if isinstance(modelo, str) and modelo.strip():
        return modelo.strip()
    modelo = os.environ.get("ANTHROPIC_MODEL", "")
    if modelo.strip():
        return modelo.strip()
    try:
        with open(ajustes or ruta_de_ajustes(), "r", encoding="utf-8") as f:
            config = json.load(f)
        modelo = config.get("model") if isinstance(config, dict) else None
        return modelo.strip() if isinstance(modelo, str) else ""
    except Exception:
        return ""


def es_fork(entrada):
    return texto(entrada.get("subagent_type")).strip().lower() == "fork"


def revisar_fork(datos, ajustes=None):
    """Un fork hereda el modelo de la sesión: si es de la familia más capaz, se bloquea."""
    modelo = modelo_de_sesion(datos, ajustes)
    if FAMILIA_MAS_CAPAZ in modelo.lower():
        deny("Un fork (subagent_type \"fork\") ignora model y effort y hereda el modelo de "
             "la sesión (%s), así que se salta el tope de uso. Lanza un agente normal, sin "
             "subagent_type \"fork\", con modelo explícito (por ejemplo opus con effort high)."
             % modelo)
    return None


def quitar_comentarios(guion):
    """Quita los comentarios // y /* */ de un script sin tocar lo que va dentro de textos."""
    salida, i, n, comilla = [], 0, len(guion), None
    while i < n:
        c = guion[i]
        if comilla:
            salida.append(c)
            if c == "\\" and i + 1 < n:
                salida.append(guion[i + 1])
                i += 2
                continue
            if c == comilla:
                comilla = None
            i += 1
        elif c in "'\"`":
            comilla = c
            salida.append(c)
            i += 1
        elif guion.startswith("//", i):
            fin = guion.find("\n", i)
            i = n if fin < 0 else fin
        elif guion.startswith("/*", i):
            fin = guion.find("*/", i + 2)
            salida.append(" ")
            i = n if fin < 0 else fin + 2
        else:
            salida.append(c)
            i += 1
    return "".join(salida)


def leer_guion(entrada):
    """El script en línea o, si no hay, el archivo de `scriptPath`. '' si no se puede leer."""
    guion = texto(entrada.get("script"))
    ruta = texto(entrada.get("scriptPath"))
    if guion or not ruta:
        return guion
    try:
        with open(os.path.expanduser(ruta), "r", encoding="utf-8", errors="replace") as f:
            return f.read(TOPE_SCRIPT)
    except Exception:
        return ""


def revisar_workflow(entrada, session_id=None):
    guion = leer_guion(entrada)
    if not guion:
        return None  # sin script legible no hay nada que revisar aquí
    guion = quitar_comentarios(guion)
    llamadas = len(LLAMADA_AGENTE.findall(guion))
    modelos = [m.strip() for m in MODELO_EN_GUION.findall(guion)]
    if any(not es_modelo_permitido(m, MODELOS_WORKFLOW) for m in modelos if m):
        deny("El script del workflow fija un agente con un modelo no permitido "
             "(solo haiku, sonnet u opus).")
    if sum(1 for m in modelos if m and es_modelo_permitido(m, MODELOS_WORKFLOW)) < llamadas:
        deny("Hay agent() sin model explícito (haiku, sonnet u opus) en el workflow.")
    for esfuerzo in (e.strip().lower() for e in ESFUERZO_EN_GUION.findall(guion)):
        if esfuerzo and (esfuerzo not in ESFUERZOS_PERMITIDOS or esfuerzo == "xhigh"):
            deny("El script del workflow pide effort=%r; el máximo es %s."
                 % (esfuerzo, ESFUERZO_MAX_WORKFLOW))
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
        if revisor is revisar_agente and es_fork(entrada):
            return revisar_fork(datos)  # model y effort no cuentan en un fork
        actualizada = revisor(entrada, sesion)
    except SystemExit:
        raise
    except Exception:
        return  # ante un fallo del guardián, no bloquear el trabajo normal
    if actualizada is not None:
        allow(*actualizada)


if __name__ == "__main__":
    main()

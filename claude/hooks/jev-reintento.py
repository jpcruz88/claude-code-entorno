#!/usr/bin/env python3
"""PostToolUseFailure y PostToolUse: si la misma herramienta falla dos veces seguidas con el
mismo error, le pregunta a Jev si reintentar, cambiar de enfoque o parar y preguntar.

Qué hace:
- Fallo (PostToolUseFailure): cuenta los fallos seguidos de la misma herramienta con el mismo
  error normalizado, por sesión. Al segundo, pregunta a Jev (`reintento`) y, si Jev responde,
  devuelve su elección como nota para Claude (additionalContext).
- Éxito (PostToolUse): si es la misma herramienta, reinicia la cuenta. No imprime nada.
- Las interrupciones (is_interrupt: true) se ignoran: no cuentan como fallo.
- Estado en ~/.claude/jev/estado.json. Registro en decisiones.jsonl, sin el texto del error.

Cualquier fallo propio deja pasar la acción: este hook nunca bloquea nada.
"""
import contextlib
import datetime
import json
import os
import re
import sys
import tempfile
from pathlib import Path

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import jev_cliente
except Exception:
    jev_cliente = None  # sin Jev el hook se queda en silencio

PREGUNTA = "reintento"
OPCIONES = ["reintentar", "cambiar_enfoque", "parar_y_preguntar"]
FRASES = {
    "reintentar": "reintentar tal cual",
    "cambiar_enfoque": "cambiar de enfoque",
    "parar_y_preguntar": "parar y preguntar al usuario",
}
DESCRIPCION_MAX = 60
ERROR_REGISTRO_MAX = 60
ERROR_NORMAL_MAX = 200

RUTA_WINDOWS = re.compile(r"\b[A-Za-z]:\\[^\s'\"`<>|]*")
RUTA_UNIX = re.compile(r"(?<![\w.])/[^\s'\"`<>|]*")
MARCA_DE_TIEMPO = re.compile(
    r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?")
HORA = re.compile(r"\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?")
NUMERO = re.compile(r"\d+")


def normalizar_error(texto):
    """Quita rutas, marcas de tiempo y números; colapsa espacios; recorta a 200 caracteres."""
    limpio = "" if texto is None else str(texto)
    for patron in (RUTA_WINDOWS, RUTA_UNIX, MARCA_DE_TIEMPO, HORA, NUMERO):
        limpio = patron.sub(" ", limpio)
    return " ".join(limpio.split())[:ERROR_NORMAL_MAX].rstrip()


def _texto(valor):
    return valor if isinstance(valor, str) else ""


def _entero(valor):
    try:
        return int(valor)
    except Exception:
        return 0


def _carpeta(home):
    carpeta = Path(home, ".claude", "jev")
    os.makedirs(carpeta, mode=0o700, exist_ok=True)
    return carpeta


def _bloqueo(carpeta):
    """El mismo bloqueo que usa jev_cliente para decisiones.lock; sin Jev, no bloquea."""
    if jev_cliente is None:
        return contextlib.nullcontext()
    return jev_cliente._bloqueo(carpeta)


def _leer_estado(carpeta):
    try:
        datos = json.loads((carpeta / "estado.json").read_text(encoding="utf-8"))
        return datos if isinstance(datos, dict) else {}
    except Exception:
        return {}


def _escribir_estado(carpeta, estado):
    """Escribe a un temporal y lo cambia con os.replace: nunca queda a medias."""
    temporal = None
    try:
        fd, temporal = tempfile.mkstemp(dir=carpeta, prefix="estado-", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False)
        os.replace(temporal, carpeta / "estado.json")
        temporal = None
    finally:
        if temporal is not None:
            with contextlib.suppress(OSError):
                os.unlink(temporal)


def registrar_fallo(home, sesion, herramienta, error_normal):
    """Suma un fallo a la cuenta de la sesión y devuelve la cuenta nueva."""
    carpeta = _carpeta(home)
    with _bloqueo(carpeta):
        estado = _leer_estado(carpeta)
        previo = estado.get(sesion) if isinstance(estado.get(sesion), dict) else {}
        misma = (previo.get("herramienta") == herramienta
                 and previo.get("error_normal") == error_normal)
        cuenta = _entero(previo.get("cuenta")) + 1 if misma else 1
        estado[sesion] = {"herramienta": herramienta, "error_normal": error_normal,
                          "cuenta": cuenta}
        _escribir_estado(carpeta, estado)
    return cuenta


def reiniciar(home, sesion, herramienta):
    """Un éxito de la misma herramienta pone la cuenta de la sesión en 0."""
    ruta = Path(home, ".claude", "jev", "estado.json")
    if not ruta.is_file():
        return  # sin fallos previos no hay nada que reiniciar; no crea carpetas
    carpeta = _carpeta(home)
    with _bloqueo(carpeta):
        estado = _leer_estado(carpeta)
        previo = estado.get(sesion)
        if (isinstance(previo, dict) and previo.get("herramienta") == herramienta
                and _entero(previo.get("cuenta")) != 0):
            previo["cuenta"] = 0
            _escribir_estado(carpeta, estado)


def consultar_jev(home, herramienta, error):
    """Devuelve (decision, config). decision es None si Jev no responde. Nunca lanza.

    Jev recibe solo el nombre de la herramienta y el error: la entrada (en Bash, el comando
    completo) puede llevar tokens y no sale del equipo.
    """
    if jev_cliente is None:
        return None, None
    config = jev_cliente.cargar_config(home)
    clave = jev_cliente.leer_clave(home, os.environ)
    if not clave:
        return None, config
    encargo = "Herramienta: %s\n\nError:\n%s" % (herramienta, error)
    return jev_cliente.decidir(PREGUNTA, encargo, OPCIONES, config, clave), config


def nota_para_claude(decision, sharp, herramienta):
    p = ("%.2f" % float(decision["confianza"])).replace(".", ",")
    cabecera = "Jev (p=%s): " if sharp else "Jev sugiere (p=%s): "
    frase = FRASES.get(decision["opcion"], decision["opcion"])
    return (cabecera % p) + frase + ". Mismo error dos veces en %s." % herramienta


def evaluar(entrada):
    """Devuelve el texto JSON de salida, o None si no hay nada que decir."""
    evento = entrada.get("hook_event_name")
    if evento not in ("PostToolUseFailure", "PostToolUse"):
        return None
    herramienta = _texto(entrada.get("tool_name"))
    if not herramienta:
        return None
    sesion = _texto(entrada.get("session_id")) or "sin-sesion"
    home = os.path.expanduser("~")

    if evento == "PostToolUse":
        reiniciar(home, sesion, herramienta)
        return None
    if entrada.get("is_interrupt") is True:
        return None

    error = entrada.get("error")
    error = error if isinstance(error, str) else ("" if error is None else str(error))
    error_normal = normalizar_error(error)
    cuenta = registrar_fallo(home, sesion, herramienta, error_normal)
    if cuenta != 2:
        return None

    decision, config = consultar_jev(home, herramienta, error)
    sharp = decision is not None and jev_cliente.es_sharp(decision, config)
    linea = {
        "hora": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "session_id": sesion,
        "tipo": "reintento",
        "descripcion": herramienta[:DESCRIPCION_MAX],
        "error": error_normal[:ERROR_REGISTRO_MAX],
    }
    if decision is None:
        linea.update(opcion=None, confianza=None, sharp=False, nota=False,
                     latencia_ms=None, costo=None, motivo="sin respuesta")
        if jev_cliente is not None:
            jev_cliente.registrar(home, linea)
        return None
    linea.update(opcion=decision["opcion"], confianza=decision["confianza"], sharp=sharp,
                 nota=True, latencia_ms=decision.get("latencia_ms"), costo=decision.get("costo"))
    jev_cliente.registrar(home, linea)
    return json.dumps({"hookSpecificOutput": {
        "hookEventName": evento,
        "additionalContext": nota_para_claude(decision, sharp, herramienta),
    }}, ensure_ascii=False)


def main():
    try:
        crudo = sys.stdin.buffer.read() if hasattr(sys.stdin, "buffer") else sys.stdin.read()
        if isinstance(crudo, bytes):
            crudo = crudo.decode("utf-8", "replace")
        entrada = json.loads(crudo)
        if not isinstance(entrada, dict):
            return
        salida = evaluar(entrada)
        if salida:
            print(salida)
    except Exception:
        return  # un error propio nunca debe frenar el trabajo normal


if __name__ == "__main__":
    main()

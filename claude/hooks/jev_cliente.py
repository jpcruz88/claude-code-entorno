"""Cliente de Jev (modelo de decisiones de TypeSafe) por la Decisions API de OpenRouter.

Lo usan los hooks de Claude Code para pedir a Jev una decisión tipada (una opción de una
lista) y dejar un registro local en ~/.claude/jev/decisiones.jsonl.

Reglas:
- Nunca lanza excepciones: cualquier fallo (red, timeout, HTTP 402/429, respuesta rara)
  es «sin respuesta» (`None`), y entonces pasa lo que eligió Claude.
- El encargo viaja a Jev, pero nunca se escribe en el registro. Jev recibe como máximo
  32.000 caracteres: por encima entra en modo de contexto largo (más lento).
- La clave de OpenRouter nunca aparece en salidas, registros ni mensajes de error.
- Sin dependencias externas (solo la biblioteca estándar).

Variable de entorno JEV_URL: cambia la URL del endpoint (solo para pruebas).
"""
import copy
import json
import os
import stat
import time
import urllib.error
import urllib.request
from pathlib import Path

LIMITE_ENCARGO = 32000
LIMITE_REGISTRO = 2000
CAMPOS_PRIVADOS = ("encargo", "texto")
VARIABLE_CLAVE = "OPENROUTER_API_KEY"

DEFECTOS = {
    "umbral": 0.80,
    "timeout": 2.0,
    "modelo_jev": "typesafe/jev-1.14",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "definiciones": {
        "modelo": {
            "haiku": "Tarea mecánica y de bajo riesgo: búsquedas, formatos, cambios pequeños.",
            "sonnet": "Funcionalidad o depuración con alcance acotado.",
            "opus": "Causa raíz poco clara, decisiones de arquitectura o riesgo alto.",
        },
        "esfuerzo": {
            "low": "Tarea trivial o de respuesta directa.",
            "medium": "Tarea habitual de código o de análisis.",
            "high": "Razonamiento difícil con muchas dependencias.",
        },
        "reintento": {
            "reintentar": "Fallo transitorio o de entorno; volver a intentar tal cual.",
            "cambiar_enfoque": "El enfoque no sirve; probar otra estrategia.",
            "parar_y_preguntar": "Falta información o hay riesgo; preguntar al usuario.",
        },
    },
}

PREGUNTAS_FIJAS = {
    "modelo": ["haiku", "sonnet", "opus"],
    "esfuerzo": ["low", "medium", "high"],
    "reintento": ["reintentar", "cambiar_enfoque", "parar_y_preguntar"],
}


def _ruta_jev(home):
    return Path(home, ".claude", "jev")


def cargar_config(home):
    """Valores por defecto mezclados con ~/.claude/jev/config.json si existe y es válido."""
    config = copy.deepcopy(DEFECTOS)
    try:
        datos = json.loads(_ruta_jev(home).joinpath("config.json").read_text(encoding="utf-8"))
        if isinstance(datos, dict):
            for clave, valor in datos.items():
                if clave == "definiciones" and isinstance(valor, dict):
                    config["definiciones"].update(valor)
                else:
                    config[clave] = valor
    except Exception:
        pass
    return config


def leer_clave(home, entorno):
    """OPENROUTER_API_KEY; si falta, ~/.claude/jev/clave, solo si sus permisos son 600."""
    try:
        valor = entorno.get(VARIABLE_CLAVE)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
        archivo = _ruta_jev(home) / "clave"
        if stat.S_IMODE(os.stat(archivo).st_mode) != 0o600:
            return None
        valor = archivo.read_text(encoding="utf-8").strip()
        return valor or None
    except Exception:
        return None


def _es_numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def decidir(pregunta, texto, opciones, config, clave):
    """Pide a Jev una elección entre `opciones`. Devuelve un dict o None (sin respuesta)."""
    try:
        inicio = time.monotonic()
        url = os.environ.get("JEV_URL") or config["url"]
        definiciones = config["definiciones"].get(pregunta, {})
        criterios = {op: definiciones.get(op, op) for op in opciones}
        cuerpo = {
            "model": config["modelo_jev"],
            "state": {"encargo": texto[:LIMITE_ENCARGO]},
            "questions": {pregunta: {
                "type": "choice",
                "instructions": "Choose the option that best fits the task.",
                "criteria": criterios,
            }},
        }
        peticion = urllib.request.Request(
            url,
            data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + clave, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(peticion, timeout=config["timeout"]) as resp:
            datos = json.loads(resp.read().decode("utf-8"))

        respuesta = datos["answers"][pregunta]
        eleccion = respuesta["choice"]
        if eleccion not in opciones:
            return None
        probabilidades = respuesta.get("probabilities")
        if not isinstance(probabilidades, dict):
            probabilidades = {}
        confianza = respuesta.get("confidence")
        if not _es_numero(confianza):
            confianza = probabilidades.get(eleccion)
        if not _es_numero(confianza):
            return None
        uso = datos.get("usage") or {}
        costo = uso.get("cost")
        return {
            "opcion": eleccion,
            "confianza": confianza,
            "probabilidades": probabilidades,
            "costo": costo if _es_numero(costo) else 0.0,
            "latencia_ms": int((time.monotonic() - inicio) * 1000),
        }
    except urllib.error.HTTPError as error:
        error.close()
        return None
    except Exception:
        return None


def es_sharp(decision, config):
    """True si la confianza de la decisión alcanza el umbral (0,80 por defecto)."""
    try:
        return float(decision["confianza"]) >= float(config["umbral"])
    except Exception:
        return False


def registrar(home, linea):
    """Agrega `linea` a decisiones.jsonl y lo recorta a sus últimas 2000 líneas.

    Quita los campos privados (encargo, texto) antes de escribir. Nunca lanza excepciones.
    """
    try:
        carpeta = _ruta_jev(home)
        os.makedirs(carpeta, mode=0o700, exist_ok=True)
        limpia = {k: v for k, v in linea.items() if k not in CAMPOS_PRIVADOS}
        archivo = carpeta / "decisiones.jsonl"
        with open(archivo, "a", encoding="utf-8") as f:
            f.write(json.dumps(limpia, ensure_ascii=False) + "\n")
        lineas = archivo.read_text(encoding="utf-8").splitlines(keepends=True)
        if len(lineas) > LIMITE_REGISTRO:
            temporal = carpeta / "decisiones.jsonl.tmp"
            temporal.write_text("".join(lineas[-LIMITE_REGISTRO:]), encoding="utf-8")
            os.replace(temporal, archivo)
    except Exception:
        pass

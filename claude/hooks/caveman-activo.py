#!/usr/bin/env python3
"""SessionStart y UserPromptSubmit: el modo caveman se activa solo en cada sesión.

La regla `caveman.md` pide responder siempre en modo caveman, pero una regla es solo
texto: nada garantiza que la skill se cargue. Este hook lo garantiza de dos formas:

- SessionStart: mete en el contexto las reglas del modo, en corto. No copia la skill
  `caveman` entera: ese texto se paga en cada sesión y en cada subagente, así que solo
  van las reglas y una remisión a la skill para el detalle. Una sesión nueva o un
  `/clear` empiezan en `full`; al reanudar o compactar se conserva el modo que la
  sesión ya tenía.
- UserPromptSubmit: una línea corta que recuerda el modo en cada mensaje. También
  sigue los cambios que pide el usuario: `/caveman lite|full|ultra`, «stop caveman»
  y «modo normal».

El modo de cada sesión se guarda en `~/.claude/caveman/<id de sesión>`.
Cualquier fallo propio sale con código 0 y sin texto: este hook nunca bloquea.
"""
import json
import re
import sys
import time
from pathlib import Path

NIVELES = ("lite", "full", "ultra")
APAGADO = "off"
POR_OMISION = "full"
DIAS_DE_ESTADO = 30

# Los mismos patrones que el mod caveman-badge, para que el badge y el hook coincidan.
NIVEL = re.compile(r"^\s*/caveman(?:\s+(lite|full|ultra))?\s*$", re.IGNORECASE)
# Se admite puntuación alrededor («stop caveman.», «¡modo normal!»), pero no más palabras.
APAGAR = re.compile(r"^[\W_]*(stop\s+caveman|modo\s+normal|normal\s+mode)[\W_]*$",
                    re.IGNORECASE)

EXCEPCIONES = (
    "Solo se comprime lo que le respondes al usuario en el chat, en español. Lo que se "
    "escribe para otras personas o programas va en español normal y completo: código y "
    "comentarios, commits y PRs, documentos, specs, planes, tickets, mensajes y prompts "
    "de agentes. También las advertencias de seguridad, las confirmaciones de acciones "
    "irreversibles y los pasos que se siguen en orden."
)

REGLAS = (
    "Responde telegráfico: primero la respuesta, luego la razón y el siguiente paso. "
    "Frases cortas, sin relleno ni cortesías, sin anunciar lo que vas a hacer y sin "
    "resumen final. Términos técnicos, comandos, rutas, números y errores exactos. "
    "Nunca quites una negación. Si comprimir resta claridad, gana la claridad. "
    "El detalle está en la skill `caveman`."
)


def carpeta_estado(home):
    return Path(home) / ".claude" / "caveman"


def _archivo(home, sesion):
    nombre = re.sub(r"[^A-Za-z0-9_-]", "_", str(sesion or ""))[:120] or "sin-sesion"
    return carpeta_estado(home) / nombre


def leer_modo(home, sesion):
    """Modo guardado de la sesión, o None si no hay ninguno válido."""
    try:
        modo = _archivo(home, sesion).read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return modo if modo in NIVELES or modo == APAGADO else None


def guardar_modo(home, sesion, modo):
    archivo = _archivo(home, sesion)
    archivo.parent.mkdir(parents=True, exist_ok=True)
    archivo.write_text(modo, encoding="utf-8")


def limpiar_viejos(home, ahora):
    """Borra el estado de las sesiones que llevan más de DIAS_DE_ESTADO sin usarse."""
    limite = ahora - DIAS_DE_ESTADO * 86400
    try:
        archivos = list(carpeta_estado(home).iterdir())
    except OSError:
        return
    for archivo in archivos:
        try:
            if archivo.is_file() and archivo.stat().st_mtime < limite:
                archivo.unlink()
        except OSError:
            pass


def siguiente_modo(actual, texto):
    """Modo tras el mensaje del usuario; `actual` si el mensaje no lo cambia."""
    nivel = NIVEL.match(texto)
    if nivel:
        return (nivel.group(1) or POR_OMISION).lower()
    if APAGAR.match(texto):
        return APAGADO
    return actual


def texto_inicio(modo):
    return (
        "Caveman mode: %s. El modo caveman está ACTIVO desde el primer mensaje de esta "
        "sesión, sin que el usuario lo pida y sin anunciarlo. Sigue activo hasta que el "
        "usuario diga «stop caveman» o «modo normal»; el nivel se cambia con "
        "`/caveman lite|full|ultra`.\n\n%s\n\n%s" % (modo, REGLAS, EXCEPCIONES)
    )


def texto_recordatorio(modo):
    return (
        "Caveman mode: %s. Responde al usuario en español, telegráfico y sin relleno. "
        "Código, commits, documentos y prompts de agentes van en español normal." % modo
    )


TEXTO_APAGADO = (
    "Caveman mode: off. El usuario apagó el modo caveman: confírmalo en una línea y "
    "responde en español normal hasta que lo vuelva a pedir con `/caveman`."
)


def _salida(evento, texto):
    return {"hookSpecificOutput": {"hookEventName": evento, "additionalContext": texto}}


def main(evento, home, ahora=None):
    """Devuelve el JSON que el hook debe imprimir, o None si no hay nada que decir."""
    if not isinstance(evento, dict):
        return None
    nombre = evento.get("hook_event_name")
    sesion = evento.get("session_id")

    if nombre == "SessionStart":
        limpiar_viejos(home, time.time() if ahora is None else ahora)
        modo = POR_OMISION
        if evento.get("source") in ("resume", "compact"):
            modo = leer_modo(home, sesion) or POR_OMISION
        if modo == APAGADO:
            return None
        guardar_modo(home, sesion, modo)
        return _salida(nombre, texto_inicio(modo))

    if nombre == "UserPromptSubmit":
        antes = leer_modo(home, sesion) or POR_OMISION
        modo = siguiente_modo(antes, str(evento.get("prompt") or ""))
        if modo != antes or leer_modo(home, sesion) is None:
            guardar_modo(home, sesion, modo)
        if modo == APAGADO:
            return _salida(nombre, TEXTO_APAGADO) if antes != APAGADO else None
        return _salida(nombre, texto_recordatorio(modo))

    return None


if __name__ == "__main__":
    try:
        salida = main(json.loads(sys.stdin.read()), Path.home())
        if salida:
            print(json.dumps(salida, ensure_ascii=False))
    except Exception:
        pass
    sys.exit(0)

"""Tope de modelo y esfuerzo para los subagentes según el uso de la cuenta.

Lee ~/.claude/jev/limites.json (lo escribe la statusline) y calcula el modelo y el
esfuerzo máximos que conviene usar ahora, para gastar la suscripción casi entera sin
quedarse sin uso antes del viernes. Las reglas están en
docs/superpowers/specs/2026-11-06-jev-limites-design.md.

Reglas del módulo:
- Puro y sin red; solo biblioteca estándar.
- Un error propio nunca bloquea: si algo falla, no hay tope.
- Sin dato, o con un dato de más de `max_antiguedad_h` horas, no hay tope.
"""
import datetime
import json
import re
from pathlib import Path

MODELOS = ["haiku", "sonnet", "opus", "fable"]  # de menor a mayor gasto
TECHO = ("fable", "xhigh")  # lo más alto que puede permitir una ventana
ESFUERZOS = ["low", "medium", "high", "xhigh"]  # `max` queda bloqueado siempre

DEFAULTS_LIMITES = {
    "meta_corte": 90,
    "final": 97,
    # [umbral, modelo, esfuerzo]: el primer escalón cuyo umbral alcanza el valor.
    # Semana: se compara el exceso (<=). Por encima del último: haiku/medium.
    "semana_escalones": [[-20, "fable", "xhigh"], [-10, "opus", "xhigh"], [5, "opus", "high"],
                         [10, "opus", "medium"], [15, "sonnet", "high"], [25, "sonnet", "medium"]],
    # 5 h: se compara el uso (<). Desde el último umbral: haiku/medium.
    # xhigh solo pasa con la semana por debajo del ritmo y la ventana de 5 h bajo 60 %
    # (o sin ventana de 5 h en la cuenta). Fable pide más margen: la semana 20 puntos bajo
    # el ritmo y la ventana de 5 h bajo 40 %.
    "h5_escalones": [[40, "fable", "xhigh"], [60, "opus", "xhigh"], [75, "opus", "medium"],
                     [85, "sonnet", "medium"]],
    "h5_gracia_min": 15,
    "corte_dia": 3,  # jueves, con lunes = 0
    "corte_hora": 23,
    "max_antiguedad_h": 6,
}

_FAMILIA = re.compile(r"claude-(haiku|sonnet|opus|fable)(-.*)?")


def _config_limites(config):
    """DEFAULTS_LIMITES mezclados con la clave `limites` de la configuración.

    Acepta la configuración completa de Jev (con la clave `limites`) o el dict de
    límites directamente.
    """
    cfg = dict(DEFAULTS_LIMITES)
    try:
        if isinstance(config, dict):
            propios = config.get("limites", config)
            if isinstance(propios, dict):
                cfg.update({k: v for k, v in propios.items() if k in DEFAULTS_LIMITES})
    except Exception:
        pass
    return cfg


def _es_numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _ventana_valida(ventana, ahora):
    """Con números y sin reinicio vencido: una ventana que ya se reinició es «sin dato»."""
    return (isinstance(ventana, dict) and _es_numero(ventana.get("usado"))
            and _es_numero(ventana.get("reinicio")) and ventana["reinicio"] > ahora)


def leer_limites(home, ahora):
    """Contenido de limites.json, o None si falta, está roto, es viejo o no es válido."""
    try:
        carpeta = Path(home, ".claude", "jev")
        try:
            config = json.loads((carpeta / "config.json").read_text(encoding="utf-8"))
        except Exception:
            config = {}
        cfg = _config_limites(config)
        datos = json.loads((carpeta / "limites.json").read_text(encoding="utf-8"))
        if not isinstance(datos, dict) or not _es_numero(datos.get("actualizado")):
            return None
        if ahora - datos["actualizado"] > float(cfg["max_antiguedad_h"]) * 3600:
            return None
        return datos
    except Exception:
        return None


def _corte(reinicio, cfg, tz):
    """Epoch del día de corte a la hora de corte más reciente que no pase de `reinicio`."""
    dt = datetime.datetime.fromtimestamp(reinicio, tz)
    atras = (dt.weekday() - int(cfg["corte_dia"])) % 7
    fecha = dt.date() - datetime.timedelta(days=atras)

    def a_epoch(dia):
        naive = datetime.datetime.combine(dia, datetime.time(int(cfg["corte_hora"])))
        return (naive.replace(tzinfo=tz) if tz is not None else naive).timestamp()

    corte = a_epoch(fecha)
    if corte > reinicio:
        corte = a_epoch(fecha - datetime.timedelta(days=7))
    return corte


def _etiqueta(modelo, esfuerzo):
    return modelo if modelo != "opus" else "esfuerzo " + esfuerzo


def _sin_recorte(modelo, esfuerzo):
    """Opus o Fable con esfuerzo alto: la ventana no recorta nada que haya que explicar."""
    return MODELOS.index(modelo) >= MODELOS.index("opus") and esfuerzo in ("high", "xhigh")


def _tope_semana(ventana, ahora, cfg, tz):
    """(modelo, esfuerzo, motivo, resumen) de la semana. Resumen: usado, ritmo, exceso."""
    usado = float(ventana["usado"])
    reinicio = float(ventana["reinicio"])
    inicio = reinicio - 7 * 86400
    corte = _corte(reinicio, cfg, tz)
    meta = float(cfg["meta_corte"])
    if corte > inicio:
        ritmo = meta * (ahora - inicio) / (corte - inicio)
    else:
        ritmo = meta
    ritmo = max(0.0, min(meta, ritmo))
    exceso = usado - ritmo
    resumen = {"usado": usado, "ritmo": ritmo, "exceso": exceso}

    if ahora >= corte:
        if usado >= float(cfg["final"]):
            return "haiku", "medium", "tope semana %.0f%% → haiku" % usado, resumen
        return TECHO[0], TECHO[1], None, resumen
    modelo, esfuerzo = "haiku", "medium"
    if usado < meta:
        for umbral, m, e in cfg["semana_escalones"]:
            if exceso <= float(umbral):
                modelo, esfuerzo = m, e
                break
    if _sin_recorte(modelo, esfuerzo):
        return modelo, esfuerzo, None, resumen
    if usado >= meta:  # con la meta ya cumplida el exceso sobre el ritmo no explica el tope
        return modelo, esfuerzo, "tope semana %.0f%% → %s" % (usado, _etiqueta(modelo, esfuerzo)), resumen
    return modelo, esfuerzo, "tope semana %+.0f pts → %s" % (exceso, _etiqueta(modelo, esfuerzo)), resumen


def _tope_5h(ventana, ahora, cfg):
    usado = float(ventana["usado"])
    if float(ventana["reinicio"]) - ahora < float(cfg["h5_gracia_min"]) * 60:
        return TECHO[0], TECHO[1], None  # la gracia no pone ningún tope
    modelo, esfuerzo = "haiku", "medium"
    for umbral, m, e in cfg["h5_escalones"]:
        if usado < float(umbral):
            modelo, esfuerzo = m, e
            break
    if _sin_recorte(modelo, esfuerzo):
        return modelo, esfuerzo, None
    return modelo, esfuerzo, "tope 5h %.0f%% → %s" % (usado, _etiqueta(modelo, esfuerzo))


def calcular_tope(limites, ahora, config, tz=None):
    """Tope vigente: {modelo_max, esfuerzo_max, motivo, semana}. Sin dato: opus y high.

    `tz=None` es la hora local del sistema. Nunca lanza excepciones.
    """
    libre = {"modelo_max": "opus", "esfuerzo_max": "high", "motivo": None, "semana": None}
    try:
        if not isinstance(limites, dict):
            return libre
        cfg = _config_limites(config)
        candidatos = []
        semana = None
        # Hay cuentas a las que Claude Code no les manda la ventana de 5 h: si falta del
        # todo, decide solo la semana. Una ventana presente pero vencida o rota no cuenta.
        completo = (_ventana_valida(limites.get("seven_day"), ahora)
                    and ("five_hour" not in limites
                         or _ventana_valida(limites.get("five_hour"), ahora)))
        if _ventana_valida(limites.get("seven_day"), ahora):
            modelo, esfuerzo, motivo, semana = _tope_semana(limites["seven_day"], ahora, cfg, tz)
            candidatos.append((modelo, esfuerzo, motivo))
        if _ventana_valida(limites.get("five_hour"), ahora):
            candidatos.append(_tope_5h(limites["five_hour"], ahora, cfg))
        if not candidatos:
            return libre
        modelo = min((c[0] for c in candidatos), key=MODELOS.index)
        esfuerzo = min((c[1] for c in candidatos), key=ESFUERZOS.index)
        if not completo:  # xhigh y Fable exigen conocer la semana y, si la cuenta la tiene, la de 5 h
            if ESFUERZOS.index(esfuerzo) > ESFUERZOS.index("high"):
                esfuerzo = "high"
            if MODELOS.index(modelo) > MODELOS.index("opus"):
                modelo = "opus"
        # Pone el motivo la ventana que baja el modelo; si ninguna, la que baja el esfuerzo.
        manda = min(candidatos, key=lambda c: (MODELOS.index(c[0]), ESFUERZOS.index(c[1])))
        motivo = manda[2]
        return {"modelo_max": modelo, "esfuerzo_max": esfuerzo, "motivo": motivo, "semana": semana}
    except Exception:
        return libre


def _familia(modelo):
    m = str(modelo).lower()
    if m in MODELOS:
        return m
    encontrada = _FAMILIA.fullmatch(m)
    return encontrada.group(1) if encontrada else None


def aplicar_tope(modelo, esfuerzo, tope):
    """(modelo, esfuerzo) tras aplicar el tope. Nunca sube; un valor desconocido se deja igual.

    Si el tope baja un id completo (`claude-opus-5-5`), devuelve el nombre corto (`sonnet`).
    """
    try:
        familia = _familia(modelo)
        if familia is not None and MODELOS.index(familia) > MODELOS.index(tope["modelo_max"]):
            modelo = tope["modelo_max"]
        e = str(esfuerzo).lower()
        if e in ESFUERZOS and ESFUERZOS.index(e) > ESFUERZOS.index(tope["esfuerzo_max"]):
            esfuerzo = tope["esfuerzo_max"]
    except Exception:
        pass
    return modelo, esfuerzo

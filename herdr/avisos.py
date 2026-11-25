#!/usr/bin/env python3
"""Avisa con nombre claro cuando un agente de herdr termina o necesita respuesta.

El aviso propio de herdr 0.9.5 dice, por ejemplo, «claude finished · Personales · 1»:
no nombra la máquina, el «1» es el número del espacio de trabajo y la pestaña solo
aparece si el espacio tiene más de una. Su texto no se puede configurar, así que la
config de herdr los apaga (`[ui.toast] delivery = "off"`) y este vigía avisa así:

    Colabora: Claude terminó
    m4 › Personales
    Cloudflare a disco duro externo

Cada pocos segundos lee los agentes de esta Mac y de las máquinas guardadas en herdr
(`herdr machine list`). Como herdr, solo avisa si el agente sigue terminado o
bloqueado tras la espera: si lo miras antes, herdr lo marca como visto y no avisa.

Uso: avisos.py <ruta de herdr>
Variables: HERDR_AVISOS_ESPERA (segundos, 30) y HERDR_AVISOS_INTERVALO (segundos, 5).
"""
import json
import os
import subprocess
import sys
import time

VERBOS = {"done": "terminó", "blocked": "necesita tu respuesta"}
NOMBRES = {"claude": "Claude", "opencode": "OpenCode", "codex": "Codex"}
ESTA_MAC = "Esta Mac"


class Vigia:
    def __init__(self, espera=30):
        self.espera = espera
        self.vistos = {}  # (máquina, panel) -> {"estado", "desde", "avisado"}

    def paso(self, ahora, agentes, respondieron):
        """Devuelve los agentes de los que toca avisar ahora."""
        avisos = []
        presentes = set()
        for a in agentes:
            clave = (a["maquina"], a["pane_id"])
            presentes.add(clave)
            previo = self.vistos.get(clave)
            if previo is None:
                # Lo que ya estaba terminado al arrancar no es noticia.
                self.vistos[clave] = {"estado": a["estado"], "desde": ahora, "avisado": True}
            elif previo["estado"] != a["estado"]:
                self.vistos[clave] = {"estado": a["estado"], "desde": ahora, "avisado": False}
            elif (not previo["avisado"] and a["estado"] in VERBOS
                  and ahora - previo["desde"] >= self.espera):
                previo["avisado"] = True
                avisos.append(a)
        # Olvida los paneles cerrados, solo de las máquinas que respondieron.
        for clave in list(self.vistos):
            if clave[0] in respondieron and clave not in presentes:
                del self.vistos[clave]
        return avisos


def texto(a):
    nombre = NOMBRES.get(a["agente"], a["agente"].capitalize())
    titulo = "%s: %s %s" % (a["pestana"], nombre, VERBOS[a["estado"]])
    subtitulo = "%s › %s" % (a["maquina"] or ESTA_MAC, a["espacio"])
    return titulo, subtitulo, a["tarea"] or nombre


def orden_notificacion(titulo, subtitulo, cuerpo):
    # Los textos van como argumentos: así no hay que escapar comillas en AppleScript.
    return ["osascript", "-e", "on run argv",
            "-e", "display notification (item 1 of argv) with title (item 2 of argv) "
                  "subtitle (item 3 of argv)",
            "-e", "end run", cuerpo, titulo, subtitulo]


def _json(herdr, maquina, *args):
    orden = [herdr] + (["--machine", maquina] if maquina else []) + list(args)
    r = subprocess.run(orden, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, timeout=20)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace").strip())
    return json.loads(r.stdout)


def leer_maquina(herdr, maquina):
    agentes = _json(herdr, maquina, "agent", "list")["result"]["agents"]
    espacios = {w["workspace_id"]: w["label"]
                for w in _json(herdr, maquina, "workspace", "list")["result"]["workspaces"]}
    pestanas = {t["tab_id"]: t["label"]
                for t in _json(herdr, maquina, "tab", "list")["result"]["tabs"]}
    return [{"maquina": maquina, "pane_id": a["pane_id"], "estado": a.get("agent_status", ""),
             "agente": a.get("agent") or "agente",
             "espacio": espacios.get(a.get("workspace_id"), "?"),
             "pestana": pestanas.get(a.get("tab_id"), "?"),
             "tarea": a.get("terminal_title_stripped") or ""}
            for a in agentes]


def leer(herdr):
    """Agentes de esta Mac (máquina None) y de las máquinas guardadas que respondieron."""
    maquinas = [None]
    try:
        maquinas += [m["label"] for m in _json(herdr, None, "machine", "list", "--json")
                     if m.get("enabled")]
    except Exception as e:  # sin máquinas guardadas, solo esta Mac
        print("herdr machine list: %s" % e, file=sys.stderr)
    agentes, respondieron = [], set()
    for maquina in maquinas:
        try:
            agentes += leer_maquina(herdr, maquina)
            respondieron.add(maquina)
        except Exception as e:
            print("%s: %s" % (maquina or ESTA_MAC, e), file=sys.stderr)
    return agentes, respondieron


def main():
    if len(sys.argv) != 2:
        print("uso: avisos.py <ruta de herdr>", file=sys.stderr)
        return 2
    herdr = sys.argv[1]
    vigia = Vigia(espera=float(os.environ.get("HERDR_AVISOS_ESPERA", "30")))
    intervalo = float(os.environ.get("HERDR_AVISOS_INTERVALO", "5"))
    while True:
        agentes, respondieron = leer(herdr)
        for a in vigia.paso(time.time(), agentes, respondieron):
            subprocess.run(orden_notificacion(*texto(a)), stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        time.sleep(intervalo)


if __name__ == "__main__":
    sys.exit(main())

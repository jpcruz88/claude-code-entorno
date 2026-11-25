#!/usr/bin/env python3
"""SessionStart (startup): «Al día». Actualiza una vez al día skills, plugins y programas.

Dos modos:
- Hook (sin argumentos): lee y descarta la entrada, decide con `que_revisar` si toca
  revisar y lanza este mismo script con `--revisar` en un proceso separado. Vuelve al
  instante, sin escribir nada en stdout.
- Trabajador (`--revisar [--solo-pendientes]`): toma el cerrojo, corre la revisión y lo
  suelta. Si otra revisión tiene el cerrojo vivo, sale sin hacer nada.

Cualquier fallo propio sale con código 0: este hook nunca bloquea la sesión.
"""
import functools
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import al_dia
    from al_dia import revisar
except Exception:
    al_dia = revisar = None  # sin la biblioteca el hook se queda en silencio

RUTA = os.path.abspath(__file__)


def lanzar_separado(cmd):
    """Lanza `cmd` desligado de esta sesión y sin esperarlo."""
    if os.environ.get("AL_DIA_NO_LANZAR"):   # solo para las pruebas
        return
    opciones = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL, "close_fds": True,
                # no hereda la carpeta del proyecto abierto (su .npmrc, etc.)
                "cwd": str(Path.home())}
    if sys.platform == "win32":
        opciones["creationflags"] = (getattr(subprocess, "DETACHED_PROCESS", 0x8)
                                     | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200))
    else:
        opciones["start_new_session"] = True
    subprocess.Popen(cmd, **opciones)


def _trabajar(argv, home, ahora):
    carpeta = al_dia.carpeta(home)
    if not al_dia.tomar_cerrojo(carpeta, ahora):
        return
    try:
        archivo = carpeta / "ultima-revision.json"
        estado = al_dia.leer_json(archivo) or {}
        if "--solo-pendientes" in argv:
            repetir = estado.get("repetir")
            solo = set(repetir) if isinstance(repetir, list) else set()
            # Si la revisión truena, no se reintenta antes de 1 h.
            al_dia.escribir_json(archivo, {**estado, "ultimo_intento": ahora})
        else:
            solo = None
            # Si la revisión truena, no se relanza en cada sesión; `revisar` lo reemplaza al acabar.
            al_dia.escribir_json(archivo, {"inicio": ahora, "repetir": [],
                                           "ultimo_intento": ahora})
        revisar(home, ahora, functools.partial(al_dia.ejecutar_real, home=home), solo=solo)
    finally:
        al_dia.soltar_cerrojo(carpeta)


def _decidir(home, ahora, lanzar):
    estado = al_dia.leer_json(al_dia.carpeta(home) / "ultima-revision.json")
    que = al_dia.que_revisar(estado, ahora)
    if que is None:
        return
    cmd = [sys.executable, RUTA, "--revisar"]
    if que == "pendientes":
        cmd.append("--solo-pendientes")
    lanzar(cmd)


def main(argv, home, ahora, lanzar):
    """Punto de entrada. Devuelve siempre 0."""
    if al_dia is None:
        return 0
    try:
        if "--revisar" in argv:
            _trabajar(argv, home, ahora)
        else:
            _decidir(home, ahora, lanzar)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    try:
        if "--revisar" not in sys.argv[1:]:
            sys.stdin.read()   # el evento llega por stdin; no se usa
    except Exception:
        pass
    sys.exit(main(sys.argv[1:], Path.home(), time.time(), lanzar_separado))

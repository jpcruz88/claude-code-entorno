"""Al día: estado diario, cerrojo y JSON atómico.

Base de la revisión que actualiza una vez al día skills, plugins y programas.
Solo biblioteca estándar.
"""
import json
import os
import tempfile
from pathlib import Path

HORAS_REVISION = 24 * 3600   # revisión completa cada 24 h desde el inicio de la última
REINTENTO = 3600             # los pendientes se reintentan pasada 1 h
CERROJO_MUERTO = 3600        # un cerrojo de más de 1 h se da por muerto


def carpeta(home):
    """Carpeta de estado de Al día dentro del HOME dado."""
    return Path(home) / ".claude" / "al-dia"


def que_revisar(estado, ahora):
    """Decide qué revisar: "todo", "pendientes" o None.

    `estado` es el contenido de ultima-revision.json: {"inicio": float, "repetir": [str]}.
    """
    if not isinstance(estado, dict):
        return "todo"
    inicio = estado.get("inicio")
    if isinstance(inicio, bool) or not isinstance(inicio, (int, float)):
        return "todo"
    transcurrido = ahora - inicio
    if transcurrido >= HORAS_REVISION:
        return "todo"
    if estado.get("repetir") and transcurrido >= REINTENTO:
        return "pendientes"
    return None


def _ruta_cerrojo(dir):
    return Path(dir) / "cerrojo"


def tomar_cerrojo(dir, ahora):
    """Intenta tomar el cerrojo. True si lo tomó; False si otra revisión lo tiene vivo."""
    ruta = _ruta_cerrojo(dir)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(2):
        try:
            fd = os.open(ruta, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if not _cerrojo_muerto(ruta, ahora):
                return False
            try:
                ruta.unlink()
            except FileNotFoundError:
                pass
            continue
        with os.fdopen(fd, "w") as f:
            f.write(str(ahora))
        return True
    return False


def _cerrojo_muerto(ruta, ahora):
    """Compara la hora guardada (o la mtime si no se lee) con `ahora`."""
    try:
        hora = float(ruta.read_text().strip())
    except (OSError, ValueError):
        try:
            hora = ruta.stat().st_mtime
        except OSError:
            return True
    return ahora - hora > CERROJO_MUERTO


def soltar_cerrojo(dir):
    """Libera el cerrojo; no falla si no existe."""
    try:
        _ruta_cerrojo(dir).unlink()
    except FileNotFoundError:
        pass


def escribir_json(ruta, datos):
    """Escribe JSON de forma atómica: archivo temporal y os.replace."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, temporal = tempfile.mkstemp(dir=ruta.parent, prefix=ruta.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        os.replace(temporal, ruta)
    except BaseException:
        try:
            os.unlink(temporal)
        except OSError:
            pass
        raise


def leer_json(ruta):
    """Lee un JSON objeto; None si falta, está roto o no es un objeto."""
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return datos if isinstance(datos, dict) else None

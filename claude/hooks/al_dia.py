"""Al día: estado diario, cerrojo y JSON atómico.

Base de la revisión que actualiza una vez al día skills, plugins y programas.
Solo biblioteca estándar.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

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


# Código y salida (stdout + stderr) de un comando.
Ejecutar = Callable[[list, int], tuple]

TIEMPO_CONSULTA = 60  # las consultas de versión son rápidas


def ejecutar_real(cmd, timeout):
    """Corre `cmd` sin entrada y con tiempo límite. (124, "tiempo agotado") si se acaba."""
    try:
        r = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True, timeout=timeout,
                           errors="replace")
    except subprocess.TimeoutExpired:
        return 124, "tiempo agotado"
    except OSError as e:
        return 127, str(e)
    return r.returncode, r.stdout or ""


def _carpetas_de_programas(home):
    home = Path(home)
    carpetas = [home / ".local" / "bin", home / ".opencode" / "bin",
                Path("/opt/homebrew/bin"), Path("/usr/local/bin")]
    appdata = os.environ.get("APPDATA")
    if appdata:
        carpetas.append(Path(appdata) / "npm")
    return carpetas


def buscar(programa, home):
    """Ruta del programa: PATH y, si no, las carpetas habituales. None si no está."""
    ruta = shutil.which(programa)
    if ruta:
        return ruta
    sufijos = ["", ".exe", ".cmd"] if sys.platform == "win32" else [""]
    for carpeta_ in _carpetas_de_programas(home):
        for sufijo in sufijos:
            candidato = carpeta_ / (programa + sufijo)
            if candidato.is_file() and os.access(candidato, os.X_OK):
                return str(candidato)
    return None


def _salida(programa, args, ejecutar, buscar_, home):
    """Salida de `programa args`; None si no está instalado o falla."""
    ruta = buscar_(programa, home)
    if not ruta:
        return None
    try:
        codigo, texto = ejecutar([ruta, *args], TIEMPO_CONSULTA)
    except Exception:
        return None
    return texto if codigo == 0 else None


def _json_de(texto):
    try:
        return json.loads(texto)
    except (TypeError, ValueError):
        return None


def _entrada(nombre, tipo, version, carpeta=None):
    return {"nombre": nombre, "tipo": tipo, "version": version, "carpeta": carpeta}


def _foto_skills(home):
    lock = leer_json(Path(home) / ".agents" / ".skill-lock.json") or {}
    skills = lock.get("skills")
    if not isinstance(skills, dict):
        return {}
    r = {}
    for nombre, datos in skills.items():
        hash_ = datos.get("skillFolderHash") if isinstance(datos, dict) else None
        if isinstance(hash_, str) and hash_:
            r[f"skill:{nombre}"] = _entrada(
                nombre, "skill", hash_[:5],
                str(Path(home) / ".agents" / "skills" / nombre))
    return r


def _foto_plugins(home, ejecutar, buscar_):
    datos = _json_de(_salida("claude", ["plugin", "list", "--json"], ejecutar, buscar_, home))
    if not isinstance(datos, list):
        return {}
    r = {}
    for p in datos:
        if not isinstance(p, dict) or not isinstance(p.get("id"), str):
            continue
        id_ = p["id"]
        if id_.endswith("@claude-code-entorno"):
            continue
        r[f"plugin:{id_}"] = _entrada(id_.split("@")[0], "plugin",
                                      str(p.get("version", "")), p.get("installPath"))
    return r


def _foto_plugins_herdr(home, ejecutar, buscar_):
    datos = _json_de(_salida("herdr", ["plugin", "list", "--json"], ejecutar, buscar_, home))
    resultado = datos.get("result") if isinstance(datos, dict) else None
    plugins = resultado.get("plugins") if isinstance(resultado, dict) else None
    if not isinstance(plugins, list):
        return {}
    r = {}
    for p in plugins:
        if not isinstance(p, dict) or not isinstance(p.get("plugin_id"), str):
            continue
        origen = p.get("source") if isinstance(p.get("source"), dict) else {}
        nombre = origen.get("repo") or p["plugin_id"]
        r[f"plugin:herdr/{p['plugin_id']}"] = _entrada(
            nombre, "plugin", str(p.get("version", "")), p.get("plugin_root"))
    return r


def _palabra(texto, indice):
    palabras = (texto or "").split()
    return palabras[indice] if palabras else None


def _foto_programa(clave, nombre, tipo, programa, ejecutar, buscar_, home, extraer):
    texto = _salida(programa, ["--version"], ejecutar, buscar_, home)
    try:
        version = extraer(texto) if texto else None
    except Exception:
        version = None
    return {clave: _entrada(nombre, tipo, version)} if version else {}


def _foto_neovim(home):
    try:
        contenido = (Path(home) / ".config" / "nvim" / "lazy-lock.json").read_bytes()
    except OSError:
        return {}
    return {"programa:neovim-plugins": _entrada(
        "plugins de Neovim", "programa", hashlib.sha1(contenido).hexdigest()[:5])}


def foto(home, ejecutar, buscar=buscar):
    """Foto de lo instalado: {"<tipo>:<id>": {nombre, tipo, version, carpeta}}.

    Cada fuente se salta si no está; un error en una no afecta a las demás.
    """
    home = Path(home)
    fuentes = [
        lambda: _foto_skills(home),
        lambda: _foto_plugins(home, ejecutar, buscar),
        lambda: _foto_programa("MCP:codebase-memory", "codebase-memory", "MCP",
                               "codebase-memory-mcp", ejecutar, buscar, home,
                               lambda t: _palabra(t, -1)),
        lambda: _foto_programa("programa:herdr", "herdr", "programa", "herdr",
                               ejecutar, buscar, home, lambda t: _palabra(t, -1)),
        lambda: _foto_plugins_herdr(home, ejecutar, buscar),
        lambda: _foto_programa("programa:opencode", "opencode", "programa", "opencode",
                               ejecutar, buscar, home,
                               lambda t: _palabra(t, -1).removeprefix("v")),
        lambda: _foto_programa("programa:claude", "Claude Code", "programa", "claude",
                               ejecutar, buscar, home, lambda t: _palabra(t, 0)),
        lambda: _foto_neovim(home),
    ]
    r = {}
    for fuente in fuentes:
        try:
            r.update(fuente())
        except Exception:
            pass
    return r

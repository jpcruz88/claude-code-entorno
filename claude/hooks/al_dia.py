"""Al día: estado diario, cerrojo y JSON atómico.

Base de la revisión que actualiza una vez al día skills, plugins y programas.
Solo biblioteca estándar.
"""
import difflib
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

HORAS_REVISION = 24 * 3600   # revisión completa cada 24 h desde el inicio de la última
REINTENTO = 3600             # los pendientes se reintentan pasada 1 h
CERROJO_MUERTO = 3600        # un cerrojo de más de 1 h se da por muerto


def carpeta(home):
    """Carpeta de estado de Al día dentro del HOME dado."""
    return Path(home) / ".claude" / "al-dia"


def _hora(valor):
    """Número válido (no bool) o None."""
    return None if isinstance(valor, bool) or not isinstance(valor, (int, float)) else valor


def que_revisar(estado, ahora):
    """Decide qué revisar: "todo", "pendientes" o None.

    `estado` es el contenido de ultima-revision.json:
    {"inicio": float, "ultimo_intento": float (opcional), "repetir": [str]}.
    Las 24 h cuentan desde `inicio` (la última revisión completa); el reintento de
    pendientes, desde `ultimo_intento` (o desde `inicio` si falta).
    """
    if not isinstance(estado, dict):
        return "todo"
    inicio = _hora(estado.get("inicio"))
    if inicio is None:
        return "todo"
    if ahora - inicio >= HORAS_REVISION:
        return "todo"
    ultimo = _hora(estado.get("ultimo_intento"))
    if ultimo is None:
        ultimo = inicio
    if estado.get("repetir") and ahora - ultimo >= REINTENTO:
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


def _sin_ventana():
    return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


def _entorno(cmd, home):
    """Entorno del hijo con PATH ampliado.

    Claude abierto desde el Dock no hereda el PATH de la terminal: `npx` necesita `node`
    (`#!/usr/bin/env node`) y sin él sale con 127. Orden: carpeta del programa, carpetas
    habituales y el PATH actual, sin duplicados.
    """
    carpetas = []
    donde = os.path.dirname(str(cmd[0])) if cmd else ""
    if donde:
        carpetas.append(donde)
    carpetas += [str(c) for c in _carpetas_de_programas(home)]
    carpetas += os.environ.get("PATH", "").split(os.pathsep)
    vistas, unicas = set(), []
    for c in carpetas:
        if c and c not in vistas:
            vistas.add(c)
            unicas.append(c)
    return {**os.environ, "PATH": os.pathsep.join(unicas)}


def _matar_arbol(proc):
    """Mata el proceso y sus descendientes, siempre por el PID concreto."""
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=15,
                           creationflags=_sin_ventana())
        else:
            os.killpg(proc.pid, getattr(signal, "SIGKILL", 9))
    except Exception:
        pass
    try:
        proc.kill()   # por si lo anterior no alcanzó al proceso principal
    except Exception:
        pass


def ejecutar_real(cmd, timeout, home=None):
    """Corre `cmd` sin entrada y con tiempo límite. (124, "tiempo agotado") si se acaba.

    Corre en `home` (no hereda la carpeta del proyecto abierto) y, al agotarse el tiempo,
    mata todo el árbol de procesos, no solo el primero.
    """
    home = Path(home) if home is not None else Path.home()
    opciones = {"stdin": subprocess.DEVNULL, "stdout": subprocess.PIPE,
                "stderr": subprocess.STDOUT, "text": True, "errors": "replace",
                "cwd": str(home), "env": _entorno(cmd, home)}
    if sys.platform == "win32":
        opciones["creationflags"] = (_sin_ventana()
                                     | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200))
    else:
        opciones["start_new_session"] = True
    try:
        proc = subprocess.Popen(cmd, **opciones)
    except OSError as e:
        return 127, str(e)
    try:
        salida, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _matar_arbol(proc)
        try:
            proc.communicate(timeout=5)   # corto: un nieto fuera del grupo no nos retiene
        except Exception:
            pass
        for tuberia in (proc.stdout, proc.stdin, proc.stderr):
            try:
                tuberia.close()
            except Exception:
                pass
        return 124, "tiempo agotado"
    return proc.returncode, salida or ""


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
    """Primer JSON (lista u objeto) del texto.

    stderr va mezclado: un aviso antes (`(node:1) [DEP0040] …`) trae corchetes que no son
    JSON. Se prueba cada `[` o `{` en orden hasta que uno decodifique a lista o dict.
    """
    if not isinstance(texto, str):
        return None
    decodificador = json.JSONDecoder()
    for i, c in enumerate(texto):
        if c not in "[{":
            continue
        try:
            dato = decodificador.raw_decode(texto, i)[0]
        except ValueError:
            continue
        if isinstance(dato, (list, dict)):
            return dato
    return None


def _version_de(p):
    """Versión como texto; None si falta, es nula o está vacía."""
    v = p.get("version")
    if v is None or isinstance(v, (dict, list)):
        return None
    v = str(v).strip()
    return v or None


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
        version = _version_de(p)
        if id_.endswith("@claude-code-entorno") or not version:
            continue
        r[f"plugin:{id_}"] = _entrada(id_.split("@")[0], "plugin",
                                      version, p.get("installPath"))
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
        version = _version_de(p)
        if not version:
            continue
        origen = p.get("source") if isinstance(p.get("source"), dict) else {}
        nombre = origen.get("repo") or p["plugin_id"]
        r[f"plugin:herdr/{p['plugin_id']}"] = _entrada(
            nombre, "plugin", version, p.get("plugin_root"))
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


# --- Revisión: actualizar, comparar y guardar diffs ---------------------------

TIEMPO_PASO = 300        # cada skill o plugin
TIEMPO_PROGRAMA = 600    # cada programa
EXTENSIONES = {".md", ".json", ".py", ".sh", ".ts", ".tsx", ".js", ".toml", ".yaml", ".yml"}
MAX_TEXTO = 512 * 1024
IGNORADAS = {"node_modules", ".git"}
MAX_ERROR = 120
EN_USO = ("in use", "being used", "busy", "denied")


def _skills_cli_de(ruta):
    try:
        m = re.search(r'^SKILLS_CLI\s*=\s*["\']([^"\']+)["\']',
                      ruta.read_text(encoding="utf-8"), re.M)
    except OSError:
        return None
    return m.group(1) if m else None


def skills_cli(home=None):
    """SKILLS_CLI de herramientas/instalar_comun.py, para no duplicarlo a mano.

    Busca en el repo vecino a este archivo y, con el hook instalado en ~/.claude/hooks,
    en <home>/claude-code-entorno.
    """
    candidatos = [Path(__file__).resolve().parent.parent.parent / "herramientas" / "instalar_comun.py",
                  Path(home if home is not None else Path.home())
                  / "claude-code-entorno" / "herramientas" / "instalar_comun.py"]
    for ruta in candidatos:
        valor = _skills_cli_de(ruta)
        if valor:
            return valor
    # Último recurso: ni el repo ni ~/claude-code-entorno están en este equipo.
    return "skills@1.7.2"


def pasos(antes, cli_skills):
    """Pasos de actualización: [(clave, comando, timeout)], solo de lo que está en `antes`.

    Los `marketplace update` van primero, para que `plugin update` vea lo último.
    """
    plugins = [k for k in antes if k.startswith("plugin:") and not k.startswith("plugin:herdr/")]
    r = []
    marketplaces = []
    for k in plugins:
        mk = k[len("plugin:"):].partition("@")[2]
        if mk and mk not in marketplaces:
            marketplaces.append(mk)
    for mk in marketplaces:
        r.append((f"marketplace:{mk}", ["claude", "plugin", "marketplace", "update", mk],
                  TIEMPO_PASO))
    for k in plugins:
        r.append((k, ["claude", "plugin", "update", k[len("plugin:"):]], TIEMPO_PASO))
    for k, datos in antes.items():
        if k.startswith("skill:"):
            r.append((k, ["npx", "-y", cli_skills, "update", datos["nombre"], "-g", "-y"],
                      TIEMPO_PASO))
    programas = [
        ("MCP:codebase-memory", ["codebase-memory-mcp", "update", "-y"]),
        ("programa:herdr", ["herdr", "update"]),
    ]
    for clave, cmd in programas:
        if clave in antes:
            r.append((clave, cmd, TIEMPO_PROGRAMA))
    if any(k.startswith("plugin:herdr/") for k in antes):
        r.append(("plugin:herdr/*", ["herdr", "plugin", "update"], TIEMPO_PASO))
    finales = [
        ("programa:opencode", ["opencode", "upgrade"]),
        ("programa:neovim-plugins", ["nvim", "--headless", "+Lazy! update", "+qa"]),
        ("programa:claude", ["claude", "update"]),   # el último: puede reemplazar al binario
    ]
    for clave, cmd in finales:
        if clave in antes:
            r.append((clave, cmd, TIEMPO_PROGRAMA))
    return r


def textos(carpeta_):
    """Archivos de texto de la carpeta: {ruta relativa: contenido}. {} si no se puede leer."""
    base = Path(carpeta_)
    r = {}
    try:
        for raiz, dirs, archivos in os.walk(base):
            dirs[:] = sorted(d for d in dirs if d not in IGNORADAS)
            for nombre in sorted(archivos):
                ruta = Path(raiz) / nombre
                if ruta.suffix.lower() not in EXTENSIONES:
                    continue
                try:
                    if ruta.stat().st_size >= MAX_TEXTO:
                        continue
                    r[str(ruta.relative_to(base))] = ruta.read_text(
                        encoding="utf-8", errors="replace")
                except OSError:
                    continue
    except OSError:
        pass
    return r


def _diff(antes_, despues_):
    """Diff unificado entre dos {ruta: texto}; "" si no hay diferencias."""
    trozos = []
    for ruta in sorted(set(antes_) | set(despues_)):
        a, b = antes_.get(ruta, ""), despues_.get(ruta, "")
        if a == b:
            continue
        trozos.extend(difflib.unified_diff(
            a.splitlines(keepends=True), b.splitlines(keepends=True),
            fromfile=f"a/{ruta}", tofile=f"b/{ruta}"))
        if trozos and not trozos[-1].endswith("\n"):
            trozos.append("\n")
    return "".join(trozos)


def _error(salida):
    texto = " ".join((salida or "").split())
    return texto[:MAX_ERROR] if texto else "sin detalle"


def _identidad_fallo(clave, antes):
    """(nombre, tipo) con que un paso fallido sale en `fallos`."""
    if clave.startswith("marketplace:"):
        return "marketplace " + clave[len("marketplace:"):], "plugin"
    if clave == "plugin:herdr/*":
        return "plugins de herdr", "plugin"
    datos = antes.get(clave) or {}
    return datos.get("nombre") or clave, datos.get("tipo") or "programa"


def _resultado_previo(home, ahora):
    previo = leer_json(carpeta(home) / "resultado.json")
    if not previo or not isinstance(previo.get("cambios"), list):
        return None
    ts = previo.get("ts")
    if isinstance(ts, bool) or not isinstance(ts, (int, float)) or ahora - ts >= HORAS_REVISION:
        return None
    return previo


def _ruta_diff(home, ahora, nombre, tipo, usadas):
    dia = time.strftime("%Y-%m-%d", time.localtime(ahora))
    base = nombre.replace("/", "_").replace("\\", "_")
    ruta = carpeta(home) / "cambios" / dia / (base + ".diff")
    if ruta in usadas:   # mismo nombre en skill y plugin
        ruta = ruta.with_name(f"{base}-{tipo}.diff")
    usadas.add(ruta)
    return ruta


def revisar(home, ahora, ejecutar, buscar=buscar, solo=None, cli_skills=None):
    """Actualiza, compara la foto de antes con la de después y guarda el resultado.

    `solo` (modo reintento): claves de los únicos pasos que corren; el resultado nuevo
    se suma al anterior si este tiene menos de 24 h.
    """
    home = Path(home)
    antes = foto(home, ejecutar, buscar)
    lista = pasos(antes, cli_skills or skills_cli(home))
    if solo is not None:
        lista = [p for p in lista if p[0] in solo]

    # Textos de antes de actualizar, solo de lo que va a correr.
    textos_antes = {}
    for clave, _, _ in lista:
        datos = antes.get(clave)
        if datos and datos["tipo"] in ("skill", "plugin") and datos.get("carpeta"):
            textos_antes[clave] = textos(datos["carpeta"])

    fallos, pendientes, malas = [], [], []
    for clave, cmd, timeout in lista:
        ruta = buscar(cmd[0], home)
        if not ruta:
            continue    # herramienta no instalada: se salta en silencio
        try:
            codigo, salida = ejecutar([ruta, *cmd[1:]], timeout)
        except Exception as e:
            codigo, salida = 1, str(e)
        if codigo == 0:
            continue
        nombre, tipo = _identidad_fallo(clave, antes)
        if clave == "MCP:codebase-memory" and any(
                x in (salida or "").lower() for x in EN_USO):
            pendientes.append({"nombre": nombre, "tipo": tipo, "motivo": "en uso"})
        else:
            fallos.append({"nombre": nombre, "tipo": tipo, "error": _error(salida)})
        malas.append(clave)

    despues = foto(home, ejecutar, buscar)
    cambios, usadas = [], set()
    for clave, d in despues.items():
        a = antes.get(clave)
        if not a or a["version"] == d["version"]:
            continue
        cambio = {"nombre": d["nombre"], "tipo": d["tipo"], "antes": a["version"],
                  "despues": d["version"], "cambio_texto": False, "diff": None}
        if clave in textos_antes and d.get("carpeta"):
            texto = _diff(textos_antes[clave], textos(d["carpeta"]))
            if texto:
                cambio["cambio_texto"] = True
                destino = _ruta_diff(home, ahora, d["nombre"], d["tipo"], usadas)
                try:
                    destino.parent.mkdir(parents=True, exist_ok=True)
                    destino.write_text(texto, encoding="utf-8")
                    cambio["diff"] = str(destino)
                except OSError:
                    pass   # sin diff guardado; la revisión sigue y deja el resultado
        cambios.append(cambio)

    ts, inicio = int(ahora), ahora
    if solo is not None:
        previo = _resultado_previo(home, ahora)
        if previo:
            cambios = [c for c in previo["cambios"] if isinstance(c, dict)] + cambios
            # El reintento no reinicia las 24 h: se conserva el reloj de la revisión completa.
            ts = previo["ts"]
            estado = leer_json(carpeta(home) / "ultima-revision.json") or {}
            inicio = _hora(estado.get("inicio"))
            if inicio is None:
                inicio = ts

    con_cambio = {(c.get("nombre"), c.get("tipo")) for c in cambios}
    al_dia = sum(1 for k, d in despues.items()
                 if k not in malas and (d["nombre"], d["tipo"]) not in con_cambio)
    resultado = {"version": 1, "ts": ts, "cambios": cambios, "fallos": fallos,
                 "pendientes": pendientes, "al_dia": al_dia}
    d_estado = carpeta(home)
    escribir_json(d_estado / "resultado.json", resultado)
    escribir_json(d_estado / "ultima-revision.json",
                  {"inicio": inicio, "ultimo_intento": ahora, "repetir": malas})
    return resultado

#!/usr/bin/env python3
"""Fusiona claude/settings.base.json con el settings.json de Claude Code de la máquina.

Reglas:
- Antes de escribir guarda una copia: settings.json.bak-AAAAMMDD-HHMMSS.
- Lo que ya tienes se conserva: si una clave existe con otro valor, gana el tuyo
  (y se avisa). Solo se agregan las claves que faltan.
- Los hooks se agregan sin duplicar: un hook ya está si el mismo script (por
  ejemplo guard-kill.py) ya corre para ese mismo evento y herramienta, aunque el
  comando esté escrito distinto.
- Si nada cambia, no escribe nada (correrlo dos veces da lo mismo).

Adapta los comandos a cada sistema:
- --python-hooks "py -3": los hooks .py se lanzan con ese intérprete.
- --plataforma windows: los scripts de bash se lanzan con `bash …` (Git Bash).
- Los hooks de codebase-memory-mcp (cbm-*) solo se agregan si existe su script;
  con --sin-codebase-memory no se agregan nunca.

Uso:
  python3 fusionar_settings.py --base claude/settings.base.json \\
      --destino ~/.claude/settings.json [--plataforma unix|windows] \\
      [--python-hooks python3] [--sin-codebase-memory] [--simular]
"""
import argparse
import copy
import datetime
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

PREFIJO_CLAUDE = "~/.claude/"


# ------------------------------------------------------------ comandos y hooks

def _tokens(comando):
    return [t.strip("'\"") for t in comando.replace("\\", "/").split()]


def script_de(comando):
    """Ruta del script dentro de ~/.claude que lanza un comando, o None."""
    for t in _tokens(comando):
        if "/.claude/" in t:
            return t
    return None


def clave_hook(comando):
    """Identidad de un hook: el nombre de su script (guard-kill.py) o el comando."""
    script = script_de(comando)
    if script:
        return os.path.basename(script)
    return " ".join(comando.split())


def es_cbm(comando):
    return clave_hook(comando).startswith("cbm-")


def adaptar_comando(comando, plataforma, python_hooks):
    """Antepone el intérprete adecuado si el comando empieza por el script."""
    partes = comando.split(None, 1)
    if not partes or "/.claude/" not in partes[0].replace("\\", "/"):
        return comando  # ya trae intérprete (python3 …, bash …) u otra cosa
    script = partes[0]
    if script.endswith(".py") and python_hooks:
        return "%s %s" % (python_hooks, comando)
    if plataforma == "windows" and not script.endswith((".py", ".exe", ".cmd", ".bat", ".ps1")):
        return "bash " + comando
    return comando


def matchers(matcher):
    """Conjunto de herramientas o eventos que cubre un matcher."""
    if matcher in (None, "", "*"):
        return {"*"}
    m = re.match(r"^\^?\(?([\w|]+)\)?\$?$", matcher)
    if m:
        return set(m.group(1).split("|"))
    return {matcher}


def _ordenados(matcher, faltan):
    if matcher in (None, "", "*"):
        return matcher
    m = re.match(r"^\^?\(?([\w|]+)\)?\$?$", matcher)
    if not m:
        return matcher
    lista = [x for x in m.group(1).split("|") if x in faltan]
    return "|".join(lista)


# ------------------------------------------------------------ base adaptada

def preparar_base(base, plataforma="unix", python_hooks=None, sin_codebase_memory=False,
                  scripts_disponibles=None):
    """Copia de la base con comandos adaptados y sin los hooks que no aplican."""
    base = copy.deepcopy(base)
    avisos = []
    hooks = base.get("hooks") or {}
    for evento in list(hooks):
        grupos_nuevos = []
        for grupo in hooks[evento]:
            quedan = []
            for h in grupo.get("hooks", []):
                cmd = h.get("command", "")
                if h.get("type") == "command" and cmd:
                    if sin_codebase_memory and es_cbm(cmd):
                        continue
                    script = script_de(cmd)
                    if (script and scripts_disponibles is not None
                            and os.path.basename(script) not in scripts_disponibles):
                        avisos.append("Se omite el hook %s: no existe %s en esta máquina."
                                      % (evento, script))
                        continue
                    h = dict(h, command=adaptar_comando(cmd, plataforma, python_hooks))
                quedan.append(h)
            if quedan:
                grupos_nuevos.append(dict(grupo, hooks=quedan))
        if grupos_nuevos:
            hooks[evento] = grupos_nuevos
        else:
            del hooks[evento]
    if "hooks" in base and not hooks:
        del base["hooks"]
    linea = base.get("statusLine")
    if isinstance(linea, dict) and linea.get("command"):
        linea["command"] = adaptar_comando(linea["command"], plataforma, python_hooks)
    return base, avisos


# ------------------------------------------------------------ fusión

def _fusionar_hooks(destino, base, cambios):
    for evento, grupos in base.items():
        grupos_dest = destino.setdefault(evento, [])
        for grupo in grupos:
            matcher = grupo.get("matcher")
            for h in grupo.get("hooks", []):
                clave = clave_hook(h.get("command", "")) if h.get("type") == "command" \
                    else json.dumps(h, sort_keys=True)
                cubiertos = set()
                for gd in grupos_dest:
                    for hd in gd.get("hooks", []):
                        cd = clave_hook(hd.get("command", "")) if hd.get("type") == "command" \
                            else json.dumps(hd, sort_keys=True)
                        if cd == clave:
                            cubiertos |= matchers(gd.get("matcher"))
                pedidos = matchers(matcher)
                if "*" in cubiertos:
                    continue
                faltan = pedidos - cubiertos
                if not faltan:
                    continue
                nuevo_matcher = matcher if faltan == pedidos else _ordenados(matcher, faltan)
                destino_grupo = next((g for g in grupos_dest
                                      if g.get("matcher") == nuevo_matcher), None)
                if destino_grupo is None:
                    destino_grupo = {"hooks": []}
                    if nuevo_matcher is not None:
                        destino_grupo = {"matcher": nuevo_matcher, "hooks": []}
                    grupos_dest.append(destino_grupo)
                destino_grupo.setdefault("hooks", []).append(copy.deepcopy(h))
                cambios.append("hook %s [%s]: %s" % (evento, nuevo_matcher or "todos",
                                                     h.get("command", h.get("type"))))


def _fusionar_dict(destino, base, ruta, cambios, avisos):
    for clave, valor in base.items():
        nombre = "%s.%s" % (ruta, clave) if ruta else clave
        if clave not in destino:
            destino[clave] = copy.deepcopy(valor)
            cambios.append("agrega %s" % nombre)
        elif isinstance(valor, dict) and isinstance(destino[clave], dict) \
                and clave != "statusLine":
            _fusionar_dict(destino[clave], valor, nombre, cambios, avisos)
        elif destino[clave] != valor:
            avisos.append("Se conserva tu valor de %s (%s); el repo propone %s."
                          % (nombre, json.dumps(destino[clave], ensure_ascii=False),
                             json.dumps(valor, ensure_ascii=False)))


def fusionar(base, destino, env_extra=None):
    """Devuelve (resultado, cambios, avisos) sin tocar ningún archivo."""
    resultado = copy.deepcopy(destino) if destino else {}
    cambios, avisos = [], []
    base = copy.deepcopy(base)
    hooks_base = base.pop("hooks", None)
    _fusionar_dict(resultado, base, "", cambios, avisos)
    if hooks_base:
        if not isinstance(resultado.get("hooks"), dict):
            resultado["hooks"] = {}
        _fusionar_hooks(resultado["hooks"], hooks_base, cambios)
    if env_extra:
        _fusionar_dict(resultado, {"env": env_extra}, "", cambios, avisos)
    return resultado, cambios, avisos


# ------------------------------------------------------------ archivos

def leer_json(ruta):
    with open(ruta, encoding="utf-8-sig") as f:
        return json.load(f)


def escribir_json(ruta, datos):
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".settings-", dir=str(ruta.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(datos, f, indent=2, ensure_ascii=False)
            f.write("\n")
        if ruta.exists():
            shutil.copymode(str(ruta), tmp)
        elif os.name != "nt":
            os.chmod(tmp, 0o600)
        os.replace(tmp, str(ruta))
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def respaldar(ruta):
    sello = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    copia = Path("%s.bak-%s" % (ruta, sello))
    n = 1
    while copia.exists():
        n += 1
        copia = Path("%s.bak-%s-%d" % (ruta, sello, n))
    shutil.copy2(str(ruta), str(copia))
    return copia


def aplicar(base_ruta, destino_ruta, plataforma="unix", python_hooks=None,
            sin_codebase_memory=False, scripts_disponibles=None, env_extra=None,
            simular=False, salida=print):
    """Hace todo el trabajo y devuelve 0 si salió bien, 1 si hubo un error."""
    try:
        base = leer_json(base_ruta)
    except Exception as e:
        salida("ERROR: no pude leer %s: %s" % (base_ruta, e))
        return 1
    destino = None
    if Path(destino_ruta).exists():
        try:
            destino = leer_json(destino_ruta)
        except Exception as e:
            salida("ERROR: %s no es un JSON válido (%s). No lo toco; corrígelo y "
                   "vuelve a correr el instalador." % (destino_ruta, e))
            return 1
        if not isinstance(destino, dict):
            salida("ERROR: %s no contiene un objeto JSON. No lo toco." % destino_ruta)
            return 1
    base, avisos = preparar_base(base, plataforma, python_hooks, sin_codebase_memory,
                                 scripts_disponibles)
    resultado, cambios, avisos_fusion = fusionar(base, destino, env_extra)
    for a in avisos + avisos_fusion:
        salida("    aviso: " + a)
    if not cambios:
        salida("    settings.json ya estaba al día; no cambia nada.")
        return 0
    for c in cambios:
        salida("    %s %s" % ("[simular] haría:" if simular else "+", c))
    if simular:
        return 0
    if destino is not None:
        copia = respaldar(destino_ruta)
        salida("    respaldo: %s" % copia)
    escribir_json(destino_ruta, resultado)
    salida("    guardado: %s" % destino_ruta)
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Fusiona settings.base.json con settings.json.")
    p.add_argument("--base", required=True)
    p.add_argument("--destino", required=True)
    p.add_argument("--plataforma", choices=("unix", "windows"), default="unix")
    p.add_argument("--python-hooks", default=None,
                   help='intérprete para los hooks .py, por ejemplo "python3" o "py -3"')
    p.add_argument("--sin-codebase-memory", action="store_true")
    p.add_argument("--scripts-disponibles", default=None,
                   help="nombres de scripts de hooks que existen, separados por comas")
    p.add_argument("--env", action="append", default=[], metavar="CLAVE=VALOR",
                   help="variable para la sección env (solo si no existe)")
    p.add_argument("--simular", action="store_true")
    a = p.parse_args(argv)
    env_extra = dict(x.split("=", 1) for x in a.env) if a.env else None
    disponibles = set(filter(None, a.scripts_disponibles.split(","))) \
        if a.scripts_disponibles is not None else None
    return aplicar(a.base, os.path.expanduser(a.destino), a.plataforma, a.python_hooks,
                   a.sin_codebase_memory, disponibles, env_extra, a.simular)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    sys.exit(main())

#!/usr/bin/env python3
"""Pasos de instalación que comparten Windows, macOS y Linux.

Lo llaman instalar.sh e instalar.ps1 cuando ya están Python, Node, Git y jq.
Hace, en orden:
  1. Copia reglas, hooks y statusline a ~/.claude (respaldo si ya había otra versión).
  2. Fusiona claude/settings.base.json con ~/.claude/settings.json.
  3. Instala los plugins de plugins.txt.
  4. Instala las skills de skills/lista.json.
  5. Registra los servidores MCP de mcp/.
  6. Deja listo el gitignore global (solo si no tienes uno).

Todo es idempotente: lo que ya está se deja igual. Con --simular solo muestra lo
que haría y no ejecuta claude ni npx (hasta sus consultas crean archivos).
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent
sys.path.insert(0, str(AQUI))
import fusionar_settings  # noqa: E402

ES_WINDOWS = os.name == "nt"
MARKETPLACES_CONOCIDOS = {"claude-plugins-official": "anthropics/claude-plugins-official"}
MARCADOR_CBM = "{{RUTA_CODEBASE_MEMORY_MCP}}"


ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
CLAVES_ERROR = re.compile(r"error|failed|fail|not found|fatal|denied|no se|refused|timed out", re.I)


def resumen_error(salida):
    """La línea más útil de una salida larga, sin colores ni recuadros."""
    lineas = [ANSI.sub("", l).strip(" \t│└┌■◇●◆─|") for l in salida.splitlines()]
    lineas = [l for l in lineas if l]
    utiles = [l for l in lineas if CLAVES_ERROR.search(l)]
    elegida = (utiles or lineas or ["sin detalles"])[0]
    return elegida[:200]


def sello():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


class Instalador:
    def __init__(self, a):
        self.plataforma = a.plataforma
        self.simular = a.simular
        self.python_hooks = a.python_hooks
        self.sin_cbm = a.sin_codebase_memory
        self.suponer_cbm = a.suponer_codebase_memory
        self.sin_skills = a.sin_skills
        self.git_bash = a.git_bash
        self.home = Path.home()
        self.claude_dir = self.home / ".claude"
        self.fallos = []
        self.pendientes = []

    # ------------------------------------------------------------ utilidades
    def paso(self, titulo):
        print("\n==> " + titulo)

    def info(self, texto):
        print("    " + texto)

    def aviso(self, texto):
        print("    AVISO: " + texto)

    def fallo(self, texto):
        print("    ERROR: " + texto)
        self.fallos.append(texto)

    def correr(self, args, timeout=600, env_extra=None):
        env = dict(os.environ, **(env_extra or {}))
        try:
            r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               timeout=timeout, env=env, encoding="utf-8", errors="replace")
            return r.returncode, r.stdout or ""
        except subprocess.TimeoutExpired:
            return 124, "se agotó el tiempo (%d s)" % timeout
        except OSError as e:
            return 127, str(e)

    def buscar(self, programa, extras=()):
        ruta = shutil.which(programa)
        if ruta:
            return ruta
        for candidato in extras:
            if candidato and Path(candidato).is_file():
                return str(candidato)
        return None

    def claude(self):
        nombre = "claude.exe" if ES_WINDOWS else "claude"
        return self.buscar("claude", [self.home / ".local" / "bin" / nombre])

    def ruta_cbm(self):
        if ES_WINDOWS:
            local = os.environ.get("LOCALAPPDATA", "")
            extras = [Path(local) / "Programs" / "codebase-memory-mcp" / "codebase-memory-mcp.exe"]
        else:
            extras = [self.home / ".local" / "bin" / "codebase-memory-mcp"]
        return self.buscar("codebase-memory-mcp", extras)

    def cbm_activo(self):
        if self.sin_cbm:
            return False
        return bool(self.ruta_cbm()) or self.suponer_cbm

    # ------------------------------------------------------------ 1. archivos
    def archivos(self):
        self.paso("Reglas, hooks y statusline en %s" % self.claude_dir)
        pares = []
        for sub in ("rules", "hooks"):
            for f in sorted((REPO / "claude" / sub).iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    pares.append((f, self.claude_dir / sub / f.name))
        pares.append((REPO / "claude" / "statusline.sh", self.claude_dir / "statusline.sh"))
        for origen, destino in pares:
            contenido = origen.read_bytes().replace(b"\r\n", b"\n")  # siempre LF
            ejecutable = origen.suffix in (".py", ".sh")
            if destino.exists() and destino.read_bytes() == contenido:
                self.info("al día: %s" % destino)
                continue
            if self.simular:
                self.info("[simular] copiaría %s -> %s" % (origen.relative_to(REPO), destino))
                continue
            destino.parent.mkdir(parents=True, exist_ok=True)
            if destino.exists():
                copia = Path("%s.bak-%s" % (destino, sello()))
                shutil.copy2(str(destino), str(copia))
                self.info("respaldo: %s" % copia)
            destino.write_bytes(contenido)
            if ejecutable and not ES_WINDOWS:
                destino.chmod(0o755)
            self.info("copiado: %s" % destino)

    # ------------------------------------------------------------ 2. settings
    def settings(self):
        self.paso("settings.json (fusión con claude/settings.base.json)")
        cbm = self.cbm_activo()
        if not cbm:
            motivo = "--sin-codebase-memory" if self.sin_cbm else "no está instalado"
            self.info("codebase-memory-mcp: %s; no se agregan sus hooks." % motivo)
        disponibles = set()
        for carpeta in (self.claude_dir / "hooks", REPO / "claude" / "hooks"):
            if carpeta.is_dir():
                disponibles |= {f.name for f in carpeta.iterdir() if f.is_file()}
        if cbm and self.suponer_cbm and not self.ruta_cbm():
            # en una simulación todavía no existen los scripts que crea su instalador
            disponibles |= {"cbm-code-discovery-gate", "cbm-session-reminder"}
        env_extra = {"CLAUDE_CODE_GIT_BASH_PATH": self.git_bash} if self.git_bash else None
        codigo = fusionar_settings.aplicar(
            REPO / "claude" / "settings.base.json", self.claude_dir / "settings.json",
            plataforma=self.plataforma, python_hooks=self.python_hooks,
            sin_codebase_memory=not cbm, scripts_disponibles=disponibles,
            env_extra=env_extra, simular=self.simular)
        if codigo != 0:
            self.fallos.append("settings.json")

    # ------------------------------------------------------------ 3. plugins
    def leer_plugins(self):
        plugins = []
        for linea in (REPO / "plugins.txt").read_text(encoding="utf-8").splitlines():
            linea = linea.split("#", 1)[0].strip()
            if linea:
                partes = linea.split()
                plugins.append((partes[0], partes[1] if len(partes) > 1 else None))
        return plugins

    def _json_de(self, texto):
        try:
            return json.loads(texto[texto.index("["):])
        except (ValueError, json.JSONDecodeError):
            return None

    def plugins(self):
        self.paso("Plugins (plugins.txt)")
        plugins = self.leer_plugins()
        if self.simular:
            instalados = set()
            archivo = self.claude_dir / "plugins" / "installed_plugins.json"
            if archivo.exists():
                try:
                    instalados = set(json.loads(archivo.read_text(encoding="utf-8"))
                                     .get("plugins", {}))
                except Exception:
                    pass
            for pid, _ in plugins:
                if pid in instalados:
                    self.info("ya instalado: %s" % pid)
                else:
                    self.info("[simular] haría: claude plugin install %s --scope user" % pid)
            return
        claude = self.claude()
        if not claude:
            self.aviso("No encontré el comando claude; se omiten los plugins.")
            self.pendientes.append("Instala Claude Code y vuelve a correr el instalador "
                                   "para los plugins y los MCP.")
            return
        codigo, salida = self.correr([claude, "plugin", "list", "--json"], timeout=120)
        lista = self._json_de(salida) if codigo == 0 else None
        instalados = {p.get("id") for p in (lista or []) if isinstance(p, dict)}
        codigo, salida = self.correr([claude, "plugin", "marketplace", "list", "--json"],
                                     timeout=120)
        mercados = {m.get("name") for m in (self._json_de(salida) or []) if isinstance(m, dict)}
        for pid, fuente in plugins:
            if pid in instalados:
                self.info("ya instalado: %s" % pid)
                continue
            mercado = pid.split("@", 1)[1] if "@" in pid else None
            if mercado and mercado not in mercados:
                fuente = fuente or MARKETPLACES_CONOCIDOS.get(mercado)
                if not fuente:
                    self.fallo("no sé de dónde sale el marketplace %s (agrégalo en "
                               "plugins.txt como segunda columna)" % mercado)
                    continue
                self.info("$ claude plugin marketplace add %s" % fuente)
                codigo, salida = self.correr([claude, "plugin", "marketplace", "add", fuente])
                if codigo != 0:
                    self.fallo("marketplace %s: %s" % (fuente, resumen_error(salida)))
                    continue
                mercados.add(mercado)
            self.info("$ claude plugin install %s --scope user" % pid)
            codigo, salida = self.correr([claude, "plugin", "install", pid, "--scope", "user"])
            if codigo == 0:
                self.info("instalado: %s" % pid)
            else:
                self.fallo("plugin %s: %s" % (pid, resumen_error(salida)))

    # ------------------------------------------------------------ 4. skills
    def skills(self):
        self.paso("Skills (skills/lista.json)")
        if self.sin_skills:
            self.info("Se omiten (--sin-skills).")
            return
        lista = json.loads((REPO / "skills" / "lista.json").read_text(encoding="utf-8"))
        skills = lista.get("skills", [])
        npx = self.buscar("npx")
        if not npx and not self.simular:
            self.fallo("No encontré npx (viene con Node.js); no se instalan las skills.")
            return
        hechas = nuevas = fallidas = faltan = 0
        for s in skills:
            nombre, origen = s["nombre"], s["origen"]
            if (self.claude_dir / "skills" / nombre / "SKILL.md").exists():
                hechas += 1
                continue
            faltan += 1
            args = ["npx", "-y", "skills", "add", origen, "-g", "-y", "-a", "claude-code"]
            if ES_WINDOWS:
                args.append("--copy")  # en Windows los enlaces simbólicos piden permisos
            if self.simular:
                self.info("[simular] haría: " + " ".join(args))
                continue
            self.info("$ " + " ".join(args))
            codigo, salida = self.correr([npx] + args[1:], timeout=300,
                                         env_extra={"DO_NOT_TRACK": "1",
                                                    "DISABLE_TELEMETRY": "1"})
            if codigo == 0 and (self.claude_dir / "skills" / nombre / "SKILL.md").exists():
                self.info("instalada: %s" % nombre)
                nuevas += 1
            else:
                self.fallo("skill %s (%s): %s" % (nombre, origen, resumen_error(salida)))
                fallidas += 1
        if self.simular:
            self.info("%d de %d ya estaban instaladas; %d por instalar." % (hechas, len(skills), faltan))
        else:
            self.info("%d skills: %d ya estaban, %d instaladas ahora, %d con error."
                      % (len(skills), hechas, nuevas, fallidas))

    # ------------------------------------------------------------ 5. MCP
    def mcp(self):
        self.paso("Servidores MCP (carpeta mcp/)")
        claude = self.claude()
        registrados = None
        if self.simular:
            archivo = self.home / ".claude.json"
            registrados = set()
            if archivo.exists():
                try:
                    registrados = set(json.loads(archivo.read_text(encoding="utf-8"))
                                      .get("mcpServers") or {})
                except Exception:
                    pass
        elif not claude:
            self.aviso("No encontré el comando claude; se omiten los MCP.")
            return
        plantillas = sorted(p for p in (REPO / "mcp").glob("*.json")
                            if not p.name.startswith("."))  # fuera los ._* de macOS
        for plantilla in plantillas:
            nombre = plantilla.stem
            texto = plantilla.read_text(encoding="utf-8")
            if MARCADOR_CBM in texto:
                if not self.cbm_activo():
                    self.info("%s: se omite (no está instalado o se pidió omitirlo)." % nombre)
                    continue
                ruta = self.ruta_cbm() or "<ruta de codebase-memory-mcp>"
                texto = texto.replace(MARCADOR_CBM, json.dumps(ruta)[1:-1])
            config = json.loads(texto)
            if self.simular:
                if nombre in registrados:
                    self.info("ya registrado: %s" % nombre)
                else:
                    self.info("[simular] haría: claude mcp add-json --scope user %s '%s'"
                              % (nombre, json.dumps(config)))
                continue
            codigo, _ = self.correr([claude, "mcp", "get", nombre], timeout=120)
            if codigo == 0:
                self.info("ya registrado: %s" % nombre)
                continue
            self.info("$ claude mcp add-json --scope user %s '%s'" % (nombre, json.dumps(config)))
            codigo, salida = self.correr([claude, "mcp", "add-json", "--scope", "user",
                                          nombre, json.dumps(config)], timeout=120)
            if codigo == 0:
                self.info("registrado: %s" % nombre)
            else:
                self.fallo("MCP %s: %s" % (nombre, resumen_error(salida)))
        if not os.environ.get("CONTEXT7_API_KEY"):
            self.pendientes.append("Define la variable de entorno CONTEXT7_API_KEY (ver "
                                   "README) y reinicia la terminal; sin ella el MCP "
                                   "context7 marca error en /mcp.")

    # ------------------------------------------------------------ 6. git
    def git(self):
        self.paso("Gitignore global")
        origen = REPO / "git" / "gitignore_global"
        destino = self.home / ".gitignore_global"
        contenido = origen.read_bytes().replace(b"\r\n", b"\n")
        if destino.exists():
            if destino.read_bytes().replace(b"\r\n", b"\n") == contenido:
                self.info("al día: %s" % destino)
            else:
                self.info("Ya tienes %s distinto; no lo toco (compáralo con "
                          "git/gitignore_global si quieres)." % destino)
        elif self.simular:
            self.info("[simular] copiaría git/gitignore_global -> %s" % destino)
        else:
            destino.write_bytes(contenido)
            self.info("copiado: %s" % destino)
        git = self.buscar("git")
        if not git:
            self.aviso("No encontré git; no configuro core.excludesfile.")
            return
        codigo, actual = self.correr([git, "config", "--global", "--get", "core.excludesfile"])
        actual = actual.strip()
        if actual:
            self.info("core.excludesfile ya apunta a %s; no lo cambio." % actual)
        elif self.simular:
            self.info("[simular] haría: git config --global core.excludesfile ~/.gitignore_global")
        else:
            codigo, salida = self.correr([git, "config", "--global", "core.excludesfile",
                                          "~/.gitignore_global"])
            if codigo == 0:
                self.info("git config --global core.excludesfile ~/.gitignore_global")
            else:
                self.fallo("git config: %s" % salida.strip())

    # ------------------------------------------------------------ resumen
    def resumen(self):
        self.paso("Resumen")
        if self.simular:
            self.info("Simulación: no se cambió nada.")
        if os.environ.get("CLAUDE_CONFIG_DIR"):
            self.aviso("CLAUDE_CONFIG_DIR está definida; este instalador usa %s."
                       % self.claude_dir)
        self.pendientes.append("Cierra y vuelve a abrir Claude Code para que cargue todo.")
        self.pendientes.append("Claude in Chrome: instala la extensión en Chrome (no lleva "
                               "configuración aquí).")
        for p in self.pendientes:
            self.info("- " + p)
        if self.fallos:
            self.info("")
            self.info("Hubo %d problema(s):" % len(self.fallos))
            for f in self.fallos:
                self.info("  * " + f)
            self.info("Puedes volver a correr el instalador: lo que ya quedó no se repite.")
            return 1
        self.info("Listo.")
        return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Pasos comunes de instalación.")
    p.add_argument("--plataforma", choices=("unix", "windows"), required=True)
    p.add_argument("--simular", action="store_true")
    p.add_argument("--python-hooks", default="python3",
                   help='cómo lanzar los hooks .py: "python3", "python" o "py -3"')
    p.add_argument("--sin-codebase-memory", action="store_true")
    p.add_argument("--suponer-codebase-memory", action="store_true",
                   help="(simulación) actuar como si ya estuviera instalado")
    p.add_argument("--sin-skills", action="store_true")
    p.add_argument("--git-bash", default=None,
                   help="ruta a bash.exe si no está en el lugar de siempre (Windows)")
    a = p.parse_args(argv)
    if os.path.isabs(a.python_hooks) and not a.python_hooks.startswith('"'):
        a.python_hooks = '"%s"' % a.python_hooks  # ruta con posibles espacios
    inst = Instalador(a)
    for paso in (inst.archivos, inst.settings, inst.plugins, inst.skills, inst.mcp, inst.git):
        try:
            paso()
        except Exception as e:  # un paso roto no impide los demás
            inst.fallo("%s: %s" % (paso.__name__, e))
    return inst.resumen()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace", line_buffering=True)
    sys.exit(main())

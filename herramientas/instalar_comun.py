#!/usr/bin/env python3
"""Pasos de instalación que comparten Windows, macOS y Linux.

Lo llaman instalar.sh e instalar.ps1 cuando ya están Python, Node, Git y jq.
Hace, en orden:
  1. Copia reglas, hooks y statusline a ~/.claude (respaldo si ya había otra versión).
  2. Fusiona claude/settings.base.json con ~/.claude/settings.json.
  3. Instala los plugins de plugins.txt.
  4. Instala las skills de skills/lista.json.
  5. Registra los servidores MCP de mcp/.
  6. herdr: su config, la integración con Claude, su skill y los plugins de
     herdr/plugins.txt (solo si herdr está instalado).
  7. Con --ghostty, la config de Ghostty (abre herdr al arrancar).
  8. Deja listo el gitignore global (solo si no tienes uno).

Todo es idempotente: lo que ya está se deja igual. Con --simular solo muestra lo
que haría y no ejecuta claude ni npx (hasta sus consultas crean archivos).
Nunca pregunta nada: los programas que lanza reciben una entrada vacía.
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
MARCADOR_HERDR = "{{RUTA_HERDR}}"
# Skill oficial de herdr: enseña a Claude a manejar paneles y otros agentes.
SKILL_HERDR = ("herdr", "herdrdev/herdr@herdr")
# Versión fija del instalador de skills (vercel-labs/skills): la misma con la que
# se probó este repo. Cambiarla a propósito, nunca usar «la última».
SKILLS_CLI = "skills@1.7.2"


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


# Config global de OpenCode (router de modelos y gomodel). Repositorio aparte a
# propósito: copiarlo aquí crearía dos fuentes de verdad para la misma config.
# El remoto se puede cambiar por variable de entorno para probar sin red, del mismo
# modo que ENTORNO_TERMINOS_PRIVADOS cambia el archivo de términos en revisar_privacidad.
REPO_OPENCODE_CONFIG = os.environ.get(
    "ENTORNO_OPENCODE_CONFIG_REPO", "https://github.com/jpcruz88/opencode-config.git")


class Instalador:
    def __init__(self, a):
        self.plataforma = a.plataforma
        self.simular = a.simular
        self.python_hooks = a.python_hooks
        self.sin_cbm = a.sin_codebase_memory
        self.suponer_cbm = a.suponer_codebase_memory
        self.sin_skills = a.sin_skills
        self.git_bash = a.git_bash
        self.saltar_aviso = a.saltar_aviso_permisos
        self.sin_herdr = a.sin_herdr
        self.sin_plugins_herdr = a.sin_plugins_herdr
        self.con_ghostty = a.ghostty
        self.sin_terminal = a.sin_terminal
        self.sin_opencode = a.sin_opencode
        self.sin_opencode_config = a.sin_opencode_config
        self.sin_nvim = a.sin_nvim
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
            # stdin vacío: la salida se captura, así que una pregunta de npx o claude
            # quedaría invisible esperando respuesta; así falla en vez de colgarse.
            r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, timeout=timeout, env=env,
                               encoding="utf-8", errors="replace")
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

    def herdr_bin(self):
        nombre = "herdr.exe" if ES_WINDOWS else "herdr"
        return self.buscar("herdr", [self.home / ".local" / "bin" / nombre])

    def instalar_archivo(self, contenido, destino, origen, ejecutable=False):
        """Copia `contenido` a `destino`; si ya había otra versión, antes la respalda."""
        if destino.exists() and destino.read_bytes() == contenido:
            self.info("al día: %s" % destino)
            return
        if self.simular:
            self.info("[simular] copiaría %s -> %s" % (origen, destino))
            return
        destino.parent.mkdir(parents=True, exist_ok=True)
        if destino.exists():
            copia = Path("%s.bak-%s" % (destino, sello()))
            shutil.copy2(str(destino), str(copia))
            self.info("respaldo: %s" % copia)
        destino.write_bytes(contenido)
        if ejecutable and not ES_WINDOWS:
            destino.chmod(0o755)
        self.info("copiado: %s" % destino)

    def cbm_activo(self):
        if self.sin_cbm:
            return False
        return bool(self.ruta_cbm()) or self.suponer_cbm

    # ------------------------------------------------------------ 1. archivos
    def archivos(self):
        self.paso("Reglas, hooks, temas, comandos y statusline en %s" % self.claude_dir)
        pares = []
        for sub in ("rules", "hooks", "themes", "commands"):
            for f in sorted((REPO / "claude" / sub).iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    pares.append((f, self.claude_dir / sub / f.name))
        pares.append((REPO / "claude" / "statusline.sh", self.claude_dir / "statusline.sh"))
        for origen, destino in pares:
            contenido = origen.read_bytes().replace(b"\r\n", b"\n")  # siempre LF
            self.instalar_archivo(contenido, destino, origen.relative_to(REPO),
                                  ejecutable=origen.suffix in (".py", ".sh"))

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
        ajustes = None
        if self.saltar_aviso:
            self.aviso("--saltar-aviso-permisos: se agrega skipDangerousModePermissionPrompt, "
                       "que quita la advertencia antes del modo sin permisos.")
            ajustes = {"skipDangerousModePermissionPrompt": True}
        codigo = fusionar_settings.aplicar(
            REPO / "claude" / "settings.base.json", self.claude_dir / "settings.json",
            plataforma=self.plataforma, python_hooks=self.python_hooks,
            sin_codebase_memory=not cbm, scripts_disponibles=disponibles,
            env_extra=env_extra, simular=self.simular, ajustes_extra=ajustes)
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
    def instalar_skill(self, nombre, origen):
        """Devuelve "ya", "simulada", "nueva" o "fallida"."""
        if (self.claude_dir / "skills" / nombre / "SKILL.md").exists():
            return "ya"
        args = ["npx", "-y", SKILLS_CLI, "add", origen, "-g", "-y", "-a", "claude-code"]
        if ES_WINDOWS:
            args.append("--copy")  # en Windows los enlaces simbólicos piden permisos
        if self.simular:
            self.info("[simular] haría: " + " ".join(args))
            return "simulada"
        npx = self.buscar("npx")
        if not npx:
            self.fallo("No encontré npx (viene con Node.js); no se instala la skill %s." % nombre)
            return "fallida"
        self.info("$ " + " ".join(args))
        codigo, salida = self.correr([npx] + args[1:], timeout=300,
                                     env_extra={"DO_NOT_TRACK": "1", "DISABLE_TELEMETRY": "1"})
        if codigo == 0 and (self.claude_dir / "skills" / nombre / "SKILL.md").exists():
            self.info("instalada: %s" % nombre)
            return "nueva"
        self.fallo("skill %s (%s): %s" % (nombre, origen, resumen_error(salida)))
        return "fallida"

    def skills(self):
        self.paso("Skills (skills/lista.json)")
        if self.sin_skills:
            self.info("Se omiten (--sin-skills).")
            return
        self.info("Ojo: las skills son código de terceros sin auditar (ver README).")
        lista = json.loads((REPO / "skills" / "lista.json").read_text(encoding="utf-8"))
        skills = lista.get("skills", [])
        if not self.buscar("npx") and not self.simular:
            self.fallo("No encontré npx (viene con Node.js); no se instalan las skills.")
            return
        hechas = nuevas = fallidas = faltan = 0
        for s in skills:
            resultado = self.instalar_skill(s["nombre"], s["origen"])
            if resultado == "ya":
                hechas += 1
                continue
            faltan += 1
            if resultado == "nueva":
                nuevas += 1
            elif resultado == "fallida":
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

    # ------------------------------------------------------------ 6. herdr
    def leer_plugins_herdr(self):
        plugins = []
        for linea in (REPO / "herdr" / "plugins.txt").read_text(encoding="utf-8").splitlines():
            partes = linea.split("#", 1)[0].split()
            if len(partes) >= 2:
                plugins.append((partes[0], partes[1]))
        return plugins

    def herdr(self):
        self.paso("herdr (config, integración con Claude, skill y plugins)")
        if self.sin_herdr:
            self.info("Se omite (--sin-herdr).")
            return
        herdr = self.herdr_bin()
        if not herdr:
            self.aviso("No encontré herdr; se omiten su config, su integración, su skill y sus "
                       "plugins. En Mac lo instala instalar.sh; en otros sistemas, ver "
                       "https://herdr.dev/docs/install/")
            return
        if ES_WINDOWS:
            destino = Path(os.environ.get("APPDATA", str(self.home))) / "herdr" / "config.toml"
        else:
            destino = self.home / ".config" / "herdr" / "config.toml"
        origen = REPO / "herdr" / "config.toml"
        self.instalar_archivo(origen.read_bytes().replace(b"\r\n", b"\n"), destino,
                              origen.relative_to(REPO))

        codigo, salida = self.correr([herdr, "integration", "status"], timeout=60)
        if re.search(r"^claude: current", salida, re.M):
            self.info("integración con Claude: al día")
        elif self.simular:
            self.info("[simular] haría: herdr integration install claude")
        else:
            self.info("$ herdr integration install claude")
            codigo, salida = self.correr([herdr, "integration", "install", "claude"], timeout=120)
            if codigo != 0:
                self.fallo("integración de herdr con Claude: %s" % resumen_error(salida))

        if self.sin_skills:
            self.info("skill de herdr: se omite (--sin-skills).")
        elif self.instalar_skill(*SKILL_HERDR) == "ya":
            self.info("skill de herdr: ya instalada")

        if self.sin_plugins_herdr:
            self.info("plugins de herdr: se omiten (--sin-plugins-herdr).")
        else:
            self.plugins_herdr(herdr)

        if not self.simular:
            codigo, _ = self.correr([herdr, "server", "reload-config"], timeout=30)
            self.info("config recargada en el herdr abierto." if codigo == 0 else
                      "herdr no está abierto; la config se carga al abrirlo.")

    def plugins_herdr(self, herdr):
        self.info("Ojo: los plugins de herdr son código de la comunidad sin revisar (ver README).")
        codigo, salida = self.correr([herdr, "plugin", "list", "--json"], timeout=60)
        try:
            lista = json.loads(salida)["result"]["plugins"] if codigo == 0 else []
        except (ValueError, KeyError, TypeError):
            lista = []
        instalados = set()
        for p in lista:
            fuente = p.get("source") or {}
            instalados.add(p.get("plugin_id"))
            if fuente.get("owner") and fuente.get("repo"):
                instalados.add(("%s/%s" % (fuente["owner"], fuente["repo"])).lower())
        for fuente, pid in self.leer_plugins_herdr():
            repo = "/".join(fuente.split("/")[:2]).lower()
            if pid in instalados or repo in instalados:
                self.info("ya instalado: %s" % pid)
            elif self.simular:
                self.info("[simular] haría: herdr plugin install %s --yes" % fuente)
            else:
                self.info("$ herdr plugin install %s --yes" % fuente)
                codigo, salida = self.correr([herdr, "plugin", "install", fuente, "--yes"])
                if codigo != 0:
                    self.fallo("plugin de herdr %s: %s" % (fuente, resumen_error(salida)))
                    continue
                self.info("instalado: %s" % pid)
            # Un plugin sin nada en su carpeta de config todavía no está configurado.
            codigo, carpeta = self.correr([herdr, "plugin", "config-dir", pid], timeout=30)
            carpeta = Path(carpeta.strip()) if codigo == 0 and carpeta.strip() else None
            if not carpeta or not carpeta.is_dir() or not any(carpeta.iterdir()):
                self.pendientes.append(
                    "Configura el plugin %s de herdr: en un panel de herdr corre "
                    "`herdr plugin action invoke %s.setup` (ver README, «herdr y Telegram»)."
                    % (pid, pid))

    # ------------------------------------------------------------ 7. Ghostty
    def ghostty(self):
        if not self.con_ghostty:
            return
        self.paso("Ghostty (paleta Kanagawa y herdr al abrir)")
        if self.sin_herdr:
            self.info("Se omite (--sin-herdr): su config abre herdr.")
            return
        herdr = self.herdr_bin()
        if not herdr:
            self.aviso("No encontré herdr; no cambio la config de Ghostty (abre herdr al arrancar).")
            return
        plantilla = REPO / "ghostty" / "config"
        texto = plantilla.read_text(encoding="utf-8").replace(MARCADOR_HERDR, herdr)
        self.instalar_archivo(texto.replace("\r\n", "\n").encode("utf-8"),
                              self.home / ".config" / "ghostty" / "config",
                              plantilla.relative_to(REPO))

    # ------------------------------------------------------------ 8. Neovim
    def nvim(self):
        """Copia nvim/ (LazyVim con el tema Kanagawa) a ~/.config/nvim, sin pisar una config ajena."""
        if self.plataforma != "unix":
            return  # en Windows Neovim lee %LOCALAPPDATA%/nvim; no se instala ahí todavía
        self.paso("Neovim (LazyVim con el tema Kanagawa)")
        if self.sin_nvim:
            self.info("Se omite (--sin-nvim).")
            return
        destino = self.home / ".config" / "nvim"
        marca = destino / "lua" / "plugins" / "tema.lua"
        if destino.exists() and any(destino.iterdir()) and not marca.exists():
            self.aviso("ya tienes una config de Neovim en %s; no la toco. "
                       "Para usar la de este repo, muévela y vuelve a correr el instalador." % destino)
            return
        origen = REPO / "nvim"
        for f in sorted(origen.rglob("*")):
            if f.is_file() and f.name != ".DS_Store":
                self.instalar_archivo(f.read_bytes().replace(b"\r\n", b"\n"),
                                      destino / f.relative_to(origen), f.relative_to(REPO))
        self.pendientes.append("Abre `nvim` una vez: descarga solo los plugins y parsers (tarda un minuto).")

    # ------------------------------------------------------------ 9. terminal
    def terminal(self):
        """Copia terminal/terminal.sh (eza, bat, zoxide, fzf, atuin) y lo carga desde el rc."""
        if self.plataforma != "unix":
            return
        self.paso("Archivo de la terminal (terminal/terminal.sh en tu .zshrc o .bashrc)")
        if self.sin_terminal:
            self.info("Se omite (--sin-terminal).")
            return
        origen = REPO / "terminal" / "terminal.sh"
        destino = self.home / ".config" / "claude-code-entorno" / "terminal.sh"
        self.instalar_archivo(origen.read_bytes().replace(b"\r\n", b"\n"), destino,
                              origen.relative_to(REPO))
        shell = Path(os.environ.get("SHELL") or "bash").name
        rc = self.home / (".zshrc" if shell == "zsh" else ".bashrc")
        linea = ('[ -f "$HOME/.config/claude-code-entorno/terminal.sh" ] && '
                 '. "$HOME/.config/claude-code-entorno/terminal.sh"')
        texto = rc.read_text(encoding="utf-8") if rc.exists() else ""
        if linea in texto:
            self.info("al día: %s ya lo carga" % rc)
        elif self.simular:
            self.info("[simular] agregaría a %s: %s" % (rc, linea))
        else:
            separador = "\n" if texto and not texto.endswith("\n") else ""
            with rc.open("a", encoding="utf-8") as f:
                f.write("%s\n# Herramientas de terminal de claude-code-entorno (ver su README)\n%s\n"
                        % (separador, linea))
            self.info("agregado a %s" % rc)
            self.pendientes.append("Abre una terminal nueva para usar ll, z, ctrl+t (fzf) y "
                                   "ctrl+r (atuin); ver README, «Terminal».")
        faltan = [p for p in ("eza", "bat", "zoxide", "fzf", "atuin") if not self.buscar(p)]
        if faltan:
            self.aviso("Faltan %s: la terminal se salta lo que no esté instalado."
                       % ", ".join(faltan))

    # --------------------------------------------------- 10. OpenCode de respaldo
    def opencode(self):
        """OpenCode como respaldo: su init de shell y el script de modelos.

        Existe por si se acaban los tokens de Claude: con otra cuenta y otro
        saldo, los mismos modelos quedan al alcance desde Claude Code. Solo
        define las aliases si su variable de entorno está, así que no instalar
        una clave no rompe nada.
        """
        if self.plataforma != "unix":
            return
        self.paso("OpenCode como respaldo (opencode/, en tu .zshrc o .bashrc)")
        if self.sin_opencode:
            self.info("Se omite (--sin-opencode).")
            return
        origen = REPO / "opencode" / "opencode.sh"
        destino = self.home / ".config" / "claude-code-entorno" / "opencode.sh"
        self.instalar_archivo(origen.read_bytes().replace(b"\r\n", b"\n"), destino,
                              origen.relative_to(REPO))
        script = REPO / "opencode" / "opencode-go-modelos"
        destino_script = self.home / ".local" / "bin" / "opencode-go-modelos"
        self.instalar_archivo(script.read_bytes().replace(b"\r\n", b"\n"), destino_script,
                              script.relative_to(REPO), ejecutable=True)
        shell = Path(os.environ.get("SHELL") or "bash").name
        rc = self.home / (".zshrc" if shell == "zsh" else ".bashrc")
        linea = ('[ -f "$HOME/.config/claude-code-entorno/opencode.sh" ] && '
                 '. "$HOME/.config/claude-code-entorno/opencode.sh"')
        texto = rc.read_text(encoding="utf-8") if rc.exists() else ""
        if linea in texto:
            self.info("al día: %s ya lo carga" % rc)
        elif self.simular:
            self.info("[simular] agregaría a %s: %s" % (rc, linea))
        else:
            separador = "\n" if texto and not texto.endswith("\n") else ""
            with rc.open("a", encoding="utf-8") as f:
                f.write("%s\n# OpenCode como respaldo de Claude Code (ver README)\n%s\n"
                        % (separador, linea))
            self.info("agregado a %s" % rc)
            self.pendientes.append("Abre una terminal nueva para usar cl-go y cl-or.")
        self.pendientes.append(
            "cl-go necesita OPENCODE_API_KEY (clave de https://opencode.ai/console) y "
            "cl-or necesita OPENROUTER_API_KEY; las defines tú en esta computadora, "
            "nunca en el repo. Sin ellas las aliases no se crean. La clave también la "
            "usa /go-modelos dentro de Claude Code.")

    # ---------------------------------------- 11. config global de OpenCode
    def opencode_config(self):
        """Trae opencode-config a ~/.config/opencode: el router de modelos y gomodel.

        Vive en un repo aparte a propósito: si se copiara dentro de este repo, la
        config de OpenCode tendría dos fuentes de verdad y habría que mantenerla en
        los dos sitios. Aquí solo se clona o se hace pull, nunca se edita.

        Su .gitignore cubre service.json (la contraseña local) y los tokens, así que
        un `git reset --hard` sobre una carpeta ya existente no los toca: git nunca
        toca archivos sin seguimiento.
        """
        self.paso("Config global de OpenCode (opencode-config en ~/.config/opencode)")
        if self.sin_opencode_config:
            self.info("Se omite (--sin-opencode-config).")
            return
        git = self.buscar("git")
        if not git:
            self.aviso("Falta git: no se trae opencode-config (ver README, «Instalación»).")
            return
        destino = self.home / ".config" / "opencode"
        gestionado = (destino / ".git").is_dir()
        otros = [f.name for f in destino.iterdir()] if destino.is_dir() else []

        # Un opencode.json sin extensión que no venga del repo convive con el
        # opencode.jsonc y puede mandar sobre él. Se avisa; no se borra nada.
        if (destino / "opencode.json").exists():
            self.aviso("Hay ~/.config/opencode/opencode.json, que opencode-config no "
                       "gestiona: puede mandar sobre opencode.jsonc. No lo toco.")

        if gestionado:
            if self.simular:
                self.info("[simular] git pull --ff-only en %s" % destino)
            else:
                codigo, salida = self.correr([git, "-C", str(destino), "pull", "--ff-only"])
                if codigo != 0:
                    self.fallo("opencode-config: no pude hacer pull: %s" % salida.strip()[:200])
                    return
                self.info("al día: %s" % destino)
        elif otros:
            if self.simular:
                self.info("[simular] convertiría %s en clon de opencode-config (sus archivos "
                          "sin seguimiento, como service.json, quedan)" % destino)
            else:
                destino.mkdir(parents=True, exist_ok=True)
                pasos = [
                    [git, "-C", str(destino), "init", "-q", "-b", "main"],
                    [git, "-C", str(destino), "remote", "add", "origin", REPO_OPENCODE_CONFIG],
                    [git, "-C", str(destino), "fetch", "-q", "origin", "main"],
                    [git, "-C", str(destino), "reset", "-q", "--hard", "FETCH_HEAD"],
                    # Sin upstream, el `pull --ff-only` de la próxima corrida fallaría.
                    [git, "-C", str(destino), "branch", "-q",
                     "--set-upstream-to=origin/main", "main"],
                ]
                for paso in pasos:
                    codigo, salida = self.correr(paso)
                    if codigo != 0:
                        self.fallo("opencode-config: %s → %s"
                                   % (paso[-1], salida.strip()[:200]))
                        return
                self.info("convertido en clon: %s" % destino)
        else:
            if self.simular:
                self.info("[simular] clonaría %s en %s" % (REPO_OPENCODE_CONFIG, destino))
            else:
                destino.parent.mkdir(parents=True, exist_ok=True)
                codigo, salida = self.correr([git, "clone", REPO_OPENCODE_CONFIG, str(destino)])
                if codigo != 0:
                    self.fallo("opencode-config: no pude clonar: %s" % salida.strip()[:200])
                    return
                self.info("clonado: %s" % destino)

        # gomodel en el PATH, venga de donde venga la carpeta.
        origen_gomodel = destino / "bin" / "gomodel"
        enlace = self.home / ".local" / "bin" / "gomodel"
        if self.simular:
            self.info("[simular] enlazaría gomodel -> %s" % origen_gomodel)
        elif not origen_gomodel.is_file():
            self.aviso("Falta %s: no hay gomodel en el PATH." % origen_gomodel)
        else:
            enlace.parent.mkdir(parents=True, exist_ok=True)
            if enlace.is_symlink() or enlace.exists():
                enlace.unlink()
            enlace.symlink_to(origen_gomodel)
            self.info("enlazado: gomodel -> %s" % origen_gomodel)

        if not self.simular and not (destino / "opencode.jsonc").exists():
            self.fallo("opencode-config: quedó sin opencode.jsonc en %s; revísalo." % destino)
        self.pendientes.append(
            "opencode-config trae el router de modelos y `gomodel` en la terminal; abre "
            "una terminal nueva o reinicia OpenCode para que carguen. Para actualizar: "
            "`cd ~/.config/opencode && git pull`.")

    # ------------------------------------------------------------ 12. git
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
    p.add_argument("--saltar-aviso-permisos", action="store_true",
                   help="agrega skipDangerousModePermissionPrompt (apagado por omisión)")
    p.add_argument("--sin-herdr", action="store_true",
                   help="no toca herdr (config, integración, skill ni plugins) ni Ghostty")
    p.add_argument("--sin-plugins-herdr", action="store_true",
                   help="no instala los plugins de herdr/plugins.txt")
    p.add_argument("--ghostty", action="store_true",
                   help="instala la config de Ghostty (la pide instalar.sh si hay Ghostty)")
    p.add_argument("--sin-terminal", action="store_true",
                   help="no instala terminal/terminal.sh (eza, bat, zoxide, fzf y atuin)")
    p.add_argument("--sin-opencode", action="store_true",
                   help="no instala opencode/ (las aliases cl-go y cl-or de respaldo)")
    p.add_argument("--sin-opencode-config", action="store_true",
                   help="no trae opencode-config a ~/.config/opencode (router de modelos y gomodel)")
    p.add_argument("--sin-nvim", action="store_true",
                   help="no instala la config de Neovim (nvim/)")
    p.add_argument("--git-bash", default=None,
                   help="ruta a bash.exe si no está en el lugar de siempre (Windows)")
    a = p.parse_args(argv)
    if os.path.isabs(a.python_hooks) and not a.python_hooks.startswith('"'):
        a.python_hooks = '"%s"' % a.python_hooks  # ruta con posibles espacios
    inst = Instalador(a)
    for paso in (inst.archivos, inst.settings, inst.plugins, inst.skills, inst.mcp,
                 inst.herdr, inst.ghostty, inst.nvim, inst.terminal, inst.opencode,
                 inst.opencode_config, inst.git):
        try:
            paso()
        except Exception as e:  # un paso roto no impide los demás
            inst.fallo("%s: %s" % (paso.__name__, e))
    return inst.resumen()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace", line_buffering=True)
    sys.exit(main())

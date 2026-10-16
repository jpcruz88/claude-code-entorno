#!/usr/bin/env python3
"""Regenera los archivos del repo a partir del Claude Code de esta Mac.

Solo LEE la configuración real (nunca la modifica) y escribe únicamente dentro
del repo. Aplica los filtros de herramientas/filtros.json:
  - claude/settings.base.json: solo las claves y hooks permitidos; enabledPlugins
    recortado a plugins.txt; rutas del HOME convertidas a «~».
  - claude/rules/: solo las de reglas_permitidas; a matar-procesos.md se le
    agrega la sección de Windows si no la trae. Avisa de reglas nuevas.
  - skills/lista.json: solo las de skills_permitidas, con su origen de
    ~/.agents/.skill-lock.json (corrigiendo los repos renombrados). Avisa de las
    skills usadas (clave skillUsage de ~/.claude.json; no se lee nada más de ese
    archivo) que no estén en la lista. Con --verificar-origenes comprueba, sin
    credenciales, que cada repo sea público y conserve su nombre; si no, falla.
Además compara el hook guard-kill.py y statusline.sh de esta Mac con los del repo
(el repo guarda versiones portables: no se sobrescriben) y avisa de diferencias.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from fusionar_settings import clave_hook  # noqa: E402


def nombres_en(raiz):
    """Nombres de skills guardadas en raiz/<skill> o raiz/<grupo>/<skill>.

    Sirve para skills-retiradas/<fecha>/<skill> (a veces son enlaces simbólicos)
    y para skills/synced/<cuenta>/<skill>.
    """
    nombres = set()
    if not raiz.is_dir():
        return nombres
    for d in raiz.iterdir():
        if d.name.startswith("."):
            continue
        if (d / "SKILL.md").exists():
            nombres.add(d.name)
        elif d.is_dir():
            nombres |= {c.name for c in d.iterdir()
                        if not c.name.startswith(".") and (c.is_dir() or c.is_symlink())}
    return nombres


def repo_publico(repo):
    """True si el repo se puede leer sin ninguna credencial (ni la del llavero,
    ni la de gh, ni reglas insteadOf de la configuración personal de git)."""
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_ASKPASS="", SSH_ASKPASS="",
               GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
    try:
        r = subprocess.run(["git", "-c", "credential.helper=", "ls-remote", "--exit-code", "-h",
                            "https://github.com/%s.git" % repo],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=60, env=env)
        return r.returncode in (0, 2)  # 2: existe pero sin ramas que coincidan
    except Exception:
        return False


class _SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def nombre_actual(repo):
    """dueño/repo al que redirige GitHub si el repo cambió de nombre, o None."""
    abrir = urllib.request.build_opener(_SinRedireccion).open
    pedido = urllib.request.Request("https://github.com/%s" % repo, method="HEAD",
                                    headers={"User-Agent": "claude-code-entorno"})
    try:
        abrir(pedido, timeout=30)
        return None
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 307, 308):
            m = re.match(r"https://github\.com/([^/]+/[^/?#]+)", e.headers.get("Location", ""))
            return m.group(1) if m else None
        return None
    except Exception:
        return None


class Exportador:
    def __init__(self, repo, claude_dir, claude_json, skill_lock, verificar=False):
        self.repo = Path(repo).resolve()
        self.claude_dir = Path(claude_dir)
        self.claude_json = Path(claude_json)
        self.skill_lock = Path(skill_lock)
        self.home = Path.home()
        self.filtros = json.loads((self.repo / "herramientas" / "filtros.json")
                                  .read_text(encoding="utf-8"))
        self.cambiados = []
        self.errores = []
        self.verificar = verificar

    def error(self, texto):
        print("    ERROR: " + texto)
        self.errores.append(texto)

    # ------------------------------------------------------------ escritura
    def escribir(self, relativo, texto):
        ruta = (self.repo / relativo).resolve()
        if self.repo not in ruta.parents:
            raise RuntimeError("se intentó escribir fuera del repo: %s" % ruta)
        anterior = ruta.read_text(encoding="utf-8") if ruta.exists() else None
        if anterior == texto:
            print("    sin cambios: %s" % relativo)
            return
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        self.cambiados.append(relativo)
        print("    %s: %s" % ("actualizado" if anterior is not None else "nuevo", relativo))

    def plugins_permitidos(self):
        ids = []
        for linea in (self.repo / "plugins.txt").read_text(encoding="utf-8").splitlines():
            linea = linea.split("#", 1)[0].strip()
            if linea:
                ids.append(linea.split()[0])
        return ids

    def a_tilde(self, comando):
        return comando.replace(str(self.home) + "/", "~/")

    # ------------------------------------------------------------ settings
    def settings(self):
        print("\n==> claude/settings.base.json")
        real = json.loads((self.claude_dir / "settings.json").read_text(encoding="utf-8"))
        conf = self.filtros["settings"]
        permitidos = conf["hooks_permitidos"]
        plugins = self.plugins_permitidos()
        salida = {}
        for clave in conf["claves"]:
            if clave not in real:
                continue
            valor = real[clave]
            if clave == "hooks":
                valor = self.filtrar_hooks(valor, permitidos)
            elif clave == "enabledPlugins":
                fuera = sorted(k for k in valor if k not in plugins)
                if fuera:
                    print("    plugins que no se exportan: %s" % ", ".join(fuera))
                valor = {k: v for k, v in valor.items() if k in plugins}
            elif clave == "statusLine" and isinstance(valor, dict) and "command" in valor:
                valor = dict(valor, command=self.a_tilde(valor["command"]))
            salida[clave] = valor
        fuera = sorted(k for k in real if k not in conf["claves"])
        if fuera:
            print("    claves que no se exportan: %s" % ", ".join(fuera))
        self.escribir("claude/settings.base.json",
                      json.dumps(salida, indent=2, ensure_ascii=False) + "\n")

    def filtrar_hooks(self, hooks, permitidos):
        salida, omitidos = {}, 0
        for evento, grupos in hooks.items():
            nuevos = []
            for grupo in grupos:
                for h in grupo.get("hooks", []):
                    clave = clave_hook(h.get("command", "")) if h.get("type") == "command" else None
                    if clave not in permitidos:
                        omitidos += 1
                        continue
                    matcher = permitidos[clave].get("matcher", grupo.get("matcher"))
                    destino = next((g for g in nuevos if g.get("matcher") == matcher), None)
                    if destino is None:
                        destino = {"matcher": matcher, "hooks": []} if matcher is not None \
                            else {"hooks": []}
                        nuevos.append(destino)
                    destino["hooks"].append(dict(h, command=self.a_tilde(h["command"])))
            if nuevos:
                salida[evento] = nuevos
        print("    hooks que no se exportan: %d" % omitidos)
        return salida

    # ------------------------------------------------------------ reglas
    def reglas(self):
        print("\n==> claude/rules/ (lista de permitidas)")
        plantilla = (AQUI / "plantillas" / "matar-procesos-windows.md").read_text(encoding="utf-8")
        permitidas = self.filtros["reglas_permitidas"]
        for nombre in permitidas:
            texto = (self.claude_dir / "rules" / nombre).read_text(encoding="utf-8")
            if nombre == "matar-procesos.md" and "taskkill" not in texto:
                texto = texto.rstrip("\n") + "\n" + plantilla
            self.escribir("claude/rules/" + nombre, texto)
        for f in sorted((self.claude_dir / "rules").glob("*.md")):
            if f.name not in permitidas and not f.name.startswith("."):
                print("    regla nueva: %s; agrégala a reglas_permitidas en "
                      "herramientas/filtros.json si quieres llevarla" % f.name)

    # ------------------------------------------------------------ skills
    def skills(self):
        print("\n==> skills/lista.json (lista de permitidas)")
        permitidas = self.filtros["skills_permitidas"]
        conf = self.filtros["skills"]
        renombrados = conf.get("origenes_renombrados", {})
        usadas = set(json.loads(self.claude_json.read_text(encoding="utf-8"))
                     .get("skillUsage", {}))
        lock = json.loads(self.skill_lock.read_text(encoding="utf-8")).get("skills", {})
        incluidas = []
        for nombre in sorted(permitidas):
            entrada = lock.get(nombre) or {}
            if entrada.get("sourceType") != "github" or not entrada.get("source"):
                self.error("la skill permitida «%s» no tiene un origen de GitHub en "
                           ".skill-lock.json" % nombre)
                continue
            fuente = renombrados.get(entrada["source"], entrada["source"])
            incluidas.append({"nombre": nombre, "origen": "%s@%s" % (fuente, nombre)})
        print("    incluidas: %d" % len(incluidas))
        # Avisa de las usadas que no están en la lista (salvo las que llegan solas)
        llegan_solas = (nombres_en(self.claude_dir / "skills-retiradas")
                        | nombres_en(self.claude_dir / "skills" / "synced")
                        | set(conf.get("integradas", [])))
        for nombre in sorted(usadas - set(permitidas)):
            fuente = (lock.get(nombre) or {}).get("source")
            if ":" in nombre or nombre in llegan_solas or fuente in conf.get("fuentes_de_plugins", []):
                continue
            print("    nueva skill usada: %s; agrégala a filtros.json si quieres llevarla" % nombre)
        datos = {
            "_que_es": ("Skills que instalan instalar.sh e instalar.ps1 con "
                        "`npx -y skills@<versión fija> add <origen> -g -y -a claude-code` "
                        "(la versión está en herramientas/instalar_comun.py). Lo genera "
                        "exportar.sh desde esta Mac; para cambiar qué entra, edita "
                        "skills_permitidas en herramientas/filtros.json."),
            "skills": incluidas,
        }
        self.escribir("skills/lista.json", json.dumps(datos, indent=2, ensure_ascii=False) + "\n")
        if self.verificar:
            self.verificar_origenes(incluidas)
        return incluidas

    def verificar_origenes(self, incluidas):
        """Comprueba, sin credenciales, que cada repositorio de origen sea público y
        conserve su nombre (GitHub redirige los renombrados)."""
        repos = sorted({s["origen"].split("@", 1)[0] for s in incluidas})
        print("    verificando sin credenciales %d repositorios de origen…" % len(repos))
        for repo in repos:
            if not repo_publico(repo):
                self.error("https://github.com/%s no es público (o ya no existe): sus skills "
                           "no se pueden instalar sin credenciales. Sácalas de "
                           "skills_permitidas." % repo)
                continue
            nuevo = nombre_actual(repo)
            if nuevo and nuevo.lower() != repo.lower():
                self.error("%s ahora se llama %s: agrégalo a skills.origenes_renombrados "
                           "en herramientas/filtros.json." % (repo, nuevo))
        if not self.errores:
            print("    todos públicos y con su nombre actual.")

    # ------------------------------------------------------------ comparaciones
    def comparar(self):
        print("\n==> Hook y statusline (el repo guarda versiones portables)")
        pares = [("claude/hooks/guard-kill.py", self.claude_dir / "hooks" / "guard-kill.py"),
                 ("claude/statusline.sh", self.claude_dir / "statusline.sh")]
        for relativo, real in pares:
            if not real.exists():
                print("    esta Mac no tiene %s" % real.name)
            elif real.read_bytes() == (self.repo / relativo).read_bytes():
                print("    igual en esta Mac y en el repo: %s" % relativo)
            else:
                print("    distinto en esta Mac: %s. El repo conserva su versión portable; "
                      "si cambiaste algo aquí, pásalo a mano al repo." % relativo)

    def todo(self):
        self.settings()
        self.reglas()
        self.skills()
        self.comparar()
        print("\nArchivos cambiados: %s" % (", ".join(self.cambiados) or "ninguno"))
        if self.errores:
            print("Hubo %d error(es); corrígelos antes de hacer commit." % len(self.errores))
            return 1
        return 0


def main(argv=None):
    home = Path.home()
    p = argparse.ArgumentParser(description="Regenera el repo desde la config de esta Mac.")
    p.add_argument("--repo", default=str(AQUI.parent))
    p.add_argument("--claude-dir", default=str(home / ".claude"))
    p.add_argument("--claude-json", default=str(home / ".claude.json"))
    p.add_argument("--skill-lock", default=str(home / ".agents" / ".skill-lock.json"))
    p.add_argument("--verificar-origenes", action="store_true",
                   help="comprobar con internet que los repositorios de las skills sean "
                        "públicos y conserven su nombre")
    a = p.parse_args(argv)
    return Exportador(a.repo, a.claude_dir, a.claude_json, a.skill_lock,
                      a.verificar_origenes).todo()


if __name__ == "__main__":
    sys.exit(main())

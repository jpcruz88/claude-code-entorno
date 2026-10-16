#!/usr/bin/env python3
"""Regenera los archivos del repo a partir del Claude Code de esta Mac.

Solo LEE la configuración real (nunca la modifica) y escribe únicamente dentro
del repo. Aplica los filtros de herramientas/filtros.json:
  - claude/settings.base.json: solo las claves y hooks permitidos; enabledPlugins
    recortado a plugins.txt; rutas del HOME convertidas a «~».
  - claude/rules/: las reglas permitidas; a matar-procesos.md se le agrega la
    sección de Windows si no la trae.
  - skills/lista.json: las skills usadas alguna vez (clave skillUsage de
    ~/.claude.json; no se lee nada más de ese archivo) más las «extra», menos las
    retiradas, las de synced/, las integradas, las que llegan con un plugin y las
    que no tienen origen en ~/.agents/.skill-lock.json.
Además compara el hook guard-kill.py y statusline.sh de esta Mac con los del repo
(el repo guarda versiones portables: no se sobrescriben) y avisa de diferencias.
"""
import argparse
import json
import os
import subprocess
import sys
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
        self.verificar = verificar

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
        print("\n==> claude/rules/")
        plantilla = (AQUI / "plantillas" / "matar-procesos-windows.md").read_text(encoding="utf-8")
        for nombre in self.filtros["reglas"]:
            texto = (self.claude_dir / "rules" / nombre).read_text(encoding="utf-8")
            if nombre == "matar-procesos.md" and "taskkill" not in texto:
                texto = texto.rstrip("\n") + "\n" + plantilla
            self.escribir("claude/rules/" + nombre, texto)

    # ------------------------------------------------------------ skills
    def skills(self):
        print("\n==> skills/lista.json")
        conf = self.filtros["skills"]
        usadas = set(json.loads(self.claude_json.read_text(encoding="utf-8"))
                     .get("skillUsage", {}))
        lock = json.loads(self.skill_lock.read_text(encoding="utf-8")).get("skills", {})
        retiradas = nombres_en(self.claude_dir / "skills-retiradas")
        synced = nombres_en(self.claude_dir / "skills" / "synced")
        fuera = {}
        incluidas = []
        for nombre in sorted(usadas | set(conf["extra"])):
            entrada = lock.get(nombre)
            if ":" in nombre:
                motivo = "vienen dentro de un plugin"
            elif nombre in conf["excluidas"]:
                motivo = "excluidas: %s" % conf["excluidas"][nombre]
            elif nombre in retiradas:
                motivo = "retiradas"
            elif nombre in synced:
                motivo = "llegan por la cuenta de claude.ai (synced)"
            elif nombre in conf["integradas"]:
                motivo = "integradas en Claude Code"
            elif not entrada:
                motivo = "SIN ORIGEN en .skill-lock.json"
            elif entrada.get("source") in conf["fuentes_de_plugins"]:
                motivo = "llegan con un plugin (%s)" % entrada.get("source")
            elif entrada.get("sourceType") != "github":
                motivo = "origen que no es de GitHub"
            else:
                incluidas.append({"nombre": nombre, "origen": "%s@%s" % (entrada["source"], nombre)})
                continue
            fuera.setdefault(motivo, []).append(nombre)
        for nombre in conf["extra"]:
            if nombre not in lock:
                print("    AVISO: la skill extra «%s» no tiene origen; no se incluye." % nombre)
        print("    incluidas: %d" % len(incluidas))
        for motivo in sorted(fuera):
            print("    fuera (%s): %s" % (motivo, ", ".join(fuera[motivo])))
        datos = {
            "_que_es": ("Skills que instalan instalar.sh e instalar.ps1 con "
                        "`npx -y skills add <origen> -g -y -a claude-code`. Lo genera "
                        "exportar.sh desde esta Mac; para cambiar qué entra, edita "
                        "herramientas/filtros.json."),
            "skills": incluidas,
        }
        self.escribir("skills/lista.json", json.dumps(datos, indent=2, ensure_ascii=False) + "\n")
        if self.verificar:
            self.verificar_origenes(incluidas)
        return incluidas, fuera

    def verificar_origenes(self, incluidas):
        """Comprueba (con internet) que cada repositorio de origen siga existiendo."""
        repos = sorted({s["origen"].split("@", 1)[0] for s in incluidas})
        print("    verificando %d repositorios de origen en GitHub…" % len(repos))
        for repo in repos:
            try:
                r = subprocess.run(["git", "ls-remote", "--exit-code", "-h",
                                    "https://github.com/%s.git" % repo],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   timeout=30, env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
                ok = r.returncode in (0, 2)  # 2: existe pero sin ramas que coincidan
            except Exception:
                ok = False
            if not ok:
                print("    AVISO: no pude abrir https://github.com/%s; ¿lo borraron? Si es así, "
                      "agrega sus skills a «excluidas» en herramientas/filtros.json." % repo)

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


def main(argv=None):
    home = Path.home()
    p = argparse.ArgumentParser(description="Regenera el repo desde la config de esta Mac.")
    p.add_argument("--repo", default=str(AQUI.parent))
    p.add_argument("--claude-dir", default=str(home / ".claude"))
    p.add_argument("--claude-json", default=str(home / ".claude.json"))
    p.add_argument("--skill-lock", default=str(home / ".agents" / ".skill-lock.json"))
    p.add_argument("--verificar-origenes", action="store_true",
                   help="comprobar con internet que los repositorios de las skills existan")
    a = p.parse_args(argv)
    Exportador(a.repo, a.claude_dir, a.claude_json, a.skill_lock, a.verificar_origenes).todo()
    return 0


if __name__ == "__main__":
    sys.exit(main())

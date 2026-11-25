"""claude/hooks/al_dia.py: estado diario, cerrojo y JSON atómico."""
import importlib.util
import json
import os
import sys
import re
import subprocess
import tempfile
import time
import unittest
import unittest.mock
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODULO = RAIZ / "claude" / "hooks" / "al_dia.py"


def cargar():
    """Carga el módulo; perezoso para que cada prueba falle por su cuenta."""
    spec = importlib.util.spec_from_file_location("al_dia", MODULO)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class PruebaEstado(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        self.t = 1_800_000_000.0

    def test_carpeta(self):
        self.assertEqual(cargar().carpeta(Path("/h")), Path("/h/.claude/al-dia"))

    def test_sin_estado_revisa_todo(self):
        self.assertEqual(cargar().que_revisar(None, self.t), "todo")

    def test_antes_de_24h_no_revisa(self):
        e = {"inicio": self.t - 23 * 3600, "repetir": []}
        self.assertIsNone(cargar().que_revisar(e, self.t))

    def test_a_las_24h_revisa_todo(self):
        e = {"inicio": self.t - 24 * 3600, "repetir": []}
        self.assertEqual(cargar().que_revisar(e, self.t), "todo")

    def test_pendientes_antes_de_1h_no(self):
        e = {"inicio": self.t - 1800, "repetir": ["skill:caveman"]}
        self.assertIsNone(cargar().que_revisar(e, self.t))

    def test_pendientes_pasada_1h(self):
        e = {"inicio": self.t - 3600, "repetir": ["skill:caveman"]}
        self.assertEqual(cargar().que_revisar(e, self.t), "pendientes")

    def test_pendientes_cuentan_desde_el_ultimo_intento(self):
        m = cargar()
        e = {"inicio": self.t - 5 * 3600, "ultimo_intento": self.t - 1800,
             "repetir": ["skill:caveman"]}
        self.assertIsNone(m.que_revisar(e, self.t))
        e["ultimo_intento"] = self.t - 3600
        self.assertEqual(m.que_revisar(e, self.t), "pendientes")

    def test_las_24h_cuentan_desde_inicio_aunque_haya_reintentos(self):
        e = {"inicio": self.t - 24 * 3600, "ultimo_intento": self.t - 60,
             "repetir": ["skill:caveman"]}
        self.assertEqual(cargar().que_revisar(e, self.t), "todo")

    def test_ultimo_intento_roto_se_ignora(self):
        e = {"inicio": self.t - 3600, "ultimo_intento": "ayer", "repetir": ["x"]}
        self.assertEqual(cargar().que_revisar(e, self.t), "pendientes")

    def test_cerrojo(self):
        m = cargar()
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t))
        self.assertFalse(m.tomar_cerrojo(self.dir, self.t))

    def test_cerrojo_muerto_de_mas_de_1h(self):
        m = cargar()
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t - 3601))
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t))

    def test_soltar_cerrojo(self):
        m = cargar()
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t))
        m.soltar_cerrojo(self.dir)
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t))

    def test_cerrojo_ilegible_usa_mtime(self):
        m = cargar()
        (self.dir / "cerrojo").write_text("basura")
        os.utime(self.dir / "cerrojo", (self.t - 10, self.t - 10))
        self.assertFalse(m.tomar_cerrojo(self.dir, self.t))
        os.utime(self.dir / "cerrojo", (self.t - 3601, self.t - 3601))
        self.assertTrue(m.tomar_cerrojo(self.dir, self.t))

    def test_leer_json_roto(self):
        ruta = self.dir / "roto.json"
        ruta.write_text('{"a":')
        self.assertIsNone(cargar().leer_json(ruta))

    def test_leer_json_falta(self):
        self.assertIsNone(cargar().leer_json(self.dir / "no.json"))

    def test_escribir_y_leer_sin_temporales(self):
        m = cargar()
        ruta = self.dir / "sub" / "x.json"
        m.escribir_json(ruta, {"a": 1})
        self.assertEqual(m.leer_json(ruta), {"a": 1})
        self.assertEqual([p.name for p in ruta.parent.iterdir()], ["x.json"])


class PruebaFoto(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        (self.home / ".agents").mkdir()
        (self.home / ".agents" / ".skill-lock.json").write_text(json.dumps({
            "version": 3,
            "skills": {
                "caveman": {"skillFolderHash": "c909448e1234"},
                "herdr": {"skillFolderHash": "abcdef0123"},
            }}))
        (self.home / ".config" / "nvim").mkdir(parents=True)
        (self.home / ".config" / "nvim" / "lazy-lock.json").write_text('{"a": 1}')
        self.salidas = {
            ("claude", "plugin", "list", "--json"): (0, json.dumps([
                {"id": "superpowers@claude-plugins-official", "version": "5.1.0",
                 "installPath": "/x/superpowers"},
                {"id": "tablero@claude-code-entorno", "version": "0.6.1",
                 "installPath": "/x/tablero"}])),
            ("codebase-memory-mcp", "--version"): (0, "codebase-memory-mcp 0.12.0\n"),
            ("herdr", "--version"): (0, "herdr 0.9.5"),
            ("herdr", "plugin", "list", "--json"): (0, json.dumps({
                "id": "cli:plugin", "result": {"plugins": [{
                    "plugin_id": "permgps.telegram-agents", "version": "0.17.3",
                    "plugin_root": "/p/telegram",
                    "source": {"kind": "github", "owner": "permgps",
                               "repo": "herdr-telegram-agents"}}]}})),
            ("opencode", "--version"): (0, "opencode v2.2.6"),
            ("claude", "--version"): (0, "2.1.322 (Claude Code)"),
        }
        self.llamadas = []

    def ejecutar(self, cmd, timeout):
        self.llamadas.append(list(cmd))
        return self.salidas.get(tuple(cmd), (1, "no existe"))

    def buscar_todo(self, programa, home):
        return programa

    def foto(self, buscar=None):
        return cargar().foto(self.home, self.ejecutar, buscar or self.buscar_todo)

    def test_skills_y_plugins_sin_mods_del_repo(self):
        f = self.foto()
        self.assertEqual(sorted(k for k in f if k.startswith("skill:")),
                         ["skill:caveman", "skill:herdr"])
        self.assertEqual(f["skill:caveman"], {
            "nombre": "caveman", "tipo": "skill", "version": "c9094",
            "carpeta": str(self.home / ".agents" / "skills" / "caveman")})
        plugins = [k for k in f if k.startswith("plugin:") and "herdr/" not in k]
        self.assertEqual(plugins, ["plugin:superpowers@claude-plugins-official"])
        sp = f["plugin:superpowers@claude-plugins-official"]
        self.assertEqual((sp["nombre"], sp["tipo"], sp["version"], sp["carpeta"]),
                         ("superpowers", "plugin", "5.1.0", "/x/superpowers"))

    def test_versiones_de_programas(self):
        f = self.foto()
        self.assertEqual(f["MCP:codebase-memory"]["version"], "0.12.0")
        self.assertEqual(f["MCP:codebase-memory"]["tipo"], "MCP")
        self.assertEqual(f["programa:herdr"]["version"], "0.9.5")
        self.assertEqual(f["programa:opencode"]["version"], "2.2.6")
        self.assertEqual(f["programa:claude"]["version"], "2.1.322")
        self.assertEqual(f["programa:claude"]["nombre"], "Claude Code")
        self.assertIsNone(f["programa:claude"]["carpeta"])

    def test_plugin_de_herdr(self):
        p = self.foto()["plugin:herdr/permgps.telegram-agents"]
        self.assertEqual(p, {"nombre": "herdr-telegram-agents", "tipo": "plugin",
                             "version": "0.17.3", "carpeta": "/p/telegram"})

    def test_neovim_es_una_sola_cosa(self):
        f = self.foto()
        n = f["programa:neovim-plugins"]
        self.assertEqual(n["nombre"], "plugins de Neovim")
        self.assertEqual(len(n["version"]), 5)
        self.assertEqual([k for k in f if "nvim" in k or "neovim" in k],
                         ["programa:neovim-plugins"])

    def test_lock_roto_da_cero_skills(self):
        (self.home / ".agents" / ".skill-lock.json").write_text('{"skills":')
        f = self.foto()
        self.assertEqual([k for k in f if k.startswith("skill:")], [])
        self.assertIn("programa:claude", f)

    def test_lista_de_plugins_rota_no_afecta_al_resto(self):
        self.salidas[("claude", "plugin", "list", "--json")] = (0, '[{"id":')
        f = self.foto()
        self.assertEqual([k for k in f if k.startswith("plugin:superpowers")], [])
        self.assertIn("programa:herdr", f)
        self.assertIn("skill:caveman", f)

    def test_comando_con_error_deja_la_fuente_vacia(self):
        self.salidas[("opencode", "--version")] = (1, "boom")
        f = self.foto()
        self.assertNotIn("programa:opencode", f)
        self.assertIn("programa:claude", f)

    def test_ejecutar_que_lanza_no_rompe(self):
        def malo(cmd, timeout):
            raise RuntimeError("x")
        f = cargar().foto(self.home, malo, self.buscar_todo)
        self.assertIn("skill:caveman", f)
        self.assertIn("programa:neovim-plugins", f)

    def test_sin_programas_solo_skills_y_neovim(self):
        f = self.foto(buscar=lambda programa, home: None)
        self.assertEqual(self.llamadas, [])
        self.assertEqual(sorted(f), ["programa:neovim-plugins",
                                     "skill:caveman", "skill:herdr"])

    def test_json_de_plugins_con_aviso_antes(self):
        # stderr va mezclado: un aviso antes del JSON no debe romper la lectura.
        self.salidas[("claude", "plugin", "list", "--json")] = (
            0, "aviso: algo raro\n" + json.dumps([
                {"id": "superpowers@claude-plugins-official", "version": "5.1.0",
                 "installPath": "/x/superpowers"}]))
        self.salidas[("herdr", "plugin", "list", "--json")] = (
            0, "warn: x\n" + self.salidas[("herdr", "plugin", "list", "--json")][1])
        f = self.foto()
        self.assertIn("plugin:superpowers@claude-plugins-official", f)
        self.assertIn("plugin:herdr/permgps.telegram-agents", f)

    def test_json_de_salta_avisos_con_corchetes_antes_del_json(self):
        texto = ("(node:123) [DEP0040] DeprecationWarning: The `punycode` module is "
                 "deprecated.\n" + json.dumps([{"id": "a@mk", "version": "1.0.0"}]))
        self.assertEqual(cargar()._json_de(texto), [{"id": "a@mk", "version": "1.0.0"}])
        self.salidas[("claude", "plugin", "list", "--json")] = (0, texto)
        self.assertIn("plugin:a@mk", self.foto())

    def test_json_de_sin_json_devuelve_none(self):
        m = cargar()
        self.assertIsNone(m._json_de("(node:1) [DEP0040] aviso { raro"))
        self.assertIsNone(m._json_de("[1, 2"))
        self.assertIsNone(m._json_de(None))

    def test_plugin_sin_version_se_omite(self):
        self.salidas[("claude", "plugin", "list", "--json")] = (0, json.dumps([
            {"id": "a@mk", "version": "", "installPath": "/x/a"},
            {"id": "b@mk", "version": None, "installPath": "/x/b"},
            {"id": "c@mk", "installPath": "/x/c"},
            {"id": "d@mk", "version": "1.0.0", "installPath": "/x/d"}]))
        self.salidas[("herdr", "plugin", "list", "--json")] = (0, json.dumps({
            "result": {"plugins": [
                {"plugin_id": "x.vacia", "version": ""},
                {"plugin_id": "x.nula", "version": None},
                {"plugin_id": "x.buena", "version": "0.1.0"}]}}))
        f = self.foto()
        self.assertEqual(sorted(k for k in f if k.startswith("plugin:")),
                         ["plugin:d@mk", "plugin:herdr/x.buena"])


    def test_buscar_en_carpetas_conocidas(self):
        m = cargar()
        bin_ = self.home / ".opencode" / "bin"
        bin_.mkdir(parents=True)
        exe = bin_ / "opencode"
        exe.write_text("#!/bin/sh\n")
        exe.chmod(0o755)
        with unittest.mock.patch.object(m.shutil, "which", return_value=None):
            self.assertEqual(m.buscar("opencode", self.home), str(exe))
            self.assertIsNone(m.buscar("noexiste-xyz", self.home))

    def test_ejecutar_real_corta_por_tiempo(self):
        codigo, salida = cargar().ejecutar_real(
            [sys.executable, "-c", "import time; time.sleep(5)"], 1)
        self.assertEqual((codigo, salida), (124, "tiempo agotado"))

    def test_ejecutar_real_devuelve_salida(self):
        codigo, salida = cargar().ejecutar_real(
            [sys.executable, "-c", "print('hola')"], 10)
        self.assertEqual(codigo, 0)
        self.assertIn("hola", salida)


class PruebaMaquinaReal(unittest.TestCase):
    """Lo que salió en la primera revisión real en una Mac (2026-11-09)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        self.salidas = {
            ("claude", "plugin", "list", "--json"): (0, json.dumps([
                {"id": "superpowers@claude-plugins-official", "version": "5.1.0", "installPath": "/x/s"},
                {"id": "cowork-plugin-management@synced", "version": "1.0.0", "installPath": "/x/c"},
                {"id": "data-viz-2025@skills-dir", "version": "1.0.0", "installPath": "/x/d"}])),
            ("herdr", "--version"): (0, "herdr 0.9.5"),
            ("codebase-memory-mcp", "--version"): (0, "codebase-memory-mcp 0.12.0"),
        }

    def ejecutar(self, cmd, timeout):
        return self.salidas.get(tuple(cmd), (1, "no existe"))

    def test_plugins_sincronizados_o_de_carpeta_no_entran(self):
        # @synced viene de claude.ai y @skills-dir de ~/.claude/skills: no tienen marketplace que actualizar.
        f = cargar().foto(self.home, self.ejecutar, lambda programa, home: programa)
        self.assertIn("plugin:superpowers@claude-plugins-official", f)
        self.assertNotIn("plugin:cowork-plugin-management@synced", f)
        self.assertNotIn("plugin:data-viz-2025@skills-dir", f)
        claves = [x[0] for x in cargar().pasos(f, "skills@1.7.2")]
        self.assertNotIn("marketplace:synced", claves)
        self.assertNotIn("marketplace:skills-dir", claves)

    def test_programa_de_homebrew_se_actualiza_con_brew(self):
        # herdr instalado con Homebrew no deja `herdr update`: se usa `brew upgrade herdr`.
        cellar = self.home / "opt" / "homebrew" / "Cellar" / "herdr" / "0.9.5" / "bin"
        cellar.mkdir(parents=True)
        (cellar / "herdr").write_text("")
        enlace = self.home / "bin-herdr"
        enlace.symlink_to(cellar / "herdr")
        buscar = lambda programa, home: str(enlace) if programa == "herdr" else programa
        ejecutar = lambda cmd, t: self.salidas.get(("herdr", "--version") if cmd[0] == str(enlace) else tuple(cmd), (1, ""))
        f = cargar().foto(self.home, ejecutar, buscar)
        self.assertEqual(f["programa:herdr"].get("instalador"), "brew")
        self.assertNotIn("instalador", f["MCP:codebase-memory"])
        comandos = {x[0]: x[1] for x in cargar().pasos(f, "skills@1.7.2")}
        self.assertEqual(comandos["programa:herdr"], ["brew", "upgrade", "herdr"])
        self.assertEqual(comandos["MCP:codebase-memory"], ["codebase-memory-mcp", "update", "-y"])

    def test_plugins_de_herdr_con_yes(self):
        # Sin terminal, `herdr plugin update` exige --yes.
        antes = {"plugin:herdr/x": {"nombre": "x", "tipo": "plugin", "version": "1", "carpeta": None}}
        comandos = {x[0]: x[1] for x in cargar().pasos(antes, "skills@1.7.2")}
        self.assertEqual(comandos["plugin:herdr/*"], ["herdr", "plugin", "update", "--yes"])


class PopenFalso:
    """Reemplaza subprocess.Popen: guarda los argumentos y no lanza nada."""
    instancias = []
    espera_timeout = False

    def __init__(self, cmd, **kw):
        self.cmd, self.kw = cmd, kw
        self.pid = 4242
        self.stdin = self.stdout = self.stderr = None
        self.returncode = 0
        self.llamadas = 0
        PopenFalso.instancias.append(self)

    def communicate(self, timeout=None):
        self.llamadas += 1
        if PopenFalso.espera_timeout and self.llamadas == 1:
            raise subprocess.TimeoutExpired(self.cmd, timeout)
        return "ok", None

    def kill(self):
        pass

    def wait(self, timeout=None):
        return 0


class PruebaEjecutarReal(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        PopenFalso.instancias = []
        PopenFalso.espera_timeout = False
        self.addCleanup(setattr, PopenFalso, "espera_timeout", False)

    def correr(self, cmd, plataforma=None, home=None):
        m = cargar()
        with unittest.mock.patch.object(m.subprocess, "Popen", PopenFalso):
            if plataforma:
                with unittest.mock.patch.object(m.sys, "platform", plataforma):
                    r = m.ejecutar_real(cmd, 5, home or self.home)
            else:
                r = m.ejecutar_real(cmd, 5, home or self.home)
        return r, PopenFalso.instancias[-1].kw

    @unittest.skipIf(sys.platform == "win32", "solo POSIX")
    def test_tiempo_limite_mata_tambien_al_nieto(self):
        pidfile = self.home / "nieto.pid"
        t0 = time.monotonic()
        codigo, salida = cargar().ejecutar_real(
            ["sh", "-c", f"sleep 30 & echo $! > '{pidfile}'; sleep 30"], 1, self.home)
        nieto = int(pidfile.read_text().strip())
        try:
            self.assertEqual((codigo, salida), (124, "tiempo agotado"))
            self.assertLess(time.monotonic() - t0, 8)
            vivo = True
            for _ in range(40):
                try:
                    os.kill(nieto, 0)
                except ProcessLookupError:
                    vivo = False
                    break
                time.sleep(0.1)
            self.assertFalse(vivo, "el nieto sigue vivo")
        finally:
            try:
                os.kill(nieto, 9)   # PID concreto, solo si la prueba falló
            except OSError:
                pass

    @unittest.skipIf(sys.platform == "win32", "solo POSIX")
    def test_posix_abre_sesion_nueva(self):
        _, k = self.correr(["x"], "darwin")
        self.assertIs(k["start_new_session"], True)
        self.assertNotIn("creationflags", k)

    def test_windows_taskkill_por_pid_con_arbol(self):
        m = cargar()
        PopenFalso.espera_timeout = True
        with unittest.mock.patch.object(m.subprocess, "Popen", PopenFalso), \
                unittest.mock.patch.object(m.subprocess, "run") as run, \
                unittest.mock.patch.object(m.sys, "platform", "win32"):
            r = m.ejecutar_real(["x"], 1, self.home)
        self.assertEqual(r, (124, "tiempo agotado"))
        cmd = run.call_args.args[0]
        self.assertEqual(cmd, ["taskkill", "/PID", "4242", "/T", "/F"])

    def test_windows_sin_ventana_de_consola(self):
        _, k = self.correr(["x"], "win32")
        sin_ventana = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        grupo = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200)
        self.assertTrue(k["creationflags"] & sin_ventana)
        self.assertTrue(k["creationflags"] & grupo)
        self.assertNotIn("start_new_session", k)

    def test_path_del_hijo_lleva_programa_y_carpetas_conocidas_sin_duplicar(self):
        m = cargar()
        actual = os.pathsep.join(["/usr/bin", "/opt/homebrew/bin", "/bin"])
        with unittest.mock.patch.dict(os.environ, {"PATH": actual}):
            _, k = self.correr(["/opt/tools/npx", "-v"])
        esperado = ["/opt/tools"] + [str(c) for c in m._carpetas_de_programas(self.home)]
        for c in ["/usr/bin", "/opt/homebrew/bin", "/bin"]:
            if c not in esperado:
                esperado.append(c)
        self.assertEqual(k["env"]["PATH"].split(os.pathsep), esperado)

    def test_hijo_corre_en_home_no_en_la_carpeta_del_proyecto(self):
        _, k = self.correr(["x"])
        self.assertEqual(k["cwd"], str(self.home))

    def test_cwd_por_defecto_es_el_home_del_usuario(self):
        m = cargar()
        with unittest.mock.patch.object(m.subprocess, "Popen", PopenFalso):
            m.ejecutar_real(["x"], 5)
        self.assertEqual(PopenFalso.instancias[-1].kw["cwd"], str(Path.home()))


class PruebaRevision(unittest.TestCase):
    """revisar: actualiza, compara antes y después y guarda diffs."""

    SK = "skills@1.7.2"
    SP = "superpowers@claude-plugins-official"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        self.ahora = 1_800_000_000.0
        self.hashes = {"caveman": "aaaaa11111", "brand-identity": "bbbbb22222"}
        for nombre in self.hashes:
            self._texto(self.home / ".agents" / "skills" / nombre / "SKILL.md",
                        "instrucciones viejas\n")
        self._lock()
        self.plugins = {
            self.SP: ("7.0.0", str(self.home / "plugins" / "superpowers" / "7.0.0")),
            "otro@claude-plugins-official": ("1.0.0", str(self.home / "plugins" / "otro" / "1.0.0")),
            "tablero@claude-code-entorno": ("0.7.0", str(self.home / "plugins" / "tablero")),
        }
        for v, ruta in self.plugins.values():
            self._texto(Path(ruta) / "README.md", "igual\n")
        self.cm = "0.12.0"
        self.respuestas = {}    # cmd -> (código, salida): pisa el efecto normal
        self.falla_con_efecto = {}   # cmd -> (código, salida): hace el efecto y luego falla
        self.llamadas = []

    # ---- ayudas del mundo falso ----
    def _texto(self, ruta, contenido):
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(contenido, encoding="utf-8")

    def _lock(self):
        self._texto(self.home / ".agents" / ".skill-lock.json", json.dumps({
            "version": 3,
            "skills": {n: {"skillFolderHash": h} for n, h in self.hashes.items()}}))

    def buscar(self, programa, home):
        return programa

    def ejecutar(self, cmd, timeout):
        cmd = list(cmd)
        self.llamadas.append((cmd, timeout))
        if tuple(cmd) in self.respuestas:
            return self.respuestas[tuple(cmd)]
        if tuple(cmd) in self.falla_con_efecto:
            self.respuestas_normal(cmd)
            return self.falla_con_efecto[tuple(cmd)]
        return self.respuestas_normal(cmd)

    def respuestas_normal(self, cmd):
        if cmd[:3] == ["claude", "plugin", "list"]:
            return 0, json.dumps([{"id": i, "version": v, "installPath": r}
                                  for i, (v, r) in self.plugins.items()])
        if cmd == ["codebase-memory-mcp", "--version"]:
            return 0, "codebase-memory-mcp " + self.cm
        if cmd == ["claude", "--version"]:
            return 0, "2.1.322 (Claude Code)"
        if cmd == ["claude", "update"]:
            return 0, "ok"
        if cmd[:4] == ["claude", "plugin", "marketplace", "update"]:
            return 0, "ok"
        if cmd[:3] == ["claude", "plugin", "update"]:
            self._actualizar_plugin(cmd[3])
            return 0, "ok"
        if cmd[:3] == ["npx", "-y", self.SK] and cmd[3] == "update":
            self._actualizar_skill(cmd[4])
            return 0, "ok"
        if cmd == ["codebase-memory-mcp", "update", "-y"]:
            self.cm = "0.13.0"
            return 0, "ok"
        return 1, "no existe"

    def _actualizar_plugin(self, id_):
        if id_ == self.SP:
            # sube de versión y de carpeta, pero el texto queda igual
            ruta = self.home / "plugins" / "superpowers" / "7.1.0"
            self._texto(ruta / "README.md", "igual\n")
            self.plugins[id_] = ("7.1.0", str(ruta))

    def _actualizar_skill(self, nombre):
        if nombre == "caveman":
            self.hashes[nombre] = "ccccc33333"
            self._lock()
            self._texto(self.home / ".agents" / "skills" / nombre / "SKILL.md",
                        "instrucciones viejas\nlinea nueva\n")

    def revisar(self, ahora=None, **kw):
        kw.setdefault("cli_skills", self.SK)
        return cargar().revisar(self.home, self.ahora if ahora is None else ahora,
                                self.ejecutar, self.buscar, **kw)

    def por_nombre(self, lista, nombre):
        return [x for x in lista if x["nombre"] == nombre]

    def comandos(self):
        return [c for c, _ in self.llamadas]

    # ---- cambios ----
    def test_skill_con_texto_nuevo_guarda_el_diff(self):
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "caveman")
        self.assertEqual((c["tipo"], c["antes"], c["despues"], c["cambio_texto"]),
                         ("skill", "aaaaa", "ccccc", True))
        dia = time.strftime("%Y-%m-%d", time.localtime(self.ahora))
        esperado = self.home / ".claude" / "al-dia" / "cambios" / dia / "caveman.diff"
        self.assertEqual(c["diff"], str(esperado))
        texto = esperado.read_text(encoding="utf-8")
        self.assertIn("+linea nueva", texto)
        self.assertNotIn("+instrucciones viejas", texto)

    def test_si_no_se_puede_escribir_el_diff_la_revision_sigue(self):
        # cambios/ es un archivo: mkdir falla con OSError
        self._texto(self.home / ".claude" / "al-dia" / "cambios", "no soy carpeta")
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "caveman")
        self.assertIs(c["cambio_texto"], True)
        self.assertIsNone(c["diff"])
        guardado = json.loads((self.home / ".claude" / "al-dia" / "resultado.json")
                              .read_text(encoding="utf-8"))
        self.assertEqual(guardado, r)
        self.assertEqual(len(self.por_nombre(r["cambios"], "codebase-memory")), 1)

    def test_plugin_cambia_de_version_sin_cambiar_texto(self):
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "superpowers")
        self.assertEqual((c["tipo"], c["antes"], c["despues"]), ("plugin", "7.0.0", "7.1.0"))
        self.assertFalse(c["cambio_texto"])
        self.assertIsNone(c["diff"])

    def test_el_cambio_sale_de_la_version_no_del_codigo_de_salida(self):
        # El comando actualiza (la versión cambia) pero sale con código 1: según el brief
        # el cambio sale de comparar versiones y el fallo del código; son las dos cosas.
        self.falla_con_efecto[("npx", "-y", self.SK, "update", "caveman", "-g", "-y")] = (
            1, "salió mal")
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "caveman")
        self.assertEqual((c["antes"], c["despues"]), ("aaaaa", "ccccc"))
        self.assertEqual(self.por_nombre(r["fallos"], "caveman"),
                         [{"nombre": "caveman", "tipo": "skill", "error": "salió mal"}])
        ultima = json.loads((self.home / ".claude" / "al-dia" / "ultima-revision.json").read_text())
        self.assertIn("skill:caveman", ultima["repetir"])

    def test_sin_cambio_de_version_un_comando_exitoso_no_es_cambio(self):
        # brand-identity sale con código 0 pero la versión no cambia: ni cambio ni fallo
        r = self.revisar()
        self.assertEqual(self.por_nombre(r["cambios"], "brand-identity"), [])
        self.assertEqual(self.por_nombre(r["fallos"], "brand-identity"), [])

    def test_codebase_memory_cambia_sin_carpeta(self):
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "codebase-memory")
        self.assertEqual((c["tipo"], c["antes"], c["despues"], c["cambio_texto"], c["diff"]),
                         ("MCP", "0.12.0", "0.13.0", False, None))

    def test_mods_del_repo_no_se_actualizan(self):
        self.revisar()
        for c in self.comandos():
            self.assertNotIn("tablero@claude-code-entorno", c)

    # ---- fallos ----
    def test_fallo_de_skill_va_a_fallos_y_a_repetir(self):
        self.respuestas[("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")] = (
            1, "network error")
        r = self.revisar()
        self.assertEqual(r["fallos"], [{"nombre": "brand-identity", "tipo": "skill",
                                        "error": "network error"}])
        ultima = json.loads((self.home / ".claude" / "al-dia" / "ultima-revision.json").read_text())
        self.assertEqual(ultima["inicio"], self.ahora)
        self.assertIn("skill:brand-identity", ultima["repetir"])
        # la revisión siguió: caveman sí se actualizó
        self.assertEqual(len(self.por_nombre(r["cambios"], "caveman")), 1)

    def test_error_largo_se_acorta_a_120(self):
        self.respuestas[("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")] = (
            1, "x" * 500)
        (f,) = self.revisar()["fallos"]
        self.assertLessEqual(len(f["error"]), 120)

    def test_codebase_en_uso_es_pendiente_no_fallo(self):
        self.respuestas[("codebase-memory-mcp", "update", "-y")] = (
            1, "The process cannot access the file because it is being used")
        r = self.revisar()
        self.assertEqual(r["pendientes"], [{"nombre": "codebase-memory", "tipo": "MCP",
                                            "motivo": "en uso"}])
        self.assertEqual(self.por_nombre(r["fallos"], "codebase-memory"), [])
        ultima = json.loads((self.home / ".claude" / "al-dia" / "ultima-revision.json").read_text())
        self.assertIn("MCP:codebase-memory", ultima["repetir"])

    def test_codebase_con_otro_error_es_fallo(self):
        self.respuestas[("codebase-memory-mcp", "update", "-y")] = (1, "boom")
        r = self.revisar()
        self.assertEqual(r["pendientes"], [])
        self.assertEqual(len(self.por_nombre(r["fallos"], "codebase-memory")), 1)

    def test_tiempo_agotado_es_fallo_y_los_siguientes_corren(self):
        self.respuestas[("claude", "plugin", "update", self.SP)] = (124, "tiempo agotado")
        r = self.revisar()
        self.assertEqual(self.por_nombre(r["fallos"], "superpowers"),
                         [{"nombre": "superpowers", "tipo": "plugin", "error": "tiempo agotado"}])
        self.assertIn(["npx", "-y", self.SK, "update", "caveman", "-g", "-y"], self.comandos())
        self.assertIn(["codebase-memory-mcp", "update", "-y"], self.comandos())

    def test_ejecutar_que_lanza_es_fallo(self):
        base = self.ejecutar

        def malo(cmd, timeout):
            if list(cmd[:2]) == ["claude", "plugin"] and "update" in cmd:
                raise RuntimeError("se cayó")
            return base(cmd, timeout)
        r = cargar().revisar(self.home, self.ahora, malo, self.buscar, cli_skills=self.SK)
        self.assertEqual(len(self.por_nombre(r["fallos"], "superpowers")), 1)

    def test_sin_red_todo_falla_y_se_reintenta_pasada_una_hora(self):
        base = self.ejecutar

        def sin_red(cmd, timeout):
            if "update" in cmd or "upgrade" in cmd:
                return 1, "sin red"
            return base(cmd, timeout)
        m = cargar()
        r = m.revisar(self.home, self.ahora, sin_red, self.buscar, cli_skills=self.SK)
        self.assertEqual(r["cambios"], [])
        self.assertGreaterEqual(len(r["fallos"]), 4)
        for f in r["fallos"]:
            self.assertEqual(f["error"], "sin red")
        estado = m.leer_json(self.home / ".claude" / "al-dia" / "ultima-revision.json")
        self.assertEqual(m.que_revisar(estado, self.ahora + 3600), "pendientes")
        self.assertIsNone(m.que_revisar(estado, self.ahora + 60))

    def test_fallo_de_marketplace(self):
        self.respuestas[("claude", "plugin", "marketplace", "update", "claude-plugins-official")] = (
            1, "sin red")
        r = self.revisar()
        self.assertEqual(r["fallos"], [{"nombre": "marketplace claude-plugins-official",
                                        "tipo": "plugin", "error": "sin red"}])
        ultima = json.loads((self.home / ".claude" / "al-dia" / "ultima-revision.json").read_text())
        self.assertIn("marketplace:claude-plugins-official", ultima["repetir"])

    def test_fallo_de_plugins_de_herdr(self):
        antes_ejecutar = self.ejecutar

        def con_herdr(cmd, timeout):
            cmd = list(cmd)
            if cmd == ["herdr", "--version"]:
                return 0, "herdr 0.9.5"
            if cmd == ["herdr", "plugin", "list", "--json"]:
                return 0, json.dumps({"result": {"plugins": [
                    {"plugin_id": "x.y", "version": "0.1.0", "plugin_root": "/p"}]}})
            if cmd == ["herdr", "plugin", "update", "--yes"]:
                return 1, "sin red"
            if cmd == ["herdr", "update"]:
                return 0, "ok"
            return antes_ejecutar(cmd, timeout)
        r = cargar().revisar(self.home, self.ahora, con_herdr, self.buscar, cli_skills=self.SK)
        self.assertEqual(r["fallos"], [{"nombre": "plugins de herdr", "tipo": "plugin",
                                        "error": "sin red"}])
        ultima = json.loads((self.home / ".claude" / "al-dia" / "ultima-revision.json").read_text())
        self.assertIn("plugin:herdr/*", ultima["repetir"])

    # ---- al_dia y archivos ----
    def test_al_dia_cuenta_lo_que_no_cambio_ni_fallo(self):
        self.respuestas[("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")] = (1, "x")
        r = self.revisar()
        # en la foto: 2 skills, 2 plugins (sin el mod), codebase-memory, claude = 6
        # cambian caveman, superpowers y codebase-memory; falla brand-identity
        self.assertEqual(r["al_dia"], 2)

    def test_escribe_resultado_y_ultima_revision_con_el_esquema(self):
        r = self.revisar()
        d = self.home / ".claude" / "al-dia"
        guardado = json.loads((d / "resultado.json").read_text(encoding="utf-8"))
        self.assertEqual(guardado, r)
        self.assertEqual(sorted(r), ["al_dia", "cambios", "fallos", "pendientes", "ts", "version"])
        self.assertEqual((r["version"], r["ts"]), (1, int(self.ahora)))
        self.assertEqual(sorted(r["cambios"][0]),
                         ["antes", "cambio_texto", "despues", "diff", "nombre", "tipo"])
        self.assertEqual(json.loads((d / "ultima-revision.json").read_text()),
                         {"inicio": self.ahora, "ultimo_intento": self.ahora, "repetir": []})

    # ---- modo reintento ----
    def test_solo_corre_un_paso_y_conserva_los_cambios_anteriores(self):
        self.respuestas[("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")] = (
            1, "network error")
        self.revisar()
        self.llamadas.clear()
        del self.respuestas[("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")]
        r = self.revisar(ahora=self.ahora + 3700, solo={"skill:brand-identity"})
        actualizaciones = [c for c in self.comandos() if "update" in c or "upgrade" in c]
        self.assertEqual(actualizaciones,
                         [["npx", "-y", self.SK, "update", "brand-identity", "-g", "-y"]])
        nombres = sorted(c["nombre"] for c in r["cambios"])
        self.assertEqual(nombres, ["caveman", "codebase-memory", "superpowers"])
        self.assertEqual(r["fallos"], [])

    def test_solo_no_reinicia_el_reloj_de_las_24_horas(self):
        clave = ("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")
        self.respuestas[clave] = (1, "network error")
        self.revisar()
        r = self.revisar(ahora=self.ahora + 3700, solo={"skill:brand-identity"})
        d = self.home / ".claude" / "al-dia"
        self.assertEqual(r["ts"], int(self.ahora))
        self.assertEqual(json.loads((d / "resultado.json").read_text())["ts"], int(self.ahora))
        ultima = json.loads((d / "ultima-revision.json").read_text())
        self.assertEqual(ultima["inicio"], self.ahora)
        self.assertEqual(ultima["ultimo_intento"], self.ahora + 3700)
        self.assertEqual(ultima["repetir"], ["skill:brand-identity"])

    def test_fallo_permanente_con_reintentos_cada_hora_llega_a_revision_completa(self):
        m = cargar()
        clave = ("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")
        self.respuestas[clave] = (1, "network error")
        self.revisar()
        d = self.home / ".claude" / "al-dia"
        for hora in range(1, 24):
            ahora = self.ahora + hora * 3600
            estado = m.leer_json(d / "ultima-revision.json")
            self.assertEqual(m.que_revisar(estado, ahora), "pendientes", hora)
            self.assertIsNone(m.que_revisar(estado, ahora - 60), hora)
            self.revisar(ahora=ahora, solo=set(estado["repetir"]))
        estado = m.leer_json(d / "ultima-revision.json")
        self.assertEqual(estado["inicio"], self.ahora)
        self.assertEqual(m.que_revisar(estado, self.ahora + 24 * 3600), "todo")

    def test_solo_reemplaza_fallos_por_los_nuevos(self):
        clave = ("npx", "-y", self.SK, "update", "brand-identity", "-g", "-y")
        self.respuestas[clave] = (1, "network error")
        self.revisar()
        self.respuestas[clave] = (1, "otro error")
        r = self.revisar(ahora=self.ahora + 3700, solo={"skill:brand-identity"})
        self.assertEqual(r["fallos"], [{"nombre": "brand-identity", "tipo": "skill",
                                        "error": "otro error"}])

    def test_solo_no_suma_si_el_anterior_tiene_mas_de_24_horas(self):
        self.revisar()
        r = self.revisar(ahora=self.ahora + 25 * 3600, solo={"skill:brand-identity"})
        self.assertEqual(r["cambios"], [])

    def test_solo_acepta_marketplace_y_herdr(self):
        self.revisar()
        self.llamadas.clear()
        self.revisar(ahora=self.ahora + 3700,
                     solo={"marketplace:claude-plugins-official", "plugin:herdr/*"})
        actualizaciones = [c for c in self.comandos() if "update" in c]
        self.assertEqual(actualizaciones, [
            ["claude", "plugin", "marketplace", "update", "claude-plugins-official"]])

    # ---- pasos ----
    def antes_completo(self):
        def e(nombre, tipo, version="1", carpeta=None):
            return {"nombre": nombre, "tipo": tipo, "version": version, "carpeta": carpeta}
        return {
            "skill:caveman": e("caveman", "skill"),
            "plugin:a@mk1": e("a", "plugin"),
            "plugin:b@mk1": e("b", "plugin"),
            "plugin:c@mk2": e("c", "plugin"),
            "plugin:herdr/x.y": e("repo", "plugin"),
            "MCP:codebase-memory": e("codebase-memory", "MCP"),
            "programa:herdr": e("herdr", "programa"),
            "programa:opencode": e("opencode", "programa"),
            "programa:neovim-plugins": e("plugins de Neovim", "programa"),
            "programa:claude": e("Claude Code", "programa"),
        }

    def test_orden_y_comandos_de_los_pasos(self):
        p = cargar().pasos(self.antes_completo(), self.SK)
        self.assertEqual([x[0] for x in p], [
            "marketplace:mk1", "marketplace:mk2",
            "plugin:a@mk1", "plugin:b@mk1", "plugin:c@mk2",
            "skill:caveman", "MCP:codebase-memory", "programa:herdr", "plugin:herdr/*",
            "programa:opencode", "programa:neovim-plugins", "programa:claude"])
        comandos = {x[0]: x[1] for x in p}
        self.assertEqual(comandos["marketplace:mk1"],
                         ["claude", "plugin", "marketplace", "update", "mk1"])
        self.assertEqual(comandos["plugin:a@mk1"], ["claude", "plugin", "update", "a@mk1"])
        self.assertEqual(comandos["skill:caveman"],
                         ["npx", "-y", self.SK, "update", "caveman", "-g", "-y"])
        self.assertEqual(comandos["MCP:codebase-memory"], ["codebase-memory-mcp", "update", "-y"])
        self.assertEqual(comandos["programa:herdr"], ["herdr", "update"])
        self.assertEqual(comandos["plugin:herdr/*"], ["herdr", "plugin", "update", "--yes"])
        self.assertEqual(comandos["programa:opencode"], ["opencode", "upgrade"])
        self.assertEqual(comandos["programa:neovim-plugins"],
                         ["nvim", "--headless", "+Lazy! update", "+qa"])
        self.assertEqual(comandos["programa:claude"], ["claude", "update"])

    def test_tiempos_limite_de_los_pasos(self):
        tiempos = {x[0]: x[2] for x in cargar().pasos(self.antes_completo(), self.SK)}
        for clave in ("skill:caveman", "plugin:a@mk1", "marketplace:mk1", "plugin:herdr/*"):
            self.assertEqual(tiempos[clave], 300, clave)
        for clave in ("MCP:codebase-memory", "programa:herdr", "programa:opencode",
                      "programa:neovim-plugins", "programa:claude"):
            self.assertEqual(tiempos[clave], 600, clave)

    def test_marketplace_va_antes_que_su_plugin(self):
        claves = [x[0] for x in cargar().pasos(self.antes_completo(), self.SK)]
        self.assertLess(claves.index("marketplace:mk1"), claves.index("plugin:a@mk1"))
        self.assertLess(claves.index("marketplace:mk2"), claves.index("plugin:c@mk2"))

    def test_solo_entran_pasos_de_herramientas_instaladas(self):
        antes = {"skill:caveman": self.antes_completo()["skill:caveman"]}
        self.assertEqual([x[0] for x in cargar().pasos(antes, self.SK)], ["skill:caveman"])
        self.assertEqual(cargar().pasos({}, self.SK), [])

    def test_programa_que_buscar_no_encuentra_se_salta(self):
        r = cargar().revisar(self.home, self.ahora, self.ejecutar,
                             lambda programa, home: None, cli_skills=self.SK)
        self.assertEqual(self.llamadas, [])
        self.assertEqual((r["cambios"], r["fallos"], r["pendientes"]), ([], [], []))

    def test_ejecuta_con_la_ruta_que_da_buscar(self):
        buscado = lambda programa, home: "/bin/" + programa
        llamadas = []

        def ejecutar(cmd, timeout):
            llamadas.append(list(cmd))
            return 1, "no"
        cargar().revisar(self.home, self.ahora, ejecutar, buscado, cli_skills=self.SK)
        self.assertTrue(llamadas)
        for c in llamadas:
            self.assertTrue(c[0].startswith("/bin/"), c)

    # ---- cli_skills y textos ----
    def test_cli_skills_por_defecto_sale_de_instalar_comun(self):
        fuente = (RAIZ / "herramientas" / "instalar_comun.py").read_text(encoding="utf-8")
        esperado = re.search(r'^SKILLS_CLI\s*=\s*"([^"]+)"', fuente, re.M).group(1)
        m = cargar()
        self.assertEqual(m.skills_cli(self.home), esperado)
        ejecutadas = []

        def ejecutar(cmd, timeout):
            ejecutadas.append(list(cmd))
            return 0, "ok"
        m.revisar(self.home, self.ahora, ejecutar, self.buscar)
        self.assertIn(["npx", "-y", esperado, "update", "caveman", "-g", "-y"], ejecutadas)

    def cargar_instalado(self):
        """Simula el hook copiado a ~/.claude/hooks: sin `herramientas/` al lado."""
        hooks = self.home / ".claude" / "hooks"
        hooks.mkdir(parents=True)
        copia = hooks / "al_dia.py"
        copia.write_text(MODULO.read_text(encoding="utf-8"), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("al_dia_instalado", copia)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return modulo

    def test_cli_skills_con_el_hook_instalado_sale_del_repo_en_home(self):
        self._texto(self.home / "claude-code-entorno" / "herramientas" / "instalar_comun.py",
                    'import os\nSKILLS_CLI = "skills@9.9.9"\n')
        m = self.cargar_instalado()
        self.assertEqual(m.skills_cli(self.home), "skills@9.9.9")
        ejecutadas = []

        def ejecutar(cmd, timeout):
            ejecutadas.append(list(cmd))
            return 0, "ok"
        m.revisar(self.home, self.ahora, ejecutar, self.buscar)
        self.assertIn(["npx", "-y", "skills@9.9.9", "update", "caveman", "-g", "-y"], ejecutadas)

    def test_cli_skills_ultimo_recurso_si_no_hay_ningun_archivo(self):
        m = self.cargar_instalado()
        self.assertEqual(m.skills_cli(self.home), "skills@1.7.2")

    def test_textos_filtra_por_extension_tamano_y_carpetas(self):
        d = self.home / "t"
        self._texto(d / "a.md", "uno")
        self._texto(d / "sub" / "b.py", "dos")
        self._texto(d / "c.png", "no")
        self._texto(d / "node_modules" / "x.js", "no")
        self._texto(d / ".git" / "config.toml", "no")
        self._texto(d / "grande.md", "x" * (512 * 1024))
        self._texto(d / "ok.yml", "y")
        t = cargar().textos(d)
        self.assertEqual(sorted(t), ["a.md", "ok.yml", str(Path("sub") / "b.py")])
        self.assertEqual(t["a.md"], "uno")
        self.assertEqual(cargar().textos(self.home / "no-existe"), {})


HOOK = RAIZ / "claude" / "hooks" / "al-dia.py"


def cargar_hook():
    """Carga claude/hooks/al-dia.py (lleva guion: no se puede importar por nombre)."""
    spec = importlib.util.spec_from_file_location("al_dia_hook", HOOK)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class PruebaHook(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        self.t = 1_000_000.0
        self.lanzados = []

    def lanzar(self, cmd):
        self.lanzados.append(cmd)

    def estado(self, datos):
        escribir = cargar().escribir_json
        escribir(cargar().carpeta(self.home) / "ultima-revision.json", datos)

    def test_sin_estado_lanza_revision_completa(self):
        hook = cargar_hook()
        self.assertEqual(hook.main([], self.home, self.t, self.lanzar), 0)
        self.assertEqual(self.lanzados, [[sys.executable, str(HOOK.resolve()), "--revisar"]])

    def test_revision_de_hace_2_horas_no_lanza(self):
        self.estado({"inicio": self.t - 7200, "repetir": []})
        self.assertEqual(cargar_hook().main([], self.home, self.t, self.lanzar), 0)
        self.assertEqual(self.lanzados, [])

    def test_con_pendientes_lanza_solo_pendientes(self):
        self.estado({"inicio": self.t - 7200, "ultimo_intento": self.t - 7200,
                     "repetir": ["skill:x"]})
        cargar_hook().main([], self.home, self.t, self.lanzar)
        self.assertEqual(self.lanzados, [[sys.executable, str(HOOK.resolve()),
                                          "--revisar", "--solo-pendientes"]])

    def test_estado_roto_lanza_revision_completa(self):
        d = cargar().carpeta(self.home)
        d.mkdir(parents=True)
        (d / "ultima-revision.json").write_text("{roto", encoding="utf-8")
        cargar_hook().main([], self.home, self.t, self.lanzar)
        self.assertEqual(self.lanzados, [[sys.executable, str(HOOK.resolve()), "--revisar"]])

    def test_si_lanzar_falla_devuelve_0(self):
        def mal(cmd):
            raise OSError("no se pudo")
        self.assertEqual(cargar_hook().main([], self.home, self.t, mal), 0)

    def test_revisar_toma_cerrojo_corre_y_lo_suelta(self):
        hook = cargar_hook()
        llamadas = []
        with unittest.mock.patch.object(hook, "revisar",
                                        lambda *a, **k: llamadas.append((a, k))):
            self.assertEqual(hook.main(["--revisar"], self.home, self.t, self.lanzar), 0)
        self.assertEqual(len(llamadas), 1)
        self.assertFalse((cargar().carpeta(self.home) / "cerrojo").exists())

    def test_revisar_con_cerrojo_vivo_sale_sin_revisar(self):
        hook = cargar_hook()
        self.assertTrue(cargar().tomar_cerrojo(cargar().carpeta(self.home), self.t))
        with unittest.mock.patch.object(hook, "revisar") as rev:
            self.assertEqual(hook.main(["--revisar"], self.home, self.t, self.lanzar), 0)
        rev.assert_not_called()

    def test_solo_pendientes_pasa_el_conjunto_de_repetir(self):
        self.estado({"inicio": self.t - 7200, "repetir": ["skill:x", "plugin:y@z"]})
        hook = cargar_hook()
        with unittest.mock.patch.object(hook, "revisar") as rev:
            hook.main(["--revisar", "--solo-pendientes"], self.home, self.t, self.lanzar)
        self.assertEqual(rev.call_args.kwargs["solo"], {"skill:x", "plugin:y@z"})

    # --- fallos de disco, estado previo al intento y banderas de lanzamiento ---

    def test_oserror_en_cerrojo_devuelve_0_en_modo_trabajador(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook.al_dia, "tomar_cerrojo",
                                        side_effect=OSError("mkdir")):
            self.assertEqual(hook.main(["--revisar"], self.home, self.t, self.lanzar), 0)

    def test_oserror_al_leer_estado_en_modo_hook_devuelve_0(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook.al_dia, "leer_json", side_effect=OSError("disco")):
            self.assertEqual(hook.main([], self.home, self.t, self.lanzar), 0)

    def test_oserror_en_escribir_json_devuelve_0_y_suelta_cerrojo(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook.al_dia, "escribir_json",
                                        side_effect=OSError("disco lleno")):
            self.assertEqual(hook.main(["--revisar"], self.home, self.t, self.lanzar), 0)
        self.assertFalse((cargar().carpeta(self.home) / "cerrojo").exists())

    def test_si_revisar_lanza_el_cerrojo_queda_suelto(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook, "revisar", side_effect=RuntimeError("boom")):
            self.assertEqual(hook.main(["--revisar"], self.home, self.t, self.lanzar), 0)
        self.assertFalse((cargar().carpeta(self.home) / "cerrojo").exists())

    def test_revision_completa_que_truena_no_se_relanza_en_la_sesion_siguiente(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook, "revisar", side_effect=RuntimeError("boom")):
            hook.main(["--revisar"], self.home, self.t, self.lanzar)
        estado = cargar().leer_json(cargar().carpeta(self.home) / "ultima-revision.json")
        self.assertEqual(estado, {"inicio": self.t, "repetir": [], "ultimo_intento": self.t})
        self.assertIsNone(cargar().que_revisar(estado, self.t + 60))

    def test_solo_pendientes_que_truena_solo_mueve_ultimo_intento(self):
        self.estado({"inicio": self.t - 7200, "ultimo_intento": self.t - 7200,
                     "repetir": ["skill:x"]})
        hook = cargar_hook()
        with unittest.mock.patch.object(hook, "revisar", side_effect=RuntimeError("boom")):
            hook.main(["--revisar", "--solo-pendientes"], self.home, self.t, self.lanzar)
        estado = cargar().leer_json(cargar().carpeta(self.home) / "ultima-revision.json")
        self.assertEqual(estado, {"inicio": self.t - 7200, "ultimo_intento": self.t,
                                  "repetir": ["skill:x"]})
        self.assertIsNone(cargar().que_revisar(estado, self.t + 60))

    def _banderas_de_lanzar(self, plataforma=None):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook.subprocess, "Popen") as popen, \
                unittest.mock.patch.dict(os.environ, {"AL_DIA_NO_LANZAR": ""}):
            if plataforma:
                with unittest.mock.patch.object(hook.sys, "platform", plataforma):
                    hook.lanzar_separado(["x"])
            else:
                hook.lanzar_separado(["x"])
        self.assertEqual(popen.call_args.args, (["x"],))
        return popen.call_args.kwargs

    def test_lanzar_en_mac_abre_sesion_nueva_y_desliga_todo(self):
        k = self._banderas_de_lanzar("darwin")
        self.assertIs(k["start_new_session"], True)
        self.assertNotIn("creationflags", k)
        self.assertIs(k["stdin"], subprocess.DEVNULL)
        self.assertIs(k["stdout"], subprocess.DEVNULL)
        self.assertIs(k["stderr"], subprocess.DEVNULL)
        self.assertIs(k["close_fds"], True)

    def test_lanzar_corre_en_home_no_en_la_carpeta_del_proyecto(self):
        self.assertEqual(self._banderas_de_lanzar("darwin")["cwd"], str(Path.home()))
        self.assertEqual(self._banderas_de_lanzar("win32")["cwd"], str(Path.home()))

    def test_el_trabajador_ejecuta_con_el_home_dado(self):
        hook = cargar_hook()
        with unittest.mock.patch.object(hook, "revisar") as rev:
            hook.main(["--revisar"], self.home, self.t, self.lanzar)
        ejecutar = rev.call_args.args[2]
        PopenFalso.espera_timeout = False
        with unittest.mock.patch.object(hook.al_dia.subprocess, "Popen", PopenFalso):
            PopenFalso.instancias = []
            ejecutar(["x"], 5)
        self.assertEqual(PopenFalso.instancias[-1].kw["cwd"], str(self.home))

    def test_lanzar_en_windows_usa_creationflags_y_desliga_todo(self):
        k = self._banderas_de_lanzar("win32")
        esperado = (getattr(subprocess, "DETACHED_PROCESS", 0x8)
                    | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x200))
        self.assertEqual(k["creationflags"], esperado)
        self.assertNotIn("start_new_session", k)
        self.assertIs(k["stdin"], subprocess.DEVNULL)
        self.assertIs(k["stdout"], subprocess.DEVNULL)
        self.assertIs(k["stderr"], subprocess.DEVNULL)
        self.assertIs(k["close_fds"], True)

    def test_proceso_real_sale_0_sin_salida_y_rapido(self):
        entorno = {**os.environ, "HOME": str(self.home), "USERPROFILE": str(self.home),
                   "AL_DIA_NO_LANZAR": "1"}
        t0 = time.monotonic()
        r = subprocess.run([sys.executable, str(HOOK)], input="{}", env=entorno,
                           capture_output=True, text=True, timeout=10)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout, "")
        self.assertLess(time.monotonic() - t0, 2)


if __name__ == "__main__":
    unittest.main()

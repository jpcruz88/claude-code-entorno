"""claude/hooks/al_dia.py: estado diario, cerrojo y JSON atómico."""
import importlib.util
import json
import os
import sys
import re
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

    def test_plugin_cambia_de_version_sin_cambiar_texto(self):
        r = self.revisar()
        (c,) = self.por_nombre(r["cambios"], "superpowers")
        self.assertEqual((c["tipo"], c["antes"], c["despues"]), ("plugin", "7.0.0", "7.1.0"))
        self.assertFalse(c["cambio_texto"])
        self.assertIsNone(c["diff"])

    def test_el_cambio_sale_de_la_version_no_del_codigo_de_salida(self):
        # el comando falla pero la versión cambió: es un cambio y también un fallo
        self.respuestas[("npx", "-y", self.SK, "update", "caveman", "-g", "-y")] = (1, "salió mal")
        self.hashes["caveman"] = "ddddd44444"   # ya no cambia por el comando
        r = self.revisar()
        self.assertEqual(self.por_nombre(r["cambios"], "caveman"), [])
        self.assertEqual(len(self.por_nombre(r["fallos"], "caveman")), 1)

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
            if cmd == ["herdr", "plugin", "update"]:
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
                         {"inicio": self.ahora, "repetir": []})

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
        self.assertEqual(r["ts"], int(self.ahora + 3700))

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
        self.assertEqual(comandos["plugin:herdr/*"], ["herdr", "plugin", "update"])
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
        self.assertEqual(m.SKILLS_CLI, esperado)
        antes = {"skill:caveman": self.antes_completo()["skill:caveman"]}
        ejecutadas = []

        def ejecutar(cmd, timeout):
            ejecutadas.append(list(cmd))
            return 0, "ok"
        m.revisar(self.home, self.ahora, ejecutar, self.buscar)
        self.assertIn(["npx", "-y", esperado, "update", "caveman", "-g", "-y"], ejecutadas)

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


if __name__ == "__main__":
    unittest.main()

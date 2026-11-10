"""claude/hooks/al_dia.py: estado diario, cerrojo y JSON atómico."""
import importlib.util
import json
import os
import sys
import tempfile
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


if __name__ == "__main__":
    unittest.main()

"""Pruebas de los mods (mods/) y de su instalación desde el propio repo.

El repo es su propio marketplace (.claude-plugin/marketplace.json): cada mod de
mods/ se instala con `claude plugin install <mod>@claude-code-entorno`. Los
instaladores lo hacen por defecto; --sin-mods lo omite.
"""
import importlib.util
import json
import subprocess
import unittest

from test_instalar import OPCIONES, RAIZ, BaseInstalarSh, programas_listos

MARKETPLACE = RAIZ / ".claude-plugin" / "marketplace.json"
NOMBRE_MARKETPLACE = "claude-code-entorno"


class MarketplaceDeMods(unittest.TestCase):
    def setUp(self):
        self.datos = json.loads(MARKETPLACE.read_text(encoding="utf-8"))

    def test_nombre_del_marketplace(self):
        self.assertEqual(self.datos["name"], NOMBRE_MARKETPLACE)

    def test_lista_cada_carpeta_de_mods(self):
        nombres = {p["name"] for p in self.datos["plugins"]}
        carpetas = {d.name for d in (RAIZ / "mods").iterdir() if d.is_dir()}
        self.assertEqual(nombres, carpetas)

    def test_cada_fuente_es_un_plugin_con_su_nombre(self):
        for entrada in self.datos["plugins"]:
            with self.subTest(mod=entrada["name"]):
                manifiesto = RAIZ / entrada["source"] / ".claude-plugin" / "plugin.json"
                self.assertTrue(manifiesto.is_file(), manifiesto)
                datos = json.loads(manifiesto.read_text(encoding="utf-8"))
                self.assertEqual(datos["name"], entrada["name"])

    def test_version_del_marketplace_igual_a_la_del_plugin(self):
        # Quien clona el repo ve la versión del marketplace; la caché de plugins
        # se indexa por la de plugin.json. Si difieren, la instalación confunde.
        for entrada in self.datos["plugins"]:
            with self.subTest(mod=entrada["name"]):
                manifiesto = RAIZ / entrada["source"] / ".claude-plugin" / "plugin.json"
                datos = json.loads(manifiesto.read_text(encoding="utf-8"))
                self.assertEqual(entrada.get("version"), datos.get("version"))


class CiPruebaLosMods(unittest.TestCase):
    def test_ci_corre_claude_plugin_test_en_cada_mod(self):
        texto = (RAIZ / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("mods/*/", texto)
        self.assertIn('claude plugin test "$carpeta"', texto)
        # Va después de instalar el CLI fijado y en el mismo trabajo (Linux).
        self.assertLess(texto.index("npm install -g @anthropic-ai/claude-code@"),
                        texto.index('claude plugin test "$carpeta"'))


class ExportarPruebaLosMods(unittest.TestCase):
    def test_exportar_corre_las_pruebas_de_cada_mod(self):
        texto = (RAIZ / "exportar.sh").read_text(encoding="utf-8")
        self.assertIn('for carpeta in "$REPO"/mods/*/', texto)
        self.assertIn('claude plugin test "$carpeta"', texto)


@unittest.skipUnless(programas_listos(),
                     "hace falta macOS o Linux con git, jq, uv, Node.js 18+ y Python 3.8+")
class InstalarMods(BaseInstalarSh):
    def test_instala_los_mods_desde_el_marketplace_del_repo(self):
        self.correr(OPCIONES, subprocess.DEVNULL)
        llamadas = self.leer("llamadas-claude.txt")
        self.assertIn("plugin marketplace add %s" % RAIZ, llamadas)
        self.assertIn("plugin install secret-guard@%s --scope user" % NOMBRE_MARKETPLACE,
                      llamadas)
        self.assertIn("plugin install tablero@%s --scope user" % NOMBRE_MARKETPLACE, llamadas)

    def test_sin_mods_no_los_instala(self):
        salida = self.correr(OPCIONES + ["--sin-mods"], subprocess.DEVNULL)
        self.assertNotIn(NOMBRE_MARKETPLACE, self.leer("llamadas-claude.txt"))
        self.assertIn("Se omiten (--sin-mods).", salida)


def cargar_instalar_comun():
    ruta = RAIZ / "herramientas" / "instalar_comun.py"
    spec = importlib.util.spec_from_file_location("instalar_comun_mods", str(ruta))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class ActualizarModsYaInstalados(unittest.TestCase):
    """Un mod ya instalado se actualiza: si no, `git pull` no trae su versión nueva."""

    def setUp(self):
        modulo = cargar_instalar_comun()
        inst = object.__new__(modulo.Instalador)
        inst.sin_mods = False
        inst.simular = False
        inst.pendientes = []
        inst.llamadas = []
        inst.fallos = []
        inst.paso = lambda *a: None
        inst.info = lambda *a: None
        inst.aviso = lambda *a: None
        inst.fallo = inst.fallos.append
        inst.claude = lambda: "claude"
        inst.nombres_mods = lambda: ["tablero", "secret-guard"]

        def correr(args, timeout=600, env_extra=None):
            inst.llamadas.append(" ".join(args[1:]))
            if args[1:] == ["plugin", "list", "--json"]:
                return 0, json.dumps([{"id": "tablero@%s" % NOMBRE_MARKETPLACE}])
            if args[1:] == ["plugin", "marketplace", "list", "--json"]:
                return 0, json.dumps([{"name": NOMBRE_MARKETPLACE}])
            return 0, ""

        inst.correr = correr
        self.inst = inst

    def test_actualiza_el_ya_instalado_e_instala_el_que_falta(self):
        self.inst.mods()
        self.assertIn("plugin update tablero@%s --scope user" % NOMBRE_MARKETPLACE,
                      self.inst.llamadas)
        self.assertIn("plugin install secret-guard@%s --scope user" % NOMBRE_MARKETPLACE,
                      self.inst.llamadas)
        self.assertNotIn("plugin install tablero@%s --scope user" % NOMBRE_MARKETPLACE,
                         self.inst.llamadas)
        self.assertEqual(self.inst.fallos, [])


if __name__ == "__main__":
    unittest.main()

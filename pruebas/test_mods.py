"""Pruebas de los mods (mods/) y de su instalación desde el propio repo.

El repo es su propio marketplace (.claude-plugin/marketplace.json): cada mod de
mods/ se instala con `claude plugin install <mod>@claude-code-entorno`. Los
instaladores lo hacen por defecto; --sin-mods lo omite.
"""
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


if __name__ == "__main__":
    unittest.main()

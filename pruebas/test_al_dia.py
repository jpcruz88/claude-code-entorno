"""claude/hooks/al_dia.py: estado diario, cerrojo y JSON atómico."""
import importlib.util
import os
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()

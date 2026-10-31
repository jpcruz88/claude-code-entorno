"""La regla de memoria existe, se exporta y no trae datos personales."""
import json
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REGLA = RAIZ / "claude" / "rules" / "memoria.md"


class ReglaDeMemoria(unittest.TestCase):
    def test_existe_y_se_exporta(self):
        self.assertTrue(REGLA.is_file())
        filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))
        self.assertIn("memoria.md", filtros["reglas_permitidas"])

    def test_describe_el_procedimiento(self):
        texto = REGLA.read_text(encoding="utf-8")
        for palabra in ("MEMORY.md", "frontmatter", "user", "feedback", "project", "reference"):
            self.assertIn(palabra, texto)

    def test_sin_datos_personales(self):
        texto = REGLA.read_text(encoding="utf-8")
        # Partidos para que esta prueba no contenga los datos que busca.
        for patron in (r"/Users/", r"/Volumes/", "ap" + "olo", "jpcr" + "uz", r"@"):
            self.assertIsNone(re.search(patron, texto), patron)


if __name__ == "__main__":
    unittest.main()

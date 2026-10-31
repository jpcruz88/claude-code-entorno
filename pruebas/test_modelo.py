"""Modelo por omisión: Haiku, salvo que el usuario pida otro en ese mensaje.

La clave `model` de settings.base.json es la que usa Claude Code al iniciar. La
regla claude/rules/modelo.md le pide además usar Haiku en los subagentes.
"""
import json
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


class ModeloPorDefecto(unittest.TestCase):
    def test_settings_base_usa_haiku(self):
        ajustes = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
        self.assertEqual(ajustes["model"], "haiku")

    def test_existe_la_regla_y_se_exporta(self):
        regla = RAIZ / "claude" / "rules" / "modelo.md"
        self.assertTrue(regla.is_file())
        filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))
        self.assertIn("modelo.md", filtros["reglas_permitidas"])


if __name__ == "__main__":
    unittest.main()

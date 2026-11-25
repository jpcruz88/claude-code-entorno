"""Modelo de la sesión principal: el que elige el usuario, sin Haiku fijo por omisión.

La clave `model` de settings.base.json es la que usa Claude Code al iniciar en una
máquina nueva. La regla claude/rules/modelo.md dice cómo elegir el de los subagentes.
"""
import json
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


class ModeloPorDefecto(unittest.TestCase):
    def test_settings_base_no_arranca_con_el_modelo_mas_chico(self):
        ajustes = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
        self.assertIn(ajustes["model"], ("sonnet", "opus"))

    def test_la_regla_ya_no_obliga_a_haiku_en_la_sesion_principal(self):
        texto = (RAIZ / "claude" / "rules" / "modelo.md").read_text(encoding="utf-8")
        self.assertNotIn("arranca con **Haiku**", texto)
        self.assertNotIn("vuelve a Haiku", texto)
        self.assertIn("el modelo que el usuario tiene elegido", texto)

    def test_la_regla_sigue_prohibiendo_cambiar_el_modelo_por_su_cuenta(self):
        texto = (RAIZ / "claude" / "rules" / "modelo.md").read_text(encoding="utf-8")
        self.assertIn("No cambies el modelo de la sesión por tu cuenta", texto)

    def test_existe_la_regla_y_se_exporta(self):
        regla = RAIZ / "claude" / "rules" / "modelo.md"
        self.assertTrue(regla.is_file())
        filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))
        self.assertIn("modelo.md", filtros["reglas_permitidas"])


if __name__ == "__main__":
    unittest.main()

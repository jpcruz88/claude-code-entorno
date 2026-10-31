"""El repo maestro trae toda la configuración genérica: reglas, hooks y su registro."""
import json
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


class ConfiguracionCompleta(unittest.TestCase):
    def setUp(self):
        self.filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))
        self.base = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))

    def test_reglas_genericas_en_el_repo_y_exportadas(self):
        for regla in ("nunca-fable.md", "git.md"):
            with self.subTest(regla=regla):
                self.assertTrue((RAIZ / "claude" / "rules" / regla).is_file())
                self.assertIn(regla, self.filtros["reglas_permitidas"])

    def test_hook_fable_en_el_repo_registrado_y_exportado(self):
        self.assertTrue((RAIZ / "claude" / "hooks" / "guard-fable.py").is_file())
        self.assertIn("guard-fable.py", self.filtros["settings"]["hooks_permitidos"])
        comandos = [h["command"] for g in self.base["hooks"]["PreToolUse"] for h in g["hooks"]]
        self.assertIn("python3 ~/.claude/hooks/guard-fable.py", comandos)

    def test_reglas_de_git_piden_commit_y_push(self):
        texto = (RAIZ / "claude" / "rules" / "git.md").read_text(encoding="utf-8")
        self.assertIn("commit", texto)
        self.assertIn("push", texto)
        self.assertIn("Co-Authored-By", texto)


if __name__ == "__main__":
    unittest.main()

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

    def test_reintento_en_fallos_y_en_exitos(self):
        for evento in ("PostToolUseFailure", "PostToolUse"):
            with self.subTest(evento=evento):
                comandos = [(g.get("matcher"), h["command"], h.get("timeout"))
                            for g in self.base["hooks"].get(evento, []) for h in g["hooks"]]
                self.assertIn(("*", "python3 ~/.claude/hooks/jev-reintento.py", 5), comandos)

    def test_reintento_y_su_cliente_estan_en_el_repo_y_exportados(self):
        # instalar_comun.py copia la carpeta claude/hooks completa: basta con que estén aquí.
        for archivo in ("jev-reintento.py", "jev_cliente.py"):
            with self.subTest(archivo=archivo):
                self.assertTrue((RAIZ / "claude" / "hooks" / archivo).is_file())
        self.assertIn("jev-reintento.py", self.filtros["settings"]["hooks_permitidos"])

    def test_al_dia_en_el_repo_registrado_y_exportado(self):
        self.assertTrue((RAIZ / "claude" / "hooks" / "al-dia.py").is_file())
        self.assertTrue((RAIZ / "claude" / "hooks" / "al_dia.py").is_file())
        self.assertIn("al-dia.py", self.filtros["settings"]["hooks_permitidos"])
        grupos = [g for g in self.base["hooks"]["SessionStart"] if g.get("matcher") == "startup"]
        comandos = [(h["command"], h.get("timeout")) for g in grupos for h in g["hooks"]]
        self.assertIn(("python3 ~/.claude/hooks/al-dia.py", 5), comandos)
        self.assertIn(("~/.claude/hooks/cbm-session-reminder", None), comandos)

    def test_memoria_maestra_inicio_y_fin(self):
        eventos = {e: [h["command"] for g in self.base["hooks"][e] for h in g["hooks"]]
                   for e in ("SessionStart", "Stop")}
        self.assertIn("python3 ~/.claude/hooks/memoria-maestra.py inicio", eventos["SessionStart"])
        self.assertIn("python3 ~/.claude/hooks/memoria-maestra.py fin", eventos["Stop"])
        self.assertIn("memoria-maestra.py", self.filtros["settings"]["hooks_permitidos"])

    def test_reglas_de_git_piden_commit_y_push(self):
        texto = (RAIZ / "claude" / "rules" / "git.md").read_text(encoding="utf-8")
        self.assertIn("commit", texto)
        self.assertIn("push", texto)
        self.assertIn("Co-Authored-By", texto)


if __name__ == "__main__":
    unittest.main()

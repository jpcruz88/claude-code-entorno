"""Pruebas de herramientas/exportar.py con una configuración de Claude Code inventada."""
import io
import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import exportar  # noqa: E402

SETTINGS = {
    "model": "opus",
    "permissions": {"allow": ["mcp__algo"]},
    "extraKnownMarketplaces": {"x": {"source": {"source": "github", "repo": "a/b"}}},
    "statusLine": {"type": "command", "command": "~/.claude/statusline.sh"},
    "enabledPlugins": {"superpowers@claude-plugins-official": True, "otro@claude-plugins-official": True},
    "hooks": {
        "PreToolUse": [{"matcher": "Bash", "hooks": [
            {"type": "command", "command": "~/.claude/hooks/guard-kill.py", "timeout": 10}]}],
        "SessionStart": [{"matcher": "startup", "hooks": [
            {"type": "command", "command": "/opt/cliente/bin/herramienta-privada contexto"},
            {"type": "command", "command": "~/.claude/hooks/cbm-session-reminder"}]}],
        "Stop": [{"hooks": [{"type": "command", "command": "/opt/cliente/bin/herramienta-privada hook"}]}],
    },
    "theme": "dark",
}


class Exportar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        # repo de prueba con lo mínimo que lee el exportador
        self.repo = base / "repo"
        for rel in ("herramientas/filtros.json", "herramientas/plantillas/matar-procesos-windows.md",
                    "plugins.txt", "claude/hooks/guard-kill.py", "claude/statusline.sh"):
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(str(RAIZ / rel), str(self.repo / rel))
        # misma estructura que el filtros.json real, con una lista de permitidas de prueba
        filtros = json.loads((RAIZ / "herramientas/filtros.json").read_text(encoding="utf-8"))
        filtros["skills_permitidas"] = ["buena", "playwright-cli", "renombrada"]
        filtros["reglas_permitidas"] = ["context7.md", "matar-procesos.md"]
        filtros["skills"]["origenes_renombrados"] = {"dueno/viejo": "dueno/nuevo"}
        (self.repo / "herramientas/filtros.json").write_text(json.dumps(filtros), encoding="utf-8")
        # configuración falsa
        self.claude = base / "claude"
        (self.claude / "rules").mkdir(parents=True)
        (self.claude / "settings.json").write_text(json.dumps(SETTINGS), encoding="utf-8")
        (self.claude / "rules" / "context7.md").write_text("Usa ctx7.\n", encoding="utf-8")
        (self.claude / "rules" / "matar-procesos.md").write_text("Solo por PID.\n", encoding="utf-8")
        (self.claude / "rules" / "privada.md").write_text("no debe salir\n", encoding="utf-8")
        retirada = self.claude / "skills-retiradas" / "2026-01-01" / "vieja"
        retirada.mkdir(parents=True)
        (retirada / "SKILL.md").write_text("x")
        synced = self.claude / "skills" / "synced" / "cuenta" / "de-la-cuenta"
        synced.mkdir(parents=True)
        (synced / "SKILL.md").write_text("x")
        self.claude_json = base / "claude.json"
        self.claude_json.write_text(json.dumps({
            "skillUsage": {n: {} for n in ["buena", "vieja", "de-la-cuenta", "personal",
                                           "personal-usada", "init", "plugin:algo",
                                           "de-plugin"]},
            "otraClave": "no se lee"}), encoding="utf-8")
        self.lock = base / "lock.json"
        self.lock.write_text(json.dumps({"skills": {
            "buena": {"source": "dueno/repo", "sourceType": "github"},
            "vieja": {"source": "dueno/repo", "sourceType": "github"},
            "de-la-cuenta": {"source": "dueno/repo", "sourceType": "github"},
            "de-plugin": {"source": "obra/superpowers", "sourceType": "github"},
            "playwright-cli": {"source": "microsoft/playwright-cli", "sourceType": "github"},
            "renombrada": {"source": "dueno/viejo", "sourceType": "github"},
            "personal-usada": {"source": "dueno/privado", "sourceType": "github"},
        }}), encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self):
        salida = io.StringIO()
        with redirect_stdout(salida):
            self.codigo = exportar.Exportador(self.repo, self.claude, self.claude_json,
                                              self.lock, config_dir=getattr(
                                                  self, "config_dir", None)).todo()
        return salida.getvalue()

    def test_filtra_y_es_idempotente(self):
        salida = self.correr()
        base = json.loads((self.repo / "claude/settings.base.json").read_text(encoding="utf-8"))
        self.assertEqual(list(base), ["model", "statusLine", "hooks", "enabledPlugins", "theme"])
        self.assertEqual(base["enabledPlugins"], {"superpowers@claude-plugins-official": True})
        self.assertNotIn("herramienta-privada", json.dumps(base))
        self.assertEqual(base["hooks"]["PreToolUse"][0]["matcher"], "Bash|PowerShell")
        self.assertNotIn("Stop", base["hooks"])
        reglas = sorted(p.name for p in (self.repo / "claude/rules").iterdir())
        self.assertEqual(reglas, ["context7.md", "matar-procesos.md"])
        self.assertIn("taskkill", (self.repo / "claude/rules/matar-procesos.md").read_text())
        lista = json.loads((self.repo / "skills/lista.json").read_text(encoding="utf-8"))
        self.assertEqual(lista["skills"], [
            {"nombre": "buena", "origen": "dueno/repo@buena"},
            {"nombre": "playwright-cli", "origen": "microsoft/playwright-cli@playwright-cli"},
            {"nombre": "renombrada", "origen": "dueno/nuevo@renombrada"}])
        self.assertEqual(self.codigo, 0)
        # usadas fuera de la lista: se avisa de las propias, no de las que llegan solas
        self.assertIn("nueva skill usada: personal;", salida)
        self.assertIn("nueva skill usada: personal-usada;", salida)
        for callada in ("vieja", "de-la-cuenta", "init", "plugin:algo", "de-plugin"):
            self.assertNotIn("nueva skill usada: %s;" % callada, salida)
        self.assertIn("regla nueva: privada.md", salida)
        # segunda vez: nada cambia
        self.assertIn("Archivos cambiados: ninguno", self.correr())

    def test_compara_herdr_y_ghostty_sin_tocar_el_repo(self):
        for rel in ("herdr/config.toml", "ghostty/config"):
            (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(str(RAIZ / rel), str(self.repo / rel))
        config = Path(self.tmp.name) / "config"
        (config / "herdr").mkdir(parents=True)
        (config / "herdr" / "config.toml").write_text("# cambiada en esta Mac\n", encoding="utf-8")
        (config / "ghostty").mkdir()
        # La de Ghostty lleva la ruta real de herdr en vez del marcador: cuenta como igual.
        ghostty = (RAIZ / "ghostty/config").read_text(encoding="utf-8")
        (config / "ghostty" / "config").write_text(
            ghostty.replace("{{RUTA_HERDR}}", "/opt/homebrew/bin/herdr"), encoding="utf-8")
        self.config_dir = config
        salida = self.correr()
        self.assertIn("distinto en esta Mac: herdr/config.toml", salida)
        self.assertIn("igual en esta Mac y en el repo: ghostty/config", salida)
        self.assertEqual((self.repo / "herdr/config.toml").read_bytes(),
                         (RAIZ / "herdr/config.toml").read_bytes())

    def test_permitida_sin_origen_falla(self):
        filtros = json.loads((self.repo / "herramientas/filtros.json").read_text(encoding="utf-8"))
        filtros["skills_permitidas"].append("no-existe")
        (self.repo / "herramientas/filtros.json").write_text(json.dumps(filtros), encoding="utf-8")
        salida = self.correr()
        self.assertEqual(self.codigo, 1)
        self.assertIn("«no-existe» no tiene un origen", salida)


if __name__ == "__main__":
    unittest.main()

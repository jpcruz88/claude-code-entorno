"""Pruebas de herramientas/fusionar_settings.py."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import fusionar_settings as fs  # noqa: E402

BASE = RAIZ / "claude" / "settings.base.json"
TODOS = {"guard-kill.py", "cbm-code-discovery-gate", "cbm-session-reminder"}


def comandos(settings, evento):
    return [(g.get("matcher"), h["command"]) for g in settings.get("hooks", {}).get(evento, [])
            for h in g["hooks"]]


class Fusion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.destino = self.dir / "settings.json"

    def tearDown(self):
        self.tmp.cleanup()

    def aplicar(self, **kw):
        kw.setdefault("scripts_disponibles", TODOS)
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = fs.aplicar(BASE, self.destino, **kw)
        return codigo, salida.getvalue()

    def leer(self):
        return json.loads(self.destino.read_text(encoding="utf-8"))

    def respaldos(self):
        return sorted(self.dir.glob("settings.json.bak-*"))

    def test_crea_desde_cero_e_idempotente(self):
        codigo, _ = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 0)
        primero = self.leer()
        self.assertEqual(primero["model"], "opus")
        self.assertIn(("Bash|PowerShell", "python3 ~/.claude/hooks/guard-kill.py"),
                      comandos(primero, "PreToolUse"))
        self.assertEqual(len(comandos(primero, "SessionStart")), 4)
        self.assertEqual(self.respaldos(), [])  # no había nada que respaldar
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertIn("ya estaba al día", salida)
        self.assertEqual(self.leer(), primero)
        self.assertEqual(self.respaldos(), [])

    def test_conserva_lo_existente_y_respalda(self):
        propio = {"model": "sonnet", "theme": "light", "env": {"MI_VAR": "1"},
                  "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "mi-script"}]}]}}
        self.destino.write_text(json.dumps(propio), encoding="utf-8")
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 0)
        r = self.leer()
        self.assertEqual(r["model"], "sonnet")
        self.assertEqual(r["theme"], "light")
        self.assertEqual(r["env"], {"MI_VAR": "1"})
        self.assertEqual(comandos(r, "Stop"), [(None, "mi-script")])
        self.assertEqual(r["tui"], "fullscreen")
        self.assertIn("Se conserva tu valor de model", salida)
        self.assertEqual(len(self.respaldos()), 1)
        self.assertEqual(json.loads(self.respaldos()[0].read_text()), propio)

    def test_no_duplica_hook_escrito_distinto(self):
        """guard-kill ya instalado para Bash: solo falta cubrir PowerShell."""
        propio = {"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [
            {"type": "command", "command": "~/.claude/hooks/guard-kill.py", "timeout": 10}]}]}}
        self.destino.write_text(json.dumps(propio), encoding="utf-8")
        self.aplicar(python_hooks="python3")
        guard = [c for c in comandos(self.leer(), "PreToolUse") if "guard-kill" in c[1]]
        self.assertEqual(guard, [("Bash", "~/.claude/hooks/guard-kill.py"),
                                 ("PowerShell", "python3 ~/.claude/hooks/guard-kill.py")])
        _, salida = self.aplicar(python_hooks="python3")
        self.assertIn("ya estaba al día", salida)

    def test_windows(self):
        self.aplicar(plataforma="windows", python_hooks="py -3",
                     env_extra={"CLAUDE_CODE_GIT_BASH_PATH": "D:\\Git\\bin\\bash.exe"})
        r = self.leer()
        self.assertEqual(r["statusLine"]["command"], "bash ~/.claude/statusline.sh")
        pre = comandos(r, "PreToolUse")
        self.assertIn(("Bash|PowerShell", "py -3 ~/.claude/hooks/guard-kill.py"), pre)
        self.assertIn(("Grep|Glob", "bash ~/.claude/hooks/cbm-code-discovery-gate"), pre)
        self.assertEqual(r["env"]["CLAUDE_CODE_GIT_BASH_PATH"], "D:\\Git\\bin\\bash.exe")

    def test_sin_codebase_memory(self):
        self.aplicar(python_hooks="python3", sin_codebase_memory=True)
        r = self.leer()
        self.assertNotIn("SessionStart", r["hooks"])
        self.assertEqual([m for m, _ in comandos(r, "PreToolUse")], ["Bash|PowerShell"])

    def test_omite_hooks_sin_script(self):
        _, salida = self.aplicar(python_hooks="python3", scripts_disponibles={"guard-kill.py"})
        self.assertNotIn("SessionStart", self.leer()["hooks"])
        self.assertIn("no existe ~/.claude/hooks/cbm-session-reminder", salida)

    def test_aviso_de_permisos_es_opcional(self):
        self.aplicar(python_hooks="python3")
        self.assertNotIn("skipDangerousModePermissionPrompt", self.leer())
        self.aplicar(python_hooks="python3",
                     ajustes_extra={"skipDangerousModePermissionPrompt": True})
        self.assertIs(self.leer()["skipDangerousModePermissionPrompt"], True)
        _, salida = self.aplicar(python_hooks="python3",
                                 ajustes_extra={"skipDangerousModePermissionPrompt": True})
        self.assertIn("ya estaba al día", salida)

    def test_simular_no_escribe(self):
        codigo, salida = self.aplicar(python_hooks="python3", simular=True)
        self.assertEqual(codigo, 0)
        self.assertIn("[simular] haría:", salida)
        self.assertFalse(self.destino.exists())

    def test_json_roto_no_se_toca(self):
        self.destino.write_text("{ esto no es json", encoding="utf-8")
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 1)
        self.assertEqual(self.destino.read_text(encoding="utf-8"), "{ esto no es json")
        self.assertEqual(self.respaldos(), [])

    def test_clave_hook(self):
        self.assertEqual(fs.clave_hook('"C:/Program Files/Python/python.exe" '
                                       '~/.claude/hooks/guard-kill.py'), "guard-kill.py")
        self.assertEqual(fs.clave_hook("C:\\x\\.claude\\hooks\\guard-kill.py"), "guard-kill.py")
        self.assertEqual(fs.clave_hook("echo  hola"), "echo hola")


if __name__ == "__main__":
    unittest.main()

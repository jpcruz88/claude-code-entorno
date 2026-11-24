"""Los mods que tablero 1.3.0 absorbió se desinstalan al actualizar el entorno.

Se corre instalar_comun.py de verdad, con HOME en una carpeta temporal y un `claude` de mentira.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
INSTALAR_COMUN = RAIZ / "herramientas" / "instalar_comun.py"
MARKETPLACE = RAIZ / ".claude-plugin" / "marketplace.json"
RETIRADOS = ["barra-plan", "aduana-panel", "caveman-badge", "plan-progress"]

# claude de mentira: dice tener instalado barra-plan del marketplace del repo y anota cada llamada.
CLAUDE_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-claude.txt"
case "$*" in
  "plugin list --json") echo '[{"id":"barra-plan@claude-code-entorno"},{"id":"superpowers@claude-plugins-official"}]' ;;
  "plugin marketplace list --json") echo '[{"name":"claude-code-entorno"}]' ;;
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""


@unittest.skipIf(sys.platform == "win32", "el claude de mentira es un guion sh")
class ModsRetirados(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        ruta = self.bin / "claude"
        ruta.write_text(CLAUDE_FALSO, encoding="utf-8")
        ruta.chmod(0o755)
        self.env = {"HOME": str(self.home), "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *opciones):
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", "unix", "--sin-codebase-memory",
                "--sin-skills", "--sin-herdr", "--sin-terminal", "--sin-opencode", "--sin-opencode-config",
                "--sin-nvim"] + list(opciones)
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, env=self.env, timeout=180)
        return r.stdout.decode("utf-8", "replace")

    def llamadas(self):
        archivo = self.home / "llamadas-claude.txt"
        return archivo.read_text(encoding="utf-8") if archivo.exists() else ""

    def test_los_retirados_ya_no_estan_en_el_marketplace(self):
        nombres = [p["name"] for p in json.loads(MARKETPLACE.read_text(encoding="utf-8"))["plugins"]]
        for retirado in RETIRADOS:
            self.assertNotIn(retirado, nombres)
        self.assertIn("tablero", nombres)

    def test_desinstala_el_retirado_que_esta_instalado_y_no_toca_los_demas(self):
        self.correr()
        llamadas = self.llamadas()
        self.assertIn("plugin uninstall barra-plan@claude-code-entorno --scope user", llamadas)
        self.assertNotIn("plugin uninstall caveman-badge", llamadas)
        self.assertNotIn("plugin uninstall superpowers", llamadas)

    def test_en_simulacion_solo_lo_anuncia(self):
        salida = self.correr("--simular")
        self.assertIn("haría: claude plugin uninstall barra-plan@claude-code-entorno", salida)
        self.assertNotIn("plugin uninstall", self.llamadas())


if __name__ == "__main__":
    unittest.main()

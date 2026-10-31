"""La configuración del repo es válida: JSON correcto, hooks que existen y plugins
que `claude plugin validate` acepta (si el CLI de Claude Code está instalado)."""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AJUSTES = RAIZ / "claude" / "settings.base.json"
# Hooks que instala otro programa (codebase-memory-mcp), no viven en este repo.
HOOKS_DE_OTRO_PROGRAMA = ("cbm-",)


class AjustesBase(unittest.TestCase):
    def setUp(self):
        self.ajustes = json.loads(AJUSTES.read_text(encoding="utf-8"))

    def test_claves_basicas(self):
        for clave in ("model", "statusLine", "hooks", "enabledPlugins"):
            self.assertIn(clave, self.ajustes)

    def test_hooks_apuntan_a_archivos_del_repo(self):
        for evento, grupos in self.ajustes["hooks"].items():
            for grupo in grupos:
                for hook in grupo["hooks"]:
                    comando = hook["command"]
                    nombre = Path(comando).name
                    if nombre.startswith(HOOKS_DE_OTRO_PROGRAMA):
                        continue
                    with self.subTest(evento=evento, comando=comando):
                        self.assertTrue((RAIZ / "claude" / "hooks" / nombre).is_file(),
                                        "falta claude/hooks/" + nombre)

    def test_modelo_es_un_alias_conocido(self):
        self.assertIn(self.ajustes["model"], ("haiku", "sonnet", "opus"))


@unittest.skipUnless(shutil.which("claude"), "hace falta el CLI de Claude Code")
class ValidacionDeClaude(unittest.TestCase):
    def validar(self, ruta):
        r = subprocess.run(["claude", "plugin", "validate", str(ruta)],
                           capture_output=True, text=True, timeout=120)
        salida = r.stdout + r.stderr
        self.assertEqual(r.returncode, 0, salida[-800:])
        self.assertNotRegex(salida, re.compile(r"Validation failed", re.I))

    def test_marketplace_del_repo(self):
        self.validar(RAIZ)

    def test_cada_mod(self):
        for carpeta in sorted((RAIZ / "mods").iterdir()):
            if carpeta.is_dir():
                with self.subTest(mod=carpeta.name):
                    self.validar(carpeta)


if __name__ == "__main__":
    unittest.main()

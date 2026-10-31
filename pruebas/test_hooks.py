"""Los hooks de git del repo (.githooks/) existen, son válidos y revisan lo mismo que el CI."""
import os
import subprocess
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOKS = RAIZ / ".githooks"


class HooksDeGit(unittest.TestCase):
    def test_existen_y_son_ejecutables(self):
        for nombre in ("pre-commit", "pre-push"):
            with self.subTest(hook=nombre):
                ruta = HOOKS / nombre
                self.assertTrue(ruta.is_file(), ruta)
                self.assertTrue(os.access(ruta, os.X_OK), ruta)

    def test_sintaxis_de_sh(self):
        for nombre in ("pre-commit", "pre-push"):
            with self.subTest(hook=nombre):
                r = subprocess.run(["sh", "-n", str(HOOKS / nombre)], capture_output=True)
                self.assertEqual(r.returncode, 0, r.stderr)

    def test_pre_commit_revisa_privacidad_y_secretos(self):
        texto = (HOOKS / "pre-commit").read_text(encoding="utf-8")
        self.assertIn("revisar_privacidad.py", texto)
        self.assertIn("gitleaks protect --staged", texto)

    def test_pre_push_revisa_el_historial(self):
        texto = (HOOKS / "pre-push").read_text(encoding="utf-8")
        self.assertIn("--historial", texto)
        self.assertIn('--log-opts="--all"', texto)


if __name__ == "__main__":
    unittest.main()

"""Comprueba que el clon tenga activados los hooks de git (core.hooksPath=.githooks).

Sin esa configuración, ni la revisión de privacidad ni gitleaks corren en cada commit
y push, y se puede subir algo privado sin darse cuenta. Se activa una vez por clon:

    git config core.hooksPath .githooks

La comprobación se salta donde no aplica: en CI (variable CI), en un árbol sin `.git`
(por ejemplo un zip) o sin `git` instalado. Ahí los mismos controles los corre el CI.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MENSAJE = ("Los hooks de git no están activados en este clon (core.hooksPath=%r, se esperaba '.githooks').\n"
           "Sin ellos no corren la revisión de privacidad ni gitleaks en cada commit y push.\n"
           "Actívalos una vez con:\n\n    git config core.hooksPath .githooks\n")


def hooks_path(raiz):
    """El valor de core.hooksPath de `raiz`, o '' si no está configurado."""
    r = subprocess.run(["git", "-C", str(raiz), "config", "--get", "core.hooksPath"],
                       capture_output=True, text=True)
    return r.stdout.strip()


def apuntan_a_githooks(raiz, valor):
    if not valor:
        return False
    destino = Path(valor) if os.path.isabs(valor) else Path(raiz) / valor
    return destino.resolve() == (Path(raiz) / ".githooks").resolve()


class LogicaDeLaComprobacion(unittest.TestCase):
    """Prueba la comprobación misma en repos temporales (corre en todas partes con git)."""

    def setUp(self):
        if not shutil.which("git"):
            self.skipTest("git no está instalado")
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.repo)], check=True)
        (self.repo / ".githooks").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_sin_configurar_no_apunta(self):
        self.assertFalse(apuntan_a_githooks(self.repo, hooks_path(self.repo)))

    def test_configurado_apunta(self):
        subprocess.run(["git", "-C", str(self.repo), "config", "core.hooksPath", ".githooks"], check=True)
        self.assertTrue(apuntan_a_githooks(self.repo, hooks_path(self.repo)))

    def test_otra_carpeta_no_apunta(self):
        subprocess.run(["git", "-C", str(self.repo), "config", "core.hooksPath", "otros"], check=True)
        self.assertFalse(apuntan_a_githooks(self.repo, hooks_path(self.repo)))

    def test_ruta_absoluta_a_githooks_apunta(self):
        subprocess.run(["git", "-C", str(self.repo), "config", "core.hooksPath",
                        str(self.repo / ".githooks")], check=True)
        self.assertTrue(apuntan_a_githooks(self.repo, hooks_path(self.repo)))


class ClonConHooksActivados(unittest.TestCase):
    @unittest.skipIf(os.environ.get("CI"), "en CI los controles los corre el propio CI")
    @unittest.skipUnless((RAIZ / ".git").exists(), "no es un clon de git (no hay .git)")
    @unittest.skipUnless((RAIZ / ".githooks").is_dir(), "este árbol no trae .githooks")
    @unittest.skipUnless(shutil.which("git"), "git no está instalado")
    def test_core_hooks_path_es_githooks(self):
        valor = hooks_path(RAIZ)
        self.assertTrue(apuntan_a_githooks(RAIZ, valor), MENSAJE % valor)


if __name__ == "__main__":
    unittest.main()

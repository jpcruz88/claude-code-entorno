"""El instalador recuerda dónde está el repo y con qué opciones se instaló.

«Al día» (claude/hooks/al_dia.py) lee ~/.claude/al-dia/entorno.json para traer `main`
y reinstalar con las mismas opciones una vez al día.
"""
import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
INSTALAR_COMUN = RAIZ / "herramientas" / "instalar_comun.py"


def cargar():
    spec = importlib.util.spec_from_file_location("instalar_comun", INSTALAR_COMUN)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class RecordarEntorno(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name)
        self.ruta = self.home / ".claude" / "al-dia" / "entorno.json"

    def test_guarda_repo_plataforma_opciones_y_commit(self):
        cargar().recordar_entorno(self.home, "/repo", "unix", ["--sin-skills"], "abc123")
        self.assertEqual(json.loads(self.ruta.read_text(encoding="utf-8")), {
            "repo": "/repo", "plataforma": "unix", "opciones": ["--sin-skills"],
            "commit": "abc123"})

    def test_sin_commit_queda_null_para_que_al_dia_repita(self):
        cargar().recordar_entorno(self.home, "/repo", "windows", [], None)
        self.assertIsNone(json.loads(self.ruta.read_text(encoding="utf-8"))["commit"])

    def test_main_acepta_recordar_repetido(self):
        a = cargar().argumentos(["--plataforma", "unix", "--recordar=--sin-skills",
                                 "--recordar=--servidor"])
        self.assertEqual(a.recordar, ["--sin-skills", "--servidor"])


class InstaladoresPasanSusOpciones(unittest.TestCase):
    def test_instalar_sh_pasa_cada_opcion_menos_simular_y_no_interactivo(self):
        texto = (RAIZ / "instalar.sh").read_text(encoding="utf-8")
        self.assertRegex(texto, r'--simular\|--no-interactivo\) ;;')
        self.assertIn('args+=("--recordar=$arg")', texto)

    def test_instalar_ps1_pasa_sus_opciones(self):
        texto = (RAIZ / "instalar.ps1").read_text(encoding="utf-8-sig")
        for opcion in ("SinCodebaseMemory", "SinSkills", "SinMods", "SinOpencode",
                       "SaltarAvisoPermisos"):
            self.assertIn("if ($%s) { $argumentos += '--recordar=-%s' }" % (opcion, opcion), texto)


if __name__ == "__main__":
    unittest.main()

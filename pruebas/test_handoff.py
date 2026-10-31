"""claude/hooks/memoria-maestra.py: al abrir sesión, Claude recuerda en qué quedó.

El handoff vive en la carpeta de memoria del proyecto (así viaja al repo privado):
- handoff.md: resumen escrito por Claude al cerrar (qué se hizo, qué sigue).
- handoff-auto.md: estado de git que el hook de fin escribe solo (rama, commits, cambios).
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "memoria-maestra.py"
sys.path.insert(0, str(HOOK.parent))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("memoria_maestra", HOOK)
mm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mm)


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, text=True)


class ConProyecto(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.base = self.tmp / "claude"          # imita ~/.claude
        self.proyecto = self.tmp / "mi-proyecto"
        self.proyecto.mkdir()
        self.memoria = mm.carpeta_memoria(self.proyecto, self.base)
        self.memoria.mkdir(parents=True)
        self.config = self.tmp / "config.json"   # no existe: sin memoria maestra

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def repo_git(self):
        git(self.proyecto, "init", "-q", "-b", "main")
        git(self.proyecto, "config", "user.email", "prueba@localhost")
        git(self.proyecto, "config", "user.name", "Prueba")
        (self.proyecto / "a.txt").write_text("uno\n", encoding="utf-8")
        git(self.proyecto, "add", "a.txt")
        git(self.proyecto, "commit", "-q", "-m", "feat: primer cambio")


class Resumen(ConProyecto):
    def test_sin_git_no_hay_resumen(self):
        self.assertEqual(mm.resumen_git(self.proyecto), "")

    def test_con_git_trae_rama_commits_y_cambios(self):
        self.repo_git()
        (self.proyecto / "b.txt").write_text("sin commit\n", encoding="utf-8")
        texto = mm.resumen_git(self.proyecto)
        self.assertIn("main", texto)
        self.assertIn("feat: primer cambio", texto)
        self.assertIn("b.txt", texto)


class EscribirAuto(ConProyecto):
    def test_escribe_handoff_auto_en_la_carpeta_de_memoria(self):
        self.repo_git()
        mm.escribir_handoff_auto(self.proyecto, self.base)
        destino = self.memoria / "handoff-auto.md"
        self.assertTrue(destino.exists())
        self.assertIn("feat: primer cambio", destino.read_text(encoding="utf-8"))

    def test_sin_cambios_no_reescribe_el_archivo(self):
        self.repo_git()
        mm.escribir_handoff_auto(self.proyecto, self.base)
        destino = self.memoria / "handoff-auto.md"
        antes = destino.stat().st_mtime_ns
        mm.escribir_handoff_auto(self.proyecto, self.base)
        self.assertEqual(destino.stat().st_mtime_ns, antes)

    def test_sin_git_no_crea_nada(self):
        mm.escribir_handoff_auto(self.proyecto, self.base)
        self.assertFalse((self.memoria / "handoff-auto.md").exists())


class Contexto(ConProyecto):
    def test_sin_handoff_ni_git_no_hay_contexto(self):
        self.assertEqual(mm.texto_inicio(self.proyecto, self.base), "")

    def test_incluye_el_handoff_escrito_por_claude(self):
        (self.memoria / "handoff.md").write_text("Sigue: probar el panel.\n", encoding="utf-8")
        texto = mm.texto_inicio(self.proyecto, self.base)
        self.assertIn("Sigue: probar el panel.", texto)

    def test_incluye_el_estado_de_git_si_existe(self):
        self.repo_git()
        mm.escribir_handoff_auto(self.proyecto, self.base)
        texto = mm.texto_inicio(self.proyecto, self.base)
        self.assertIn("feat: primer cambio", texto)

    def test_pide_a_claude_actualizar_el_handoff_al_cerrar(self):
        (self.memoria / "handoff.md").write_text("x\n", encoding="utf-8")
        texto = mm.texto_inicio(self.proyecto, self.base)
        self.assertIn("handoff.md", texto)
        self.assertIn("cerrar", texto.lower())


class HookInicioFin(ConProyecto):
    def correr(self, modo, datos):
        entorno = dict(os.environ)
        entorno["MEMORIA_MAESTRA_CONFIG"] = str(self.config)
        entorno["CLAUDE_CONFIG_DIR"] = str(self.base)
        r = subprocess.run([sys.executable, str(HOOK), modo], input=json.dumps(datos).encode("utf-8"),
                           capture_output=True, timeout=60, env=entorno)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.decode("utf-8").strip()

    def test_inicio_entrega_el_handoff_al_abrir(self):
        (self.memoria / "handoff.md").write_text("Quedamos en la mascota.\n", encoding="utf-8")
        salida = self.correr("inicio", {"cwd": str(self.proyecto)})
        contexto = json.loads(salida)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("Quedamos en la mascota.", contexto)

    def test_fin_escribe_el_handoff_auto(self):
        self.repo_git()
        self.correr("fin", {"cwd": str(self.proyecto)})
        self.assertTrue((self.memoria / "handoff-auto.md").exists())


if __name__ == "__main__":
    unittest.main()

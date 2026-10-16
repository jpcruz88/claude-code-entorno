"""Pruebas de claude/statusline.sh: le da JSON como el que manda Claude Code.

Necesitan bash y jq (en Windows, desde Git Bash). Si faltan, se omiten.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCRIPT = RAIZ / "claude" / "statusline.sh"
EJEMPLO = RAIZ / "pruebas" / "datos" / "statusline-ejemplo.json"
BASH = shutil.which("bash")
ANSI = re.compile(r"\x1b\[[0-9;]*m")
DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]  # time.gmtime: lunes = 0


def correr(datos, **entorno):
    env = dict(os.environ, TZ="UTC", **entorno)
    entrada = datos if isinstance(datos, str) else json.dumps(datos)
    r = subprocess.run([BASH, str(SCRIPT)], input=entrada.encode("utf-8"),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=30)
    return r.returncode, ANSI.sub("", r.stdout.decode("utf-8"))


@unittest.skipUnless(BASH and shutil.which("jq"), "hace falta bash y jq")
class Statusline(unittest.TestCase):
    def ejemplo(self):
        return json.loads(EJEMPLO.read_text(encoding="utf-8"))

    def test_ejemplo_completo(self):
        datos = self.ejemplo()
        ahora = int(time.time())
        semanal = ahora + 3 * 86400 + 4 * 3600 + 120
        datos["rate_limits"]["five_hour"]["resets_at"] = ahora + 2 * 3600 + 13 * 60 + 30
        datos["rate_limits"]["seven_day"]["resets_at"] = semanal
        codigo, salida = correr(datos)
        self.assertEqual(codigo, 0)
        t = time.gmtime(semanal)
        dia = "%s %02d:%02d" % (DIAS[t.tm_wday], t.tm_hour, t.tm_min)
        for esperado in ["Opus", "«mi-sesion»", "📁 demo", "🌿 mi-rama", "🤖 revisor",
                         "eff xhigh", "thinking on", "ctx 8%", "cache 91%", "$0.01",
                         "+156 −23", "⏱ 1h15m", "sesión 24% ↻ 2h13m",
                         "semana 41%% ↻ 3d4h (%s)" % dia, "🕐 "]:
            self.assertIn(esperado, salida)

    def test_fechas_pasadas(self):
        codigo, salida = correr(self.ejemplo())
        self.assertEqual(codigo, 0)
        self.assertIn("↻ ya", salida)

    def test_json_minimo(self):
        codigo, salida = correr("{}")
        self.assertEqual(codigo, 0)
        self.assertTrue(salida.startswith("? · ctx –"), salida)

    def test_ruta_de_windows_y_cache_fria(self):
        datos = {"cwd": "C:\\proyectos\\demo-win", "model": {"display_name": "Sonnet"},
                 "prompt_cache": {"warm": False}, "context_window": {"used_percentage": 91.6}}
        codigo, salida = correr(datos)
        self.assertEqual(codigo, 0)
        for esperado in ["📁 demo-win", "ctx 92%", "cache ❄"]:
            self.assertIn(esperado, salida)

    def test_no_depende_del_idioma(self):
        """Con un idioma que usa coma decimal, los números siguen saliendo bien."""
        datos = {"context_window": {"used_percentage": 45.5}, "cost": {"total_cost_usd": 1.5}}
        for idioma in ("de_DE.UTF-8", "es_MX.UTF-8", "C"):
            codigo, salida = correr(datos, LC_ALL=idioma)
            self.assertEqual(codigo, 0)
            self.assertIn("ctx 46%", salida)
            self.assertIn("$1.50", salida)

    def test_json_roto(self):
        codigo, salida = correr("esto no es json")
        self.assertEqual(codigo, 0)
        self.assertIn("no pude leer", salida)

    def test_perfil_aws(self):
        codigo, salida = correr("{}", **{"AWS_" + "PROFILE": "perfil-de-prueba"})
        self.assertIn("☁ perfil-de-prueba", salida)

    @unittest.skipUnless(shutil.which("git"), "hace falta git")
    def test_rama_git(self):
        with tempfile.TemporaryDirectory() as carpeta:
            subprocess.run(["git", "init", "-q", "-b", "principal", carpeta], check=True)
            codigo, salida = correr({"cwd": carpeta})
            self.assertIn("⎇ principal", salida)
            self.assertNotIn("principal*", salida)
            Path(carpeta, "nuevo.txt").write_text("x")
            codigo, salida = correr({"cwd": carpeta})
            self.assertIn("⎇ principal*", salida)

    def test_sin_jq(self):
        """Sin jq avisa en lugar de fallar."""
        with tempfile.TemporaryDirectory() as bin_:
            for prog in ("cat", "tr"):
                os.symlink(shutil.which(prog), os.path.join(bin_, prog))
            codigo, salida = correr("{}", PATH=bin_)
            self.assertEqual(codigo, 0)
            self.assertIn("falta jq", salida)


if __name__ == "__main__":
    unittest.main()

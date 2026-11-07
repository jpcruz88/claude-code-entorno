"""Pruebas de claude/statusline.sh: le da JSON como el que manda Claude Code.

Necesitan bash y jq (en Windows, desde Git Bash). Si faltan, se omiten.
"""
import json
import os
import re
import shutil
import subprocess
import sys
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


def correr(datos, home=None, **entorno):
    """Corre la statusline. HOME apunta a una carpeta temporal para no tocar ~/.claude."""
    propio = None
    try:
        if home is None:
            propio = tempfile.TemporaryDirectory()
            home = propio.name
        env = dict(os.environ, TZ="UTC", HOME=str(home), **entorno)
        entrada = datos if isinstance(datos, str) else json.dumps(datos)
        r = subprocess.run([BASH, str(SCRIPT)], input=entrada.encode("utf-8"),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=30)
    finally:
        if propio:
            propio.cleanup()
    return r.returncode, ANSI.sub("", r.stdout.decode("utf-8"))


@unittest.skipUnless(BASH and shutil.which("jq"), "hace falta bash y jq")
class GuardaUso(unittest.TestCase):
    """La statusline escribe ~/.claude/jev/limites.json con el uso de la cuenta."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.archivo = self.home / ".claude" / "jev" / "limites.json"

    def ejemplo(self):
        return json.loads(EJEMPLO.read_text(encoding="utf-8"))

    def test_escribe_el_uso(self):
        antes = int(time.time())
        codigo, salida = correr(self.ejemplo(), home=self.home)
        self.assertEqual(codigo, 0)
        datos = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertEqual(sorted(datos), ["actualizado", "five_hour", "seven_day"])
        self.assertGreaterEqual(datos["actualizado"], antes)
        self.assertLessEqual(datos["actualizado"], int(time.time()))
        self.assertEqual(datos["five_hour"], {"usado": 23.5, "reinicio": 1738425600})
        self.assertEqual(datos["seven_day"], {"usado": 41.2, "reinicio": 1738857600})
        self.assertEqual(oct(self.archivo.parent.stat().st_mode & 0o777), "0o700")

    def test_reinicio_en_iso_se_guarda_como_epoch(self):
        datos = self.ejemplo()
        datos["rate_limits"]["five_hour"]["resets_at"] = "2025-02-01T16:00:00.123Z"
        correr(datos, home=self.home)
        escrito = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertEqual(escrito["five_hour"]["reinicio"], 1738425600)
        self.assertIsInstance(escrito["five_hour"]["reinicio"], int)

    def _leer(self):
        sys.path.insert(0, str(RAIZ / "claude" / "hooks"))
        try:
            import jev_limites
        finally:
            sys.path.pop(0)
        return jev_limites.leer_limites(str(self.home), time.time())

    def test_solo_five_hour_valida(self):
        datos = self.ejemplo()
        del datos["rate_limits"]["seven_day"]
        correr(datos, home=self.home)
        escrito = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertEqual(sorted(escrito), ["actualizado", "five_hour"])
        self.assertEqual(escrito["five_hour"], {"usado": 23.5, "reinicio": 1738425600})
        self.assertIsNotNone(self._leer())

    def test_seven_day_sin_resets_at(self):
        datos = self.ejemplo()
        del datos["rate_limits"]["seven_day"]["resets_at"]
        correr(datos, home=self.home)
        escrito = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertEqual(sorted(escrito), ["actualizado", "five_hour"])
        self.assertIsNotNone(self._leer())

    def test_ninguna_ventana_valida_no_escribe(self):
        datos = self.ejemplo()
        datos["rate_limits"] = {"five_hour": {"used_percentage": 5}, "seven_day": {}}
        correr(datos, home=self.home)
        self.assertFalse(self.archivo.exists())

    def test_reinicio_iso_con_offset(self):
        datos = self.ejemplo()
        datos["rate_limits"]["five_hour"]["resets_at"] = "2026-11-07T06:00:00+01:00"
        datos["rate_limits"]["seven_day"]["resets_at"] = "2026-11-07T06:00:00.5-06:00"
        codigo, _ = correr(datos, home=self.home)
        self.assertEqual(codigo, 0)
        escrito = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertEqual(escrito["five_hour"]["reinicio"], 1794027600)  # 05:00 UTC
        self.assertEqual(escrito["seven_day"]["reinicio"], 1794052800)  # 12:00 UTC

    def test_sin_rate_limits_no_escribe_y_salida_igual(self):
        datos = self.ejemplo()
        con = correr(datos, home=self.home)[1]
        shutil.rmtree(self.archivo.parent, ignore_errors=True)
        del datos["rate_limits"]
        codigo, salida = correr(datos, home=self.home)
        self.assertEqual(codigo, 0)
        self.assertFalse(self.archivo.exists())
        self.assertIn("Opus", salida)
        self.assertNotIn("sesión", salida)
        self.assertIn("sesión 24%", con)

    def test_carpeta_no_escribible_dibuja_igual(self):
        (self.home / ".claude").write_text("soy un archivo", encoding="utf-8")
        codigo, salida = correr(self.ejemplo(), home=self.home)
        self.assertEqual(codigo, 0)
        self.assertIn("sesión 24%", salida)
        self.assertFalse(self.archivo.exists())

    def test_cinco_en_paralelo_dejan_json_valido(self):
        procesos = []
        for i in range(5):
            datos = self.ejemplo()
            datos["rate_limits"]["five_hour"]["used_percentage"] = 10 + i
            env = dict(os.environ, TZ="UTC", HOME=str(self.home))
            p = subprocess.Popen([BASH, str(SCRIPT)], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            p.stdin.write(json.dumps(datos).encode("utf-8"))
            p.stdin.close()
            procesos.append(p)
        for p in procesos:
            p.wait(timeout=30)
            p.stdout.close()
            p.stderr.close()
        datos = json.loads(self.archivo.read_text(encoding="utf-8"))
        self.assertIn(datos["five_hour"]["usado"], [10, 11, 12, 13, 14])
        sobras = [f.name for f in self.archivo.parent.iterdir() if f.name != "limites.json"]
        self.assertEqual(sobras, [])

    def test_leer_limites_acepta_lo_escrito(self):
        sys.path.insert(0, str(RAIZ / "claude" / "hooks"))
        try:
            import jev_limites
        finally:
            sys.path.pop(0)
        correr(self.ejemplo(), home=self.home)
        ahora = time.time()
        datos = jev_limites.leer_limites(str(self.home), ahora)
        self.assertIsNotNone(datos)
        self.assertEqual(datos["seven_day"]["usado"], 41.2)
        self.assertEqual(datos["five_hour"]["reinicio"], 1738425600)


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

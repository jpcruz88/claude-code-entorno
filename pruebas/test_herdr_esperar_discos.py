"""herdr/esperar-discos.sh: antes de abrir herdr espera a los discos externos de la sesión guardada.

Si herdr restaura sus pestañas antes de que el disco esté montado, las marca con
«Saved directory is unavailable» y no lo vuelve a intentar.
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GUION = RAIZ / "herdr" / "esperar-discos.sh"

# herdr de mentira: anota cómo lo llamaron; «status server» responde según un marcador.
HERDR_FALSO = """#!/bin/sh
if [ "$*" = "status server" ]; then
  if [ -f "$HOME/.servidor-activo" ]; then echo "status: running"; else echo "status: stopped"; fi
  exit 0
fi
echo "$*" > "$HOME/llamada-herdr.txt"
"""


@unittest.skipIf(os.name == "nt", "guion de sh")
class EsperarDiscos(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.discos = self.tmp / "Volumes"
        (self.home / ".config" / "herdr").mkdir(parents=True)
        self.discos.mkdir()
        self.herdr = self.tmp / "herdr"
        self.herdr.write_text(HERDR_FALSO, encoding="utf-8")
        self.herdr.chmod(0o755)

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def sesion(self, *carpetas):
        paneles = {str(i + 1): {"cwd": c} for i, c in enumerate(carpetas)}
        datos = {"version": 1, "workspaces": [{"tabs": [{"panes": paneles}]}]}
        (self.home / ".config" / "herdr" / "session.json").write_text(json.dumps(datos), encoding="utf-8")

    def correr(self, *args, espera="5"):
        env = {"HOME": str(self.home), "PATH": "/usr/bin:/bin",
               "HERDR_RAIZ_DISCOS": str(self.discos), "HERDR_ESPERA_DISCOS": espera}
        inicio = time.time()
        r = subprocess.run(["sh", str(GUION), str(self.herdr)] + list(args), env=env,
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=30)
        self.assertEqual(r.returncode, 0, r.stdout)
        return r.stdout.decode("utf-8", "replace"), time.time() - inicio

    def llamada(self):
        return (self.home / "llamada-herdr.txt").read_text(encoding="utf-8").strip()

    def test_es_ejecutable_y_de_sintaxis_valida(self):
        self.assertTrue(os.access(GUION, os.X_OK))
        r = subprocess.run(["sh", "-n", str(GUION)], capture_output=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_sin_sesion_guardada_abre_herdr_con_sus_argumentos(self):
        salida, tardo = self.correr("--session", "trabajo")
        self.assertEqual(self.llamada(), "--session trabajo")
        self.assertEqual(salida, "")
        self.assertLess(tardo, 2)

    def test_disco_ya_montado_no_espera(self):
        (self.discos / "DISCO").mkdir()
        self.sesion(str(self.discos / "DISCO" / "proyecto"), str(self.home))
        salida, tardo = self.correr()
        self.assertEqual(self.llamada(), "")
        self.assertEqual(salida, "")
        self.assertLess(tardo, 2)

    def test_espera_a_que_aparezca_el_disco(self):
        self.sesion(str(self.discos / "Mi Disco" / "proyecto"))
        threading.Timer(1.5, lambda: (self.discos / "Mi Disco").mkdir()).start()
        salida, tardo = self.correr(espera="10")
        self.assertIn("Mi Disco", salida)
        self.assertGreater(tardo, 1.2)
        self.assertLess(tardo, 6)
        self.assertEqual(self.llamada(), "")

    def test_si_el_disco_no_llega_abre_herdr_igual_y_avisa(self):
        self.sesion(str(self.discos / "DISCO" / "a"), str(self.discos / "DISCO" / "b"))
        salida, tardo = self.correr(espera="1")
        self.assertEqual(salida.count("DISCO"), 2, salida)  # una vez al esperar y otra al rendirse
        self.assertLess(tardo, 5)
        self.assertEqual(self.llamada(), "")

    def test_con_el_servidor_ya_abierto_no_espera(self):
        self.sesion(str(self.discos / "DISCO" / "proyecto"))
        (self.home / ".servidor-activo").write_text("", encoding="utf-8")
        salida, tardo = self.correr(espera="10")
        self.assertEqual(salida, "")
        self.assertLess(tardo, 2)
        self.assertEqual(self.llamada(), "")

    def test_espera_cero_no_espera(self):
        self.sesion(str(self.discos / "DISCO" / "proyecto"))
        salida, tardo = self.correr(espera="0")
        self.assertLess(tardo, 2)
        self.assertEqual(self.llamada(), "")


if __name__ == "__main__":
    unittest.main()

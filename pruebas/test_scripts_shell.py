"""Revisiones de los scripts de shell del repo, sin correrlos.

En una terminal con UTF-8, el bash de macOS (3.2) toma el primer byte de «, », é…
como parte del nombre de una variable: en "«$NOMBRE»" busca la variable NOMBRE\\xc2,
que no existe, y con `set -u` el script se detiene. Hay que escribir "«${NOMBRE}»".
"""
import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PEGADA = re.compile(rb"\$[A-Za-z_][A-Za-z0-9_]*[\x80-\xff]")


class ScriptsShell(unittest.TestCase):
    def test_ninguna_variable_pegada_a_un_caracter_no_ascii(self):
        scripts = [p for p in RAIZ.rglob("*.sh") if ".git" not in p.parts]
        self.assertTrue(scripts)
        malas = []
        for script in sorted(scripts):
            for n, linea in enumerate(script.read_bytes().splitlines(), 1):
                if PEGADA.search(linea):
                    malas.append("%s:%d: %s" % (script.relative_to(RAIZ), n,
                                                linea.decode("utf-8", "replace").strip()))
        self.assertEqual(malas, [], "usa ${VAR} junto a «», tildes o eñes:\n" + "\n".join(malas))


if __name__ == "__main__":
    unittest.main()

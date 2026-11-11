"""Los hooks que settings.base.json lanza por su ruta (sin intérprete) deben ser ejecutables.

Un hook sin permiso de ejecución falla con «Permission denied» en cada llamada y, como
el fallo no bloquea, la guarda deja de revisar sin que nadie lo note.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))

import instalar_comun  # noqa: E402

ES_WINDOWS = os.name == "nt"


def comandos_de_hooks():
    base = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
    for grupos in base.get("hooks", {}).values():
        for grupo in grupos:
            for h in grupo.get("hooks", []):
                if h.get("type") == "command":
                    yield h["command"]


@unittest.skipIf(ES_WINDOWS, "Windows no tiene bit de ejecución")
class HooksLanzadosPorRuta(unittest.TestCase):
    def test_son_ejecutables_en_el_repo(self):
        revisados = 0
        for comando in comandos_de_hooks():
            primero = comando.split(None, 1)[0]
            if not primero.startswith("~/.claude/hooks/"):
                continue  # trae intérprete (python3 …) o no es un hook del repo
            origen = RAIZ / "claude" / "hooks" / Path(primero).name
            if not origen.is_file():
                continue  # lo instala otro programa (cbm-*)
            revisados += 1
            with self.subTest(hook=origen.name):
                self.assertTrue(os.access(origen, os.X_OK),
                                "%s se lanza por su ruta y no es ejecutable" % origen.name)
        self.assertGreater(revisados, 0)


@unittest.skipIf(ES_WINDOWS, "Windows no tiene bit de ejecución")
class PermisoAlInstalar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.inst = instalar_comun.Instalador.__new__(instalar_comun.Instalador)
        self.inst.simular = False
        self.inst.info = lambda *a, **k: None

    def tearDown(self):
        self.tmp.cleanup()

    def test_archivo_al_dia_sin_permiso_lo_recupera(self):
        destino = self.dir / "guarda.py"
        destino.write_bytes(b"#!/usr/bin/env python3\n")
        destino.chmod(0o644)
        self.inst.instalar_archivo(b"#!/usr/bin/env python3\n", destino, "guarda.py",
                                   ejecutable=True)
        self.assertTrue(os.access(destino, os.X_OK))
        self.assertEqual(list(self.dir.glob("guarda.py.bak-*")), [])  # sin respaldo: no cambió

    def test_simular_no_cambia_el_permiso(self):
        destino = self.dir / "guarda.py"
        destino.write_bytes(b"x")
        destino.chmod(0o644)
        self.inst.simular = True
        self.inst.instalar_archivo(b"x", destino, "guarda.py", ejecutable=True)
        self.assertFalse(os.access(destino, os.X_OK))


if __name__ == "__main__":
    unittest.main()

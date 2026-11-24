"""El mod tablero copia los topes de claude/hooks/jev_limites.py para dibujar la fila de ritmo.

El kit de pruebas del mod no corre procesos, así que la comparación vive aquí: si alguien
cambia DEFAULTS_LIMITES en Python y no en jev-modelo.ts (o al revés), esta prueba falla.
"""
import json
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "claude" / "hooks"))

import jev_limites  # noqa: E402

TS = (RAIZ / "mods" / "tablero" / "hooks" / "jev-modelo.ts").read_text(encoding="utf-8")


def constantes():
    """Las constantes numéricas sueltas del módulo: `const NOMBRE = 97`."""
    return {n: int(v) for n, v in re.findall(r"^const ([A-Z0-9_]+) = (-?\d+)\s*$", TS, re.M)}


def escalones(nombre):
    """Una lista `[[umbral, 'modelo', 'esfuerzo'], …]` con sus constantes ya sustituidas."""
    m = re.search(rf"const {nombre}\b[^=]*=\s*\[", TS)
    if m is None:
        raise AssertionError(f"no encontré {nombre} en jev-modelo.ts")
    inicio, nivel = m.end() - 1, 0
    for i in range(inicio, len(TS)):  # hasta el corchete que cierra la lista
        nivel += {"[": 1, "]": -1}.get(TS[i], 0)
        if nivel == 0:
            break
    texto = TS[inicio : i + 1]
    for n, v in constantes().items():
        texto = re.sub(rf"\b{n}\b", str(v), texto)
    return json.loads(re.sub(r",\s*\]", "]", texto.replace("'", '"')))


class TopesIguales(unittest.TestCase):
    def setUp(self):
        self.py = jev_limites.DEFAULTS_LIMITES
        self.k = constantes()

    def test_escalones_de_la_semana(self):
        self.assertEqual(escalones("SEMANA_ESCALONES"), self.py["semana_escalones"])

    def test_escalones_de_5_horas(self):
        self.assertEqual(escalones("H5_ESCALONES"), self.py["h5_escalones"])

    def test_valores_sueltos(self):
        ritmo = re.search(r"CFG_RITMO: CfgRitmo = \{([^}]*)\}", TS).group(1)
        cfg = {k: int(v) for k, v in re.findall(r"(\w+): (-?\d+)", ritmo)}
        self.assertEqual(cfg["metaCorte"], self.py["meta_corte"])
        self.assertEqual(cfg["corteDia"], self.py["corte_dia"])
        self.assertEqual(cfg["corteHora"], self.py["corte_hora"])
        self.assertEqual(cfg["maxAntiguedadH"], self.py["max_antiguedad_h"])
        self.assertEqual(self.k["FINAL_SEMANA"], self.py["final"])
        self.assertEqual(self.k["H5_GRACIA_MIN"], self.py["h5_gracia_min"])


if __name__ == "__main__":
    unittest.main()

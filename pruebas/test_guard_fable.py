"""claude/hooks/guard-fable.py: el hook existe, es Python válido y deja pasar Haiku.

Los casos que bloquean Fable no van aquí a propósito: el propio hook los bloquea
al escribirlos, y esta prueba no debe contener un fixture de Fable.
"""
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-fable.py"


def correr(entrada):
    entorno = {k: v for k, v in os.environ.items() if k != "CLAUDE_PERMITIR_FABLE"}
    r = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(entrada).encode(),
                       capture_output=True, timeout=30, env=entorno)
    assert r.returncode == 0, r.stderr
    return r.stdout.decode().strip()


class GuardFable(unittest.TestCase):
    def test_es_python_valido(self):
        compile(HOOK.read_text(encoding="utf-8"), str(HOOK), "exec")

    def test_agente_con_haiku_pasa(self):
        self.assertEqual(correr({"tool_name": "Agent", "tool_input": {"model": "haiku"}}), "")

    def test_herramienta_no_revisada_pasa(self):
        self.assertEqual(correr({"tool_name": "Read", "tool_input": {"file_path": "x"}}), "")


if __name__ == "__main__":
    unittest.main()

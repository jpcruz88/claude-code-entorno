"""claude/hooks/guard-fable.py: bloquea elegir Fable, salvo en subagentes con tope de uso.

En Agent y Task, Fable lo decide guard-subagentes.py (lo baja según el uso de la cuenta),
así que este hook lo deja pasar solo si ese guardián está instalado a su lado. En
workflows, comandos y archivos sigue bloqueado.

Las pruebas arman el nombre del modelo con una constante: el propio hook bloquea
escribir un archivo que fije ese modelo de forma literal.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-fable.py"
MAS_CAPAZ = "fable"


def correr(entrada, hook=HOOK):
    entorno = {k: v for k, v in os.environ.items() if k != "CLAUDE_PERMITIR_FABLE"}
    r = subprocess.run([sys.executable, str(hook)], input=json.dumps(entrada).encode(),
                       capture_output=True, timeout=30, env=entorno)
    assert r.returncode == 0, r.stderr
    return r.stdout.decode().strip()


def agente(modelo, herramienta="Agent"):
    entrada = {"description": "x", "prompt": "y", "effort": "high"}
    entrada["model"] = modelo
    return {"tool_name": herramienta, "tool_input": entrada}


def negado(salida):
    return bool(salida) and json.loads(salida)["hookSpecificOutput"]["permissionDecision"] == "deny"


class GuardFable(unittest.TestCase):
    def test_es_python_valido(self):
        compile(HOOK.read_text(encoding="utf-8"), str(HOOK), "exec")

    def test_agente_con_haiku_pasa(self):
        self.assertEqual(correr({"tool_name": "Agent", "tool_input": {"model": "haiku"}}), "")

    def test_herramienta_no_revisada_pasa(self):
        self.assertEqual(correr({"tool_name": "Read", "tool_input": {"file_path": "x"}}), "")

    def test_subagente_pasa_si_el_guardian_de_topes_esta_al_lado(self):
        for herramienta in ("Agent", "Task"):
            for modelo in (MAS_CAPAZ, "claude-%s-5-2" % MAS_CAPAZ):
                with self.subTest(herramienta=herramienta, modelo=modelo):
                    self.assertEqual(correr(agente(modelo, herramienta)), "")

    def test_subagente_se_bloquea_sin_el_guardian_de_topes(self):
        carpeta = tempfile.mkdtemp(prefix="solo-fable-")
        self.addCleanup(shutil.rmtree, carpeta, True)
        copia = Path(carpeta, "guard-fable.py")
        shutil.copy(str(HOOK), str(copia))
        self.assertTrue(negado(correr(agente(MAS_CAPAZ), hook=copia)))

    def test_workflow_sigue_bloqueado(self):
        guion = "await agent('x', {model: '%s', effort: 'high'})" % MAS_CAPAZ
        self.assertTrue(negado(correr({"tool_name": "Workflow", "tool_input": {"script": guion}})))

    def test_comando_sigue_bloqueado(self):
        comando = "claude --model %s -p hola" % MAS_CAPAZ
        self.assertTrue(negado(correr({"tool_name": "Bash", "tool_input": {"command": comando}})))


if __name__ == "__main__":
    unittest.main()

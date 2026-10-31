"""claude/hooks/guard-subagentes.py: todo agente o subagente usa Haiku con esfuerzo medio.

Regla del usuario: cualquier agente o subagente usa claude-haiku-5-5 con esfuerzo
medio; ningún otro modelo, y ningún esfuerzo más alto que medio (se acepta «low»).
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-subagentes.py"


def correr(entrada, crudo=None):
    datos = crudo if crudo is not None else json.dumps(entrada)
    r = subprocess.run([sys.executable, str(HOOK)], input=datos.encode("utf-8"),
                       capture_output=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout.decode("utf-8").strip()


def agente(model=None, effort=None, herramienta="Agent"):
    entrada = {"description": "x", "prompt": "y"}
    if model is not None:
        entrada["model"] = model
    if effort is not None:
        entrada["effort"] = effort
    return {"tool_name": herramienta, "tool_input": entrada}


def negado(salida):
    return bool(salida) and json.loads(salida)["hookSpecificOutput"]["permissionDecision"] == "deny"


class AgentesYSubagentes(unittest.TestCase):
    def test_haiku_medio_pasa(self):
        self.assertEqual(correr(agente("haiku", "medium")), "")

    def test_haiku_bajo_pasa(self):
        self.assertEqual(correr(agente("haiku", "low")), "")

    def test_id_completo_de_haiku_pasa(self):
        self.assertEqual(correr(agente("claude-haiku-5-5", "medium")), "")

    def test_otro_modelo_se_bloquea(self):
        for modelo in ("opus", "sonnet", "claude-opus-5-5", "claude-sonnet-5-5"):
            with self.subTest(modelo=modelo):
                self.assertTrue(negado(correr(agente(modelo, "medium"))))

    def test_esfuerzo_mas_alto_que_medio_se_bloquea(self):
        for esfuerzo in ("high", "xhigh", "max"):
            with self.subTest(esfuerzo=esfuerzo):
                self.assertTrue(negado(correr(agente("haiku", esfuerzo))))

    def test_sin_modelo_se_bloquea(self):
        self.assertTrue(negado(correr(agente(None, "medium"))))

    def test_sin_esfuerzo_se_bloquea(self):
        self.assertTrue(negado(correr(agente("haiku", None))))

    def test_task_tambien_se_revisa(self):
        self.assertTrue(negado(correr(agente("opus", "medium", herramienta="Task"))))

    def test_otras_herramientas_no_se_tocan(self):
        self.assertEqual(correr({"tool_name": "Bash", "tool_input": {"command": "ls"}}), "")


class Workflows(unittest.TestCase):
    def workflow(self, guion):
        return {"tool_name": "Workflow", "tool_input": {"script": guion}}

    def test_script_haiku_medio_pasa(self):
        guion = "await agent('x', {model: 'haiku', effort: 'medium'})"
        self.assertEqual(correr(self.workflow(guion)), "")

    def test_script_con_otro_modelo_se_bloquea(self):
        guion = "await agent('x', {model: 'opus', effort: 'medium'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_script_con_esfuerzo_alto_se_bloquea(self):
        guion = "await agent('x', {model: 'haiku', effort: 'high'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_script_sin_modelo_se_bloquea(self):
        guion = "await agent('x', {effort: 'medium'})"
        self.assertTrue(negado(correr(self.workflow(guion))))


class Robustez(unittest.TestCase):
    def test_entrada_rota_no_bloquea(self):
        self.assertEqual(correr(None, crudo="esto no es json"), "")


class Configuracion(unittest.TestCase):
    def setUp(self):
        import json
        self.ajustes = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
        self.filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))

    def test_hook_registrado_en_agentes_y_workflows(self):
        comandos = [(g["matcher"], h["command"]) for g in self.ajustes["hooks"]["PreToolUse"]
                    for h in g["hooks"]]
        self.assertIn(("Agent|Task|Workflow", "~/.claude/hooks/guard-subagentes.py"), comandos)

    def test_hook_se_exporta(self):
        self.assertIn("guard-subagentes.py", self.filtros["settings"]["hooks_permitidos"])

    def test_esfuerzo_de_haiku_es_medio_y_no_hay_esfuerzos_altos(self):
        ms = self.ajustes["modelSettings"]
        self.assertEqual(ms["claude-haiku-5-5"]["effortLevel"], "medium")
        for modelo, cfg in ms.items():
            with self.subTest(modelo=modelo):
                self.assertIn(cfg["effortLevel"], ("low", "medium"))


if __name__ == "__main__":
    unittest.main()

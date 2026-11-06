"""claude/hooks/guard-subagentes.py: todo agente o subagente usa Haiku con esfuerzo medio.

Regla del usuario: cualquier agente o subagente usa claude-haiku-5-5 con esfuerzo
medio; ningún otro modelo, y ningún esfuerzo más alto que medio (se acepta «low»).
"""
import atexit
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-subagentes.py"

# HOME temporal para que ninguna prueba lea ni escriba la configuración real de Jev.
_HOME_COMUN = tempfile.mkdtemp(prefix="guard-home-")
atexit.register(shutil.rmtree, _HOME_COMUN, True)


def correr(entrada, crudo=None, home=None, jev=None, clave=None):
    datos = crudo if crudo is not None else json.dumps(entrada)
    entorno = {k: v for k, v in os.environ.items() if k not in ("OPENROUTER_API_KEY", "JEV_URL", "HOME")}
    entorno["HOME"] = home or _HOME_COMUN
    if jev:
        entorno["JEV_URL"] = jev
    if clave:
        entorno["OPENROUTER_API_KEY"] = clave
    r = subprocess.run([sys.executable, str(HOOK)], input=datos.encode("utf-8"),
                       capture_output=True, timeout=30, env=entorno)
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
        for modelo in ("fable", "claude-fable-5-1", "gpt-5", "claude-instant"):
            with self.subTest(modelo=modelo):
                self.assertTrue(negado(correr(agente(modelo, "medium"))))

    def test_esfuerzo_mas_alto_que_medio_se_bloquea(self):
        for esfuerzo in ("xhigh", "max"):
            with self.subTest(esfuerzo=esfuerzo):
                self.assertTrue(negado(correr(agente("haiku", esfuerzo))))

    def test_sonnet_alto_pasa(self):
        self.assertEqual(correr(agente("sonnet", "high")), "")

    def test_opus_medio_pasa(self):
        self.assertEqual(correr(agente("claude-opus-5-5", "medium")), "")

    def test_xhigh_se_bloquea(self):
        self.assertTrue(negado(correr(agente("opus", "xhigh"))))

    def test_fable_se_bloquea(self):
        self.assertTrue(negado(correr(agente("fable", "low"))))

    def test_workflow_sonnet_pasa(self):
        guion = "agent('a', {model: 'sonnet', effort: 'high'})"
        self.assertEqual(correr({"tool_name": "Workflow", "tool_input": {"script": guion}}), "")

    def test_sin_modelo_se_bloquea(self):
        self.assertTrue(negado(correr(agente(None, "medium"))))

    def test_sin_esfuerzo_se_bloquea(self):
        self.assertTrue(negado(correr(agente("haiku", None))))

    def test_task_tambien_se_revisa(self):
        self.assertTrue(negado(correr(agente("fable", "medium", herramienta="Task"))))

    def test_otras_herramientas_no_se_tocan(self):
        self.assertEqual(correr({"tool_name": "Bash", "tool_input": {"command": "ls"}}), "")


class Workflows(unittest.TestCase):
    def workflow(self, guion):
        return {"tool_name": "Workflow", "tool_input": {"script": guion}}

    def test_script_haiku_medio_pasa(self):
        guion = "await agent('x', {model: 'haiku', effort: 'medium'})"
        self.assertEqual(correr(self.workflow(guion)), "")

    def test_script_con_otro_modelo_se_bloquea(self):
        guion = "await agent('x', {model: 'gpt-5', effort: 'medium'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_script_con_esfuerzo_alto_se_bloquea(self):
        guion = "await agent('x', {model: 'haiku', effort: 'xhigh'})"
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


CLAVE = "clave-falsa-solo-para-pruebas"
ENCARGO_SECRETO = "SECRETO-XYZ"


def respuesta(pregunta, eleccion, confianza):
    return {"answers": {pregunta: {
        "type": "choice",
        "choice": eleccion,
        "confidence": confianza,
        "probabilities": {eleccion: confianza},
    }}, "usage": {"cost": 0.00002}}


class ServidorJev:
    """Servidor falso en 127.0.0.1. Responde según la pregunta que llegue en `questions`."""

    def __init__(self, respuestas=None, espera=0.0):
        self.respuestas = respuestas or {}
        self.espera = espera
        self.peticiones = []
        servidor = self

        class Manejador(BaseHTTPRequestHandler):
            def do_POST(self):
                largo = int(self.headers.get("Content-Length", 0))
                cuerpo = json.loads(self.rfile.read(largo).decode("utf-8"))
                servidor.peticiones.append(cuerpo)
                pregunta = next(iter(cuerpo["questions"]))
                if servidor.espera:
                    time.sleep(servidor.espera)
                status, datos = servidor.respuestas.get(pregunta, (200, respuesta(pregunta, "haiku", 0.5)))
                salida = json.dumps(datos).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(salida)))
                self.end_headers()
                try:
                    self.wfile.write(salida)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # el hook ya se rindió por timeout: es lo que la prueba espera

            def log_message(self, *args):
                pass

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
        self.url = "http://127.0.0.1:%d/api/alpha/decisions" % self._httpd.server_address[1]
        self._hilo = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._hilo.start()

    def cerrar(self):
        self._httpd.shutdown()
        self._httpd.server_close()


class RuteoConJev(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="jev-home-")
        self.addCleanup(shutil.rmtree, self.home, True)
        self.servidor = None

    def servir(self, respuestas=None, espera=0.0):
        self.servidor = ServidorJev(respuestas, espera)
        self.addCleanup(self.servidor.cerrar)
        return self.servidor

    def ejecutar(self, model="haiku", effort="medium", description="x", prompt="y",
                 session="sesion-1", clave=CLAVE, url=None, herramienta="Agent"):
        entrada = {"description": description, "prompt": prompt}
        if model is not None:
            entrada["model"] = model
        if effort is not None:
            entrada["effort"] = effort
        if url is None and self.servidor is not None:
            url = self.servidor.url
        datos = {"tool_name": herramienta, "tool_input": entrada, "session_id": session}
        return correr(datos, home=self.home, jev=url, clave=clave)

    def registro(self):
        ruta = Path(self.home, ".claude", "jev", "decisiones.jsonl")
        if not ruta.exists():
            return []
        return [json.loads(l) for l in ruta.read_text(encoding="utf-8").splitlines() if l]

    def linea(self, tipo):
        lineas = [r for r in self.registro() if r["tipo"] == tipo]
        self.assertEqual(len(lineas), 1, "debe haber una línea de %s" % tipo)
        return lineas[0]

    def reescrito(self, salida):
        self.assertTrue(salida, "debe haber salida con updatedInput")
        datos = json.loads(salida)["hookSpecificOutput"]
        self.assertEqual(datos["permissionDecision"], "allow")
        return datos["updatedInput"]

    def test_sharp_reescribe_modelo(self):
        self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.91)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.50))})
        upd = self.reescrito(self.ejecutar(model="haiku", effort="medium"))
        self.assertEqual(upd["model"], "sonnet")
        self.assertEqual(upd["effort"], "medium")
        self.assertEqual(upd["prompt"], "y")
        linea = self.linea("modelo")
        self.assertTrue(linea["aplicada"])
        self.assertTrue(linea["sharp"])
        self.assertEqual(linea["opcion"], "sonnet")
        self.assertEqual(linea["claude"], "haiku")
        self.assertEqual(linea["session_id"], "sesion-1")

    def test_split_respeta_a_claude(self):
        self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.64)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.50))})
        self.assertEqual(self.ejecutar(model="haiku", effort="medium"), "")
        linea = self.linea("modelo")
        self.assertFalse(linea["sharp"])
        self.assertFalse(linea["aplicada"])
        self.assertEqual(linea["opcion"], "sonnet")

    def test_misma_eleccion_no_reescribe(self):
        self.servir({"modelo": (200, respuesta("modelo", "haiku", 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.95))})
        self.assertEqual(self.ejecutar(model="haiku", effort="medium"), "")
        for tipo in ("modelo", "esfuerzo"):
            with self.subTest(tipo=tipo):
                linea = self.linea(tipo)
                self.assertTrue(linea["sharp"])
                self.assertFalse(linea["aplicada"])

    def test_id_completo_de_claude_cuenta_como_la_misma_familia(self):
        self.servir({"modelo": (200, respuesta("modelo", "haiku", 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.50))})
        self.assertEqual(self.ejecutar(model="claude-haiku-5-5", effort="medium"), "")
        self.assertFalse(self.linea("modelo")["aplicada"])

    def test_sin_clave_pasa_y_registra_sin_respuesta(self):
        self.assertEqual(self.ejecutar(clave=None, url="http://127.0.0.1:1/x"), "")
        for tipo in ("modelo", "esfuerzo"):
            with self.subTest(tipo=tipo):
                linea = self.linea(tipo)
                self.assertIsNone(linea["opcion"])
                self.assertEqual(linea["motivo"], "sin respuesta")
                self.assertFalse(linea["aplicada"])

    def test_jev_caido_no_bloquea(self):
        servidor = self.servir()
        url = servidor.url
        servidor.cerrar()
        inicio = time.monotonic()
        salida = self.ejecutar(url=url)
        self.assertLess(time.monotonic() - inicio, 3.0)
        self.assertEqual(salida, "")
        self.assertEqual(self.linea("modelo")["motivo"], "sin respuesta")

    def test_jev_lento_se_corta_a_tiempo(self):
        self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.99)),
                     "esfuerzo": (200, respuesta("esfuerzo", "high", 0.99))}, espera=6.0)
        inicio = time.monotonic()
        salida = self.ejecutar()
        self.assertLess(time.monotonic() - inicio, 4.5)
        self.assertEqual(salida, "")
        self.assertEqual(self.linea("modelo")["motivo"], "sin respuesta")

    def test_encargo_no_se_registra(self):
        servidor = self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.91)),
                                "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.50))})
        self.ejecutar(prompt="contexto " + ENCARGO_SECRETO)
        self.assertIn(ENCARGO_SECRETO, json.dumps(servidor.peticiones))
        ruta = Path(self.home, ".claude", "jev", "decisiones.jsonl")
        self.assertNotIn(ENCARGO_SECRETO, ruta.read_text(encoding="utf-8"))

    def test_jev_recibe_descripcion_mas_encargo_completo(self):
        servidor = self.servir()
        self.ejecutar(description="Buscar fallos", prompt="cuerpo " + "z" * 500)
        self.assertEqual(len(servidor.peticiones), 2)
        preguntas = sorted(next(iter(p["questions"])) for p in servidor.peticiones)
        self.assertEqual(preguntas, ["esfuerzo", "modelo"])
        for p in servidor.peticiones:
            self.assertEqual(p["state"]["encargo"], "Buscar fallos\n\ncuerpo " + "z" * 500)

    def test_descripcion_se_recorta_a_60(self):
        self.servir({"modelo": (200, respuesta("modelo", "haiku", 0.5)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.5))})
        self.ejecutar(description="d" * 100)
        self.assertEqual(self.linea("modelo")["descripcion"], "d" * 60)

    def test_claude_pide_fable_sigue_bloqueado(self):
        servidor = self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.99)),
                                "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.99))})
        self.assertTrue(negado(self.ejecutar("fable")))
        self.assertEqual(servidor.peticiones, [])

    def test_sin_model_no_consulta_a_jev(self):
        servidor = self.servir()
        self.assertTrue(negado(self.ejecutar(model=None)))
        self.assertEqual(servidor.peticiones, [])

    def test_respuesta_rara_y_402_son_sin_respuesta(self):
        self.servir({"modelo": (200, respuesta("modelo", "fable", 0.99)),
                     "esfuerzo": (402, {"error": "sin saldo"})})
        self.assertEqual(self.ejecutar(model="haiku", effort="medium"), "")
        for tipo in ("modelo", "esfuerzo"):
            with self.subTest(tipo=tipo):
                self.assertEqual(self.linea(tipo)["motivo"], "sin respuesta")

    def test_task_tambien_se_rutea(self):
        self.servir({"modelo": (200, respuesta("modelo", "opus", 0.90)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.50))})
        upd = self.reescrito(self.ejecutar(model="haiku", effort="medium", herramienta="Task"))
        self.assertEqual(upd["model"], "opus")

    def test_workflow_no_se_rutea_con_jev(self):
        servidor = self.servir({"modelo": (200, respuesta("modelo", "opus", 0.99)),
                                "esfuerzo": (200, respuesta("esfuerzo", "high", 0.99))})
        guion = "agent('a', {model: 'sonnet', effort: 'high'})"
        salida = correr({"tool_name": "Workflow", "tool_input": {"script": guion}},
                        home=self.home, jev=servidor.url, clave=CLAVE)
        self.assertEqual(salida, "")
        self.assertEqual(servidor.peticiones, [])

    def test_sin_modulo_jev_sigue_como_antes(self):
        carpeta = tempfile.mkdtemp(prefix="hook-sin-jev-")
        self.addCleanup(shutil.rmtree, carpeta, True)
        copia = Path(carpeta, "guard-subagentes.py")
        copia.write_text(HOOK.read_text(encoding="utf-8"), encoding="utf-8")
        entrada = {"tool_name": "Agent", "tool_input": {"model": "haiku", "effort": "medium"}}
        entorno = {k: v for k, v in os.environ.items() if k not in ("OPENROUTER_API_KEY", "JEV_URL", "HOME")}
        entorno["HOME"] = self.home
        r = subprocess.run([sys.executable, str(copia)], input=json.dumps(entrada).encode("utf-8"),
                           capture_output=True, timeout=30, env=entorno)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout.decode("utf-8").strip(), "")
        self.assertFalse(Path(self.home, ".claude", "jev", "decisiones.jsonl").exists())


if __name__ == "__main__":
    unittest.main()

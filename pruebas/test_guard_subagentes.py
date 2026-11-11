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
    entorno = {k: v for k, v in os.environ.items()
               if k not in ("OPENROUTER_API_KEY", "JEV_URL", "HOME", "ANTHROPIC_MODEL")}
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
        for modelo in ("gpt-5", "claude-instant", "claude-fablexyz"):
            with self.subTest(modelo=modelo):
                self.assertTrue(negado(correr(agente(modelo, "medium"))))

    def test_max_se_bloquea(self):
        self.assertTrue(negado(correr(agente("haiku", "max"))))

    def test_sonnet_alto_pasa(self):
        self.assertEqual(correr(agente("sonnet", "high")), "")

    def test_opus_medio_pasa(self):
        self.assertEqual(correr(agente("claude-opus-5-5", "medium")), "")

    def test_prefijo_de_familia_sin_guion_se_bloquea(self):
        self.assertTrue(negado(correr(agente("claude-opusxyz", "medium"))))
        self.assertTrue(negado(correr(agente("claude-haikuo", "medium"))))

    def test_xhigh_ya_no_se_bloquea(self):
        # sin limites.json no hay dato: el tope libre es opus/high, así que xhigh baja a high
        salida = json.loads(correr(agente("opus", "xhigh")))["hookSpecificOutput"]
        self.assertEqual(salida["permissionDecision"], "allow")
        self.assertEqual(salida["updatedInput"]["effort"], "high")

    def test_fable_sin_dato_de_uso_baja_a_opus(self):
        # Fable ya no se bloquea en Agent / Task, pero exige conocer el uso de la cuenta.
        for modelo in ("fable", "claude-fable-5-2"):
            with self.subTest(modelo=modelo):
                salida = json.loads(correr(agente(modelo, "low")))["hookSpecificOutput"]
                self.assertEqual(salida["permissionDecision"], "allow")
                self.assertEqual(salida["updatedInput"]["model"], "opus")
                self.assertEqual(salida["updatedInput"]["effort"], "low")

    def test_workflow_sonnet_pasa(self):
        guion = "agent('a', {model: 'sonnet', effort: 'high'})"
        self.assertEqual(correr({"tool_name": "Workflow", "tool_input": {"script": guion}}), "")

    def test_sin_modelo_se_bloquea(self):
        self.assertTrue(negado(correr(agente(None, "medium"))))

    def test_sin_esfuerzo_se_bloquea(self):
        self.assertTrue(negado(correr(agente("haiku", None))))

    def test_task_tambien_se_revisa(self):
        self.assertTrue(negado(correr(agente("gpt-5", "medium", herramienta="Task"))))

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

    def test_script_con_fable_se_bloquea(self):
        # Un workflow no se puede bajar con el tope: ahí Fable sigue prohibido.
        guion = "await agent('x', {model: '%s', effort: 'medium'})" % "fable"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_script_con_esfuerzo_alto_se_bloquea(self):
        guion = "await agent('x', {model: 'haiku', effort: 'xhigh'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_script_sin_modelo_se_bloquea(self):
        guion = "await agent('x', {effort: 'medium'})"
        self.assertTrue(negado(correr(self.workflow(guion))))


    # --- comentarios: un model en un comentario no cuenta ---

    def test_model_en_comentario_de_linea_no_cuenta(self):
        guion = "// ejemplo: model: 'haiku'\nawait agent('x', {effort: 'medium'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_model_en_comentario_de_bloque_no_cuenta(self):
        guion = "/* model: 'sonnet' */\nawait agent('x', {effort: 'low'})"
        self.assertTrue(negado(correr(self.workflow(guion))))

    def test_barras_dentro_de_un_texto_no_son_comentario(self):
        guion = "await agent('lee https://x.y/z', {model: 'haiku', effort: 'low'})"
        self.assertEqual(correr(self.workflow(guion)), "")

    def test_modelo_prohibido_en_comentario_no_bloquea_aqui(self):
        guion = "// antes: model: 'gpt-5'\nawait agent('x', {model: 'haiku', effort: 'low'})"
        self.assertEqual(correr(self.workflow(guion)), "")

    # --- scriptPath: el archivo se revisa igual que el script en línea ---

    def guion_en_archivo(self, contenido):
        carpeta = tempfile.mkdtemp(prefix="guion-")
        self.addCleanup(shutil.rmtree, carpeta, True)
        ruta = Path(carpeta, "flujo.js")
        ruta.write_text(contenido, encoding="utf-8")
        return {"tool_name": "Workflow", "tool_input": {"scriptPath": str(ruta)}}

    def test_script_path_con_otro_modelo_se_bloquea(self):
        entrada = self.guion_en_archivo("await agent('x', {model: 'gpt-5', effort: 'low'})")
        self.assertTrue(negado(correr(entrada)))

    def test_script_path_sin_modelo_se_bloquea(self):
        self.assertTrue(negado(correr(self.guion_en_archivo("await agent('x', {effort: 'low'})"))))

    def test_script_path_valido_pasa(self):
        entrada = self.guion_en_archivo("await agent('x', {model: 'sonnet', effort: 'high'})")
        self.assertEqual(correr(entrada), "")

    def test_script_path_ilegible_pasa(self):
        entrada = {"tool_name": "Workflow", "tool_input": {"scriptPath": "/no/existe/flujo.js"}}
        self.assertEqual(correr(entrada), "")


class Forks(unittest.TestCase):
    """Un fork ignora model y effort: hereda el modelo de la sesión."""
    # El nombre va en una constante: guard-fable.py bloquea escribir un archivo que lo fije literal.
    MAS_CAPAZ = "fable"

    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="fork-home-")
        self.addCleanup(shutil.rmtree, self.home, True)

    def ajustes(self, datos):
        carpeta = Path(self.home, ".claude")
        carpeta.mkdir(parents=True, exist_ok=True)
        carpeta.joinpath("settings.json").write_text(json.dumps(datos), encoding="utf-8")

    def fork(self, **extra):
        entrada = {"description": "x", "prompt": "y", "subagent_type": "fork",
                   "model": "haiku", "effort": "low"}
        datos = {"tool_name": "Agent", "tool_input": entrada}
        datos.update(extra)
        return datos

    def test_fork_con_sesion_mas_capaz_en_settings_se_bloquea(self):
        self.ajustes({"model": self.MAS_CAPAZ})
        salida = correr(self.fork(), home=self.home)
        self.assertTrue(negado(salida))
        razon = json.loads(salida)["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("fork", razon)
        self.assertIn("modelo explícito", razon)

    def test_fork_con_id_completo_mas_capaz_se_bloquea(self):
        self.ajustes({"model": "claude-%s-5-1[1m]" % self.MAS_CAPAZ})
        self.assertTrue(negado(correr(self.fork(), home=self.home)))

    def test_fork_con_modelo_en_la_entrada_del_hook_se_bloquea(self):
        self.ajustes({"model": "sonnet"})
        datos = self.fork(model={"id": "claude-%s-5-1" % self.MAS_CAPAZ})
        self.assertTrue(negado(correr(datos, home=self.home)))

    def test_entrada_del_hook_manda_sobre_settings(self):
        self.ajustes({"model": self.MAS_CAPAZ})
        self.assertEqual(correr(self.fork(model="claude-haiku-5-5"), home=self.home), "")

    def test_fork_con_sesion_opus_pasa(self):
        self.ajustes({"model": "opus"})
        self.assertEqual(correr(self.fork(), home=self.home), "")

    def test_fork_sin_saber_el_modelo_pasa(self):
        self.assertEqual(correr(self.fork(), home=self.home), "")

    def test_fork_con_settings_roto_pasa(self):
        Path(self.home, ".claude").mkdir()
        Path(self.home, ".claude", "settings.json").write_text("{roto", encoding="utf-8")
        self.assertEqual(correr(self.fork(), home=self.home), "")

    def test_agente_normal_no_mira_el_modelo_de_la_sesion(self):
        self.ajustes({"model": self.MAS_CAPAZ})
        self.assertEqual(correr(agente("haiku", "low"), home=self.home), "")


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

    def test_modelo_prohibido_no_llega_a_jev(self):
        servidor = self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.99)),
                                "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.99))})
        self.assertTrue(negado(self.ejecutar("gpt-5")))
        self.assertEqual(servidor.peticiones, [])

    def test_jev_tiene_fable_entre_sus_opciones(self):
        servidor = self.servir()
        self.ejecutar()
        self.assertIn("fable", json.dumps(servidor.peticiones))

    def test_sin_model_no_consulta_a_jev(self):
        servidor = self.servir()
        self.assertTrue(negado(self.ejecutar(model=None)))
        self.assertEqual(servidor.peticiones, [])

    def test_respuesta_rara_y_402_son_sin_respuesta(self):
        self.servir({"modelo": (200, respuesta("modelo", "gpt-5", 0.99)),
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


class TopePorLimites(unittest.TestCase):
    """El guardián baja modelo y esfuerzo según ~/.claude/jev/limites.json."""
    ejecutar = RuteoConJev.ejecutar
    servir = RuteoConJev.servir
    registro = RuteoConJev.registro
    reescrito = RuteoConJev.reescrito

    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="tope-home-")
        self.addCleanup(shutil.rmtree, self.home, True)
        self.servidor = None

    def escribir(self, nombre, datos):
        carpeta = Path(self.home, ".claude", "jev")
        carpeta.mkdir(parents=True, exist_ok=True)
        carpeta.joinpath(nombre).write_text(
            datos if isinstance(datos, str) else json.dumps(datos), encoding="utf-8")

    def limites(self, h5=None, semana=None, reinicio_semana=None):
        ahora = time.time()
        datos = {"actualizado": ahora}
        if h5 is not None:
            datos["five_hour"] = {"usado": h5, "reinicio": ahora + 3 * 3600}
        if semana is not None:
            datos["seven_day"] = {"usado": semana, "reinicio": reinicio_semana}
        self.escribir("limites.json", datos)

    def semana_a_mitad(self):
        """Reinicio a 3,5 días y corte 1-2 h antes: el ritmo es ~45 y el corte sigue en el futuro.

        Fija el día y la hora de corte en config.json para no depender del día real.
        """
        import datetime
        reinicio = time.time() + 3.5 * 86400
        corte = datetime.datetime.fromtimestamp(reinicio) - datetime.timedelta(hours=1)
        propios = {"corte_dia": corte.weekday(), "corte_hora": corte.hour}
        self.escribir("config.json", {"limites": propios})
        sys.path.insert(0, str(RAIZ / "claude" / "hooks"))
        import jev_limites
        ahora = time.time()
        ritmo = jev_limites.calcular_tope(
            {"actualizado": ahora, "seven_day": {"usado": 1, "reinicio": reinicio}},
            ahora, {"limites": propios})["semana"]["ritmo"]
        return reinicio, ritmo

    def lineas_tope(self):
        return [r for r in self.registro() if r["tipo"] == "tope"]

    def salida(self, **kw):
        return self.ejecutar(clave=None, url="http://127.0.0.1:1/x", **kw)

    def test_jev_elige_opus_y_la_semana_a_mas_12_lo_baja_a_sonnet(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(semana=ritmo + 12, reinicio_semana=reinicio)
        self.servir({"modelo": (200, respuesta("modelo", "opus", 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.95))})
        upd = self.reescrito(self.ejecutar(model="haiku", effort="medium"))
        self.assertEqual(upd["model"], "sonnet")
        lineas = self.lineas_tope()
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]["opcion"], "sonnet")
        self.assertEqual(lineas[0]["claude"], "opus")
        self.assertTrue(lineas[0]["aplicada"])
        self.assertIn("tope semana", lineas[0]["motivo"])
        self.assertEqual(lineas[0]["session_id"], "sesion-1")

    def test_claude_pide_opus_a_mano_con_5h_al_90_baja_a_haiku_medium(self):
        self.limites(h5=90)
        upd = self.reescrito(self.salida(model="opus", effort="high"))
        self.assertEqual((upd["model"], upd["effort"]), ("haiku", "medium"))
        linea = self.lineas_tope()[0]
        self.assertEqual((linea["opcion"], linea["claude"]), ("haiku", "opus"))
        self.assertIn("tope 5h", linea["motivo"])

    def test_5h_al_78_baja_opus_alto_a_sonnet_medium(self):
        self.limites(h5=78)
        upd = self.reescrito(self.salida(model="opus", effort="high"))
        self.assertEqual((upd["model"], upd["effort"]), ("sonnet", "medium"))

    def test_claude_ya_eligio_menos_que_el_tope_no_toca_ni_registra(self):
        self.limites(h5=78)  # tope sonnet/medium
        self.assertEqual(self.salida(model="haiku", effort="medium"), "")
        self.assertEqual(self.lineas_tope(), [])

    def test_sin_limites_json_es_igual_que_antes(self):
        self.assertEqual(self.salida(model="opus", effort="high"), "")
        self.assertEqual(self.lineas_tope(), [])

    def test_limites_roto_es_sin_tope(self):
        self.escribir("limites.json", '{"actualizado": ')
        self.assertEqual(self.salida(model="opus", effort="high"), "")

    def test_modelo_prohibido_sigue_bloqueado_con_tope(self):
        self.limites(h5=10)
        prohibido = "gpt-5"
        self.assertTrue(negado(self.salida(model=prohibido, effort="low")))
        self.assertEqual(self.lineas_tope(), [])

    def test_max_sigue_bloqueado(self):
        self.limites(h5=10)
        self.assertTrue(negado(self.salida(model="opus", effort="max")))

    def test_xhigh_con_5h_al_70_baja_a_medium(self):
        self.limites(h5=70)
        upd = self.reescrito(self.salida(model="opus", effort="xhigh"))
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "medium"))
        self.assertEqual(len(self.lineas_tope()), 1)

    def test_xhigh_con_limites_vacio_baja_a_high(self):
        self.escribir("limites.json", {})
        upd = self.reescrito(self.salida(model="opus", effort="xhigh"))
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "high"))

    def test_xhigh_sin_limites_json_baja_a_high(self):
        upd = self.reescrito(self.salida(model="opus", effort="xhigh"))
        self.assertEqual(upd["effort"], "high")

    def test_xhigh_pasa_si_las_dos_ventanas_lo_permiten(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(h5=10, semana=max(0.0, ritmo - 15), reinicio_semana=reinicio)
        self.assertEqual(self.salida(model="opus", effort="xhigh"), "")
        self.assertEqual(self.lineas_tope(), [])

    # --- Fable: solo con mucho margen de uso ---
    # El nombre va en una constante: guard-fable.py bloquea escribir un archivo que lo fije literal.
    MAS_CAPAZ = "fable"

    def test_fable_pasa_con_la_semana_muy_por_debajo_del_ritmo(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(semana=max(0.0, ritmo - 30), reinicio_semana=reinicio)
        self.assertEqual(self.salida(model=self.MAS_CAPAZ, effort="xhigh"), "")
        self.assertEqual(self.lineas_tope(), [])

    def test_fable_baja_a_opus_si_el_margen_no_alcanza(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(semana=ritmo - 15, reinicio_semana=reinicio)
        upd = self.reescrito(self.salida(model=self.MAS_CAPAZ, effort="xhigh"))
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "xhigh"))
        linea = self.lineas_tope()[0]
        self.assertEqual((linea["opcion"], linea["claude"]), ("opus", "fable"))
        self.assertIn("fable → opus", linea["motivo"])

    def test_fable_con_poco_credito_baja_a_sonnet(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(semana=ritmo + 12, reinicio_semana=reinicio)
        upd = self.reescrito(self.salida(model=self.MAS_CAPAZ, effort="xhigh"))
        self.assertEqual((upd["model"], upd["effort"]), ("sonnet", "high"))

    def test_jev_elige_fable_y_pasa_si_hay_margen(self):
        reinicio, ritmo = self.semana_a_mitad()
        self.limites(semana=max(0.0, ritmo - 30), reinicio_semana=reinicio)
        self.servir({"modelo": (200, respuesta("modelo", self.MAS_CAPAZ, 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "xhigh", 0.95))})
        upd = self.reescrito(self.ejecutar(model="sonnet", effort="medium"))
        self.assertEqual((upd["model"], upd["effort"]), ("fable", "xhigh"))

    def test_fable_baja_a_opus_si_el_modulo_de_topes_no_importa(self):
        salida = self.correr_con_limites_roto("raise ImportError('roto')\n", modelo=self.MAS_CAPAZ)
        upd = self.reescrito(salida)
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "high"))

    def test_semana_al_99_antes_del_corte_baja_a_haiku(self):
        reinicio, _ = self.semana_a_mitad()
        self.limites(semana=99, reinicio_semana=reinicio)
        upd = self.reescrito(self.salida(model="sonnet", effort="high"))
        self.assertEqual((upd["model"], upd["effort"]), ("haiku", "medium"))

    def test_jev_puede_elegir_xhigh_y_el_tope_lo_baja(self):
        servidor = self.servir({"modelo": (200, respuesta("modelo", "opus", 0.95)),
                                "esfuerzo": (200, respuesta("esfuerzo", "xhigh", 0.95))})
        self.limites(h5=70)
        upd = self.reescrito(self.ejecutar(model="opus", effort="high"))
        self.assertEqual(upd["effort"], "medium")
        self.assertIn("xhigh", json.dumps(servidor.peticiones))


    # --- el texto del allow dice quién ajustó ---

    def razon(self, salida):
        return json.loads(salida)["hookSpecificOutput"]["permissionDecisionReason"]

    def test_razon_solo_jev(self):
        self.servir({"modelo": (200, respuesta("modelo", "sonnet", 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.95))})
        salida = self.ejecutar(model="haiku", effort="medium")
        self.assertEqual(self.razon(salida), "Jev ajustó el modelo o el esfuerzo del agente.")

    def test_razon_solo_tope(self):
        self.limites(h5=90)
        salida = self.salida(model="opus", effort="high")
        self.assertEqual(self.razon(salida), "Tope de uso ajustó el modelo o el esfuerzo del agente.")

    def test_razon_jev_y_tope(self):
        self.limites(h5=78)  # tope sonnet/medium
        self.servir({"modelo": (200, respuesta("modelo", "opus", 0.95)),
                     "esfuerzo": (200, respuesta("esfuerzo", "medium", 0.95))})
        salida = self.ejecutar(model="haiku", effort="medium")
        self.assertEqual(self.reescrito(salida)["model"], "sonnet")
        self.assertEqual(self.razon(salida),
                         "Jev y el tope de uso ajustaron el modelo o el esfuerzo del agente.")

    # --- si fallan los topes, xhigh baja a high ---

    def correr_con_limites_roto(self, codigo, effort="xhigh", modelo="opus"):
        """Copia el guardián a una carpeta con un jev_limites.py roto y lo corre."""
        carpeta = tempfile.mkdtemp(prefix="hooks-rotos-")
        self.addCleanup(shutil.rmtree, carpeta, True)
        hooks = RAIZ / "claude" / "hooks"
        for nombre in ("guard-subagentes.py", "jev_cliente.py"):
            shutil.copy(str(hooks / nombre), carpeta)
        Path(carpeta, "jev_limites.py").write_text(codigo, encoding="utf-8")
        entorno = {k: v for k, v in os.environ.items()
                   if k not in ("OPENROUTER_API_KEY", "JEV_URL", "HOME")}
        entorno["HOME"] = self.home
        entrada = agente(modelo, effort)
        r = subprocess.run([sys.executable, str(Path(carpeta, "guard-subagentes.py"))],
                           input=json.dumps(entrada).encode("utf-8"),
                           capture_output=True, timeout=30, env=entorno)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.decode("utf-8").strip()

    def test_xhigh_baja_a_high_si_el_modulo_de_topes_no_importa(self):
        salida = self.correr_con_limites_roto("raise ImportError('roto')\n")
        upd = self.reescrito(salida)
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "high"))
        self.assertNotEqual(json.loads(salida)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_xhigh_baja_a_high_si_el_calculo_del_tope_falla(self):
        codigo = "def leer_limites(home, ahora):\n    raise RuntimeError('roto')\n"
        upd = self.reescrito(self.correr_con_limites_roto(codigo))
        self.assertEqual((upd["model"], upd["effort"]), ("opus", "high"))

    def test_high_sigue_igual_si_el_modulo_de_topes_no_importa(self):
        self.assertEqual(self.correr_con_limites_roto("raise ImportError('roto')\n", "high"), "")


if __name__ == "__main__":
    unittest.main()

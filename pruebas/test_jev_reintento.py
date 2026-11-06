"""claude/hooks/jev-reintento.py: ante el mismo error dos veces seguidas, pregunta a Jev.

Las pruebas nunca tocan la red real: usan un servidor falso en 127.0.0.1, un HOME temporal
y JEV_URL apuntando al servidor falso.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "jev-reintento.py"


def cargar_hook():
    """Carga el hook como módulo; perezoso para que cada prueba falle por su cuenta."""
    spec = importlib.util.spec_from_file_location("jev_reintento", HOOK)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo

CLAVE = "clave-falsa-solo-para-pruebas"
SECRETO_ERROR = "SECRETO-ERROR-XYZ"


def correr(entrada, home, jev=None, clave=CLAVE, crudo=None):
    datos = crudo if crudo is not None else json.dumps(entrada)
    entorno = {k: v for k, v in os.environ.items() if k not in ("OPENROUTER_API_KEY", "JEV_URL", "HOME")}
    entorno["HOME"] = home
    if jev:
        entorno["JEV_URL"] = jev
    if clave:
        entorno["OPENROUTER_API_KEY"] = clave
    r = subprocess.run([sys.executable, str(HOOK)], input=datos.encode("utf-8"),
                       capture_output=True, timeout=30, env=entorno)
    assert r.returncode == 0, r.stderr
    return r.stdout.decode("utf-8").strip()


def respuesta(pregunta, eleccion, confianza):
    return {"answers": {pregunta: {
        "type": "choice",
        "choice": eleccion,
        "confidence": confianza,
        "probabilities": {eleccion: confianza},
    }}, "usage": {"cost": 0.00002}}


class ServidorJev:
    """Servidor falso en 127.0.0.1. Responde según la pregunta que llegue en `questions`."""

    def __init__(self, respuestas=None):
        self.respuestas = respuestas or {}
        self.peticiones = []
        servidor = self

        class Manejador(BaseHTTPRequestHandler):
            def do_POST(self):
                largo = int(self.headers.get("Content-Length", 0))
                cuerpo = json.loads(self.rfile.read(largo).decode("utf-8"))
                servidor.peticiones.append(cuerpo)
                pregunta = next(iter(cuerpo["questions"]))
                status, datos = servidor.respuestas.get(pregunta, (200, respuesta(pregunta, "reintentar", 0.5)))
                salida = json.dumps(datos).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(salida)))
                self.end_headers()
                self.wfile.write(salida)

            def log_message(self, *args):
                pass

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Manejador)
        self.url = "http://127.0.0.1:%d/api/alpha/decisions" % self._httpd.server_address[1]
        self._hilo = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._hilo.start()

    def cerrar(self):
        self._httpd.shutdown()
        self._httpd.server_close()


def fallo(herramienta="Bash", error="Error: no existe /ruta/de/prueba/a.txt linea 3",
          session="sesion-1", interrumpido=False):
    return {"hook_event_name": "PostToolUseFailure", "session_id": session, "cwd": "/ruta/de/prueba",
            "tool_name": herramienta, "tool_input": {"command": "ls"}, "tool_use_id": "toolu_1",
            "error": error, "is_interrupt": interrumpido, "duration_ms": 12, "effort": "medium"}


def exito(herramienta="Bash", session="sesion-1"):
    return {"hook_event_name": "PostToolUse", "session_id": session, "cwd": "/ruta/de/prueba",
            "tool_name": herramienta, "tool_input": {"command": "ls"}, "tool_use_id": "toolu_2",
            "tool_response": {"stdout": "ok"}}


class Normalizar(unittest.TestCase):
    def test_normalizar_quita_rutas_y_numeros(self):
        texto = "Error en /ruta/de/prueba/a.py linea 42 y C:\\carpeta\\b.txt el 2026-11-06T10:20:30Z"
        resultado = cargar_hook().normalizar_error(texto)
        self.assertNotIn("/ruta", resultado)
        self.assertNotIn("C:\\", resultado)
        self.assertNotIn("2026", resultado)
        self.assertFalse(any(c.isdigit() for c in resultado), resultado)
        self.assertIn("Error en", resultado)
        self.assertIn("linea", resultado)

    def test_normalizar_colapsa_espacios_y_recorta_a_200(self):
        modulo = cargar_hook()
        self.assertEqual(modulo.normalizar_error("a   b\n\tc"), "a b c")
        self.assertLessEqual(len(modulo.normalizar_error("palabra " * 300)), 200)


class ReintentoConJev(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="reintento-home-")
        self.addCleanup(shutil.rmtree, self.home, True)
        self.servidor = None

    def servir(self, respuestas=None):
        self.servidor = ServidorJev(respuestas)
        self.addCleanup(self.servidor.cerrar)
        return self.servidor

    def correr(self, entrada, jev=None, clave=CLAVE):
        if jev is None and self.servidor is not None:
            jev = self.servidor.url
        return correr(entrada, self.home, jev=jev, clave=clave)

    def estado(self):
        ruta = Path(self.home, ".claude", "jev", "estado.json")
        return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}

    def registro(self):
        ruta = Path(self.home, ".claude", "jev", "decisiones.jsonl")
        if not ruta.exists():
            return []
        return [json.loads(l) for l in ruta.read_text(encoding="utf-8").splitlines() if l]

    def nota(self, salida):
        self.assertTrue(salida, "debe haber una nota para Claude")
        datos = json.loads(salida)["hookSpecificOutput"]
        self.assertEqual(datos["hookEventName"], "PostToolUseFailure")
        return datos["additionalContext"]

    def test_primer_fallo_no_pregunta(self):
        servidor = self.servir()
        self.assertEqual(self.correr(fallo()), "")
        self.assertEqual(servidor.peticiones, [])
        estado = self.estado()["sesion-1"]
        self.assertEqual(estado["herramienta"], "Bash")
        self.assertEqual(estado["cuenta"], 1)
        self.assertIn("error_normal", estado)

    def test_segundo_igual_pregunta_y_da_nota(self):
        servidor = self.servir({"reintento": (200, respuesta("reintento", "parar_y_preguntar", 0.88))})
        error = "Error: " + "relleno de texto " * 5 + SECRETO_ERROR + " /ruta/de/prueba/a.txt"
        self.correr(fallo(error=error))
        salida = self.correr(fallo(error=error))
        self.assertEqual(self.nota(salida),
                         "Jev (p=0,88): parar y preguntar al usuario. Mismo error dos veces en Bash.")
        self.assertEqual(len(servidor.peticiones), 1)
        self.assertEqual(next(iter(servidor.peticiones[0]["questions"])), "reintento")
        self.assertIn("Bash", servidor.peticiones[0]["state"]["encargo"])
        self.assertIn(SECRETO_ERROR, servidor.peticiones[0]["state"]["encargo"])
        lineas = self.registro()
        self.assertEqual(len(lineas), 1)
        linea = lineas[0]
        self.assertEqual(linea["tipo"], "reintento")
        self.assertEqual(linea["session_id"], "sesion-1")
        self.assertEqual(linea["descripcion"], "Bash")
        self.assertTrue(linea["sharp"])
        self.assertNotIn(SECRETO_ERROR, Path(self.home, ".claude", "jev", "decisiones.jsonl").read_text(encoding="utf-8"))
        self.assertLessEqual(len(linea["error"]), 60)

    def test_split_da_nota_suave(self):
        self.servir({"reintento": (200, respuesta("reintento", "cambiar_enfoque", 0.61))})
        self.correr(fallo())
        salida = self.correr(fallo())
        self.assertEqual(self.nota(salida),
                         "Jev sugiere (p=0,61): cambiar de enfoque. Mismo error dos veces en Bash.")
        self.assertFalse(self.registro()[0]["sharp"])

    def test_exito_reinicia(self):
        servidor = self.servir({"reintento": (200, respuesta("reintento", "parar_y_preguntar", 0.99))})
        self.correr(fallo())
        self.assertEqual(self.correr(exito()), "")
        self.assertEqual(self.estado()["sesion-1"]["cuenta"], 0)
        self.assertEqual(self.correr(fallo()), "")
        self.assertEqual(servidor.peticiones, [])

    def test_errores_distintos_no_cuentan(self):
        servidor = self.servir({"reintento": (200, respuesta("reintento", "parar_y_preguntar", 0.99))})
        self.correr(fallo(error="Error: uno"))
        self.assertEqual(self.correr(fallo(error="Error: otro")), "")
        self.correr(fallo(herramienta="Read", error="Error: otro"))
        self.assertEqual(self.correr(fallo(herramienta="Bash", error="Error: uno")), "")
        self.assertEqual(servidor.peticiones, [])

    def test_sesiones_separadas(self):
        servidor = self.servir({"reintento": (200, respuesta("reintento", "parar_y_preguntar", 0.99))})
        self.correr(fallo(session="sesion-1"))
        self.assertEqual(self.correr(fallo(session="sesion-2")), "")
        self.assertEqual(servidor.peticiones, [])
        self.correr(fallo(session="sesion-1"))
        self.assertEqual(len(servidor.peticiones), 1)
        self.assertEqual(self.registro()[0]["session_id"], "sesion-1")

    def test_jev_caido_sin_nota(self):
        for nombre, respuestas, url, clave in (
            ("402", {"reintento": (402, {"error": "sin saldo"})}, None, CLAVE),
            ("conexion rechazada", None, "http://127.0.0.1:1/x", CLAVE),
            ("sin clave", None, "http://127.0.0.1:1/x", None),
        ):
            with self.subTest(caso=nombre):
                if respuestas is not None:
                    self.servir(respuestas)
                else:
                    self.servidor = None
                self.correr(fallo(session="s-" + nombre), jev=url, clave=clave)
                salida = self.correr(fallo(session="s-" + nombre), jev=url, clave=clave)
                self.assertEqual(salida, "")
                self.assertEqual(self.registro()[-1]["motivo"], "sin respuesta")

    def test_interrupcion_se_ignora(self):
        servidor = self.servir({"reintento": (200, respuesta("reintento", "parar_y_preguntar", 0.99))})
        self.assertEqual(self.correr(fallo(interrumpido=True)), "")
        self.assertEqual(self.correr(fallo(interrumpido=True)), "")
        self.assertEqual(self.correr(fallo()), "")
        self.assertEqual(servidor.peticiones, [])

    def test_entrada_rota_no_bloquea(self):
        self.assertEqual(correr(None, self.home, crudo="esto no es json"), "")


if __name__ == "__main__":
    unittest.main()

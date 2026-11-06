"""claude/hooks/jev_cliente.py: cliente de la Decisions API de OpenRouter (Jev) con registro local.

Las pruebas nunca tocan la red real: usan un servidor falso en 127.0.0.1 (puerto libre),
un HOME temporal y JEV_URL apuntando al servidor falso.
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "claude" / "hooks"))

import jev_cliente  # noqa: E402

CLAVE = "clave-falsa-solo-para-pruebas"
PREGUNTA = "modelo"
OPCIONES = ["haiku", "sonnet", "opus"]


class ServidorFalso:
    """Servidor HTTP de juguete en 127.0.0.1 que responde lo que se le indique."""

    def __init__(self, status=200, cuerpo=None, espera=0.0):
        self.status = status
        self.cuerpo = cuerpo if cuerpo is not None else {}
        self.espera = espera
        self.peticiones = []
        servidor = self

        class Manejador(BaseHTTPRequestHandler):
            def do_POST(self):
                largo = int(self.headers.get("Content-Length", 0))
                crudo = self.rfile.read(largo)
                servidor.peticiones.append({
                    "ruta": self.path,
                    "cabeceras": dict(self.headers),
                    "cuerpo": json.loads(crudo.decode("utf-8")),
                })
                if servidor.espera:
                    time.sleep(servidor.espera)
                datos = servidor.cuerpo
                crudo_salida = datos if isinstance(datos, bytes) else json.dumps(datos).encode("utf-8")
                self.send_response(servidor.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(crudo_salida)))
                self.end_headers()
                self.wfile.write(crudo_salida)

            def log_message(self, *args):
                pass

        self._httpd = HTTPServer(("127.0.0.1", 0), Manejador)
        self._httpd.daemon_threads = True
        self.url = "http://127.0.0.1:%d/api/alpha/decisions" % self._httpd.server_address[1]
        self._hilo = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._hilo.start()

    def cerrar(self):
        self._httpd.shutdown()
        self._httpd.server_close()
        self._hilo.join(timeout=5)


def respuesta_choice(eleccion="sonnet", confianza=0.85, costo=0.00002):
    return {
        "answers": {PREGUNTA: {
            "type": "choice",
            "choice": eleccion,
            "confidence": confianza,
            "probabilities": {"haiku": 0.05, "sonnet": 0.9, "opus": 0.05},
        }},
        "model": "typesafe/jev-1.14",
        "provider": "TypeSafe",
        "usage": {"cost": costo, "input_tokens": 476, "output_tokens": 70},
    }


class JevBase(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.servidor = None
        self._env_previo = os.environ.get("JEV_URL")
        self._env_clave_previa = os.environ.pop(jev_cliente.VARIABLE_CLAVE, None)
        self.config = jev_cliente.cargar_config(self.home)

    def tearDown(self):
        if self.servidor is not None:
            self.servidor.cerrar()
        if self._env_previo is None:
            os.environ.pop("JEV_URL", None)
        else:
            os.environ["JEV_URL"] = self._env_previo
        if self._env_clave_previa is not None:
            os.environ[jev_cliente.VARIABLE_CLAVE] = self._env_clave_previa
        shutil.rmtree(self.home, ignore_errors=True)

    def servir(self, **kwargs):
        self.servidor = ServidorFalso(**kwargs)
        os.environ["JEV_URL"] = self.servidor.url
        return self.servidor

    def decidir(self, texto="tarea de prueba", clave=CLAVE):
        return jev_cliente.decidir(PREGUNTA, texto, OPCIONES, self.config, clave)


class ClaveYConfiguracion(JevBase):
    def test_clave_de_entorno_gana(self):
        ruta = Path(self.home, ".claude", "jev")
        ruta.mkdir(parents=True)
        clave_archivo = ruta / "clave"
        clave_archivo.write_text("clave-del-archivo\n", encoding="utf-8")
        os.chmod(clave_archivo, 0o600)
        entorno = {jev_cliente.VARIABLE_CLAVE: "clave-del-entorno"}
        self.assertEqual(jev_cliente.leer_clave(self.home, entorno), "clave-del-entorno")

    def test_clave_de_archivo_solo_con_600(self):
        ruta = Path(self.home, ".claude", "jev")
        ruta.mkdir(parents=True)
        clave_archivo = ruta / "clave"
        clave_archivo.write_text("clave-del-archivo\n", encoding="utf-8")
        os.chmod(clave_archivo, 0o644)
        self.assertIsNone(jev_cliente.leer_clave(self.home, {}))
        os.chmod(clave_archivo, 0o600)
        self.assertEqual(jev_cliente.leer_clave(self.home, {}), "clave-del-archivo")

    def test_sin_clave_es_none(self):
        self.assertIsNone(jev_cliente.leer_clave(self.home, {}))

    def test_config_trae_valores_por_defecto(self):
        self.assertEqual(self.config["umbral"], 0.80)
        self.assertEqual(self.config["timeout"], 2.0)
        self.assertEqual(self.config["modelo_jev"], "typesafe/jev-1.14")
        self.assertEqual(self.config["url"], "https://openrouter.ai/api/alpha/decisions")
        self.assertEqual(set(self.config["definiciones"]), {"modelo", "esfuerzo", "reintento"})
        self.assertEqual(set(self.config["definiciones"]["modelo"]), set(OPCIONES))

    def test_config_del_usuario_se_mezcla(self):
        ruta = Path(self.home, ".claude", "jev")
        ruta.mkdir(parents=True)
        (ruta / "config.json").write_text(json.dumps({"umbral": 0.9, "timeout": 1.5}),
                                          encoding="utf-8")
        config = jev_cliente.cargar_config(self.home)
        self.assertEqual(config["umbral"], 0.9)
        self.assertEqual(config["timeout"], 1.5)
        self.assertEqual(config["modelo_jev"], "typesafe/jev-1.14")

    def test_config_del_usuario_rota_se_ignora(self):
        ruta = Path(self.home, ".claude", "jev")
        ruta.mkdir(parents=True)
        (ruta / "config.json").write_text("{no es json", encoding="utf-8")
        self.assertEqual(jev_cliente.cargar_config(self.home)["umbral"], 0.80)


class Decidir(JevBase):
    def test_decide_lee_respuesta(self):
        self.servir(cuerpo=respuesta_choice("sonnet", 0.85, 0.00002))
        d = self.decidir()
        self.assertIsNotNone(d)
        self.assertEqual(d["opcion"], "sonnet")
        self.assertEqual(d["confianza"], 0.85)
        self.assertEqual(d["probabilidades"]["sonnet"], 0.9)
        self.assertEqual(d["costo"], 0.00002)
        self.assertIsInstance(d["latencia_ms"], int)
        self.assertGreaterEqual(d["latencia_ms"], 0)

    def test_peticion_tiene_forma_de_choice(self):
        srv = self.servir(cuerpo=respuesta_choice())
        self.decidir("Arreglar el parser")
        self.assertEqual(len(srv.peticiones), 1)
        peticion = srv.peticiones[0]
        self.assertEqual(peticion["ruta"], "/api/alpha/decisions")
        self.assertEqual(peticion["cabeceras"]["Authorization"], "Bearer " + CLAVE)
        cuerpo = peticion["cuerpo"]
        self.assertEqual(cuerpo["model"], "typesafe/jev-1.14")
        pregunta = cuerpo["questions"][PREGUNTA]
        self.assertEqual(pregunta["type"], "choice")
        self.assertIsInstance(pregunta["criteria"], dict)
        self.assertEqual(set(pregunta["criteria"]), set(OPCIONES))
        self.assertIn("Arreglar el parser", json.dumps(cuerpo["state"], ensure_ascii=False))

    def test_respuesta_rara_es_sin_respuesta(self):
        casos = [
            ("json_sin_campos", 200, {}),
            ("opcion_fuera_de_lista", 200, respuesta_choice("fable")),
            ("sin_confianza_ni_probabilidad", 200, {"answers": {PREGUNTA: {
                "type": "choice", "choice": "sonnet"}}}),
            ("http_402", 402, {"error": "sin creditos"}),
            ("http_429", 429, {"error": "limite"}),
            ("http_500", 500, {"error": "fallo"}),
            ("no_es_json", 200, b"<html>oops</html>"),
        ]
        for nombre, status, cuerpo in casos:
            with self.subTest(caso=nombre):
                self.servir(status=status, cuerpo=cuerpo)
                self.assertIsNone(self.decidir())
                self.servidor.cerrar()
                self.servidor = None

    def test_confianza_cae_a_probabilidad_si_no_viene(self):
        cuerpo = respuesta_choice()
        del cuerpo["answers"][PREGUNTA]["confidence"]
        self.servir(cuerpo=cuerpo)
        d = self.decidir()
        self.assertEqual(d["opcion"], "sonnet")
        self.assertEqual(d["confianza"], 0.9)

    def test_timeout_es_sin_respuesta(self):
        self.servir(cuerpo=respuesta_choice(), espera=3)
        self.config["timeout"] = 0.5
        inicio = time.monotonic()
        self.assertIsNone(self.decidir())
        self.assertLess(time.monotonic() - inicio, 1.0)

    def test_sin_servidor_es_sin_respuesta(self):
        os.environ["JEV_URL"] = "http://127.0.0.1:1/api/alpha/decisions"
        self.config["timeout"] = 0.5
        self.assertIsNone(self.decidir())


class Umbral(JevBase):
    def test_sharp_desde_080(self):
        self.assertTrue(jev_cliente.es_sharp({"confianza": 0.80}, self.config))
        self.assertFalse(jev_cliente.es_sharp({"confianza": 0.79}, self.config))
        self.assertTrue(jev_cliente.es_sharp({"confianza": 0.95}, self.config))

    def test_sin_decision_no_es_sharp(self):
        self.assertFalse(jev_cliente.es_sharp(None, self.config))


class EncargoEnorme(JevBase):
    def test_encargo_enorme_se_recorta_y_no_se_registra(self):
        srv = self.servir(cuerpo=respuesta_choice())
        marca = "INICIO-ENCARGO-"
        encargo = marca + ("x" * 200000)
        self.decidir(encargo)
        enviado = srv.peticiones[0]["cuerpo"]["state"]
        texto_enviado = json.dumps(enviado, ensure_ascii=False)
        self.assertIn(marca, texto_enviado)
        self.assertLessEqual(len(enviado["encargo"]), 32000)
        # decidir nunca escribe en el registro; el encargo solo viaja a Jev.
        self.assertFalse(Path(self.home, ".claude", "jev", "decisiones.jsonl").exists())
        # Si alguien intenta registrar el encargo por error, registrar lo descarta.
        jev_cliente.registrar(self.home, {"encargo": encargo, "opcion": "sonnet"})
        registro = Path(self.home, ".claude", "jev", "decisiones.jsonl").read_text(encoding="utf-8")
        self.assertNotIn(marca, registro)
        self.assertIn("sonnet", registro)


class Registro(JevBase):
    def test_registrar_recorta_a_2000(self):
        carpeta = Path(self.home, ".claude", "jev")
        carpeta.mkdir(parents=True)
        archivo = carpeta / "decisiones.jsonl"
        viejas = "".join(json.dumps({"n": i}) + "\n" for i in range(2000))
        archivo.write_text(viejas, encoding="utf-8")
        jev_cliente.registrar(self.home, {"n": 2000, "session_id": "s1"})
        lineas = archivo.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lineas), 2000)
        self.assertEqual(json.loads(lineas[-1]), {"n": 2000, "session_id": "s1"})
        self.assertEqual(json.loads(lineas[0]), {"n": 1})

    def test_registrar_crea_carpeta_700(self):
        jev_cliente.registrar(self.home, {"opcion": "haiku"})
        carpeta = Path(self.home, ".claude", "jev")
        self.assertEqual(os.stat(carpeta).st_mode & 0o777, 0o700)
        lineas = (carpeta / "decisiones.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(json.loads(lineas[0]), {"opcion": "haiku"})

    def test_registrar_nunca_lanza(self):
        archivo = Path(self.home, "no-es-carpeta")
        archivo.write_text("x", encoding="utf-8")
        jev_cliente.registrar(str(archivo), {"opcion": "haiku"})  # no debe lanzar

    def test_registrar_no_guarda_encargo_ni_texto(self):
        jev_cliente.registrar(self.home, {"texto": "secreto-del-encargo", "opcion": "opus"})
        registro = Path(self.home, ".claude", "jev", "decisiones.jsonl").read_text(encoding="utf-8")
        self.assertNotIn("secreto-del-encargo", registro)


class Seguridad(JevBase):
    def test_la_clave_no_sale_en_errores(self):
        self.servir(status=500, cuerpo={"error": "boom"})
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            d = self.decidir(clave=CLAVE)
        self.assertIsNone(d)
        self.assertNotIn(CLAVE, salida.getvalue())
        self.assertNotIn(CLAVE, repr(d))

    def test_la_clave_no_sale_si_hay_excepcion_interna(self):
        self.servir(cuerpo=respuesta_choice())
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            d = jev_cliente.decidir(PREGUNTA, "x", OPCIONES, None, CLAVE)  # config inválida
        self.assertIsNone(d)
        self.assertNotIn(CLAVE, salida.getvalue())


if __name__ == "__main__":
    unittest.main()

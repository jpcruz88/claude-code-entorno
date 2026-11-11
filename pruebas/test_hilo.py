"""Pruebas del hook hilo.py: el hilo literal de la conversación no se pierde.

Tras compactar o reanudar, el hook devuelve los mensajes del usuario tal como los
escribió, sacados de la transcripción y no de un resumen. También busca en sesiones
pasadas y cita lo encontrado.

Se corren con:  python3 -m unittest discover -s pruebas -v
No necesitan nada instalado: las transcripciones son archivos de ejemplo en una
carpeta temporal.
"""
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "hilo.py"


def cargar_hook():
    spec = importlib.util.spec_from_file_location("hilo", str(HOOK))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


hilo = cargar_hook()

CWD = "/proyectos/mi app"
CARPETA = "-proyectos-mi-app"


def usuario(texto, hora="2026-11-11T14:00:00.000Z", **extra):
    d = {"type": "user", "timestamp": hora, "origin": {"kind": "human"},
         "message": {"role": "user", "content": texto}}
    d.update(extra)
    return d


def claude(texto, hora="2026-11-11T14:00:30.000Z"):
    return {"type": "assistant", "timestamp": hora,
            "message": {"role": "assistant", "content": [{"type": "text", "text": texto}]}}


def edicion(ruta, herramienta="Edit"):
    return {"type": "assistant", "timestamp": "2026-11-11T14:01:00.000Z",
            "message": {"role": "assistant", "content": [
                {"type": "tool_use", "name": herramienta, "input": {"file_path": ruta}}]}}


def resultado(texto):
    return {"type": "user", "timestamp": "2026-11-11T14:01:01.000Z",
            "toolUseResult": {"ok": True}, "sourceToolAssistantUUID": "x",
            "message": {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "t1", "content": texto}]}}


RUIDO = [
    usuario("texto de una skill", isMeta=True),
    usuario("Este resumen lo escribió el modelo", isCompactSummary=True,
            isVisibleInTranscriptOnly=True, origin=None),
    {"type": "user", "timestamp": "2026-11-11T14:02:00.000Z",
     "origin": {"kind": "task-notification"},
     "message": {"role": "user", "content": "<task-notification>terminó</task-notification>"}},
    {"type": "user", "timestamp": "2026-11-11T14:02:10.000Z",
     "message": {"role": "user", "content": "<local-command-stdout>Set model</local-command-stdout>"}},
    {"type": "user", "timestamp": "2026-11-11T14:02:20.000Z",
     "message": {"role": "user", "content": "[Request interrupted by user]"}},
    resultado("salida de un comando"),
    {"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted"},
    {"type": "attachment", "contenido": "x"},
]


class ConProyectos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.proyecto = self.home / ".claude" / "projects" / CARPETA
        self.proyecto.mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def sesion(self, nombre, lineas, carpeta=None, edad=0):
        """Escribe una transcripción. `edad` en segundos la hace más vieja."""
        destino = (carpeta or self.proyecto) / (nombre + ".jsonl")
        destino.parent.mkdir(parents=True, exist_ok=True)
        cuerpo = "\n".join(l if isinstance(l, str) else json.dumps(l, ensure_ascii=False)
                           for l in lineas)
        destino.write_text(cuerpo + "\n", encoding="utf-8")
        if edad:
            t = destino.stat().st_mtime - edad
            os.utime(destino, (t, t))
        return destino

    def evento(self, origen, archivo, sesion="actual"):
        return {"hook_event_name": "SessionStart", "source": origen, "session_id": sesion,
                "transcript_path": str(archivo), "cwd": CWD}


def contexto(salida):
    return salida["hookSpecificOutput"]["additionalContext"]


class Extraer(ConProyectos):
    def test_saca_los_mensajes_del_usuario_literales_y_en_orden(self):
        f = self.sesion("s", [usuario("primero: quiero X"), claude("hecho"),
                              usuario("no, mejor Y y nunca Z")])
        datos = hilo.extraer(f)
        self.assertEqual([m["texto"] for m in datos["mensajes"]],
                         ["primero: quiero X", "no, mejor Y y nunca Z"])

    def test_ignora_lo_que_no_escribio_el_usuario(self):
        f = self.sesion("s", [usuario("lo único real")] + RUIDO)
        self.assertEqual([m["texto"] for m in hilo.extraer(f)["mensajes"]], ["lo único real"])

    def test_un_comando_con_argumentos_cuenta_como_mensaje(self):
        orden = ("<command-name>/goal</command-name>\n<command-message>goal</command-message>\n"
                 "<command-args>resuelve todo</command-args>")
        sin_args = "<command-name>/model</command-name>\n<command-args></command-args>"
        f = self.sesion("s", [
            {"type": "user", "timestamp": "2026-11-11T14:00:00.000Z",
             "message": {"role": "user", "content": orden}},
            {"type": "user", "timestamp": "2026-11-11T14:00:05.000Z",
             "message": {"role": "user", "content": sin_args}}])
        self.assertEqual([m["texto"] for m in hilo.extraer(f)["mensajes"]], ["/goal resuelve todo"])

    def test_mensaje_con_imagen_conserva_el_texto(self):
        f = self.sesion("s", [usuario([{"type": "text", "text": "mira esto"},
                                       {"type": "image", "source": {"data": "AAAA"}}])])
        self.assertEqual(hilo.extraer(f)["mensajes"][0]["texto"], "mira esto")

    def test_formato_viejo_sin_origin_tambien_cuenta(self):
        f = self.sesion("s", [{"type": "user", "timestamp": "2026-10-01T10:00:00.000Z",
                               "message": {"role": "user", "content": "mensaje de antes"}}])
        self.assertEqual(hilo.extraer(f)["mensajes"][0]["texto"], "mensaje de antes")

    def test_lista_los_archivos_editados_sin_repetir(self):
        f = self.sesion("s", [usuario("x"), edicion("/a/uno.py"), edicion("/a/dos.py", "Write"),
                              edicion("/a/uno.py")])
        self.assertEqual(hilo.extraer(f)["archivos"], ["/a/dos.py", "/a/uno.py"])

    def test_guarda_el_ultimo_resumen_de_compactacion(self):
        f = self.sesion("s", [usuario("x")] + RUIDO)
        self.assertEqual(hilo.extraer(f)["resumen"], "Este resumen lo escribió el modelo")

    def test_lineas_rotas_no_lo_tumban(self):
        f = self.sesion("s", ["esto no es json", "{", usuario("sigue vivo"), '{"type":"user"}'])
        self.assertEqual([m["texto"] for m in hilo.extraer(f)["mensajes"]], ["sigue vivo"])

    def test_archivo_que_no_existe_da_vacio(self):
        datos = hilo.extraer(self.proyecto / "no-hay.jsonl")
        self.assertEqual(datos["mensajes"], [])
        self.assertEqual(datos["archivos"], [])


class TrasCompactarOReanudar(ConProyectos):
    def test_devuelve_el_hilo_literal(self):
        f = self.sesion("actual", [usuario("quiero el panel azul"), claude("ok"),
                                   usuario("no quites nada, eso nos puede afectar")] + RUIDO)
        for origen in ("compact", "resume"):
            with self.subTest(origen=origen):
                salida = hilo.main(self.evento(origen, f), self.home)
                self.assertEqual(salida["hookSpecificOutput"]["hookEventName"], "SessionStart")
                texto = contexto(salida)
                self.assertIn("quiero el panel azul", texto)
                self.assertIn("no quites nada, eso nos puede afectar", texto)
                self.assertNotIn("Este resumen lo escribió el modelo", texto)

    def test_dice_que_las_citas_mandan_sobre_el_resumen(self):
        f = self.sesion("actual", [usuario("x")])
        texto = contexto(hilo.main(self.evento("compact", f), self.home))
        self.assertIn("no es un resumen", texto)
        self.assertIn("valen las citas", texto)

    def test_incluye_los_archivos_editados(self):
        f = self.sesion("actual", [usuario("x"), edicion("/repo/hooks/hilo.py")])
        self.assertIn("/repo/hooks/hilo.py", contexto(hilo.main(self.evento("compact", f), self.home)))

    def test_cabe_en_el_limite_de_un_hook_y_conserva_el_primero_y_los_ultimos(self):
        lineas = [usuario("PRIMER MENSAJE con el encargo")]
        lineas += [usuario("relleno %03d " % i + "x" * 500) for i in range(60)]
        lineas += [usuario("ULTIMO MENSAJE con la corrección")]
        f = self.sesion("actual", lineas)
        texto = contexto(hilo.main(self.evento("compact", f), self.home))
        self.assertLess(len(texto), 9500)        # sobre 10.000 Claude Code lo manda a un archivo
        self.assertIn("PRIMER MENSAJE con el encargo", texto)
        self.assertIn("ULTIMO MENSAJE con la corrección", texto)
        self.assertIn("omitidos", texto)
        self.assertIn("hilo.py ver actual", texto)

    def test_un_mensaje_enorme_se_recorta_y_lo_dice(self):
        f = self.sesion("actual", [usuario("inicio " + "y" * 5000 + " FINAL-PERDIDO")])
        texto = contexto(hilo.main(self.evento("compact", f), self.home))
        self.assertNotIn("FINAL-PERDIDO", texto)
        self.assertIn("recortado", texto)

    def test_sin_mensajes_no_dice_nada(self):
        f = self.sesion("actual", RUIDO)
        self.assertIsNone(hilo.main(self.evento("compact", f), self.home))


class AlAbrirSesionNueva(ConProyectos):
    def test_apunta_a_la_sesion_anterior_del_proyecto(self):
        self.sesion("vieja", [usuario("lo de hace un mes")], edad=3000)
        self.sesion("anterior", [usuario("arregla el login"),
                                 usuario("déjalo así, mañana seguimos")], edad=600)
        nueva = self.proyecto / "actual.jsonl"
        for origen in ("startup", "clear"):
            with self.subTest(origen=origen):
                texto = contexto(hilo.main(self.evento(origen, nueva), self.home))
                self.assertIn("déjalo así, mañana seguimos", texto)
                self.assertIn("hilo.py ver anterior", texto)
                self.assertIn("hilo.py buscar", texto)
                self.assertNotIn("lo de hace un mes", texto)
                self.assertLess(len(texto), 1200)

    def test_sin_sesion_anterior_no_dice_nada(self):
        self.assertIsNone(hilo.main(self.evento("startup", self.proyecto / "actual.jsonl"),
                                    self.home))

    def test_no_cuenta_los_subagentes_como_sesion_anterior(self):
        self.sesion("agente", [usuario("encargo del subagente")],
                    carpeta=self.proyecto / "anterior" / "subagents")
        self.assertIsNone(hilo.main(self.evento("startup", self.proyecto / "actual.jsonl"),
                                    self.home))

    def test_sin_ruta_de_transcripcion_usa_la_carpeta_del_proyecto(self):
        self.sesion("anterior", [usuario("seguimos mañana")], edad=600)
        ev = {"hook_event_name": "SessionStart", "source": "startup", "session_id": "actual",
              "cwd": CWD}
        self.assertIn("seguimos mañana", contexto(hilo.main(ev, self.home)))


class Buscar(ConProyectos):
    def setUp(self):
        super().setUp()
        self.sesion("s1", [usuario("usa siempre Opus para el diseño", "2026-11-01T10:00:00.000Z"),
                           claude("Decidido: el diseño va con Opus.", "2026-11-01T10:00:20.000Z")])
        otro = self.home / ".claude" / "projects" / "-otro-proyecto"
        self.sesion("s2", [usuario("la contraseña del diseño no se guarda")], carpeta=otro)
        self.sesion("sub", [usuario("diseño dentro de un subagente")],
                    carpeta=self.proyecto / "s1" / "subagents")

    def test_encuentra_en_el_proyecto_y_cita_quien_cuando_y_sesion(self):
        r = hilo.buscar("diseño", self.home, cwd=CWD)
        self.assertEqual([(x["quien"], x["sesion"]) for x in r],
                         [("usuario", "s1"), ("Claude", "s1")])
        self.assertEqual(r[0]["fecha"], "2026-11-01")
        self.assertIn("usa siempre Opus para el diseño", r[0]["cita"])

    def test_no_distingue_mayusculas_ni_tildes(self):
        self.assertEqual(len(hilo.buscar("DISENO", self.home, cwd=CWD)), 2)

    def test_todos_busca_en_los_demas_proyectos(self):
        r = hilo.buscar("diseño", self.home, cwd=CWD, todos=True)
        self.assertEqual({x["sesion"] for x in r}, {"s1", "s2"})

    def test_no_busca_en_subagentes(self):
        self.assertNotIn("sub", {x["sesion"] for x in hilo.buscar("diseño", self.home, cwd=CWD,
                                                                  todos=True)})

    def test_la_cita_es_un_fragmento_alrededor_del_termino(self):
        self.sesion("larga", [usuario("a" * 900 + " el tope semanal es 90 " + "b" * 900)])
        cita = hilo.buscar("tope semanal", self.home, cwd=CWD)[0]["cita"]
        self.assertIn("el tope semanal es 90", cita)
        self.assertLess(len(cita), 500)

    def test_sin_resultados_devuelve_lista_vacia(self):
        self.assertEqual(hilo.buscar("no-aparece-jamas", self.home, cwd=CWD), [])

    def test_respeta_el_maximo(self):
        self.sesion("muchas", [usuario("diseño %d" % i) for i in range(30)])
        self.assertEqual(len(hilo.buscar("diseño", self.home, cwd=CWD, maximo=5)), 5)


class Comandos(ConProyectos):
    def correr(self, *args):
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = hilo.cli(list(args), self.home, CWD)
        return codigo, salida.getvalue()

    def test_buscar_imprime_las_citas(self):
        self.sesion("s1", [usuario("el corte es el jueves a las 23:00", "2026-11-03T09:00:00.000Z")])
        codigo, texto = self.correr("buscar", "jueves")
        self.assertEqual(codigo, 0)
        self.assertIn("2026-11-03", texto)
        self.assertIn("s1", texto)
        self.assertIn("el corte es el jueves a las 23:00", texto)

    def test_buscar_sin_resultados_lo_dice_y_no_inventa(self):
        codigo, texto = self.correr("buscar", "nada-de-nada")
        self.assertEqual(codigo, 1)
        self.assertIn("Sin resultados", texto)

    def test_ver_ultima_muestra_la_sesion_mas_reciente_completa(self):
        self.sesion("vieja", [usuario("antiguo")], edad=900)
        self.sesion("reciente", [usuario("uno"), usuario("dos " + "z" * 3000 + " COLA")] + RUIDO)
        codigo, texto = self.correr("ver", "ultima")
        self.assertEqual(codigo, 0)
        self.assertIn("COLA", texto)                 # `ver` no recorta
        self.assertNotIn("antiguo", texto)
        self.assertIn("Este resumen lo escribió el modelo", texto)
        self.assertIn("escrito por el modelo", texto)

    def test_ver_por_id_la_encuentra_en_cualquier_proyecto(self):
        otro = self.home / ".claude" / "projects" / "-otro-proyecto"
        self.sesion("abc123", [usuario("mensaje de otro proyecto")], carpeta=otro)
        codigo, texto = self.correr("ver", "abc123")
        self.assertEqual(codigo, 0)
        self.assertIn("mensaje de otro proyecto", texto)

    def test_ver_una_sesion_que_no_existe_lo_dice(self):
        codigo, texto = self.correr("ver", "no-existe")
        self.assertEqual(codigo, 1)
        self.assertIn("No encontré", texto)


class Robustez(ConProyectos):
    def test_evento_desconocido_no_dice_nada(self):
        self.assertIsNone(hilo.main({"hook_event_name": "Stop"}, self.home))

    def test_entrada_rota_sale_con_cero_y_en_silencio(self):
        for entrada in ("", "no es json", "[]", "null"):
            with self.subTest(entrada=entrada):
                r = subprocess.run([sys.executable, str(HOOK)], input=entrada, text=True,
                                   capture_output=True, env={"HOME": str(self.home),
                                                             "USERPROFILE": str(self.home)})
                self.assertEqual(r.returncode, 0)
                self.assertEqual(r.stdout, "")

    def test_por_stdin_imprime_json_valido(self):
        f = self.sesion("actual", [usuario("mensaje con tilde: decisión")])
        r = subprocess.run([sys.executable, str(HOOK)],
                           input=json.dumps(self.evento("compact", f)), text=True,
                           capture_output=True, env={"HOME": str(self.home),
                                                     "USERPROFILE": str(self.home)})
        self.assertEqual(r.returncode, 0)
        self.assertIn("mensaje con tilde: decisión", contexto(json.loads(r.stdout)))


class Registro(unittest.TestCase):
    def setUp(self):
        self.base = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
        self.filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))

    def test_registrado_al_inicio_de_sesion_en_todos_los_origenes(self):
        comandos = [(g.get("matcher"), h["command"], h.get("timeout"))
                    for g in self.base["hooks"]["SessionStart"] for h in g["hooks"]]
        self.assertIn(("startup|resume|clear|compact", "python3 ~/.claude/hooks/hilo.py", 15),
                      comandos)

    def test_se_exporta(self):
        self.assertIn("hilo.py", self.filtros["settings"]["hooks_permitidos"])

    def test_la_regla_de_memoria_dice_como_usarlo(self):
        texto = (RAIZ / "claude" / "rules" / "memoria.md").read_text(encoding="utf-8")
        self.assertIn("hilo.py buscar", texto)
        self.assertIn("valen las citas", texto)


if __name__ == "__main__":
    unittest.main()

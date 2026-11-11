"""Pruebas del hook caveman-activo.py: el modo caveman se activa solo en cada sesión.

Se corren con:  python3 -m unittest discover -s pruebas -v
No necesitan nada instalado: la carpeta de usuario es una carpeta temporal.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "caveman-activo.py"


def cargar_hook():
    spec = importlib.util.spec_from_file_location("caveman_activo", str(HOOK))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


ca = cargar_hook()


def inicio(sesion="s1", origen="startup"):
    return {"hook_event_name": "SessionStart", "session_id": sesion, "source": origen}


def mensaje(texto, sesion="s1"):
    return {"hook_event_name": "UserPromptSubmit", "session_id": sesion, "prompt": texto}


def contexto(salida):
    return salida["hookSpecificOutput"]["additionalContext"]


class ConCarpeta(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def poner_skill(self, texto="# caveman\n\nREGLA-DE-LA-SKILL\n"):
        carpeta = self.home / ".claude" / "skills" / "caveman"
        carpeta.mkdir(parents=True)
        (carpeta / "SKILL.md").write_text("---\nname: caveman\n---\n\n" + texto, encoding="utf-8")


class InicioDeSesion(ConCarpeta):
    def test_al_arrancar_activa_caveman_full(self):
        salida = ca.main(inicio(), self.home)
        self.assertEqual(salida["hookSpecificOutput"]["hookEventName"], "SessionStart")
        texto = contexto(salida)
        self.assertIn("caveman", texto.lower())
        self.assertIn("full", texto)
        self.assertEqual(ca.leer_modo(self.home, "s1"), "full")

    def test_incluye_las_reglas_de_la_skill_instalada_sin_el_frontmatter(self):
        self.poner_skill()
        texto = contexto(ca.main(inicio(), self.home))
        self.assertIn("REGLA-DE-LA-SKILL", texto)
        self.assertNotIn("name: caveman", texto)

    def test_sin_la_skill_instalada_da_las_reglas_minimas(self):
        texto = contexto(ca.main(inicio(), self.home))
        self.assertIn("sin relleno", texto)

    def test_dice_que_lo_escrito_para_otros_va_en_espanol_normal(self):
        texto = contexto(ca.main(inicio(), self.home))
        for palabra in ("commits", "español"):
            self.assertIn(palabra, texto)

    def test_tras_compactar_o_reanudar_sigue_activo(self):
        ca.main(inicio(), self.home)
        for origen in ("compact", "resume"):
            with self.subTest(origen=origen):
                self.assertIn("full", contexto(ca.main(inicio(origen=origen), self.home)))

    def test_tras_compactar_conserva_el_nivel_elegido(self):
        ca.main(inicio(), self.home)
        ca.main(mensaje("/caveman lite"), self.home)
        self.assertIn("lite", contexto(ca.main(inicio(origen="compact"), self.home)))

    def test_apagado_no_vuelve_al_compactar_ni_al_reanudar(self):
        ca.main(inicio(), self.home)
        ca.main(mensaje("stop caveman"), self.home)
        for origen in ("compact", "resume"):
            with self.subTest(origen=origen):
                self.assertIsNone(ca.main(inicio(origen=origen), self.home))

    def test_una_sesion_nueva_vuelve_a_full_aunque_otra_lo_apagara(self):
        ca.main(inicio("vieja"), self.home)
        ca.main(mensaje("modo normal", "vieja"), self.home)
        self.assertIn("full", contexto(ca.main(inicio("nueva"), self.home)))

    def test_clear_vuelve_a_full(self):
        ca.main(inicio(), self.home)
        ca.main(mensaje("stop caveman"), self.home)
        self.assertIn("full", contexto(ca.main(inicio(origen="clear"), self.home)))


class CadaMensaje(ConCarpeta):
    def test_recuerda_el_modo_en_cada_mensaje(self):
        ca.main(inicio(), self.home)
        salida = ca.main(mensaje("arregla el error del login"), self.home)
        self.assertEqual(salida["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")
        self.assertIn("Caveman mode: full", contexto(salida))

    def test_el_recordatorio_es_corto(self):
        ca.main(inicio(), self.home)
        self.assertLess(len(contexto(ca.main(mensaje("hola"), self.home))), 400)

    def test_sin_inicio_registrado_tambien_recuerda_full(self):
        self.assertIn("Caveman mode: full", contexto(ca.main(mensaje("hola", "otra"), self.home)))

    def test_cambia_de_nivel(self):
        ca.main(inicio(), self.home)
        for nivel in ("lite", "ultra", "full"):
            with self.subTest(nivel=nivel):
                salida = ca.main(mensaje("/caveman " + nivel), self.home)
                self.assertIn("Caveman mode: " + nivel, contexto(salida))
                self.assertEqual(ca.leer_modo(self.home, "s1"), nivel)

    def test_stop_caveman_lo_apaga_y_avisa_una_vez(self):
        ca.main(inicio(), self.home)
        for frase in ("stop caveman", "modo normal", "Stop caveman.", "¡modo normal!", "normal mode"):
            with self.subTest(frase=frase):
                ca.main(mensaje("/caveman full"), self.home)
                aviso = contexto(ca.main(mensaje(frase), self.home))
                self.assertIn("Caveman mode: off", aviso)
                self.assertEqual(ca.leer_modo(self.home, "s1"), "off")
                self.assertIsNone(ca.main(mensaje("sigue con lo otro"), self.home))

    def test_una_frase_que_solo_menciona_el_modo_normal_no_lo_apaga(self):
        ca.main(inicio(), self.home)
        ca.main(mensaje("explica qué hace el modo normal del panel"), self.home)
        self.assertEqual(ca.leer_modo(self.home, "s1"), "full")

    def test_caveman_vuelve_a_encenderlo(self):
        ca.main(inicio(), self.home)
        ca.main(mensaje("stop caveman"), self.home)
        self.assertIn("Caveman mode: full", contexto(ca.main(mensaje("/caveman"), self.home)))

    def test_cada_sesion_lleva_su_modo(self):
        ca.main(inicio("a"), self.home)
        ca.main(inicio("b"), self.home)
        ca.main(mensaje("stop caveman", "a"), self.home)
        self.assertEqual(ca.leer_modo(self.home, "a"), "off")
        self.assertEqual(ca.leer_modo(self.home, "b"), "full")


class Robustez(ConCarpeta):
    def test_el_id_de_sesion_no_sale_de_la_carpeta_de_estado(self):
        ca.main(inicio("../../fuera"), self.home)
        carpeta = self.home / ".claude" / "caveman"
        dentro = [p for p in self.home.rglob("*") if p.is_file()]
        self.assertTrue(dentro)
        for p in dentro:
            self.assertIn(carpeta, p.parents)

    def test_borra_estados_de_sesiones_viejas(self):
        carpeta = self.home / ".claude" / "caveman"
        carpeta.mkdir(parents=True)
        viejo = carpeta / "vieja"
        viejo.write_text("off", encoding="utf-8")
        ca.main(inicio(), self.home, ahora=viejo.stat().st_mtime + 31 * 86400)
        self.assertFalse(viejo.exists())

    def test_evento_desconocido_no_dice_nada(self):
        self.assertIsNone(ca.main({"hook_event_name": "Stop", "session_id": "s1"}, self.home))

    def test_entrada_rota_sale_con_cero_y_en_silencio(self):
        for entrada in ("", "esto no es json", "[]", "null"):
            with self.subTest(entrada=entrada):
                r = subprocess.run([sys.executable, str(HOOK)], input=entrada, text=True,
                                   capture_output=True, env={"HOME": str(self.home),
                                                             "USERPROFILE": str(self.home)})
                self.assertEqual(r.returncode, 0)
                self.assertEqual(r.stdout, "")

    def test_por_stdin_imprime_json_valido(self):
        r = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(inicio()), text=True,
                           capture_output=True, env={"HOME": str(self.home),
                                                     "USERPROFILE": str(self.home)})
        self.assertEqual(r.returncode, 0)
        self.assertIn("full", contexto(json.loads(r.stdout)))


class Registro(unittest.TestCase):
    def setUp(self):
        self.base = json.loads((RAIZ / "claude" / "settings.base.json").read_text(encoding="utf-8"))
        self.filtros = json.loads((RAIZ / "herramientas" / "filtros.json").read_text(encoding="utf-8"))

    def comandos(self, evento):
        return [(g.get("matcher"), h["command"], h.get("timeout"))
                for g in self.base["hooks"].get(evento, []) for h in g["hooks"]]

    def test_registrado_al_inicio_de_sesion_en_todos_los_origenes(self):
        self.assertIn(("startup|resume|clear|compact",
                       "python3 ~/.claude/hooks/caveman-activo.py", 5), self.comandos("SessionStart"))

    def test_registrado_en_cada_mensaje(self):
        self.assertIn((None, "python3 ~/.claude/hooks/caveman-activo.py", 5),
                      self.comandos("UserPromptSubmit"))

    def test_se_exporta(self):
        self.assertIn("caveman-activo.py", self.filtros["settings"]["hooks_permitidos"])


if __name__ == "__main__":
    unittest.main()

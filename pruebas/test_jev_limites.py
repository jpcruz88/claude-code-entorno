"""claude/hooks/jev_limites.py: tope de modelo y esfuerzo según el uso de la cuenta.

Nada depende del reloj real: `ahora` y la zona horaria son fijos en cada prueba.
"""
import datetime
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "claude" / "hooks"))

import jev_limites  # noqa: E402

TZ = datetime.timezone(datetime.timedelta(hours=-6))
CONFIG = {}


def epoch(anio, mes, dia, hora=0, minuto=0):
    return datetime.datetime(anio, mes, dia, hora, minuto, tzinfo=TZ).timestamp()


# Semana de prueba: empieza el viernes 6-nov 23:00, reinicia el viernes 13-nov 23:00.
# Corte: jueves 12-nov 23:00. Entre inicio y corte hay 144 h, así que el lunes 9-nov
# 15:00 (64 h después del inicio) el ritmo ideal es exactamente 40.
REINICIO = epoch(2026, 11, 13, 23, 0)
LUNES = epoch(2026, 11, 9, 15, 0)
VIERNES = epoch(2026, 11, 13, 10, 0)


def datos(semana=None, h5=None, reinicio=REINICIO, h5_reinicio=None, ahora=LUNES):
    d = {"actualizado": ahora}
    if semana is not None:
        d["seven_day"] = {"usado": semana, "reinicio": reinicio}
    if h5 is not None:
        d["five_hour"] = {"usado": h5, "reinicio": h5_reinicio or ahora + 3 * 3600}
    return d


def tope(limites, ahora=LUNES):
    return jev_limites.calcular_tope(limites, ahora, CONFIG, TZ)


class TopeSemana(unittest.TestCase):
    def test_por_debajo_del_ritmo_es_libre(self):
        t = tope(datos(semana=40))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]), ("opus", "high", None))
        self.assertAlmostEqual(t["semana"]["ritmo"], 40)
        self.assertAlmostEqual(t["semana"]["exceso"], 0)

    def test_escalon_exceso_8_opus_medium(self):
        t = tope(datos(semana=48))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("opus", "medium"))
        self.assertEqual(t["motivo"], "tope semana +8 pts → esfuerzo medium")

    def test_escalon_exceso_12_sonnet_high(self):
        t = tope(datos(semana=52))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("sonnet", "high"))
        self.assertEqual(t["motivo"], "tope semana +12 pts → sonnet")

    def test_escalon_exceso_20_sonnet_medium(self):
        t = tope(datos(semana=60))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("sonnet", "medium"))

    def test_escalon_exceso_30_haiku_medium(self):
        t = tope(datos(semana=70))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))
        self.assertEqual(t["motivo"], "tope semana +30 pts → haiku")

    def test_bordes_de_cada_escalon(self):
        def r(uso):
            t = tope(datos(semana=uso))
            return (t["modelo_max"], t["esfuerzo_max"])
        self.assertEqual(r(45), ("opus", "high"))
        self.assertEqual(r(45.5), ("opus", "medium"))
        self.assertEqual(r(50), ("opus", "medium"))
        self.assertEqual(r(50.5), ("sonnet", "high"))
        self.assertEqual(r(55), ("sonnet", "high"))
        self.assertEqual(r(55.5), ("sonnet", "medium"))
        self.assertEqual(r(65), ("sonnet", "medium"))
        self.assertEqual(r(65.5), ("haiku", "medium"))

    def test_semana_al_91_antes_del_corte_es_haiku(self):
        ahora = epoch(2026, 11, 12, 20, 0)  # ritmo cerca de 90: el exceso es pequeño
        t = tope(datos(semana=91, ahora=ahora), ahora)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))

    def test_semana_al_91_antes_del_corte_el_motivo_dice_el_porcentaje(self):
        ahora = epoch(2026, 11, 12, 20, 0)
        t = tope(datos(semana=91, ahora=ahora), ahora)
        self.assertEqual(t["motivo"], "tope semana 91% → haiku")

    def test_viernes_despues_del_corte_95_es_libre(self):
        t = tope(datos(semana=95, ahora=VIERNES), VIERNES)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]), ("opus", "high", None))
        self.assertAlmostEqual(t["semana"]["ritmo"], 90)

    def test_viernes_despues_del_corte_97_es_haiku(self):
        t = tope(datos(semana=97, ahora=VIERNES), VIERNES)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))
        self.assertIsNotNone(t["motivo"])


class CorteEnElBorde(unittest.TestCase):
    """Foco 1: dónde cae el corte según el reinicio."""

    def test_reinicio_justo_el_jueves_a_las_23(self):
        reinicio = epoch(2026, 11, 12, 23, 0)
        inicio = reinicio - 7 * 86400
        ahora = inicio + 72 * 3600  # el corte coincide con el reinicio: 168 h de span
        t = tope(datos(semana=45, reinicio=reinicio, ahora=ahora), ahora)
        self.assertAlmostEqual(t["semana"]["ritmo"], 90 * 72 / 168)
        # El corte coincide con el reinicio: un minuto antes el ritmo ya es casi 90.
        ahora2 = reinicio - 60
        t2 = tope(datos(semana=85, reinicio=reinicio, ahora=ahora2), ahora2)
        self.assertAlmostEqual(t2["semana"]["ritmo"], 90, delta=0.1)
        self.assertEqual(t2["modelo_max"], "opus")

    def test_reinicio_el_viernes_a_las_0030_corta_el_jueves_a_las_23(self):
        reinicio = epoch(2026, 11, 13, 0, 30)
        inicio = reinicio - 7 * 86400
        corte = epoch(2026, 11, 12, 23, 0)
        ahora = inicio + 84 * 3600
        t = tope(datos(semana=0, reinicio=reinicio, ahora=ahora), ahora)
        self.assertAlmostEqual(t["semana"]["ritmo"], 90 * 84 / ((corte - inicio) / 3600))
        # Entre el corte y el reinicio ya no se aplica el ritmo.
        ahora2 = epoch(2026, 11, 12, 23, 15)
        t2 = tope(datos(semana=85, reinicio=reinicio, ahora=ahora2), ahora2)
        self.assertEqual(t2["modelo_max"], "opus")

    def test_reinicio_el_jueves_a_las_22_corta_el_jueves_anterior(self):
        reinicio = epoch(2026, 11, 12, 22, 0)
        inicio = reinicio - 7 * 86400
        corte = epoch(2026, 11, 5, 23, 0)  # una hora después del inicio, no el jueves 12
        self.assertEqual(corte - inicio, 3600)
        ahora = inicio + 1800
        t = tope(datos(semana=0, reinicio=reinicio, ahora=ahora), ahora)
        self.assertAlmostEqual(t["semana"]["ritmo"], 45)


class TopeCincoHoras(unittest.TestCase):
    def r(self, uso):
        t = tope(datos(h5=uso))
        return (t["modelo_max"], t["esfuerzo_max"])

    def test_bajo_60_es_libre(self):
        self.assertEqual(self.r(59), ("opus", "high"))

    def test_de_60_a_75_opus_medium(self):
        self.assertEqual(self.r(60), ("opus", "medium"))
        t = tope(datos(h5=72))
        self.assertEqual(t["motivo"], "tope 5h 72% → esfuerzo medium")
        self.assertIsNone(t["semana"])

    def test_de_75_a_85_sonnet_medium(self):
        self.assertEqual(self.r(75), ("sonnet", "medium"))
        self.assertEqual(self.r(84), ("sonnet", "medium"))
        self.assertEqual(tope(datos(h5=80))["motivo"], "tope 5h 80% → sonnet")

    def test_desde_85_haiku_medium(self):
        self.assertEqual(self.r(85), ("haiku", "medium"))
        self.assertEqual(tope(datos(h5=90))["motivo"], "tope 5h 90% → haiku")

    def test_reinicio_en_10_minutos_no_pone_tope(self):
        t = tope(datos(h5=90, h5_reinicio=LUNES + 600))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]), ("opus", "high", None))

    def test_reinicio_en_20_minutos_si_pone_tope(self):
        self.assertEqual(tope(datos(h5=90, h5_reinicio=LUNES + 1200))["modelo_max"], "haiku")

    def test_escalones_configurables(self):
        cfg = {"limites": {"h5_escalones": [[10, "opus", "high"]]}}
        t = jev_limites.calcular_tope(datos(h5=20), LUNES, cfg, TZ)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))


class Combinacion(unittest.TestCase):
    def test_gana_el_modelo_mas_estricto_con_su_motivo(self):
        t = tope(datos(semana=52, h5=90))  # semana sonnet/high, 5h haiku/medium
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))
        self.assertEqual(t["motivo"], "tope 5h 90% → haiku")
        self.assertAlmostEqual(t["semana"]["exceso"], 12)

    def test_gana_semana_si_es_mas_estricta(self):
        t = tope(datos(semana=70, h5=72))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("haiku", "medium"))
        self.assertEqual(t["motivo"], "tope semana +30 pts → haiku")

    def test_minimo_por_separado_modelo_y_esfuerzo(self):
        # semana: opus/medium; 5 h (70 %): sonnet/high -> resultado sonnet/medium
        cfg = {"limites": {"h5_escalones": [[60, "opus", "high"], [90, "sonnet", "high"]]}}
        t = jev_limites.calcular_tope(datos(semana=48, h5=70), LUNES, cfg, TZ)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("sonnet", "medium"))
        self.assertEqual(t["motivo"], "tope 5h 70% → sonnet")

    def test_si_ninguna_baja_el_modelo_pone_motivo_la_que_baja_el_esfuerzo(self):
        t = tope(datos(semana=48, h5=65))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("opus", "medium"))
        self.assertIsNotNone(t["motivo"])


class Xhigh(unittest.TestCase):
    def r(self, ahora=LUNES, **kw):
        t = tope(datos(ahora=ahora, **kw), ahora)
        return (t["modelo_max"], t["esfuerzo_max"])

    def test_exceso_menos_12_con_5h_al_40_es_xhigh(self):
        self.assertEqual(self.r(semana=28, h5=40), ("opus", "xhigh"))

    def test_exceso_menos_12_con_5h_al_65_manda_la_regla_de_5h(self):
        t = tope(datos(semana=28, h5=65))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("opus", "medium"))
        self.assertEqual(t["motivo"], "tope 5h 65% → esfuerzo medium")

    def test_borde_exceso_menos_10_y_menos_9(self):
        self.assertEqual(self.r(semana=30, h5=40), ("opus", "xhigh"))
        self.assertEqual(self.r(semana=30.5, h5=40), ("opus", "high"))

    def test_viernes_despues_del_corte_92_con_5h_al_30_es_xhigh(self):
        self.assertEqual(self.r(ahora=VIERNES, semana=92, h5=30), ("opus", "xhigh"))

    def test_viernes_despues_del_corte_con_5h_alta_no_da_xhigh(self):
        self.assertEqual(self.r(ahora=VIERNES, semana=92, h5=65), ("opus", "medium"))

    def test_viernes_desde_97_es_haiku_medium_aunque_5h_este_baja(self):
        self.assertEqual(self.r(ahora=VIERNES, semana=97, h5=30), ("haiku", "medium"))

    def test_sin_una_de_las_ventanas_el_maximo_es_high(self):
        self.assertEqual(self.r(semana=28), ("opus", "high"))
        self.assertEqual(self.r(h5=40), ("opus", "high"))

    def test_5h_en_gracia_no_pone_ningun_tope_ni_limita_xhigh(self):
        t = tope(datos(semana=28, h5=90, h5_reinicio=LUNES + 600))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]),
                         ("opus", "xhigh", None))


class ReinicioVencido(unittest.TestCase):
    """Una ventana cuyo `reinicio` ya pasó cuenta como sin dato."""

    def test_semana_vencida_no_baja_a_haiku_ni_da_xhigh(self):
        d = datos(semana=98, h5=30, reinicio=LUNES - 3600)
        t = tope(d)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]),
                         ("opus", "high", None))
        self.assertIsNone(t["semana"])

    def test_5h_vencida_no_pone_tope_ni_da_xhigh(self):
        t = tope(datos(semana=28, h5=95, h5_reinicio=LUNES - 3600))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"]),
                         ("opus", "high", None))
        self.assertAlmostEqual(t["semana"]["exceso"], -12)

    def test_reinicio_igual_a_ahora_tambien_esta_vencido(self):
        t = tope(datos(semana=98, reinicio=LUNES))
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("opus", "high"))

    def test_sin_dato_es_high_no_xhigh(self):
        t = tope(None)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"]), ("opus", "high"))
        self.assertEqual(jev_limites.aplicar_tope("opus", "xhigh", t), ("opus", "high"))

    def test_aplicar_conserva_xhigh_si_el_tope_lo_permite(self):
        t = tope(datos(semana=28, h5=40))
        self.assertEqual(jev_limites.aplicar_tope("opus", "xhigh", t), ("opus", "xhigh"))
        self.assertEqual(jev_limites.aplicar_tope("claude-opus-5-5", "xhigh", t),
                         ("claude-opus-5-5", "xhigh"))

    def test_aplicar_baja_xhigh_a_medium_con_5h_alta(self):
        t = tope(datos(semana=28, h5=65))
        self.assertEqual(jev_limites.aplicar_tope("opus", "xhigh", t), ("opus", "medium"))


class SinDato(unittest.TestCase):
    def test_sin_limites_no_hay_tope(self):
        t = tope(None)
        self.assertEqual((t["modelo_max"], t["esfuerzo_max"], t["motivo"], t["semana"]),
                         ("opus", "high", None, None))



class LeerLimites(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.home, True)
        self.carpeta = Path(self.home, ".claude", "jev")
        self.carpeta.mkdir(parents=True)

    def escribir(self, texto):
        (self.carpeta / "limites.json").write_text(texto, encoding="utf-8")

    def test_lee_un_dato_reciente(self):
        d = datos(semana=40, h5=10, ahora=1000.0)
        self.escribir(json.dumps(d))
        self.assertEqual(jev_limites.leer_limites(self.home, 1000.0 + 60), d)

    def test_archivo_ausente(self):
        self.assertIsNone(jev_limites.leer_limites(self.home, 1000.0))

    def test_json_roto_es_sin_dato(self):
        self.escribir('{"actualizado": 1000, "five_hour": {"usa')
        self.assertIsNone(jev_limites.leer_limites(self.home, 1000.0))

    def test_dato_de_7_horas_es_viejo(self):
        self.escribir(json.dumps(datos(semana=40, ahora=1000.0)))
        self.assertIsNone(jev_limites.leer_limites(self.home, 1000.0 + 7 * 3600))

    def test_dato_de_5_horas_sirve(self):
        self.escribir(json.dumps(datos(semana=40, ahora=1000.0)))
        self.assertIsNotNone(jev_limites.leer_limites(self.home, 1000.0 + 5 * 3600))

    def test_contenido_que_no_es_un_dict(self):
        self.escribir("[1, 2]")
        self.assertIsNone(jev_limites.leer_limites(self.home, 1000.0))

    def test_max_antiguedad_configurable(self):
        (self.carpeta / "config.json").write_text(json.dumps({"limites": {"max_antiguedad_h": 1}}))
        self.escribir(json.dumps(datos(semana=40, ahora=1000.0)))
        self.assertIsNone(jev_limites.leer_limites(self.home, 1000.0 + 2 * 3600))


class AplicarTope(unittest.TestCase):
    SONNET = {"modelo_max": "sonnet", "esfuerzo_max": "high", "motivo": "x", "semana": None}
    HAIKU = {"modelo_max": "haiku", "esfuerzo_max": "medium", "motivo": "x", "semana": None}
    LIBRE = {"modelo_max": "opus", "esfuerzo_max": "high", "motivo": None, "semana": None}

    def test_id_completo_baja_a_nombre_corto(self):
        self.assertEqual(jev_limites.aplicar_tope("claude-opus-5-5", "high", self.SONNET),
                         ("sonnet", "high"))

    def test_haiku_baja_el_esfuerzo(self):
        self.assertEqual(jev_limites.aplicar_tope("opus", "high", self.HAIKU), ("haiku", "medium"))

    def test_no_sube_lo_que_claude_ya_eligio(self):
        self.assertEqual(jev_limites.aplicar_tope("haiku", "low", self.HAIKU), ("haiku", "low"))
        self.assertEqual(jev_limites.aplicar_tope("sonnet", "medium", self.SONNET),
                         ("sonnet", "medium"))

    def test_id_completo_que_no_cambia_se_devuelve_igual(self):
        self.assertEqual(jev_limites.aplicar_tope("claude-haiku-5-5", "low", self.HAIKU),
                         ("claude-haiku-5-5", "low"))

    def test_libre_no_toca_nada(self):
        self.assertEqual(jev_limites.aplicar_tope("claude-opus-5-5", "high", self.LIBRE),
                         ("claude-opus-5-5", "high"))


if __name__ == "__main__":
    unittest.main()

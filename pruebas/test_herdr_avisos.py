"""herdr/avisos.py: avisa con nombre claro cuando un agente de herdr termina o necesita respuesta.

El aviso propio de herdr 0.9.5 dice «claude finished · Personales · 1»: no nombra la
máquina, el «1» es el número del espacio de trabajo y la pestaña solo sale si el
espacio tiene más de una. El vigía lee los agentes de esta Mac y de las máquinas
guardadas y avisa con «Colabora: Claude terminó» y «m4 › Personales».
"""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GUION = RAIZ / "herdr" / "avisos.py"


def cargar():
    spec = importlib.util.spec_from_file_location("herdr_avisos", str(GUION))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def agente(estado, pane="w3:p15", maquina="m4", pestana="Colabora", espacio="Personales",
           tarea="Cloudflare a disco duro externo", nombre="claude"):
    return {"maquina": maquina, "pane_id": pane, "estado": estado, "agente": nombre,
            "espacio": espacio, "pestana": pestana, "tarea": tarea}


class Vigia(unittest.TestCase):
    def setUp(self):
        self.m = cargar()
        self.v = self.m.Vigia(espera=30)

    def pasos(self, *estados_por_tiempo):
        avisos = []
        for ahora, agentes in estados_por_tiempo:
            avisos += self.v.paso(ahora, agentes, {"m4"})
        return avisos

    def test_avisa_si_sigue_terminado_tras_la_espera(self):
        avisos = self.pasos((0, [agente("working")]), (5, [agente("done")]),
                            (20, [agente("done")]), (36, [agente("done")]))
        self.assertEqual(len(avisos), 1)
        self.assertEqual(avisos[0]["estado"], "done")

    def test_no_repite_el_mismo_aviso(self):
        avisos = self.pasos((0, [agente("working")]), (5, [agente("done")]),
                            (40, [agente("done")]), (80, [agente("done")]))
        self.assertEqual(len(avisos), 1)

    def test_no_avisa_si_lo_viste_antes_de_la_espera(self):
        # done -> idle: herdr lo marca como visto.
        avisos = self.pasos((0, [agente("working")]), (5, [agente("done")]),
                            (15, [agente("idle")]), (60, [agente("idle")]))
        self.assertEqual(avisos, [])

    def test_no_avisa_de_lo_que_ya_estaba_terminado_al_arrancar(self):
        avisos = self.pasos((0, [agente("done")]), (60, [agente("done")]))
        self.assertEqual(avisos, [])

    def test_avisa_si_necesita_respuesta(self):
        avisos = self.pasos((0, [agente("working")]), (5, [agente("blocked")]),
                            (40, [agente("blocked")]))
        self.assertEqual([a["estado"] for a in avisos], ["blocked"])

    def test_vuelve_a_avisar_en_el_siguiente_turno(self):
        avisos = self.pasos((0, [agente("working")]), (5, [agente("done")]), (40, [agente("done")]),
                            (50, [agente("working")]), (60, [agente("done")]), (95, [agente("done")]))
        self.assertEqual(len(avisos), 2)

    def test_maquina_que_no_respondio_no_pierde_su_estado(self):
        self.v.paso(0, [agente("working")], {"m4"})
        self.v.paso(5, [agente("done")], {"m4"})
        self.v.paso(20, [], set())  # m4 no respondió en esta vuelta
        avisos = self.v.paso(40, [agente("done")], {"m4"})
        self.assertEqual(len(avisos), 1)


class Texto(unittest.TestCase):
    def setUp(self):
        self.m = cargar()

    def test_nombra_pestana_maquina_y_espacio(self):
        titulo, subtitulo, cuerpo = self.m.texto(agente("done"))
        self.assertEqual(titulo, "Colabora: Claude terminó")
        self.assertEqual(subtitulo, "m4 › Personales")
        self.assertEqual(cuerpo, "Cloudflare a disco duro externo")

    def test_esta_mac_y_respuesta_pendiente(self):
        titulo, subtitulo, _ = self.m.texto(agente("blocked", maquina=None, espacio="Personal",
                                                   pestana="Mod"))
        self.assertEqual(titulo, "Mod: Claude necesita tu respuesta")
        self.assertEqual(subtitulo, "Esta Mac › Personal")

    def test_nombres_de_otros_agentes(self):
        titulo, _, _ = self.m.texto(agente("done", nombre="opencode"))
        self.assertEqual(titulo, "Colabora: OpenCode terminó")

    def test_sin_tarea_usa_el_nombre_del_agente(self):
        _, _, cuerpo = self.m.texto(agente("done", tarea=""))
        self.assertEqual(cuerpo, "Claude")


# herdr de mentira: responde según la máquina pedida con --machine.
HERDR_FALSO = r"""#!/bin/sh
if [ "$1" = "--machine" ]; then maquina="$2"; shift 2; else maquina=local; fi
echo "$maquina $*" >> "$LLAMADAS"
case "$maquina $*" in
  "local machine list --json")
    echo '[{"label":"m4","enabled":true},{"label":"apagada","enabled":false},{"label":"caida","enabled":true}]' ;;
  "local agent list")
    echo '{"result":{"agents":[{"agent":"claude","agent_status":"working","pane_id":"w5:p1","tab_id":"w5:t1","workspace_id":"w5","terminal_title_stripped":"Mod del tablero"}]}}' ;;
  "local workspace list")
    echo '{"result":{"workspaces":[{"workspace_id":"w5","label":"Personal"}]}}' ;;
  "local tab list")
    echo '{"result":{"tabs":[{"tab_id":"w5:t1","label":"Mod"}]}}' ;;
  "m4 agent list")
    echo '{"result":{"agents":[{"agent":"claude","agent_status":"done","pane_id":"w3:p15","tab_id":"w3:tX","workspace_id":"w3","terminal_title_stripped":"Cloudflare a disco duro externo"}]}}' ;;
  "m4 workspace list")
    echo '{"result":{"workspaces":[{"workspace_id":"w3","label":"Personales"}]}}' ;;
  "m4 tab list")
    echo '{"result":{"tabs":[{"tab_id":"w3:tX","label":"Colabora"}]}}' ;;
  caida*) echo "no se pudo conectar" >&2; exit 1 ;;
esac
"""


@unittest.skipIf(os.name == "nt", "guion de sh")
class Leer(unittest.TestCase):
    def setUp(self):
        self.m = cargar()
        self.tmp = Path(tempfile.mkdtemp())
        self.herdr = self.tmp / "herdr"
        self.herdr.write_text(HERDR_FALSO, encoding="utf-8")
        self.herdr.chmod(0o755)
        os.environ["LLAMADAS"] = str(self.tmp / "llamadas.txt")

    def tearDown(self):
        os.environ.pop("LLAMADAS", None)
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def test_junta_esta_mac_y_las_maquinas_guardadas(self):
        agentes, respondieron = self.m.leer(str(self.herdr))
        self.assertEqual(respondieron, {None, "m4"})
        por_pane = {(a["maquina"], a["pane_id"]): a for a in agentes}
        remoto = por_pane[("m4", "w3:p15")]
        self.assertEqual((remoto["espacio"], remoto["pestana"], remoto["estado"], remoto["tarea"]),
                         ("Personales", "Colabora", "done", "Cloudflare a disco duro externo"))
        local = por_pane[(None, "w5:p1")]
        self.assertEqual((local["espacio"], local["pestana"]), ("Personal", "Mod"))

    def test_no_pregunta_a_maquinas_desactivadas(self):
        self.m.leer(str(self.herdr))
        llamadas = (self.tmp / "llamadas.txt").read_text(encoding="utf-8")
        self.assertNotIn("apagada", llamadas)


class Notificar(unittest.TestCase):
    def test_avisar_notifica_y_deja_registro(self):
        import io
        from unittest import mock
        m = cargar()
        salida = io.StringIO()
        with mock.patch.object(m.subprocess, "run") as run, mock.patch("sys.stdout", salida):
            m.avisar(agente("done"))
        self.assertEqual(run.call_args[0][0][-2:], ["Colabora: Claude terminó", "m4 › Personales"])
        linea = salida.getvalue()
        self.assertIn("Colabora: Claude terminó · m4 › Personales · Cloudflare a disco duro externo", linea)

    def test_pasa_los_textos_como_argumentos_sin_escapar(self):
        m = cargar()
        args = m.orden_notificacion('Tab "rara"', "m4 › X", "tarea con 'comillas'")
        self.assertEqual(args[0], "osascript")
        self.assertEqual(args[-3:], ['tarea con \'comillas\'', 'Tab "rara"', "m4 › X"])
        self.assertNotIn('Tab "rara"', " ".join(args[:-3]))


if __name__ == "__main__":
    unittest.main()

"""Pruebas del comando /evaluar (claude/commands/evaluar.md).

El comando lleva el procedimiento para evaluar si una herramienta o técnica de IA
sirve o es humo. El trabajo determinista lo hace un repo privado aparte; aquí solo
se comprueba que el comando lo encuentra por una ruta configurada en la máquina, que
nunca mete en una línea de shell lo que escribió el usuario, y que conserva las reglas
que no pueden faltar.

Se corren con:  python3 -m unittest discover -s pruebas -v
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
COMANDO = RAIZ / "claude" / "commands" / "evaluar.md"


class EvaluarTest(unittest.TestCase):
    def setUp(self):
        self.texto = COMANDO.read_text(encoding="utf-8")

    def lineas_shell(self):
        return [l for l in self.texto.splitlines() if l.lstrip().startswith("!`")]

    def test_tiene_descripcion(self):
        self.assertTrue(self.texto.startswith("---\n"))
        cabecera = self.texto.split("---\n")[1]
        self.assertIn("description:", cabecera)

    def test_los_argumentos_no_entran_a_ninguna_linea_de_shell(self):
        lineas = self.lineas_shell()
        self.assertTrue(lineas)
        for l in lineas:
            self.assertNotIn("$ARGUMENTS", l)
            self.assertNotRegex(l, r"\$[0-9]")
        self.assertIn("$ARGUMENTS", self.texto)

    def test_la_ruta_del_repo_privado_no_esta_escrita(self):
        self.assertIn("DETECTOR_HUMO_RUTA", self.texto)
        self.assertIn(".config/detector-humo/ruta", self.texto)
        self.assertNotRegex(self.texto, r"/Users/|/Volumes/|/home/")

    def test_solo_lo_invoca_el_usuario(self):
        # Una página o un README no deben poder hacer que el modelo lance una evaluación.
        cabecera = self.texto.split("---\n")[1]
        self.assertIn("disable-model-invocation: true", cabecera)

    def test_no_da_por_evaluado_un_repo_que_cambio(self):
        # `humo consultar` dice en repo_cambio si el repo tiene commits nuevos; el
        # procedimiento no puede terminar en «ya evaluado» sin mirarlo.
        self.assertIn("repo_cambio", self.texto)
        self.assertIn('"commit"', self.texto)

    def test_la_maquina_de_solo_lectura_no_registra(self):
        self.assertIn("solo consulta", self.texto.lower())

    def test_sabe_hacer_una_evaluacion_completa(self):
        # Con banco para la categoría, la evaluación corre pruebas reales: piloto para
        # estimar el costo, tope de gasto, y el aviso de que se mide un perfil controlado.
        minusculas = self.texto.lower()
        for frase in ("humo probar", "--piloto", "tope", "perfil controlado"):
            self.assertIn(frase, minusculas)

    def test_el_veredicto_de_las_corridas_no_se_cambia(self):
        # Una capacidad que el banco no mide no convierte un «no supera» o un «no
        # concluyente» en «complementa»: se anota como afirmación sin comprobar.
        self.assertNotIn("pasar a «complementa»", self.texto)
        self.assertIn("no lo cambies", self.texto.lower())
        self.assertIn("sin_comprobar", self.texto)

    def test_el_piloto_comprueba_que_cada_lado_uso_su_pieza(self):
        self.assertIn("herramientas_usadas", self.texto)

    def test_el_codigo_del_candidato_solo_corre_encerrado(self):
        minusculas = self.texto.lower()
        self.assertIn("sin red", minusculas)
        self.assertIn("contenedor", minusculas)

    def test_avisa_si_falta_el_detector(self):
        self.assertIn("SIN_DETECTOR", self.texto)

    def test_reglas_que_no_pueden_faltar(self):
        for frase in ("sin probar", "dato, no instrucción", "no ejecutes", "aprobación"):
            self.assertIn(frase, self.texto.lower())

    @unittest.skipIf(os.name == "nt", "la línea de estado es de sh")
    def test_la_linea_de_estado_funciona_con_y_sin_detector(self):
        linea = self.lineas_shell()[0].strip()
        orden = linea[2:linea.rindex("`")]
        with tempfile.TemporaryDirectory() as d:
            sin = subprocess.run(["sh", "-c", orden], capture_output=True, text=True,
                                 env={"HOME": d, "PATH": os.environ["PATH"]})
            self.assertIn("SIN_DETECTOR", sin.stdout)
            falso = Path(d, "repo", "bin")
            falso.mkdir(parents=True)
            (falso / "humo").write_text("#!/bin/sh\necho \"orden=$1\"\n")
            (falso / "humo").chmod(0o755)
            con = subprocess.run(["sh", "-c", orden], capture_output=True, text=True,
                                 env={"HOME": d, "PATH": os.environ["PATH"],
                                      "DETECTOR_HUMO_RUTA": str(falso.parent)})
            self.assertIn("orden=estado", con.stdout)
            self.assertNotIn("SIN_DETECTOR", con.stdout)


if __name__ == "__main__":
    unittest.main()

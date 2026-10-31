"""exportar.sh por defecto NO escribe en el repo: solo muestra qué cambiaría.
Escribir exige --aplicar (así no se pisan cambios a mano sin revisarlos)."""
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEXTO = (RAIZ / "exportar.sh").read_text(encoding="utf-8")


class ExportarSh(unittest.TestCase):
    def test_modo_por_defecto_trabaja_en_una_copia(self):
        self.assertIn("mktemp -d", TEXTO)
        self.assertIn("rsync -a --exclude='._*'", TEXTO)
        self.assertIn("diff -rq", TEXTO)

    def test_aplicar_es_la_unica_forma_de_escribir(self):
        self.assertIn("--aplicar", TEXTO)
        self.assertIn('[ "${1:-}" = "--aplicar" ]', TEXTO)

    def test_uso_documentado_en_el_encabezado(self):
        cabecera = TEXTO.split("set -uo pipefail")[0]
        self.assertIn("./exportar.sh --aplicar", cabecera)


if __name__ == "__main__":
    unittest.main()

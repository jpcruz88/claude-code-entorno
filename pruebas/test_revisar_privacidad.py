"""Pruebas de herramientas/revisar_privacidad.py.

Los datos «privados» de ejemplo se arman al vuelo (por partes) para que este
archivo no contenga ninguno y la propia revisión del repo siga limpia.
"""
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import revisar_privacidad as rp  # noqa: E402


def tipos(texto, terminos=()):
    return {h[2] for h in rp.revisar_texto(texto, "x", list(terminos))}


class Privacidad(unittest.TestCase):
    def test_detecta(self):
        casos = {
            "ruta de usuario de macOS": "/" + "Users/" + "ana/proyectos",
            "ruta de usuario de Windows": "C:" + "\\" + "Users" + "\\" + "ana",
            "disco montado de macOS": "/" + "Volumes/" + "MiDisco/x",
            "clave tipo sk-": "sk" + "-" + "a1b2c3d4e5f6g7h8i9j0",
            "token de GitHub": "gh" + "p_" + "A" * 36,
            "IP": "conecta a 10." + "0.0.12",
            "correo": "ana" + "@" + "empresa.com",
            "nombre de equipo interno": "servidor" + ".corp",
            "teléfono": "33 " + "1234 " + "5678",
            "CONTEXT7_API_KEY con valor": "CONTEXT7_API_KEY" + "=" + "ctx7" + "abc123",
            "AWS_PROFILE con valor": "export AWS_" + "PROFILE=" + "produccion",
        }
        for tipo, texto in casos.items():
            with self.subTest(tipo):
                self.assertIn(tipo, tipos(texto))

    def test_no_molesta_lo_generico(self):
        for texto in [
            "~/.claude/hooks/guard-kill.py",
            "~/.local/bin/claude",
            "settings.local.json",
            '"CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"',
            "export CONTEXT7_API_KEY='<tu-clave>'",
            "$env:CONTEXT7_API_KEY = $clave",
            "http://127.0.0.1:8765",
            "versión 2.1.301 de Claude Code",
            "Co-Authored-By: Claude <noreply" + "@anthropic.com>",
            "C:\\Users\\<tu-usuario>\\.claude",
            "%USERPROFILE%\\.claude",
            ".env.local",
            '[ -n "${AWS_PROFILE:-}" ]',
            "resets_at 1738425600",
        ]:
            with self.subTest(texto):
                self.assertEqual(tipos(texto), set())

    def test_terminos_privados(self):
        with tempfile.TemporaryDirectory() as d:
            archivo = Path(d) / "terminos.txt"
            archivo.write_text("# comentario\nclienteuno\n/\\bacme\\b/\n", encoding="utf-8")
            terminos = rp.terminos_privados(str(archivo))
            self.assertIn("término privado", tipos("trabajo para ClienteUno", terminos))
            self.assertIn("término privado", tipos("la Acme dice", terminos))
            self.assertNotIn("término privado", tipos("acmelandia", terminos))

    def test_repo_completo(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "limpio.md").write_text("Nada privado aquí.\n", encoding="utf-8")
            self.assertEqual(rp.revisar(repo, []), [])
            (repo / "sucio.md").write_text("ruta /" + "Users/" + "ana\n", encoding="utf-8")
            hallazgos = rp.revisar(repo, [])
            self.assertEqual([(h[0], h[1]) for h in hallazgos], [("sucio.md", 1)])


if __name__ == "__main__":
    unittest.main()

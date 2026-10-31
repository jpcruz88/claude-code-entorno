"""Pruebas de herramientas/revisar_privacidad.py.

Los datos «privados» de ejemplo se arman al vuelo (por partes) para que este
archivo no contenga ninguno y la propia revisión del repo siga limpia.
"""
import subprocess
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
            # Clave de OpenCode Go / Console: no empieza por «sk-», por eso su
            # propio patrón. Se arma por partes para que este archivo no lleve
            # ningún patrón de más.
            "clave tipo oc_sk-": "oc" + "_sk_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4",
            "OPENCODE_API_KEY con valor": "export OPENCODE_API_KEY=" + "'"
            + "oc" + "_sk_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4" + "'",
            "ANTHROPIC_AUTH_TOKEN con valor": "ANTHROPIC_AUTH" + "_TOKEN=\"oc"
            + "_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4\"",
            "OPENAI_API_KEY con valor": "export OPENAI_API_" + "KEY=" + "sk-proj-abc123",
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
            # Variables de OpenCode/Anthropic con marcador: no son valores reales
            'export OPENCODE_API_KEY="${OPENCODE_API_KEY}"',
            "export OPENCODE_API_KEY='<tu-clave>'",
            "$env:ANTHROPIC_AUTH_TOKEN = $clave",
            "ANTHROPIC_AUTH" + "_TOKEN=\"${ANTHROPIC_AUTH_TOKEN}\"",
            "OPENCODE_API_" + "KEY=$OPENCODE_API_KEY",
        ]:
            with self.subTest(texto):
                self.assertEqual(tipos(texto), set())

    def test_marcador_omite_datos_de_ejemplo_de_pruebas(self):
        # Las pruebas de secret-guard y de tablero llevan tokens y rutas falsas a propósito.
        token = "gh" + "p_" + "A" * 36
        self.assertIn("token de GitHub", tipos("const t = '%s'" % token))
        self.assertEqual(tipos("const t = '%s' // privacidad-ok" % token), set())

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


class Historial(unittest.TestCase):
    """Autor/committer y nombres de archivo, en un repo git de prueba."""

    def git(self, repo, *args, **entorno):
        env = dict(__import__("os").environ, GIT_CONFIG_GLOBAL="/dev/null",
                   GIT_CONFIG_NOSYSTEM="1", **entorno)
        subprocess.run(["git", "-C", str(repo)] + list(args), check=True, env=env,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def test_autor_y_nombres(self):
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            self.git(repo, "init", "-q", "-b", "main")
            self.git(repo, "config", "user.name", "Persona Acordada")
            self.git(repo, "config", "user.email", "acordada" + "@ejemplo.invalid")
            (repo / "a.txt").write_text("hola\n")
            self.git(repo, "add", "a.txt")
            self.git(repo, "commit", "-q", "-m", "uno")
            self.assertEqual(rp.revisar(repo, [], historial=True), [])
            # un commit con otra identidad y un archivo con nombre privado
            (repo / "clienteuno.md").write_text("x\n")
            self.git(repo, "add", "clienteuno.md")
            otro = "otra" + "@ejemplo.invalid"
            self.git(repo, "commit", "-q", "-m", "dos", GIT_AUTHOR_NAME="Otra",
                     GIT_AUTHOR_EMAIL=otro, GIT_COMMITTER_NAME="Otra", GIT_COMMITTER_EMAIL=otro)
            terminos = [("clienteuno", __import__("re").compile("clienteuno", 2))]
            tipos_ = {h[2] for h in rp.revisar(repo, terminos, historial=True)}
            self.assertIn("autor distinto del acordado", tipos_)
            self.assertIn("committer distinto del acordado", tipos_)
            self.assertIn("nombre de archivo: término privado", tipos_)


    def test_mismo_correo_con_otro_nombre_se_acepta(self):
        # Commits viejos del mismo correo acordado con otro nombre de usuario de git.
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            self.git(repo, "init", "-q", "-b", "main")
            acordado = "acordada" + "@ejemplo.invalid"
            self.git(repo, "config", "user.name", "Persona Acordada")
            self.git(repo, "config", "user.email", acordado)
            (repo / "a.txt").write_text("hola\n")
            self.git(repo, "add", "a.txt")
            self.git(repo, "commit", "-q", "-m", "uno", GIT_AUTHOR_NAME="usuario",
                     GIT_AUTHOR_EMAIL=acordado, GIT_COMMITTER_NAME="usuario",
                     GIT_COMMITTER_EMAIL=acordado)
            self.assertEqual(rp.revisar(repo, [], historial=True), [])
            # Otro correo sí sigue siendo hallazgo.
            (repo / "b.txt").write_text("x\n")
            self.git(repo, "add", "b.txt")
            ajeno = "otra" + "@ejemplo.invalid"
            self.git(repo, "commit", "-q", "-m", "dos", GIT_AUTHOR_NAME="Otra",
                     GIT_AUTHOR_EMAIL=ajeno, GIT_COMMITTER_NAME="Otra",
                     GIT_COMMITTER_EMAIL=ajeno)
            tipos_ = {h[2] for h in rp.revisar(repo, [], historial=True)}
            self.assertIn("autor distinto del acordado", tipos_)


    def test_commits_de_github_no_son_hallazgo(self):
        # Los merges que hace GitHub al integrar un PR llevan el correo genérico de GitHub.
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            self.git(repo, "init", "-q", "-b", "main")
            acordado = "acordada" + "@ejemplo.invalid"
            self.git(repo, "config", "user.name", "Persona Acordada")
            self.git(repo, "config", "user.email", acordado)
            (repo / "a.txt").write_text("hola\n")
            self.git(repo, "add", "a.txt")
            self.git(repo, "commit", "-q", "-m", "uno")
            (repo / "b.txt").write_text("x\n")
            self.git(repo, "add", "b.txt")
            gh = "noreply" + "@github.com"  # partido: el escáner no debe ver el correo literal
            self.git(repo, "commit", "-q", "-m", "merge de GitHub", GIT_AUTHOR_NAME="GitHub",
                     GIT_AUTHOR_EMAIL=gh, GIT_COMMITTER_NAME="GitHub",
                     GIT_COMMITTER_EMAIL=gh)
            self.assertEqual(rp.revisar(repo, [], historial=True), [])


if __name__ == "__main__":
    unittest.main()

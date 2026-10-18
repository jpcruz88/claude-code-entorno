"""Pruebas de los instaladores en modo no interactivo (el que usa un agente).

instalar.sh se corre de verdad, pero con HOME en una carpeta temporal, con un
`claude` de mentira y sin skills ni codebase-memory-mcp: no toca tu configuración
ni usa internet. Se omiten en Windows y si falta alguno de los programas que el
instalador instalaría (así nunca llega a llamar a brew ni a apt).

instalar.ps1 no se puede correr aquí: solo se revisa por fuera (BOM, CRLF y la
opción -NoInteractivo).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
INSTALAR_SH = RAIZ / "instalar.sh"
INSTALAR_PS1 = RAIZ / "instalar.ps1"
# Sin herdr: su paso llamaría a brew y a herdr de verdad (se prueba en test_herdr.py).
OPCIONES = ["--sin-skills", "--sin-codebase-memory", "--sin-herdr"]

# claude de mentira: anota cada llamada y contesta lo mínimo.
CLAUDE_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-claude.txt"
case "$*" in
  --version) echo "0.0.0 (Claude Code de prueba)" ;;
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""

# Lo mismo que revisa instalar.sh antes de intentar instalar algo.
PROGRAMAS_LISTOS = (
    "git --version && command -v jq && command -v uv"
    " && node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)'"
    " && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'"
)


def programas_listos():
    if os.name == "nt" or not shutil.which("bash"):
        return False
    r = subprocess.run(["bash", "-c", PROGRAMAS_LISTOS], stdin=subprocess.DEVNULL,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return r.returncode == 0


@unittest.skipUnless(programas_listos(),
                     "hace falta macOS o Linux con git, jq, uv, Node.js 18+ y Python 3.8+")
class InstalarShNoInteractivo(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        bin_falso = self.tmp / "bin"
        self.home.mkdir()
        bin_falso.mkdir()
        claude = bin_falso / "claude"
        claude.write_text(CLAUDE_FALSO, encoding="utf-8")
        claude.chmod(0o755)
        # Entorno mínimo: nada de la configuración real (ni la clave de Context7).
        self.env = {"HOME": str(self.home), "SHELL": "/bin/bash",
                    "PATH": str(bin_falso) + os.pathsep + os.environ.get("PATH", ""),
                    "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8"}
        for nombre in ("LANG", "LC_ALL"):
            if os.environ.get(nombre):
                self.env[nombre] = os.environ[nombre]

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, opciones, stdin):
        """Corre instalar.sh; si se quedara esperando una respuesta, el tiempo se agota."""
        r = subprocess.run(["bash", str(INSTALAR_SH)] + opciones, stdin=stdin,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    def comprobar_instalacion(self, salida):
        self.assertIn("Modo no interactivo: no la pido", salida)
        self.assertIn("CONTEXT7_API_KEY", salida)  # explica cómo ponerla después
        ajustes = json.loads((self.home / ".claude" / "settings.json").read_text(encoding="utf-8"))
        self.assertIn("statusLine", ajustes)
        comandos = [h["command"] for g in ajustes["hooks"]["PreToolUse"] for h in g["hooks"]]
        self.assertTrue(any("guard-kill.py" in c for c in comandos), comandos)
        self.assertTrue((self.home / ".claude" / "hooks" / "guard-kill.py").is_file())
        llamadas = (self.home / "llamadas-claude.txt").read_text(encoding="utf-8")
        self.assertIn("plugin install superpowers@claude-plugins-official --scope user", llamadas)
        self.assertIn("mcp add-json --scope user context7", llamadas)
        self.assertFalse((self.home / ".bashrc").exists())  # no guardó ninguna clave
        self.assertIn("Se omite (--sin-herdr).", salida)
        self.assertFalse((self.home / ".config" / "herdr").exists())
        self.assertNotIn("Modo servidor", salida)  # solo con --servidor

    def test_opcion_no_interactivo_aunque_haya_terminal(self):
        import pty  # solo existe en macOS y Linux
        maestro, esclavo = pty.openpty()  # una terminal de verdad en la entrada
        try:
            salida = self.correr(["--no-interactivo"] + OPCIONES, stdin=esclavo)
        finally:
            os.close(maestro)
            os.close(esclavo)
        self.assertIn("Modo no interactivo (opción --no-interactivo)", salida)
        self.comprobar_instalacion(salida)

    def test_sin_terminal_no_pregunta_aunque_falte_la_opcion(self):
        lectura, escritura = os.pipe()  # entrada abierta que nunca recibe nada
        try:
            salida = self.correr(OPCIONES, stdin=lectura)
        finally:
            os.close(lectura)
            os.close(escritura)
        self.assertIn("Modo no interactivo (la entrada no es una terminal)", salida)
        self.comprobar_instalacion(salida)

    def test_segunda_corrida_no_cambia_nada(self):
        self.correr(["--no-interactivo"] + OPCIONES, stdin=subprocess.DEVNULL)
        ajustes = self.home / ".claude" / "settings.json"
        antes = ajustes.read_bytes()
        salida = self.correr(["--no-interactivo"] + OPCIONES, stdin=subprocess.DEVNULL)
        self.assertEqual(ajustes.read_bytes(), antes)
        self.assertIn("settings.json ya estaba al día", salida)
        self.assertIn("al día: %s" % (self.home / ".claude" / "hooks" / "guard-kill.py"), salida)
        respaldos = [p.name for p in (self.home / ".claude").rglob("*.bak-*")]
        self.assertEqual(respaldos, [])


    def test_ayuda_lista_las_opciones_nuevas(self):
        salida = self.correr(["--ayuda"], stdin=subprocess.DEVNULL)
        for opcion in ("--sin-herdr", "--sin-ghostty", "--sin-plugins-herdr", "--servidor"):
            self.assertIn(opcion, salida)

    @unittest.skipUnless(sys.platform == "darwin", "el modo servidor solo existe en macOS")
    def test_servidor_en_simulacion_no_cambia_nada(self):
        salida = self.correr(["--simular", "--no-interactivo", "--servidor"] + OPCIONES,
                             stdin=subprocess.DEVNULL)
        self.assertIn("==> Modo servidor", salida)
        self.assertIn("sleep 0 autorestart 1", salida)  # «al día» o «[simular] haría»
        self.assertNotIn("$ sudo", salida)  # en simulación nunca se ejecuta sudo
        self.assertIn("Ítems de inicio", salida)


class InstalarPs1(unittest.TestCase):
    """Revisión por fuera: aquí no hay PowerShell para correrlo."""

    def setUp(self):
        self.datos = INSTALAR_PS1.read_bytes()

    def test_bom_y_crlf(self):
        # Sin BOM, PowerShell 5.1 lee el archivo como ANSI y rompe las tildes.
        self.assertTrue(self.datos.startswith(b"\xef\xbb\xbf"), "instalar.ps1 perdió el BOM")
        sueltos = self.datos.replace(b"\r\n", b"")
        self.assertNotIn(b"\n", sueltos, "instalar.ps1 tiene finales de línea LF")
        self.assertNotIn(b"\r", sueltos, "instalar.ps1 tiene finales de línea CR sueltos")

    def test_opcion_no_interactivo(self):
        texto = self.datos.decode("utf-8-sig")
        self.assertIn("[switch]$NoInteractivo", texto)
        self.assertIn("-not (Entrada-Interactiva)", texto)
        # La única pregunta (la clave de Context7) va después del caso no interactivo.
        self.assertLess(texto.index("} elseif ($NoInteractivo) {"),
                        texto.index("Read-Host '    Pega tu clave de Context7"))
        self.assertEqual(texto.count("= Read-Host "), 2)  # la clave y «¿la guardo?»


if __name__ == "__main__":
    unittest.main()

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
# Sin Stats: tocaría tus preferencias reales de macOS (se prueba en InstalarStats).
# Sin herramientas de terminal: agregarían una línea al .bashrc (se prueba en test_terminal.py).
OPCIONES = ["--sin-skills", "--sin-codebase-memory", "--sin-herdr", "--sin-stats",
            "--sin-terminal"]

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

# Programas de macOS de mentira para el paso de Stats: anotan cada llamada y guardan
# su estado en HOME, así nunca tocan tus preferencias, tus ítems de inicio ni brew.
BREW_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-brew.txt"
case "$*" in
  "install --cask stats") mkdir -p "$HOME/Applications/Stats.app" ;;
esac
exit 0
"""

# Guarda «dominio clave valor» por línea en $HOME/defaults.txt.
DEFAULTS_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-defaults.txt"
case "$1" in
  read) grep -q "^$2 $3 " "$HOME/defaults.txt" 2>/dev/null ;;
  write) echo "$2 $3 $5" >> "$HOME/defaults.txt" ;;
  *) exit 1 ;;
esac
"""

# Guarda el nombre de cada app agregada a los ítems de inicio, una por línea.
OSASCRIPT_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-osascript.txt"
case "$*" in
  *"make login item"*)
    echo "$*" | sed -n 's|.*path:"[^"]*/\\([^"/]*\\)\\.app".*|\\1|p' >> "$HOME/items-de-inicio.txt" ;;
  *"every login item"*) tr '\\n' ',' < "$HOME/items-de-inicio.txt" 2>/dev/null ;;
esac
exit 0
"""

OPEN_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-open.txt"
exit 0
"""

# Ninguna app está abierta (las de verdad pueden estarlo en esta Mac).
PGREP_FALSO = """#!/bin/sh
exit 1
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


class BaseInstalarSh(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.falso("claude", CLAUDE_FALSO)
        # Siempre de mentira, aunque la prueba no los espere: ninguna corrida debe
        # instalar apps, ni tocar tus preferencias o tus ítems de inicio.
        for nombre, guion in (("brew", BREW_FALSO), ("defaults", DEFAULTS_FALSO),
                              ("osascript", OSASCRIPT_FALSO), ("open", OPEN_FALSO),
                              ("pgrep", PGREP_FALSO)):
            self.falso(nombre, guion)
        # Entorno mínimo: nada de la configuración real (ni la clave de Context7).
        self.env = {"HOME": str(self.home), "SHELL": "/bin/bash",
                    "PATH": str(self.bin) + os.pathsep + os.environ.get("PATH", ""),
                    "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8",
                    # Una carpeta de apps vacía: así no cuentan las que ya tengas.
                    "CARPETA_APPS": str(self.tmp / "Applications")}
        for nombre in ("LANG", "LC_ALL"):
            if os.environ.get(nombre):
                self.env[nombre] = os.environ[nombre]

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def falso(self, nombre, guion):
        ruta = self.bin / nombre
        ruta.write_text(guion, encoding="utf-8")
        ruta.chmod(0o755)

    def correr(self, opciones, stdin):
        """Corre instalar.sh; si se quedara esperando una respuesta, el tiempo se agota."""
        r = subprocess.run(["bash", str(INSTALAR_SH)] + opciones, stdin=stdin,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    def leer(self, nombre):
        archivo = self.home / nombre
        return archivo.read_text(encoding="utf-8") if archivo.exists() else ""


@unittest.skipUnless(programas_listos(),
                     "hace falta macOS o Linux con git, jq, uv, Node.js 18+ y Python 3.8+")
class InstalarShNoInteractivo(BaseInstalarSh):
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
        for opcion in ("--sin-herdr", "--sin-ghostty", "--sin-plugins-herdr", "--servidor",
                       "--sin-stats", "--sin-terminal", "--sin-nvim"):
            self.assertIn(opcion, salida)

    @unittest.skipUnless(sys.platform == "darwin", "el modo servidor solo existe en macOS")
    def test_servidor_en_simulacion_no_cambia_nada(self):
        salida = self.correr(["--simular", "--no-interactivo", "--servidor"] + OPCIONES,
                             stdin=subprocess.DEVNULL)
        self.assertIn("==> Modo servidor", salida)
        self.assertIn("sleep 0 autorestart 1", salida)  # «al día» o «[simular] haría»
        self.assertNotIn("$ sudo", salida)  # en simulación nunca se ejecuta sudo
        self.assertIn("Ítems de inicio", salida)


@unittest.skipUnless(programas_listos() and sys.platform == "darwin",
                     "Stats solo existe en macOS (y hacen falta git, jq, uv, Node.js y Python)")
class InstalarStats(BaseInstalarSh):
    """El monitor de la barra de menú (brew, defaults, osascript y open son de mentira)."""

    OPCIONES = ["--no-interactivo", "--sin-skills", "--sin-codebase-memory", "--sin-herdr",
                "--sin-terminal"]
    MODULOS = ["eu.exelban.Stats CPU_state true", "eu.exelban.Stats GPU_state true",
               "eu.exelban.Stats RAM_state true", "eu.exelban.Stats Disk_state true",
               "eu.exelban.Stats Network_state false"]

    def correr_stats(self, *extra):
        return self.correr(self.OPCIONES + list(extra), stdin=subprocess.DEVNULL)

    def items_de_inicio(self):
        return sorted(self.leer("items-de-inicio.txt").splitlines())

    def abiertas(self):
        return self.leer("llamadas-open.txt")

    def test_instala_stats_con_cpu_gpu_ram_y_disco(self):
        self.correr_stats()
        self.assertIn("install --cask stats", self.leer("llamadas-brew.txt"))
        self.assertEqual(sorted(self.leer("defaults.txt").splitlines()), sorted(self.MODULOS))
        self.assertIn("Stats", self.items_de_inicio())
        self.assertIn(str(self.home / "Applications" / "Stats.app"), self.abiertas())

    def test_solo_instala_stats(self):
        self.correr_stats()
        self.assertEqual(self.leer("llamadas-brew.txt"), "install --cask stats\n")
        self.assertEqual(self.items_de_inicio(), ["Stats"])

    def test_segunda_corrida_no_repite_nada(self):
        self.correr_stats()
        salida = self.correr_stats()
        self.assertEqual(self.leer("llamadas-brew.txt").count("install --cask stats\n"), 1)
        self.assertEqual(len(self.leer("defaults.txt").splitlines()), len(self.MODULOS))
        self.assertEqual(self.items_de_inicio(), ["Stats"])
        self.assertIn("al día: módulos de Stats", salida)

    def test_respeta_lo_que_cambiaste_en_stats(self):
        (self.home / "defaults.txt").write_text("eu.exelban.Stats Network_state true\n",
                                                encoding="utf-8")
        self.correr_stats()
        modulos = self.leer("defaults.txt").splitlines()
        self.assertIn("eu.exelban.Stats Network_state true", modulos)
        self.assertNotIn("eu.exelban.Stats Network_state false", modulos)
        self.assertIn("eu.exelban.Stats GPU_state true", modulos)

    def test_sin_stats_no_toca_nada(self):
        salida = self.correr_stats("--sin-stats")
        self.assertIn("Se omite (--sin-stats).", salida)
        for archivo in ("llamadas-brew.txt", "llamadas-defaults.txt",
                        "llamadas-osascript.txt", "llamadas-open.txt"):
            self.assertEqual(self.leer(archivo), "", archivo)

    def test_simular_no_cambia_nada(self):
        salida = self.correr_stats("--simular")
        self.assertIn("[simular] haría: brew install --cask stats", salida)
        self.assertIn("[simular] haría: defaults write eu.exelban.Stats GPU_state -bool true", salida)
        self.assertIn("[simular] haría: agregar Stats a los ítems de inicio", salida)
        self.assertNotIn("install", self.leer("llamadas-brew.txt"))
        self.assertEqual(self.leer("defaults.txt"), "")
        self.assertEqual(self.leer("items-de-inicio.txt"), "")
        self.assertEqual(self.abiertas(), "")


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

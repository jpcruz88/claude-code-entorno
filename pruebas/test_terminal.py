"""Pruebas de las herramientas de terminal: eza, bat, zoxide, fzf y atuin.

PasoTerminal corre instalar_comun.py de verdad con HOME en una carpeta temporal:
copia terminal/terminal.sh y agrega al .zshrc (o .bashrc) la línea que lo carga.

ArchivoTerminal carga terminal/terminal.sh en zsh y bash, con o sin las herramientas
(unas de mentira que solo anotan que se cargaron): no usa tus programas reales.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
INSTALAR_COMUN = RAIZ / "herramientas" / "instalar_comun.py"
TERMINAL = RAIZ / "terminal" / "terminal.sh"
LINEA = ('[ -f "$HOME/.config/claude-code-entorno/terminal.sh" ] && '
         '. "$HOME/.config/claude-code-entorno/terminal.sh"')

CLAUDE_FALSO = """#!/bin/sh
case "$*" in
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""


class PasoTerminal(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        claude = self.bin / "claude"
        claude.write_text(CLAUDE_FALSO, encoding="utf-8")
        claude.chmod(0o755)
        self.env = {"HOME": str(self.home), "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8",
                    "SHELL": "/bin/zsh",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *opciones):
        # --sin-opencode aísla este paso: opencode/opencode.sh también agrega una
        # línea al rc (se prueba en test_opencode.py). --sin-opencode-config evita
        # un git clone real (el de ese paso se prueba en test_opencode_config.py).
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", "unix",
                "--sin-codebase-memory", "--sin-skills", "--sin-herdr",
                "--sin-opencode", "--sin-opencode-config"] + list(opciones)
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    @property
    def copia(self):
        return self.home / ".config" / "claude-code-entorno" / "terminal.sh"

    def leer(self, nombre):
        archivo = self.home / nombre
        return archivo.read_text(encoding="utf-8") if archivo.exists() else ""

    def test_copia_el_archivo_y_lo_carga_desde_zshrc(self):
        (self.home / ".zshrc").write_text("export PREVIO=1", encoding="utf-8")  # sin \n final
        salida = self.correr()
        self.assertEqual(self.copia.read_bytes(), TERMINAL.read_bytes())
        zshrc = self.leer(".zshrc")
        self.assertTrue(zshrc.startswith("export PREVIO=1\n"), zshrc)
        self.assertEqual(zshrc.count(LINEA), 1)
        self.assertTrue(zshrc.endswith(LINEA + "\n"), zshrc)
        self.assertFalse((self.home / ".bashrc").exists())
        self.assertIn("Abre una terminal nueva", salida)

    def test_con_bash_usa_bashrc(self):
        self.env["SHELL"] = "/bin/bash"
        self.correr()
        self.assertEqual(self.leer(".bashrc").count(LINEA), 1)
        self.assertFalse((self.home / ".zshrc").exists())

    def test_segunda_corrida_no_repite_la_linea(self):
        self.correr()
        salida = self.correr()
        self.assertEqual(self.leer(".zshrc").count(LINEA), 1)
        self.assertIn("al día: %s" % self.copia, salida)
        self.assertNotIn("Abre una terminal nueva", salida)

    def test_sin_terminal_no_toca_nada(self):
        salida = self.correr("--sin-terminal")
        self.assertIn("Se omite (--sin-terminal).", salida)
        self.assertFalse(self.copia.exists())
        self.assertFalse((self.home / ".zshrc").exists())

    def test_simular_no_cambia_nada(self):
        salida = self.correr("--simular")
        self.assertIn("[simular] agregaría a %s" % (self.home / ".zshrc"), salida)
        self.assertFalse(self.copia.exists())
        self.assertFalse((self.home / ".zshrc").exists())


# Herramientas de mentira: cada una, al cargarse, anota su nombre en $HOME/orden.txt.
HERRAMIENTAS = {
    "fzf": 'echo \'echo fzf >> "$HOME/orden.txt"\'',
    "zoxide": 'echo \'echo zoxide >> "$HOME/orden.txt"; z() { echo "z $*"; }\'',
    "atuin": 'echo "echo \'atuin $*\' >> \\"\\$HOME/orden.txt\\""',  # anota sus argumentos
    "eza": 'echo "eza $*"',
    "bat": 'echo "bat $*"',
}


@unittest.skipUnless(shutil.which("zsh") and shutil.which("bash"), "hacen falta zsh y bash")
class ArchivoTerminal(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.env = {"HOME": str(self.home), "TMPDIR": str(self.tmp), "TERM": "dumb",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def con_herramientas(self):
        for nombre, cuerpo in HERRAMIENTAS.items():
            ruta = self.bin / nombre
            ruta.write_text("#!/bin/sh\n%s\n" % cuerpo, encoding="utf-8")
            ruta.chmod(0o755)

    def cargar(self, shell, comando, interactiva=True):
        args = [shell] + (["-i"] if interactiva else []) + \
               ["-c", ". \"%s\"; %s" % (TERMINAL, comando)]
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, env=self.env, timeout=30)
        return (r.returncode, r.stdout.decode("utf-8", "replace"),
                r.stderr.decode("utf-8", "replace"))

    def orden(self):
        archivo = self.home / "orden.txt"
        return archivo.read_text(encoding="utf-8").splitlines() if archivo.exists() else []

    def test_sin_las_herramientas_no_rompe_la_terminal(self):
        for shell in ("zsh", "bash"):
            codigo, salida, errores = self.cargar(shell, "echo listo")
            self.assertEqual((codigo, salida), (0, "listo\n"), (shell, errores))
            self.assertNotIn("not found", errores, shell)

    def test_zsh_carga_todo_y_atuin_despues_de_fzf(self):
        self.con_herramientas()
        codigo, salida, errores = self.cargar("zsh", "alias ll; z proyecto; echo $BAT_THEME")
        self.assertEqual(codigo, 0, errores)
        # atuin después de fzf: así ctrl+r es el de atuin; la flecha arriba no la toma.
        self.assertEqual(self.orden(), ["fzf", "zoxide", "atuin init zsh --disable-up-arrow"])
        self.assertIn("eza -l", salida)
        self.assertIn("z proyecto", salida)
        self.assertIn("Visual Studio Dark+", salida)

    def test_bash_no_carga_atuin(self):
        # atuin en bash necesita bash-preexec; sin él rompe el historial.
        self.con_herramientas()
        codigo, salida, errores = self.cargar("bash", "alias ll")
        self.assertEqual(codigo, 0, errores)
        self.assertEqual(self.orden(), ["fzf", "zoxide"])
        self.assertIn("eza -l", salida)

    def test_no_cambia_ls_ni_cat(self):
        # Claude Code y los scripts usan ls y cat y esperan su salida de siempre.
        self.con_herramientas()
        codigo, salida, errores = self.cargar("zsh", "alias ls; alias cat; true")
        self.assertEqual(codigo, 0, errores)
        self.assertNotIn("eza", salida)
        self.assertNotIn("bat", salida)

    def test_fuera_de_una_terminal_interactiva_no_hace_nada(self):
        self.con_herramientas()
        codigo, salida, errores = self.cargar("zsh", "echo listo", interactiva=False)
        self.assertEqual((codigo, salida), (0, "listo\n"), errores)
        self.assertEqual(self.orden(), [])


if __name__ == "__main__":
    unittest.main()

"""Pruebas del atajo `cl` (Claude Code sin pedir permisos).

Corren instalar_comun.py de verdad con HOME en una carpeta temporal: en Mac y Linux
copia terminal/cl a ~/.local/bin/cl; en Windows agrega la función `cl` a cada
perfil de PowerShell.
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
CL = RAIZ / "terminal" / "cl"
FUNCION_PS1 = "function cl { claude --dangerously-skip-permissions @args }"

CLAUDE_FALSO = """#!/bin/sh
case "$*" in
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
echo "ARGS: $*"
exit 0
"""


class Base(unittest.TestCase):
    plataforma = None

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        claude = self.bin / "claude"
        claude.write_text(CLAUDE_FALSO, encoding="utf-8")
        claude.chmod(0o755)
        self.perfiles = [self.home / "Documents" / "PowerShell" / "Microsoft.PowerShell_profile.ps1",
                         self.home / "Documents" / "WindowsPowerShell" / "Microsoft.PowerShell_profile.ps1"]
        self.env = {"HOME": str(self.home), "USERPROFILE": str(self.home),
                    "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8", "SHELL": "/bin/zsh",
                    "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
                    "PATH": os.pathsep.join([str(self.bin), str(self.home / ".local" / "bin"),
                                             "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *opciones):
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", self.plataforma,
                "--sin-codebase-memory", "--sin-skills", "--sin-herdr", "--sin-mods",
                "--sin-terminal", "--sin-opencode", "--sin-opencode-config", "--sin-nvim"]
        for perfil in self.perfiles:
            args += ["--perfil-ps", str(perfil)]
        r = subprocess.run(args + list(opciones), stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida


@unittest.skipIf(sys.platform == "win32", "el script de cl es para Mac y Linux")
class AtajoUnix(Base):
    plataforma = "unix"

    @property
    def destino(self):
        return self.home / ".local" / "bin" / "cl"

    def test_copia_cl_ejecutable(self):
        self.correr()
        self.assertEqual(self.destino.read_bytes(), CL.read_bytes())
        self.assertTrue(os.access(str(self.destino), os.X_OK))

    def test_cl_arranca_claude_con_bypass(self):
        self.correr()
        r = subprocess.run([str(self.destino), "--resume", "abc"], env=self.env,
                           stdout=subprocess.PIPE, timeout=30)
        self.assertEqual(r.stdout.decode().strip(),
                         "ARGS: --dangerously-skip-permissions --resume abc")

    def test_avisa_si_local_bin_no_esta_en_el_path(self):
        self.env["PATH"] = os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])
        salida = self.correr()
        self.assertIn("~/.local/bin no está en tu PATH", salida)

    def test_simular_no_copia(self):
        self.correr("--simular")
        self.assertFalse(self.destino.exists())


class AtajoWindows(Base):
    plataforma = "windows"

    def test_agrega_la_funcion_a_cada_perfil_una_vez(self):
        self.perfiles[0].parent.mkdir(parents=True)
        self.perfiles[0].write_text("Set-Alias previo Get-Date", encoding="utf-8")
        self.correr()
        salida = self.correr()
        self.assertTrue(self.perfiles[0].read_text(encoding="utf-8")
                        .startswith("Set-Alias previo Get-Date\n"))
        for perfil in self.perfiles:
            with self.subTest(perfil.parent.name):
                self.assertEqual(perfil.read_text(encoding="utf-8").count(FUNCION_PS1), 1)
        self.assertIn("al día: %s ya lo carga" % self.perfiles[0], salida)
        self.assertFalse((self.home / ".local" / "bin" / "cl").exists())

    @unittest.skipUnless(shutil.which("pwsh") or shutil.which("powershell"),
                         "necesita PowerShell (corre en el CI de Windows)")
    def test_cl_en_powershell_arranca_claude_con_bypass(self):
        self.correr()
        # Un claude de mentira que PowerShell encuentra en el PATH y repite sus argumentos.
        (self.bin / "claude.ps1").write_text(
            "Write-Output ('ARGS: ' + ($args -join ' '))", encoding="utf-8")
        ps = shutil.which("pwsh") or shutil.which("powershell")
        orden = ". '%s'; cl --resume abc" % self.perfiles[0]
        env = dict(os.environ, PATH=os.pathsep.join([str(self.bin), os.environ.get("PATH", "")]))
        r = subprocess.run([ps, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", orden],
                           env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        self.assertIn("ARGS: --dangerously-skip-permissions --resume abc",
                      r.stdout.decode("utf-8", "replace"))

    def test_simular_no_toca_los_perfiles(self):
        self.correr("--simular")
        for perfil in self.perfiles:
            self.assertFalse(perfil.exists())


if __name__ == "__main__":
    unittest.main()

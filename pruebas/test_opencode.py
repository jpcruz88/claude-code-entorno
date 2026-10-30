"""Pruebas del paso de OpenCode como respaldo: opencode/ en el .zshrc o .bashrc.

PasoOpenCode corre instalar_comun.py de verdad con HOME en una carpeta temporal:
copia opencode/opencode.sh y opencode/opencode-go-modelos, y agrega al rc la línea
que carga el primero. No se prueba aquí el contenido del script de modelos (se
ejecuta solo, sin red) ni las aliases en sí: esas se prueban cargando el archivo
en el shell, abajo.

Ninguna prueba escribe una clave real: el instalador solo debe referenciar las
variables de entorno, y ese es justo lo que se comprueba.
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
INIT = RAIZ / "opencode" / "opencode.sh"
SCRIPT = RAIZ / "opencode" / "opencode-go-modelos"
LINEA = ('[ -f "$HOME/.config/claude-code-entorno/opencode.sh" ] && '
         '. "$HOME/.config/claude-code-entorno/opencode.sh"')

CLAUDE_FALSO = """#!/bin/sh
case "$*" in
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""


class PasoOpenCode(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        claude = self.bin / "claude"
        claude.write_text(CLAUDE_FALSO, encoding="utf-8")
        claude.chmod(0o755)
        self.env = {"HOME": str(self.home), "TMPDIR": str(self.tmp),
                    "PYTHONIOENCODING": "utf-8", "SHELL": "/bin/zsh",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *opciones):
        # --sin-terminal aísla este paso: terminal/terminal.sh también agrega una
        # línea al rc (se prueba en test_terminal.py).
        # --sin-opencode-config evita un git clone real (se prueba en
        # test_opencode_config.py). --sin-opencode NO va aquí: es el paso que se prueba.
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", "unix",
                "--sin-codebase-memory", "--sin-skills", "--sin-herdr",
                "--sin-terminal", "--sin-opencode-config"] + list(opciones)
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    @property
    def init(self):
        return self.home / ".config" / "claude-code-entorno" / "opencode.sh"

    @property
    def script(self):
        return self.home / ".local" / "bin" / "opencode-go-modelos"

    def leer(self, nombre):
        archivo = self.home / nombre
        return archivo.read_text(encoding="utf-8") if archivo.exists() else ""

    # ------------------------------------------------------------ instalación
    def test_copia_el_init_y_el_script(self):
        self.correr()
        self.assertEqual(self.init.read_bytes(), INIT.read_bytes())
        self.assertEqual(self.script.read_bytes(), SCRIPT.read_bytes())
        if os.name != "nt":
            self.assertTrue(os.access(str(self.script), os.X_OK),
                            "el script de modelos debe quedar ejecutable")

    def test_agrega_la_linea_al_zshrc_sin_borrar_lo_previo(self):
        (self.home / ".zshrc").write_text("export PREVIO=1", encoding="utf-8")  # sin \n final
        self.correr()
        zshrc = self.leer(".zshrc")
        self.assertTrue(zshrc.startswith("export PREVIO=1\n"), zshrc)
        self.assertEqual(zshrc.count(LINEA), 1)
        self.assertTrue(zshrc.endswith(LINEA + "\n"), zshrc)
        self.assertFalse((self.home / ".bashrc").exists())

    def test_con_bash_usa_bashrc(self):
        self.env["SHELL"] = "/bin/bash"
        self.correr()
        self.assertEqual(self.leer(".bashrc").count(LINEA), 1)
        self.assertFalse((self.home / ".zshrc").exists())

    def test_segunda_corrida_no_repite_la_linea(self):
        self.correr()
        salida = self.correr()
        self.assertEqual(self.leer(".zshrc").count(LINEA), 1)
        self.assertIn("al día: %s" % self.init, salida)

    def test_sin_opencode_no_toca_nada(self):
        self.correr("--sin-opencode")
        self.assertFalse(self.init.exists())
        self.assertFalse(self.script.exists())
        self.assertFalse((self.home / ".zshrc").exists())
        self.assertFalse((self.home / ".bashrc").exists())
        self.assertIn("Se omite (--sin-opencode).", self.correr("--sin-opencode"))

    # ------------------------------------------------------------ sin claves
    def test_no_escribe_claves_y_pide_las_variables(self):
        salida = self.correr()
        # ni en el init, ni en el script, ni en el rc, ni en la salida del instalador
        for texto, origen in [(self.init.read_text(encoding="utf-8"), "init"),
                              (self.script.read_text(encoding="utf-8"), "script"),
                              (self.leer(".zshrc"), "zshrc"), (salida, "salida")]:
            with self.subTest(origen):
                self.assertNotIn("oc_sk_", texto, origen)
                self.assertNotIn("sk-or-v1-", texto, origen)
        # sí debe referenciar las variables, que las pone el usuario en cada máquina
        self.assertIn("OPENCODE_API_KEY", self.init.read_text(encoding="utf-8"))
        self.assertIn("OPENCODE_API_KEY", salida)

    def test_el_init_no_define_aliases_sin_clave(self):
        """El init, cargado sin claves, no debe crear ninguna alias."""
        self.correr()
        comando = (f'shopt -s expand_aliases; . "{self.init}"; '
                   'alias cl-go >/dev/null 2>&1 && echo DEFINIDA || echo AUSENTE')
        r = subprocess.run(["bash", "-ic", comando], stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, env=dict(self.env))
        self.assertIn("AUSENTE", r.stdout.decode("utf-8", "replace"))

    def test_el_init_define_cl_go_cuando_hay_clave(self):
        self.correr()
        env = dict(self.env, OPENCODE_API_KEY="<de-mentira>")
        comando = (f'shopt -s expand_aliases; . "{self.init}"; '
                   'alias cl-go >/dev/null 2>&1 && echo DEFINIDA || echo AUSENTE')
        r = subprocess.run(["bash", "-ic", comando], stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, env=env)
        self.assertIn("DEFINIDA", r.stdout.decode("utf-8", "replace"))


class ArchivoOpenCode(unittest.TestCase):
    """Carga opencode/opencode.sh en el shell, con y sin sus variables."""

    def cargar(self, *vars_de_entorno):
        tmp = Path(tempfile.mkdtemp())
        binario = tmp / "bin"
        binario.mkdir()
        # opencode.sh solo define las aliases si encuentra `claude`
        fake = binario / "claude"
        fake.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        fake.chmod(0o755)
        try:
            env = {"HOME": str(tmp),
                   "PATH": os.pathsep.join([str(binario), "/usr/bin", "/bin"])}
            env.update(dict.fromkeys(vars_de_entorno, "<de-mentira>"))
            comando = ('shopt -s expand_aliases; . "%s"; '
                       'alias cl-go >/dev/null 2>&1 && echo "cl-go DEFINIDA"; '
                       'alias cl-or >/dev/null 2>&1 && echo "cl-or DEFINIDA"' % INIT)
            r = subprocess.run(["bash", "-ic", comando], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, env=env, timeout=60)
            return r.stdout.decode("utf-8", "replace")
        finally:
            shutil.rmtree(str(tmp), ignore_errors=True)

    def test_sin_variables_no_define_nada(self):
        salida = self.cargar()
        self.assertNotIn("DEFINIDA", salida)

    def test_con_opencode_define_solo_cl_go(self):
        salida = self.cargar("OPENCODE_API_KEY")
        self.assertIn("cl-go DEFINIDA", salida)
        self.assertNotIn("cl-or DEFINIDA", salida)

    def test_con_openrouter_define_solo_cl_or(self):
        salida = self.cargar("OPENROUTER_API_KEY")
        self.assertIn("cl-or DEFINIDA", salida)
        self.assertNotIn("cl-go DEFINIDA", salida)

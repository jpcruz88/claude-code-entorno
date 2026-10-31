"""Pruebas del paso que trae opencode-config a ~/.config/opencode.

OpencodeConfig corre instalar_comun.py de verdad con HOME en una carpeta temporal
y, en lugar de GitHub, con un repo local que hace de opencode-config: así se
prueban los tres caminos (clonar, convertir una carpeta ya existente, hacer pull)
sin red y sin tocar ~/.config/opencode real.

Lo que más importa proteger aquí es `service.json`, la contraseña local: tiene que
sobrevivir a la conversión en clon y quedar fuera de git.
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

CLAUDE_FALSO = """#!/bin/sh
case "$*" in
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""

# El repo «remoto», montado en una carpeta temporal.
ARCHIVOS = {
    ".gitignore": "service.json\nauth.json\n*.db\n.DS_Store\n",
    "opencode.jsonc": '{\n  "$schema": "https://opencode.ai/config.json"\n}\n',
    "bin/gomodel": "#!/bin/sh\necho gomodel-de-prueba\n",
}

CONTRASENA = '{"password":' + ' "secreta" ' + "}"   # se arma para no dejarla escrita


def preparar_remoto(base):
    repositorio = Path(base) / "opencode-config-remoto"
    subprocess.run(["git", "init", "-q", "-b", "main", str(repositorio)], check=True)
    for relativo, texto in ARCHIVOS.items():
        ruta = repositorio / relativo
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(texto, encoding="utf-8")
        if relativo.startswith("bin/"):
            ruta.chmod(0o755)
    for clave, valor in (("user.name", "Prueba"), ("user.email", "prueba@example.com")):
        subprocess.run(["git", "-C", str(repositorio), "config", clave, valor], check=True)
    subprocess.run(["git", "-C", str(repositorio), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(repositorio), "commit", "-q", "-m", "inicio"], check=True)
    return repositorio


def anadir_commit(repositorio, nombre):
    (repositorio / nombre).write_text("nuevo\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repositorio), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(repositorio), "commit", "-q", "-m", nombre], check=True)


class OpencodeConfig(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        claude = self.bin / "claude"
        claude.write_text(CLAUDE_FALSO, encoding="utf-8")
        claude.chmod(0o755)
        self.remoto = preparar_remoto(self.tmp)
        self.env = {
            "HOME": str(self.home), "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8",
            "SHELL": "/bin/zsh", "ENTORNO_OPENCODE_CONFIG_REPO": str(self.remoto),
            "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin", "/usr/sbin"]),
        }

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *opciones):
        # Se aíslan los demás pasos: pruebas de terminal, skills, herdr, etc.
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", "unix",
                "--sin-codebase-memory", "--sin-skills", "--sin-herdr", "--sin-nvim",
                "--sin-terminal", "--sin-opencode"] + list(opciones)
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, env=self.env, timeout=180)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    @property
    def cfg(self):
        return self.home / ".config" / "opencode"

    def service_json(self, contenido=CONTRASENA):
        """Crea el service.json con la contraseña local y permisos 600."""
        self.cfg.mkdir(parents=True, exist_ok=True)
        ruta = self.cfg / "service.json"
        ruta.write_text(contenido, encoding="utf-8")
        ruta.chmod(0o600)
        return ruta

    def leer(self, relativo):
        ruta = self.cfg / relativo
        return ruta.read_text(encoding="utf-8") if ruta.exists() else None

    def en_repo(self, relativo):
        r = subprocess.run(["git", "-C", str(self.cfg), "ls-files", "--error-unmatch", relativo],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return r.returncode == 0

    # ------------------------------------------------------------ caminos
    def test_clona_y_enlaza_gomodel(self):
        salida = self.correr()
        self.assertTrue((self.cfg / ".git").is_dir(), "debe quedar como clon")
        self.assertEqual(self.leer("opencode.jsonc"), ARCHIVOS["opencode.jsonc"])
        enlace = self.home / ".local" / "bin" / "gomodel"
        self.assertTrue(enlace.is_symlink(), "gomodel debe quedar enlazado")
        r = subprocess.run([str(enlace)], stdout=subprocess.PIPE)
        self.assertIn("gomodel-de-prueba", r.stdout.decode())

    def test_convierte_carpeta_existente_sin_tocar_service_json(self):
        original = self.service_json()
        self.assertTrue(original.exists())
        salida = self.correr()
        # el contenido y los permisos quedan igual
        self.assertEqual(original.read_bytes(), CONTRASENA.encode())
        self.assertEqual(original.stat().st_size, len(CONTRASENA))
        if os.name != "nt":
            self.assertEqual(original.stat().st_mode & 0o777, 0o600)
        # y git lo ignora, aunque ahora la carpeta es un clon
        self.assertTrue((self.cfg / ".git").is_dir())
        self.assertFalse(self.en_repo("service.json"), "service.json no debe entrar a git")
        # la config sí se trajo
        self.assertEqual(self.leer("opencode.jsonc"), ARCHIVOS["opencode.jsonc"])
        self.assertNotIn("ERROR", salida)

    def test_segunda_corrida_hace_pull_y_no_vuelve_a_convertir(self):
        self.service_json()          # carpeta existente sin repo → se convierte
        self.correr()
        anadir_commit(self.remoto, "segundo.txt")
        salida = self.correr()       # ahora es un repo: debe hacer pull
        self.assertNotIn("convertido en clon", salida)
        self.assertTrue((self.cfg / "segundo.txt").exists(), "el pull debe traer el archivo")
        self.assertEqual((self.cfg / "service.json").read_bytes(), CONTRASENA.encode())

    def test_sin_opencode_config_no_toca_nada(self):
        salida = self.correr("--sin-opencode-config")
        self.assertIn("Se omite (--sin-opencode-config).", salida)
        self.assertFalse(self.cfg.exists())
        self.assertFalse((self.home / ".local" / "bin" / "gomodel").exists())

    # ------------------------------------------------------------ avisos
    def test_avisa_sobre_opencode_json_no_gestionado(self):
        self.cfg.mkdir(parents=True, exist_ok=True)
        ajeno = self.cfg / "opencode.json"
        ajeno.write_text('{"model": "otro"}', encoding="utf-8")
        salida = self.correr()
        self.assertIn("opencode.json", salida)
        self.assertIn("no gestiona", salida)
        # se avisa, no se borra
        self.assertTrue(ajeno.exists())
        self.assertEqual(ajeno.read_text(encoding="utf-8"), '{"model": "otro"}')

    def test_simulacion_no_escribe_nada(self):
        salida = self.correr("--simular")
        self.assertIn("[simular]", salida)
        self.assertFalse(self.cfg.exists(), "la simulación no debe crear la carpeta")
        self.assertFalse((self.home / ".local" / "bin" / "gomodel").exists())

    # ------------------------------------------------------------ al día
    def test_avisa_de_como_actualizar(self):
        salida = self.correr()
        self.assertIn("git pull", salida)
        self.assertIn("opencode-config", salida)

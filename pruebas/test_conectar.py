"""Pruebas de conectar.sh: conectar el herdr de una Mac con el de otra por SSH.

Se corre conectar.sh de verdad con HOME en una carpeta temporal y con `scutil`, `nc`,
`ssh`, `ssh-keygen`, `ssh-copy-id` y `herdr` de mentira que anotan cada llamada:
no se conecta a ninguna Mac, no crea llaves reales ni toca tu herdr. Los falsos van
primero en el PATH, delante de /usr/bin, donde están los ssh reales.

Las direcciones `<usuario>@<mac>.local` se arman por partes para que la revisión de
privacidad no las tome por datos reales.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONECTAR = RAIZ / "conectar.sh"
LOCAL = ".local"
DESTINO = "ana@estudio" + LOCAL

FALSOS = {
    "scutil": """case "$2" in
  ComputerName) echo "Mac mini de prueba" ;;
  LocalHostName) echo "Mac-mini-de-prueba" ;;
esac""",
    # «Inicio de sesión remoto» encendido solo si existe la marca.
    "nc": '[ -f "$HOME/.sshd-activo" ] || exit 1',
    "ssh-keygen": """echo "$*" >> "$HOME/llamadas-ssh-keygen.txt"
while [ $# -gt 0 ]; do [ "$1" = -f ] && f="$2"; shift; done
echo "LLAVE" > "$f"; echo "LLAVE PUBLICA" > "$f.pub\"""",
    # Sin red, no llega; con red, deja entrar sin contraseña desde ahí en adelante.
    "ssh-copy-id": """echo "$*" >> "$HOME/llamadas-ssh-copy-id.txt"
[ -f "$HOME/.sin-red" ] && exit 1
touch "$HOME/.llave-copiada\"""",
    "ssh": """echo "$*" >> "$HOME/llamadas-ssh.txt"
[ -f "$HOME/.llave-copiada" ] || exit 255
case "$*" in *scutil*) echo "Mac del estudio" ;; esac""",
    "herdr": """echo "$*" >> "$HOME/llamadas-herdr.txt"
case "$*" in
  "machine list --json")
    if [ -f "$HOME/.marca-maquina" ]; then
      printf '[{"id":"m1","ssh_target":"%s"}]\n' "$(cat "$HOME/.marca-maquina")"
    else echo '[]'; fi ;;
  "machine list") echo "No saved SSH machines." ;;
  "machine add"*) echo "$3" > "$HOME/.marca-maquina" ;;
esac""",
}


class ConectarSh(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        for nombre, cuerpo in FALSOS.items():
            ruta = self.bin / nombre
            ruta.write_text("#!/bin/sh\n%s\nexit 0\n" % cuerpo, encoding="utf-8")
            ruta.chmod(0o755)
        self.env = {"HOME": str(self.home), "USER": "ana", "TMPDIR": str(self.tmp),
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *args):
        r = subprocess.run(["bash", str(CONECTAR)] + list(args), stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=60)
        return r.returncode, r.stdout.decode("utf-8", "replace")

    def llamadas(self, programa):
        archivo = self.home / ("llamadas-%s.txt" % programa)
        return archivo.read_text(encoding="utf-8").splitlines() if archivo.exists() else []

    def marcar(self, nombre):
        (self.home / nombre).touch()

    @property
    def llave(self):
        return self.home / ".ssh" / "id_ed25519"

    # -------------------------------------------------- en la Mac a la que te conectas
    def test_sin_destino_dice_como_conectarse_a_esta_mac(self):
        self.marcar(".sshd-activo")
        codigo, salida = self.correr()
        self.assertEqual(codigo, 0, salida)
        self.assertIn("Mac mini de prueba", salida)
        self.assertIn("./conectar.sh ana@Mac-mini-de-prueba" + LOCAL, salida)
        self.assertNotIn("AVISO", salida)

    def test_avisa_si_esta_mac_no_acepta_conexiones(self):
        codigo, salida = self.correr()
        self.assertEqual(codigo, 0, salida)
        self.assertIn("AVISO", salida)
        self.assertIn("Inicio de sesión remoto", salida)

    def test_sin_destino_no_cambia_nada(self):
        self.correr()
        self.assertFalse((self.home / ".ssh").exists())
        self.assertEqual(self.llamadas("ssh-keygen"), [])
        self.assertEqual(self.llamadas("ssh-copy-id"), [])
        self.assertFalse(any(l.startswith("machine add") for l in self.llamadas("herdr")))

    # -------------------------------------------------- en la Mac desde la que trabajas
    def test_conecta_la_otra_mac_paso_a_paso(self):
        codigo, salida = self.correr(DESTINO)
        self.assertEqual(codigo, 0, salida)
        # 1. Llave nueva sin contraseña, para que herdr se reconecte solo.
        self.assertTrue(self.llave.exists())
        self.assertIn("-t ed25519", self.llamadas("ssh-keygen")[0])
        self.assertIn("-f %s" % self.llave, self.llamadas("ssh-keygen")[0])
        # 2. La copia a la otra Mac.
        self.assertEqual(self.llamadas("ssh-copy-id"), ["-i %s.pub %s" % (self.llave, DESTINO)])
        # 3. La agrega a herdr con el nombre real de la otra Mac.
        self.assertIn("machine add %s --label Mac del estudio" % DESTINO, self.llamadas("herdr"))
        self.assertIn("herdr --remote %s" % DESTINO, salida)

    def test_segunda_vez_no_repite_nada(self):
        self.correr(DESTINO)
        codigo, salida = self.correr(DESTINO)
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(len(self.llamadas("ssh-keygen")), 1)
        self.assertEqual(len(self.llamadas("ssh-copy-id")), 1)
        self.assertEqual(len([l for l in self.llamadas("herdr") if l.startswith("machine add")]), 1)
        self.assertEqual(salida.count("al día"), 3, salida)

    def test_respeta_la_llave_que_ya_tienes(self):
        self.llave.parent.mkdir()
        self.llave.write_text("MIA", encoding="utf-8")
        Path(str(self.llave) + ".pub").write_text("MIA PUBLICA", encoding="utf-8")
        codigo, salida = self.correr(DESTINO)
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(self.llamadas("ssh-keygen"), [])
        self.assertEqual(Path(str(self.llave) + ".pub").read_text(encoding="utf-8"), "MIA PUBLICA")

    def test_nombre_propio(self):
        codigo, salida = self.correr(DESTINO, "--nombre", "Estudio")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("machine add %s --label Estudio" % DESTINO, self.llamadas("herdr"))

    def test_si_no_llega_explica_que_revisar_y_no_la_agrega(self):
        self.marcar(".sin-red")
        codigo, salida = self.correr(DESTINO)
        self.assertNotEqual(codigo, 0, salida)
        self.assertIn("Inicio de sesión remoto", salida)
        self.assertIn("./conectar.sh", salida)
        self.assertFalse(any(l.startswith("machine add") for l in self.llamadas("herdr")))

    def test_sin_herdr_no_toca_nada(self):
        (self.bin / "herdr").unlink()
        codigo, salida = self.correr(DESTINO)
        self.assertNotEqual(codigo, 0, salida)
        self.assertIn("instalar.sh", salida)
        self.assertEqual(self.llamadas("ssh-keygen"), [])
        self.assertEqual(self.llamadas("ssh-copy-id"), [])

    def test_ayuda_y_opcion_desconocida(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("./conectar.sh <usuario>@", salida)
        codigo, salida = self.correr("--inventada")
        self.assertEqual(codigo, 2, salida)


if __name__ == "__main__":
    unittest.main()

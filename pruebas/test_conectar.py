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
  "machine list")
    if [ -f "$HOME/.marca-maquina" ]; then echo "m1  Mac del estudio  $(cat "$HOME/.marca-maquina")"
    else echo "No saved SSH machines."; fi ;;
  "machine add"*) echo "$3" > "$HOME/.marca-maquina" ;;
  "machine remove m1") rm -f "$HOME/.marca-maquina" ;;
esac""",
    # Bonjour de mentira: las Macs de la red que anuncian SSH, en $HOME/red.txt.
    "dns-sd": 'cat "$HOME/red.txt" 2>/dev/null',
}

# Lo que dice `dns-sd -Z _ssh._tcp local`: esta Mac (dos veces, una por interfaz) y
# la del estudio, con el nombre escapado como lo escribe dns-sd.
RED = """_ssh._tcp  PTR  Mac\\032mini\\032de\\032prueba._ssh._tcp
Mac\\032mini\\032de\\032prueba._ssh._tcp  SRV  0 0 22 Mac-mini-de-prueba%(l)s. ; Replace with unicast FQDN
Mac\\032mini\\032de\\032prueba._ssh._tcp  SRV  0 0 22 Mac-mini-de-prueba%(l)s. ; Replace with unicast FQDN
_ssh._tcp  PTR  Mac\\032del\\032estudio._ssh._tcp
Mac\\032del\\032estudio._ssh._tcp  SRV  0 0 22 estudio%(l)s. ; Replace with unicast FQDN
Mac\\032del\\032estudio._ssh._tcp  TXT  ""
""" % {"l": LOCAL}


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
        # LANG con UTF-8, como una terminal real: así bash lee «$VAR» distinto.
        self.env = {"HOME": str(self.home), "USER": "ana", "TMPDIR": str(self.tmp),
                    "LANG": "en_US.UTF-8",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def correr(self, *args, entrada=None):
        r = subprocess.run(["bash", str(CONECTAR)] + list(args),
                           input=None if entrada is None else entrada.encode("utf-8"),
                           stdin=subprocess.DEVNULL if entrada is None else None,
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


    # -------------------------------------------------- asistente
    def asistente(self, entrada, red=RED):
        (self.home / "red.txt").write_text(red, encoding="utf-8")
        return self.correr("--asistente", entrada=entrada)

    def agregadas(self):
        return [l for l in self.llamadas("herdr") if l.startswith("machine add")]

    def test_asistente_controla_una_mac_de_la_lista(self):
        # 1 = controlar otra Mac; 1 = la primera de la lista; Enter = mismo usuario; Enter = sí
        codigo, salida = self.asistente("1\n1\n\n\n")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("1) Mac del estudio", salida)
        self.assertNotIn(") Mac mini de prueba", salida)  # esta Mac no sale en la lista
        self.assertEqual(self.agregadas(), ["machine add %s --label Mac del estudio" % DESTINO])
        self.assertEqual(len(self.llamadas("ssh-copy-id")), 1)

    def test_asistente_corta_la_busqueda_sin_ensuciar_la_pantalla(self):
        # El dns-sd real no termina solo: el script lo corta a los pocos segundos.
        (self.bin / "dns-sd").write_text('#!/bin/sh\ncat "$HOME/red.txt"\nexec sleep 30\n',
                                         encoding="utf-8")
        codigo, salida = self.asistente("1\n\n")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("1) Mac del estudio", salida)
        for ruido in ("Alarm clock", "Terminated", "Killed"):
            self.assertNotIn(ruido, salida)

    def test_asistente_con_otro_usuario(self):
        codigo, salida = self.asistente("1\n1\nbeto\n\n")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(self.agregadas(),
                         ["machine add beto@estudio%s --label Mac del estudio" % LOCAL])

    def test_asistente_sin_macs_en_la_red_deja_escribirla(self):
        codigo, salida = self.asistente("1\nestudio%s\n\n\n" % LOCAL, red="")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("elige 2", salida)  # cómo preparar la otra Mac
        self.assertEqual(len(self.agregadas()), 1)
        self.assertTrue(self.agregadas()[0].startswith("machine add %s --label" % DESTINO))

    def test_asistente_a_mano_con_usuario(self):
        codigo, salida = self.asistente("1\nm\nbeto@otra%s\n\n" % LOCAL)
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(len(self.agregadas()), 1)
        self.assertTrue(self.agregadas()[0].startswith("machine add beto@otra%s" % LOCAL))

    def test_asistente_no_sigue_si_dices_que_no(self):
        codigo, salida = self.asistente("1\n1\n\nn\n")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("Mac del estudio", salida)  # el resumen dice a cuál iba
        self.assertEqual(self.llamadas("ssh-keygen"), [])
        self.assertEqual(self.llamadas("ssh-copy-id"), [])
        self.assertEqual(self.agregadas(), [])

    def test_asistente_preparar_esta_mac(self):
        codigo, salida = self.asistente("2\n")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("Inicio de sesión remoto", salida)
        self.assertIn("ana@Mac-mini-de-prueba" + LOCAL, salida)
        self.assertEqual(self.llamadas("ssh-keygen"), [])

    def test_asistente_quitar_una_mac(self):
        self.correr(DESTINO)
        codigo, salida = self.asistente("3\nm1\n")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("Mac del estudio", salida)
        self.assertIn("machine remove m1", self.llamadas("herdr"))

    def test_asistente_quitar_ninguna(self):
        self.correr(DESTINO)
        codigo, salida = self.asistente("3\n\n")
        self.assertEqual(codigo, 0, salida)
        self.assertFalse(any(l.startswith("machine remove") for l in self.llamadas("herdr")))

    def test_asistente_enter_sale_sin_cambiar_nada(self):
        codigo, salida = self.asistente("\n")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(self.llamadas("ssh-keygen"), [])
        self.assertEqual(self.agregadas(), [])

if __name__ == "__main__":
    unittest.main()

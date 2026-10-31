"""Pruebas de universal-control.sh: revisa si dos Mac pueden usar Universal Control.

Se corre universal-control.sh de verdad con HOME en una carpeta temporal y con
`scutil`, `sw_vers`, `networksetup`, `system_profiler`, `defaults`, `pgrep`, `id` y
`log` y `ssh` de mentira delante en el PATH: no se lee ni se cambia ningún ajuste real. Cada
prueba cambia una sola cosa del estado «todo bien» con marcas o archivos en HOME.
"""
import hashlib
import os
import plistlib
import re
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCRIPT = RAIZ / "universal-control.sh"

LOCAL = ".local"
DESTINO = "ana@estudio" + LOCAL
CONF = ".config/claude-code-entorno/universal-control.conf"
ETIQUETA = "com.claude-code-entorno.universal-control"
PLIST = "Library/LaunchAgents/%s.plist" % ETIQUETA

DSID = "1234567890"
PREFIJO = "2026-10-21 15:09:33.587 I  UniversalControl[1:2] [com.apple.universalcontrol:%s] "
ENCABEZADO = "Timestamp                       Ty Process[PID:TID]\n"

# La otra Mac saca su huella de la cuenta con la sal que recibe en `--estado <sal>`. En el
# archivo del estado remoto, cuenta=@cuenta quiere decir «la misma cuenta que esta Mac».
SAL_SH = r"""sal=$(printf '%s' "$*" | sed -n 's/.*--estado \([0-9a-f][0-9a-f]*\).*/\1/p')"""
CUENTA_SED = (r"""sed "s/^cuenta=@cuenta\$/cuenta=$(printf %s "${sal}1234567890" """
              r"""| shasum -a 256 | cut -c1-12)/""" '"')


def emite_estado():
    """Las líneas de un ssh falso que contesta con el estado remoto (con la huella salada)."""
    return SAL_SH + "\n" + CUENTA_SED + ' "$HOME/estado-remoto.txt"\n'


FALSOS = {
    "scutil": 'echo "Mac mini de prueba"',
    "sw_vers": 'echo "27.0.1"',
    # Wi-Fi en en1; encendido salvo que exista la marca.
    "networksetup": """case "$1" in
  -listallhardwareports)
    printf 'Hardware Port: Ethernet\\nDevice: en0\\n\\nHardware Port: Wi-Fi\\nDevice: en1\\n' ;;
  -getairportpower)
    if [ -f "$HOME/.sin-wifi" ]; then echo "Wi-Fi Power (en1): Off"
    else echo "Wi-Fi Power (en1): On"; fi ;;
esac""",
    "system_profiler": """case "$1" in
  SPBluetoothDataType)
    if [ -f "$HOME/.sin-bluetooth" ]; then echo "      State: Off"; else echo "      State: On"; fi ;;
  SPDisplaysDataType)
    [ -f "$HOME/.falla-pantallas" ] && exit 1
    [ -f "$HOME/.sin-monitor" ] || echo "          Resolution: 3840 x 2160" ;;
esac""",
    # Handoff y Universal Control encendidos salvo marca; NAT sale de $HOME/nat.txt;
    # la cuenta de MobileMeAccounts, de $HOME/mobileme.txt. Cada marca de Universal Control
    # apaga una sola clave: .uc-host-<clave> en `-currentHost` (macOS 27, por equipo) y
    # .uc-global-<clave> en el dominio global (macOS anteriores); .sin-uc es .uc-global-Disable.
    # Lo que no tiene marca contesta como una clave que no existe (falla).
    "defaults": """case "$*" in
  *useractivityd*)
    if [ -f "$HOME/.sin-handoff" ]; then echo 0; else echo 1; fi ;;
  *com.apple.universalcontrol*)
    for clave in "$@"; do :; done
    case "$*" in
      "-currentHost "*) [ -f "$HOME/.uc-host-$clave" ] || exit 1 ;;
      *) [ -f "$HOME/.uc-global-$clave" ] || { [ "$clave" = Disable ] && [ -f "$HOME/.sin-uc" ]; } || exit 1 ;;
    esac
    echo 1 ;;
  *com.apple.nat*)
    if [ -f "$HOME/nat.txt" ]; then cat "$HOME/nat.txt"; else printf '{\\n    Enabled = 0;\\n}\\n'; fi ;;
  *MobileMeAccounts*)
    [ -f "$HOME/mobileme.txt" ] || exit 1
    cat "$HOME/mobileme.txt" ;;
  *) exit 1 ;;
esac""",
    "pgrep": '[ -f "$HOME/.internet-sharing" ] || exit 1',
    # `id -u` da 501; `id -Gn` da los grupos, con o sin admin.
    "id": """if [ "$1" = "-u" ]; then echo 501
elif [ -f "$HOME/.sin-admin" ]; then echo "staff"; else echo "staff admin"; fi""",
    "log": 'cat "$HOME/log.txt"',
    # La otra Mac: anota la llamada; con la marca falla (255) y el contenido de la marca va
    # a stderr como error de ssh. Si recibe `scutil`
    # contesta el nombre; si no, lee y descarta el script que le llega por stdin y
    # imprime el estado de $HOME/estado-remoto.txt.
    # Cada petición de estado suma una línea a $HOME/intentos. Con la marca .une-al-segundo
    # el primer intento devuelve los grupos separados y los siguientes, unidos.
    "ssh": r"""echo "$*" >> "$HOME/llamadas-ssh.txt"
case "$*" in
  *scutil*) ;;
  *) echo x >> "$HOME/intentos" ;;
esac
if [ -f "$HOME/.sin-ssh" ]; then cat "$HOME/.sin-ssh" >&2; exit 255; fi
case "$*" in
  *scutil*) echo "Mac del estudio" ;;
  *)
    cat >/dev/null
    """ + SAL_SH + r"""
    if [ -f "$HOME/.une-al-segundo" ] && [ "$(wc -l < "$HOME/intentos")" -le 1 ]; then
      sed 's/^grupo=.*/grupo=BBBBBBBB/' "$HOME/estado-remoto.txt"
    else
      cat "$HOME/estado-remoto.txt"
    fi | """ + CUENTA_SED + r""" ;;
esac""",
    # Anota los argumentos de cada llamada en una línea de llamadas-launchctl.txt. Con la
    # marca .falla-bootout o .falla-bootstrap, esa orden falla (la marca trae el error).
    "launchctl": """echo "$*" >> "$HOME/llamadas-launchctl.txt"
if [ -f "$HOME/.falla-$1" ]; then cat "$HOME/.falla-$1" >&2; exit 5; fi""",
    # Anota cada argumento en una línea de llamadas-osascript.txt y cada llamada en
    # veces-osascript.txt. Nunca muestra nada.
    "osascript": """echo x >> "$HOME/veces-osascript.txt"
for a in "$@"; do printf '%s\\n' "$a" >> "$HOME/llamadas-osascript.txt"; done""",
}

# Las opciones de ssh (todas las llamadas llevan estas).
OPCIONES_SSH = ("-o BatchMode=yes -o ConnectTimeout=5 "
                "-o ServerAliveInterval=5 -o ServerAliveCountMax=3")

CUENTA = hashlib.sha256(DSID.encode()).hexdigest()[:12]
ADVERTENCIA = "\u26a0\ufe0f"

# El estado «todo bien» de la otra Mac, en el orden de --estado.
REMOTO_BIEN = [
    ("nombre", "Mac del estudio"), ("macos", "27.0.1"), ("cuenta", "@cuenta"),
    ("wifi", "1"), ("bluetooth", "1"), ("handoff", "1"), ("universal_control", "1"),
    ("compartir_internet", "0"), ("monitores", "1"), ("admin", "1"),
    ("sesion", "unlocked"), ("id", "BBBBBBBB"), ("grupo", "AAAAAAAA,BBBBBBBB"),
    ("excluidos", ""),
]

LOG_BIEN = (
    ENCABEZADO
    + PREFIJO % "LINK" + "IDS BBBBBBBB: Device Found SF <BLE DuetSync WiFiP2P Owner LocalDevice>, Md Mac16,10, SV 700\n"
    + PREFIJO % "LOGN" + "Login Status: 'locked' -> 'unlocked'\n"
    + PREFIJO % "CIRC" + "Selected circle: [AAAAAAAA,BBBBBBBB]\n"
)


def linea(categoria, texto):
    return (PREFIJO % categoria) + texto + "\n"


class UniversalControlSh(unittest.TestCase):
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
        cuentas = self.home / "Library" / "Application Support" / "iCloud" / "Accounts"
        cuentas.mkdir(parents=True)
        (cuentas / DSID).write_text("cifrado", encoding="utf-8")
        self.cuentas = cuentas
        self.log(LOG_BIEN)
        # LANG con UTF-8, como una terminal real.
        self.env = {"HOME": str(self.home), "USER": "ana", "TMPDIR": str(self.tmp),
                    "LANG": "en_US.UTF-8", "UC_ESPERA": "3", "UC_INTERVALO": "1",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def log(self, texto):
        (self.home / "log.txt").write_text(texto, encoding="utf-8")

    def marcar(self, nombre):
        (self.home / nombre).touch()

    def llamadas(self, programa):
        archivo = self.home / ("llamadas-%s.txt" % programa)
        return archivo.read_text(encoding="utf-8").splitlines() if archivo.exists() else []

    def intentos(self):
        """Cuántas veces se pidió el estado de la otra Mac."""
        archivo = self.home / "intentos"
        return len(archivo.read_text(encoding="utf-8").splitlines()) if archivo.exists() else 0

    def notificaciones(self):
        """Cuántas veces se llamó a osascript."""
        archivo = self.home / "veces-osascript.txt"
        return len(archivo.read_text(encoding="utf-8").splitlines()) if archivo.exists() else 0

    def reporte(self):
        ruta = self.home / "Library" / "Logs" / "claude-code-entorno" / "universal-control.log"
        return ruta.read_text(encoding="utf-8") if ruta.exists() else ""

    def romper(self, programa):
        """El comando falla sin decir nada (en /usr/bin hay otros de verdad: no se borra)."""
        ruta = self.bin / programa
        ruta.write_text("#!/bin/sh\nexit 127\n", encoding="utf-8")
        ruta.chmod(0o755)

    def correr(self, *args, entrada=None):
        r = subprocess.run(["bash", str(SCRIPT)] + list(args),
                           input=None if entrada is None else entrada.encode("utf-8"),
                           stdin=subprocess.DEVNULL if entrada is None else None,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=60)
        return r.returncode, r.stdout.decode("utf-8", "replace")

    def estado(self, *args):
        codigo, salida = self.correr("--estado", *args)
        self.assertEqual(codigo, 0, salida)
        return dict(l.split("=", 1) for l in salida.splitlines() if "=" in l)

    # -------------------------------------------------- opciones
    def test_modo_desconocido_sale_con_2(self):
        codigo, salida = self.correr("--que-es-esto")
        self.assertEqual(codigo, 2, salida)
        self.assertIn("--estado", salida)

    def test_ayuda_describe_estado(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("--estado", salida)

    # -------------------------------------------------- --estado
    def test_estado_todo_bien(self):
        e = self.estado()
        self.assertEqual(e["nombre"], "Mac mini de prueba")
        self.assertEqual(e["macos"], "27.0.1")
        self.assertEqual(e["cuenta"], hashlib.sha256(DSID.encode()).hexdigest()[:12])
        for k in ("wifi", "bluetooth", "handoff", "universal_control", "admin"):
            self.assertEqual(e[k], "1", k)
        self.assertEqual((e["compartir_internet"], e["monitores"]), ("0", "1"))
        self.assertEqual((e["sesion"], e["id"]), ("unlocked", "AAAAAAAA"))
        self.assertEqual((e["grupo"], e["excluidos"]), ("AAAAAAAA,BBBBBBBB", ""))

    def test_estado_imprime_las_claves_en_orden(self):
        codigo, salida = self.correr("--estado")
        self.assertEqual(codigo, 0, salida)
        claves = [l.split("=", 1)[0] for l in salida.splitlines()]
        self.assertEqual(claves, ["nombre", "macos", "cuenta", "wifi", "bluetooth", "handoff",
                                  "universal_control", "compartir_internet", "monitores",
                                  "admin", "sesion", "id", "grupo", "excluidos"])

    def test_estado_no_imprime_el_dsid(self):
        codigo, salida = self.correr("--estado")
        self.assertEqual(codigo, 0, salida)
        self.assertNotIn(DSID, salida)

    def test_cuenta_desde_mobilemeaccounts(self):
        shutil.rmtree(str(self.cuentas))
        (self.home / "mobileme.txt").write_text(
            '(\n        {\n        AccountDSID = 9876543210;\n    }\n)\n',
            encoding="utf-8")
        codigo, salida = self.correr("--estado")
        self.assertEqual(codigo, 0, salida)
        e = dict(l.split("=", 1) for l in salida.splitlines() if "=" in l)
        self.assertEqual(e["cuenta"], hashlib.sha256(b"9876543210").hexdigest()[:12])
        self.assertNotIn("9876543210", salida)

    def test_sin_cuenta_queda_vacia(self):
        shutil.rmtree(str(self.cuentas))
        self.assertEqual(self.estado()["cuenta"], "")

    def test_cuenta_desconocida_si_falla_shasum(self):
        # Un shasum que falla no es «sin cuenta»: no se pudo calcular.
        (self.bin / "shasum").write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        (self.bin / "shasum").chmod(0o755)
        self.assertEqual(self.estado()["cuenta"], "?")

    def test_cuenta_desconocida_si_la_carpeta_no_se_puede_leer(self):
        self.cuentas.chmod(0)
        try:
            if os.access(str(self.cuentas), os.R_OK):
                self.skipTest("este usuario lee aunque no haya permiso")
            self.assertEqual(self.estado()["cuenta"], "?")
        finally:
            self.cuentas.chmod(0o755)

    def test_huella_con_sal(self):
        sal = "0a1b2c3d4e5f6071"
        esperada = hashlib.sha256((sal + DSID).encode()).hexdigest()[:12]
        e = self.estado(sal)
        self.assertEqual(e["cuenta"], esperada)
        self.assertNotEqual(e["cuenta"], CUENTA)

    def test_misma_sal_misma_huella_y_sales_distintas_no(self):
        a = self.estado("aaaa")["cuenta"]
        self.assertEqual(self.estado("aaaa")["cuenta"], a)
        self.assertNotEqual(self.estado("bbbb")["cuenta"], a)

    def test_sin_sal_la_huella_es_la_de_siempre(self):
        self.assertEqual(self.estado()["cuenta"], CUENTA)

    def test_sal_con_mobilemeaccounts(self):
        shutil.rmtree(str(self.cuentas))
        (self.home / "mobileme.txt").write_text(
            '(\n        {\n        AccountDSID = 9876543210;\n    }\n)\n', encoding="utf-8")
        self.assertEqual(self.estado("abcd")["cuenta"],
                         hashlib.sha256(b"abcd9876543210").hexdigest()[:12])

    def test_archivo_no_numerico_no_es_cuenta(self):
        (self.cuentas / DSID).unlink()
        (self.cuentas / "Accounts4.sqlite").write_text("x", encoding="utf-8")
        self.assertEqual(self.estado()["cuenta"], "")

    def test_compartir_internet_por_proceso(self):
        self.marcar(".internet-sharing")
        self.assertEqual(self.estado()["compartir_internet"], "1")

    def test_compartir_internet_interruptor_sin_puertos(self):
        (self.home / "nat.txt").write_text(
            "{\n    Enabled = 1;\n    SharingDevices =     (\n    );\n}\n", encoding="utf-8")
        self.assertEqual(self.estado()["compartir_internet"], "1")

    def test_enabled_de_subdiccionario_no_cuenta(self):
        (self.home / "nat.txt").write_text(
            "{\n    Enabled = 0;\n    AirPort =     {\n        Enabled = 1;\n    };\n}\n",
            encoding="utf-8")
        self.assertEqual(self.estado()["compartir_internet"], "0")

    def test_wifi_apagado(self):
        self.marcar(".sin-wifi")
        self.assertEqual(self.estado()["wifi"], "0")

    def test_bluetooth_apagado(self):
        self.marcar(".sin-bluetooth")
        self.assertEqual(self.estado()["bluetooth"], "0")

    def test_handoff_apagado(self):
        self.marcar(".sin-handoff")
        self.assertEqual(self.estado()["handoff"], "0")

    def test_universal_control_apagado(self):
        self.marcar(".sin-uc")
        self.assertEqual(self.estado()["universal_control"], "0")

    CLAVES_UC = ("Disable", "DisableMagicEdges", "DisableAutoConnect")

    def test_universal_control_apagado_por_equipo_en_macos_27(self):
        # En macOS 27 las claves se guardan por equipo (`defaults -currentHost`) y el dominio
        # global no existe: cada clave sola, leída ahí, apaga Universal Control.
        for clave in self.CLAVES_UC:
            with self.subTest(clave=clave):
                self.marcar(".uc-host-" + clave)
                self.assertEqual(self.estado()["universal_control"], "0")
                (self.home / (".uc-host-" + clave)).unlink()

    def test_universal_control_apagado_en_el_dominio_global_de_macos_anteriores(self):
        # Nada en `-currentHost`, 1 en el dominio global: sigue apagado.
        for clave in self.CLAVES_UC:
            with self.subTest(clave=clave):
                self.marcar(".uc-global-" + clave)
                self.assertEqual(self.estado()["universal_control"], "0")
                (self.home / (".uc-global-" + clave)).unlink()

    def test_universal_control_activado_si_no_hay_ninguna_marca(self):
        self.assertEqual(self.estado()["universal_control"], "1")

    def test_sin_monitor(self):
        self.marcar(".sin-monitor")
        self.assertEqual(self.estado()["monitores"], "0")

    def test_monitores_desconocidos_si_falla_system_profiler(self):
        # Solo un 0 explícito significa «sin monitor»; si el comando falla, no se sabe.
        self.marcar(".falla-pantallas")
        e = self.estado()
        self.assertEqual(e["monitores"], "?")
        self.assertEqual(e["bluetooth"], "1")

    def test_no_admin(self):
        self.marcar(".sin-admin")
        self.assertEqual(self.estado()["admin"], "0")

    def test_wifi_y_bluetooth_desconocidos_si_fallan_los_comandos(self):
        for programa in ("networksetup", "system_profiler"):
            self.romper(programa)
        e = self.estado()
        self.assertEqual((e["wifi"], e["bluetooth"], e["monitores"]), ("?", "?", "?"))

    # -------------------------------------------------- registros
    def test_excluido_del_ultimo_bloque(self):
        # Aquí el registro es la vista de la otra Mac.
        self.log(ENCABEZADO
                 + linea("LINK", "IDS AAAAAAAA: Device Found SF <BLE>, Md Mac16,10, SV 700")
                 + linea("CIRC", "Excluded the following unavailable devices: [AAAAAAAA]")
                 + linea("CIRC", "Selected circle: [BBBBBBBB]"))
        e = self.estado()
        self.assertEqual(e["excluidos"], "AAAAAAAA")
        self.assertEqual(e["id"], "BBBBBBBB")

    def test_excluido_viejo_no_cuenta(self):
        self.log(ENCABEZADO
                 + linea("CIRC", "Excluded the following unavailable devices: [AAAAAAAA]")
                 + linea("CIRC", "Selected circle: [BBBBBBBB]")
                 + linea("CIRC", "Selected circle: [AAAAAAAA,BBBBBBBB]"))
        self.assertEqual(self.estado()["excluidos"], "")

    def test_varios_excluidos_y_dispositivo_no_elegible(self):
        self.log(ENCABEZADO
                 + linea("LINK", "IDS BBBBBBBB: Device Found SF <BLE LocalDevice>, Md Mac16,10, SV 700")
                 + linea("LINK", "IDS CCCCCCCC: Ineligible Device Found Md iPhone18,3, SV 700")
                 + linea("CIRC", "Excluded the following unavailable devices: [CCCCCCCC,DDDDDDDD]")
                 + linea("CIRC", "Selected circle: [CCCCCCCC,AAAAAAAA,BBBBBBBB]"))
        e = self.estado()
        self.assertEqual(e["excluidos"], "CCCCCCCC,DDDDDDDD")
        self.assertEqual(e["grupo"], "CCCCCCCC,AAAAAAAA,BBBBBBBB")
        self.assertEqual(e["id"], "AAAAAAAA")

    def test_la_sesion_es_el_ultimo_estado(self):
        self.log(ENCABEZADO
                 + linea("LOGN", "Login Status: 'unlocked' -> 'locked'")
                 + linea("LOGN", "Login Status: 'locked' -> 'unlocked'")
                 + linea("LOGN", "Login Status: 'unlocked' -> 'locked'"))
        self.assertEqual(self.estado()["sesion"], "locked")

    def test_sin_registros(self):
        self.log("")
        e = self.estado()
        self.assertEqual(e["sesion"], "?")
        for k in ("id", "grupo", "excluidos"):
            self.assertEqual(e[k], "", k)

    def test_si_falla_el_comando_log(self):
        self.romper("log")
        e = self.estado()
        self.assertEqual(e["sesion"], "?")
        self.assertEqual((e["id"], e["grupo"], e["excluidos"]), ("", "", ""))

    def test_pide_los_registros_de_universal_control_una_sola_vez(self):
        (self.bin / "log").write_text(
            '#!/bin/sh\necho "$*" >> "$HOME/llamadas-log.txt"\ncat "$HOME/log.txt"\n',
            encoding="utf-8")
        self.estado()
        llamadas = (self.home / "llamadas-log.txt").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(llamadas), 1, llamadas)
        # Solo el arranque actual: con `--last 24h` entraría el círculo de antes de un reinicio.
        self.assertTrue(llamadas[0].startswith("show --last boot --info --style compact"), llamadas)
        self.assertNotIn("24h", llamadas[0])
        for texto in ("com.apple.universalcontrol", "CIRC", "LOGN", "Device Found"):
            self.assertIn(texto, llamadas[0])

    # -------------------------------------------------- --configurar
    def test_configurar_guarda_destino_y_nombre(self):
        codigo, salida = self.correr("--configurar", DESTINO)
        self.assertEqual(codigo, 0, salida)
        conf = (self.home / CONF).read_text(encoding="utf-8")
        self.assertIn("DESTINO=" + DESTINO, conf)
        self.assertIn("NOMBRE=Mac del estudio", conf)
        self.assertTrue(self.llamadas("ssh")[0].startswith(OPCIONES_SSH + " " + DESTINO), self.llamadas("ssh"))

    def test_configurar_escribe_solo_dos_lineas(self):
        self.correr("--configurar", DESTINO)
        conf = (self.home / CONF).read_text(encoding="utf-8")
        self.assertEqual(conf.splitlines(), ["DESTINO=" + DESTINO, "NOMBRE=Mac del estudio"])

    def test_configurar_sin_llave_no_guarda_y_dice_como(self):
        self.marcar(".sin-ssh")
        codigo, salida = self.correr("--configurar", DESTINO)
        self.assertEqual(codigo, 1, salida)
        self.assertFalse((self.home / CONF).exists())
        self.assertIn("./conectar.sh " + DESTINO, salida)
        self.assertIn("ssh-copy-id", salida)

    def test_configurar_muestra_el_error_real_de_ssh(self):
        error = "ssh: Could not resolve hostname estudio: nodename nor servname provided"
        (self.home / ".sin-ssh").write_text("aviso previo\n" + error + "\n\n", encoding="utf-8")
        codigo, salida = self.correr("--configurar", DESTINO)
        self.assertEqual(codigo, 1, salida)
        self.assertIn("    " + error, salida)
        self.assertLess(salida.index(error), salida.index("ssh-copy-id"))
        self.assertNotIn("aviso previo", salida)
        self.assertFalse((self.home / CONF).exists())

    def test_configurar_rechaza_direccion_sin_arroba(self):
        codigo, salida = self.correr("--configurar", "estudio" + LOCAL)
        self.assertEqual(codigo, 2, salida)
        self.assertEqual(self.llamadas("ssh"), [])
        self.assertFalse((self.home / CONF).exists())

    def test_configurar_rechaza_direcciones_peligrosas(self):
        # Un espacio o un salto de línea meterían líneas ajenas en el archivo; un guion
        # al principio ssh lo tomaría como opción.
        for malo in ("ana@estudio" + LOCAL + " x", "ana@estudio" + LOCAL + "\nNOMBRE=x",
                     "-oProxyCommand=x@estudio" + LOCAL, "@estudio" + LOCAL, "ana@"):
            codigo, salida = self.correr("--configurar", malo)
            self.assertEqual(codigo, 2, "%r: %s" % (malo, salida))
        self.assertEqual(self.llamadas("ssh"), [])
        self.assertFalse((self.home / CONF).exists())

    def test_configurar_sin_direccion_sale_con_2(self):
        codigo, salida = self.correr("--configurar")
        self.assertEqual(codigo, 2, salida)
        self.assertIn("--configurar", salida)
        self.assertEqual(self.llamadas("ssh"), [])

    def test_configurar_otra_vez_reemplaza(self):
        otro = "luis@oficina" + LOCAL
        self.assertEqual(self.correr("--configurar", DESTINO)[0], 0)
        self.assertEqual(self.correr("--configurar", otro)[0], 0)
        conf = (self.home / CONF).read_text(encoding="utf-8")
        self.assertEqual(conf.splitlines(), ["DESTINO=" + otro, "NOMBRE=Mac del estudio"])

    def test_configurar_fallido_no_borra_la_configuracion_anterior(self):
        self.correr("--configurar", DESTINO)
        self.marcar(".sin-ssh")
        codigo, salida = self.correr("--configurar", "luis@oficina" + LOCAL)
        self.assertEqual(codigo, 1, salida)
        self.assertIn("DESTINO=" + DESTINO, (self.home / CONF).read_text(encoding="utf-8"))

    def test_ayuda_describe_configurar(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("--configurar", salida)

    # -------------------------------------------------- revisión a mano
    def conf(self):
        ruta = self.home / CONF
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text("DESTINO=%s\nNOMBRE=Mac del estudio\n" % DESTINO, encoding="utf-8")

    def remoto(self, **cambios):
        """Reescribe el estado de la otra Mac; un valor None quita la clave."""
        datos = dict(REMOTO_BIEN)
        datos.update(cambios)
        lineas = ["%s=%s" % (k, datos[k]) for k, _ in REMOTO_BIEN if datos[k] is not None]
        (self.home / "estado-remoto.txt").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    def revisar(self, **cambios):
        self.conf()
        self.remoto(**cambios)
        return self.correr()

    def separados(self, **cambios):
        """Los grupos no se unieron: el remoto solo se ve a sí mismo."""
        return self.revisar(grupo="BBBBBBBB", **cambios)

    def assertCausa(self, resultado, texto):
        codigo, salida = resultado
        self.assertEqual(codigo, 1, salida)
        self.assertEqual(salida.splitlines()[-1], "No quedó: " + texto, salida)

    def test_sin_configurar(self):
        codigo, salida = self.correr()
        self.assertEqual(codigo, 2, salida)
        self.assertIn("Falta configurar: ./universal-control.sh --configurar <usuario>@<mac>.local",
                      salida)
        self.assertEqual(self.llamadas("ssh"), [])

    def test_configuracion_sin_destino_es_sin_configurar(self):
        ruta = self.home / CONF
        ruta.parent.mkdir(parents=True)
        ruta.write_text("NOMBRE=Mac del estudio\n", encoding="utf-8")
        codigo, salida = self.correr()
        self.assertEqual(codigo, 2, salida)
        self.assertIn("Falta configurar", salida)
        self.assertEqual(self.llamadas("ssh"), [])

    def test_direccion_guardada_invalida_no_llama_a_ssh(self):
        # Otro programa o una edición a mano pudo dejar una dirección que ssh tomaría por opción.
        for mala in ("-oProxyCommand=x", "-oProxyCommand=x@estudio" + LOCAL, "ana@", "ana@x y"):
            with self.subTest(mala=mala):
                ruta = self.home / CONF
                ruta.parent.mkdir(parents=True, exist_ok=True)
                ruta.write_text("DESTINO=%s\nNOMBRE=Mac del estudio\n" % mala, encoding="utf-8")
                codigo, salida = self.correr()
                self.assertEqual(codigo, 2, salida)
                self.assertIn("La dirección guardada no es válida: corre "
                              "./universal-control.sh --configurar <usuario>@<mac>.local", salida)
                self.assertNotIn("Falta configurar:", salida)
                self.assertEqual(self.llamadas("ssh"), [])

    def test_direccion_guardada_invalida_en_al_iniciar_no_llama_a_ssh(self):
        ruta = self.home / CONF
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text("DESTINO=-oProxyCommand=x\n", encoding="utf-8")
        codigo, salida = self.correr("--al-iniciar")
        self.assertEqual((codigo, salida), (2, ""))
        self.assertEqual(self.llamadas("ssh"), [])

    def test_ayuda_describe_el_uso_sin_opciones(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("./universal-control.sh\n", salida)

    def test_listo(self):
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(salida.splitlines()[-1], "Universal Control listo.")
        self.assertNotIn(ADVERTENCIA, salida)
        self.assertNotIn("\u274c", salida)
        self.assertIn("\u2705", salida)

    def test_el_reporte_nombra_a_las_dos_mac(self):
        codigo, salida = self.revisar()
        self.assertIn("Mac mini de prueba", salida)
        self.assertIn("Mac del estudio", salida)

    def test_pide_el_estado_remoto_por_ssh_con_el_script(self):
        (self.bin / "ssh").write_text(
            '#!/bin/sh\necho "$*" >> "$HOME/llamadas-ssh.txt"\n'
            'cat > "$HOME/script-enviado.txt"\n' + emite_estado(), encoding="utf-8")
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 0, salida)
        (llamada,) = self.llamadas("ssh")
        self.assertRegex(llamada, "^%s %s bash -s -- --estado [0-9a-f]{16}$" % (
            re.escape(OPCIONES_SSH), re.escape(DESTINO)))
        enviado = (self.home / "script-enviado.txt").read_text(encoding="utf-8")
        self.assertEqual(enviado, SCRIPT.read_text(encoding="utf-8"))

    def test_cada_corrida_usa_una_sal_distinta(self):
        self.revisar()
        self.revisar()
        sales = [l.rsplit(" ", 1)[1] for l in self.llamadas("ssh")]
        self.assertEqual(len(sales), 2, sales)
        self.assertNotEqual(sales[0], sales[1])

    def test_funciona_desde_otra_carpeta_con_ruta_relativa(self):
        self.conf()
        self.remoto()
        r = subprocess.run(["bash", os.path.relpath(str(SCRIPT), os.path.realpath(str(self.home)))],
                           cwd=str(self.home), stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout.decode("utf-8", "replace"))

    def test_no_deja_archivos_temporales(self):
        self.revisar()
        self.assertEqual([p.name for p in self.tmp.iterdir() if p.name.startswith("universal")], [])
        self.revisar(grupo="BBBBBBBB")
        self.assertEqual([p.name for p in self.tmp.iterdir() if p.name.startswith("universal")], [])

    def test_listo_en_otro_orden_y_con_ipad(self):
        self.log(ENCABEZADO
                 + linea("LINK", "IDS BBBBBBBB: Device Found SF <BLE>, Md Mac16,10, SV 700")
                 + linea("LINK", "IDS CCCCCCCC: Device Found SF <BLE>, Md iPad16,3, SV 700")
                 + linea("LOGN", "Login Status: 'locked' -> 'unlocked'")
                 + linea("CIRC", "Selected circle: [AAAAAAAA,BBBBBBBB,CCCCCCCC]"))
        codigo, salida = self.revisar(grupo="CCCCCCCC,BBBBBBBB,AAAAAAAA")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(salida.splitlines()[-1], "Universal Control listo.")

    def test_listo_aunque_un_ajuste_salga_mal(self):
        codigo, salida = self.revisar(compartir_internet="1")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(salida.splitlines()[-1], "Universal Control listo.")
        avisos = [l for l in salida.splitlines() if l.startswith(ADVERTENCIA)]
        self.assertEqual(len(avisos), 1, salida)
        self.assertIn("Compartir Internet", avisos[0])
        self.assertIn("Mac del estudio", avisos[0])

    def test_listo_si_cada_grupo_contiene_el_id_de_la_otra(self):
        # La Mac local ve también un iPad: su grupo es [A,B,C] y el de la otra, [A,B].
        # Los IDs son A (local) y B (remota): el grupo de cada una contiene el de la otra.
        self.log(ENCABEZADO
                 + linea("LINK", "IDS BBBBBBBB: Device Found SF <BLE>, Md Mac16,10, SV 700")
                 + linea("LINK", "IDS CCCCCCCC: Device Found SF <BLE>, Md iPad16,3, SV 700")
                 + linea("LOGN", "Login Status: 'locked' -> 'unlocked'")
                 + linea("CIRC", "Selected circle: [AAAAAAAA,BBBBBBBB,CCCCCCCC]"))
        codigo, salida = self.revisar(grupo="AAAAAAAA,BBBBBBBB")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(salida.splitlines()[-1], "Universal Control listo.")

    def test_no_listo_si_un_grupo_no_contiene_el_id_de_la_otra(self):
        self.log(ENCABEZADO
                 + linea("LINK", "IDS BBBBBBBB: Device Found SF <BLE>, Md Mac16,10, SV 700")
                 + linea("CIRC", "Selected circle: [AAAAAAAA,CCCCCCCC]"))
        self.assertCausa(self.revisar(grupo="AAAAAAAA,BBBBBBBB"),
                         "Las Mac no se unieron: reinicia las dos")

    def test_sin_ids_vale_la_igualdad_de_grupos(self):
        # Sin `id` en las dos se vuelve a pedir que los conjuntos sean iguales.
        self.log(ENCABEZADO
                 + linea("LINK", "IDS BBBBBBBB: Device Found SF <BLE>, Md Mac16,10, SV 700")
                 + linea("LINK", "IDS CCCCCCCC: Device Found SF <BLE>, Md iPad16,3, SV 700")
                 + linea("CIRC", "Selected circle: [BBBBBBBB,CCCCCCCC]"))
        self.assertCausa(self.revisar(id="", grupo="CCCCCCCC,BBBBBBBB,DDDDDDDD"),
                         "Las Mac no se unieron: reinicia las dos")
        codigo, salida = self.revisar(id="", grupo="CCCCCCCC,BBBBBBBB")
        self.assertEqual(codigo, 0, salida)

    def test_un_solo_id_no_es_un_grupo(self):
        self.log(ENCABEZADO + linea("CIRC", "Selected circle: [AAAAAAAA]"))
        self.assertCausa(self.revisar(grupo="AAAAAAAA"),
                         "Las Mac no se unieron: reinicia las dos")

    def test_sin_grupos_no_esta_listo(self):
        self.log("")
        self.assertCausa(self.revisar(grupo="", id="", sesion="?"),
                         "Las Mac no se unieron: reinicia las dos")

    def test_no_responde(self):
        self.marcar(".sin-ssh")
        self.conf()
        codigo, salida = self.correr()
        self.assertCausa((codigo, salida),
                         "Mac del estudio no responde: ¿está prendida y con sesión iniciada?")

    def test_llave_rechazada_da_su_propia_causa(self):
        for error in ("ana@estudio" + LOCAL + ": Permission denied (publickey,password).",
                      "Host key verification failed."):
            with self.subTest(error=error):
                (self.home / ".sin-ssh").write_text("aviso previo\n" + error + "\n\n",
                                                    encoding="utf-8")
                self.conf()
                codigo, salida = self.correr()
                self.assertCausa((codigo, salida),
                                 "Mac del estudio no aceptó la llave SSH: corre ./conectar.sh " + DESTINO)
                # El error de ssh aparece en el reporte, con sangría; el aviso anterior no.
                self.assertIn("\n    " + error + "\n", salida)
                self.assertNotIn("aviso previo", salida)

    def test_otro_255_sigue_siendo_no_responde(self):
        error = "ssh: Could not resolve hostname estudio: nodename nor servname provided"
        (self.home / ".sin-ssh").write_text(error + "\n", encoding="utf-8")
        self.conf()
        codigo, salida = self.correr()
        self.assertCausa((codigo, salida),
                         "Mac del estudio no responde: ¿está prendida y con sesión iniciada?")
        self.assertIn("\n    " + error + "\n", salida)

    def test_la_llave_rechazada_se_avisa_en_al_iniciar(self):
        (self.home / ".sin-ssh").write_text("Permission denied (publickey).\n", encoding="utf-8")
        self.conf()
        self.correr("--al-iniciar")
        self.assertEqual(self.llamadas("osascript")[-1],
                         "Mac del estudio no aceptó la llave SSH: corre ./conectar.sh " + DESTINO)

    def test_el_error_de_ssh_no_se_filtra_si_responde(self):
        # Con otro código que no sea 255 no hay causa de ssh ni se imprime el error.
        (self.bin / "ssh").write_text(
            '#!/bin/sh\ncat >/dev/null\necho "Permission denied (aviso)" >&2\n'
            + emite_estado(), encoding="utf-8")
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 0, salida)
        self.assertNotIn("Permission denied", salida)

    def test_no_responde_sin_nombre_usa_el_equipo_de_la_direccion(self):
        self.marcar(".sin-ssh")
        ruta = self.home / CONF
        ruta.parent.mkdir(parents=True)
        ruta.write_text("DESTINO=%s\n" % DESTINO, encoding="utf-8")
        self.assertCausa(self.correr(),
                         "estudio" + LOCAL + " no responde: ¿está prendida y con sesión iniciada?")

    def test_otro_codigo_de_ssh_usa_lo_que_llego(self):
        (self.bin / "ssh").write_text(
            '#!/bin/sh\ncat >/dev/null\n' + emite_estado() + 'exit 1\n', encoding="utf-8")
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 0, salida)

    def test_remota_no_admin(self):
        # Con los grupos separados la causa es el administrador.
        self.assertCausa(self.separados(admin="0"),
                         "No puedo leer los registros de Mac del estudio: "
                         "el usuario ana tiene que ser administrador")

    def test_local_no_admin(self):
        self.marcar(".sin-admin")
        self.assertCausa(self.separados(),
                         "No puedo leer los registros de Mac mini de prueba: "
                         "el usuario ana tiene que ser administrador")

    def test_no_admin_con_los_grupos_unidos_solo_advierte(self):
        # Si los registros dicen que están unidas, que `admin` sea 0 es una línea ⚠️ más.
        for local in (False, True):
            with self.subTest(local=local):
                if local:
                    self.marcar(".sin-admin")
                    codigo, salida = self.revisar()
                else:
                    codigo, salida = self.revisar(admin="0")
                self.assertEqual(codigo, 0, salida)
                self.assertEqual(salida.splitlines()[-1], "Universal Control listo.")
                avisos = [l for l in salida.splitlines()
                          if l.startswith(ADVERTENCIA) and "administrador" in l]
                self.assertEqual(len(avisos), 1, salida)

    def test_admin_desconocido_si_falla_id(self):
        # Si `id` falla no se sabe: ? y no 0.
        self.romper("id")
        self.assertEqual(self.estado()["admin"], "?")

    def test_admin_desconocido_no_dispara_la_causa(self):
        (self.bin / "id").write_text("#!/bin/sh\n[ \"$1\" = -u ] && { echo 501; exit 0; }\nexit 1\n",
                                     encoding="utf-8")
        (self.bin / "id").chmod(0o755)
        self.assertCausa(self.separados(), "Las Mac no se unieron: reinicia las dos")

    def test_admin_remoto_desconocido_no_dispara_la_causa(self):
        self.assertCausa(self.separados(admin="?"), "Las Mac no se unieron: reinicia las dos")

    def test_estado_remoto_incompleto(self):
        self.conf()
        (self.home / "estado-remoto.txt").write_text("nombre=Mac del estudio\n", encoding="utf-8")
        self.assertCausa(self.correr(), "Las Mac no se unieron: reinicia las dos")

    def test_valores_desconocidos_no_disparan_causas_especificas(self):
        self.assertCausa(self.separados(wifi="?", bluetooth="?", handoff="?", universal_control="?",
                                        compartir_internet="?", monitores="?", sesion="?"),
                         "Las Mac no se unieron: reinicia las dos")

    def test_no_muestra_la_cuenta(self):
        for cambios in ({}, {"cuenta": "abcdef012345"}):
            codigo, salida = self.revisar(**cambios)
            self.assertNotIn(CUENTA, salida)
            self.assertNotIn("abcdef012345", salida)
            self.assertNotIn(DSID, salida)

    def test_el_reporte_dice_si_es_la_misma_cuenta(self):
        self.assertIn("misma cuenta de Apple", self.revisar()[1])
        self.assertIn("cuentas distintas", self.revisar(cuenta="abcdef012345")[1])

    # Una prueba por cada causa, con los grupos separados.
    def test_causa_local_sin_cuenta(self):
        shutil.rmtree(str(self.cuentas))
        self.assertCausa(self.separados(),
                         "Mac mini de prueba no tiene sesión iniciada en una cuenta de Apple")

    def test_causa_remota_sin_cuenta(self):
        self.assertCausa(self.separados(cuenta=""),
                         "Mac del estudio no tiene sesión iniciada en una cuenta de Apple")

    def test_cuenta_que_no_se_pudo_leer_no_dispara_causas_de_cuenta(self):
        # Con la cuenta en «?» (shasum falló) no es «sin cuenta» ni «cuentas distintas».
        (self.bin / "shasum").write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
        (self.bin / "shasum").chmod(0o755)
        codigo, salida = self.separados(cuenta="abcdef012345")
        self.assertCausa((codigo, salida), "Las Mac no se unieron: reinicia las dos")
        self.assertNotIn("cuentas distintas", salida)
        self.assertNotIn("sin cuenta de Apple", salida)
        self.assertIn(ADVERTENCIA + " Mac mini de prueba: no se pudo leer la cuenta de Apple", salida)

    def test_causa_cuentas_distintas(self):
        self.assertCausa(self.separados(cuenta="abcdef012345"),
                         "Las dos Mac tienen cuentas de Apple distintas")

    def test_causa_versiones_distintas(self):
        self.assertCausa(self.separados(macos="26.5"),
                         "Versiones distintas: 27.0.1 en Mac mini de prueba, 26.5 en "
                         "Mac del estudio. Actualiza la que va atrás")

    def test_causa_compartir_internet_remota(self):
        self.assertCausa(self.separados(compartir_internet="1"),
                         "Apaga Compartir Internet en Mac del estudio")

    def test_causa_compartir_internet_local(self):
        self.marcar(".internet-sharing")
        self.assertCausa(self.separados(), "Apaga Compartir Internet en Mac mini de prueba")

    def test_causa_ajustes_apagados_en_la_remota(self):
        for clave, etiqueta in (("wifi", "Wi-Fi"), ("bluetooth", "Bluetooth"),
                                ("handoff", "Handoff"), ("universal_control", "Universal Control")):
            with self.subTest(clave=clave):
                self.assertCausa(self.separados(**{clave: "0"}),
                                 "Enciende %s en Mac del estudio" % etiqueta)

    def test_causa_ajustes_apagados_en_la_local(self):
        for marca, etiqueta in ((".sin-wifi", "Wi-Fi"), (".sin-bluetooth", "Bluetooth"),
                                (".sin-handoff", "Handoff"), (".sin-uc", "Universal Control")):
            with self.subTest(marca=marca):
                self.marcar(marca)
                self.assertCausa(self.separados(), "Enciende %s en Mac mini de prueba" % etiqueta)
                (self.home / marca).unlink()

    def test_causa_remota_sin_monitor(self):
        self.assertCausa(self.separados(monitores="0"), "Mac del estudio no tiene monitor")

    def test_causa_local_sin_monitor(self):
        self.marcar(".sin-monitor")
        self.assertCausa(self.separados(), "Mac mini de prueba no tiene monitor")

    def test_causa_remota_con_sesion_cerrada(self):
        self.assertCausa(self.separados(sesion="locked"), "Inicia sesión en Mac del estudio")

    def test_causa_la_remota_no_ve_a_la_local(self):
        self.assertCausa(self.separados(excluidos="AAAAAAAA"),
                         "Mac del estudio no ve a Mac mini de prueba por Bluetooth: "
                         "reinicia Mac mini de prueba")

    def test_causa_la_local_no_ve_a_la_remota(self):
        self.log(ENCABEZADO
                 + linea("LOGN", "Login Status: 'locked' -> 'unlocked'")
                 + linea("CIRC", "Excluded the following unavailable devices: [BBBBBBBB]")
                 + linea("CIRC", "Selected circle: [AAAAAAAA]"))
        self.assertCausa(self.separados(),
                         "Mac mini de prueba no ve a Mac del estudio por Bluetooth: "
                         "reinicia Mac del estudio")

    def test_causa_las_mac_no_se_unieron(self):
        self.assertCausa(self.separados(), "Las Mac no se unieron: reinicia las dos")

    def test_el_orden_de_las_causas_la_3_antes_que_la_4(self):
        self.assertCausa(self.separados(macos="26.5", compartir_internet="1"),
                         "Versiones distintas: 27.0.1 en Mac mini de prueba, 26.5 en "
                         "Mac del estudio. Actualiza la que va atrás")

    def test_el_orden_de_las_causas_la_2_antes_que_la_3(self):
        self.assertCausa(self.separados(cuenta="abcdef012345", macos="26.5"),
                         "Las dos Mac tienen cuentas de Apple distintas")

    def test_el_orden_de_las_causas_la_5_antes_que_la_7(self):
        self.assertCausa(self.separados(wifi="0", sesion="locked"),
                         "Enciende Wi-Fi en Mac del estudio")

    def test_la_causa_no_sale_si_esta_listo(self):
        codigo, salida = self.revisar()
        self.assertNotIn("No quedó", salida)

    # -------------------------------------------------- una vuelta limpia
    def test_sin_mktemp_dice_la_causa(self):
        self.romper("mktemp")
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 1, salida)
        self.assertEqual(salida.splitlines()[-1], "No quedó: No pude crear archivos temporales")
        self.assertEqual(self.llamadas("ssh"), [])

    def test_una_vuelta_no_repite_el_resultado_de_la_anterior(self):
        # El primer mktemp sirve (los grupos no se unen); los demás fallan.
        (self.bin / "mktemp").write_text(
            '#!/bin/sh\n[ -f "$HOME/mktemp-usado" ] && exit 1\ntouch "$HOME/mktemp-usado"\n'
            'exec /usr/bin/mktemp "$@"\n', encoding="utf-8")
        (self.bin / "mktemp").chmod(0o755)
        self.conf()
        self.remoto(grupo="BBBBBBBB")
        codigo, salida = self.correr("--al-iniciar")
        self.assertEqual(codigo, 1, salida)
        self.assertEqual(self.intentos(), 1)
        self.assertEqual(self.llamadas("osascript")[-1], "No pude crear archivos temporales")

    def test_ignora_la_variable_script_del_entorno(self):
        (self.bin / "ssh").write_text(
            '#!/bin/sh\ncat > "$HOME/script-enviado.txt"\n' + emite_estado(),
            encoding="utf-8")
        self.env["SCRIPT"] = "/otra/cosa"
        codigo, salida = self.revisar()
        self.assertEqual(codigo, 0, salida)
        enviado = (self.home / "script-enviado.txt").read_text(encoding="utf-8")
        self.assertEqual(enviado, SCRIPT.read_text(encoding="utf-8"))

    # -------------------------------------------------- --al-iniciar
    def al_iniciar(self, **cambios):
        self.conf()
        self.remoto(**cambios)
        return self.correr("--al-iniciar")

    def test_al_iniciar_listo_no_notifica(self):
        codigo, salida = self.al_iniciar()
        self.assertEqual((codigo, salida), (0, ""))
        self.assertEqual(self.llamadas("osascript"), [])
        self.assertIn("Universal Control listo.", self.reporte())

    def test_al_iniciar_escribe_la_fecha_en_la_primera_linea(self):
        self.al_iniciar()
        primera = self.reporte().splitlines()[0]
        self.assertRegex(primera, r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")

    def test_al_iniciar_reemplaza_el_reporte(self):
        self.al_iniciar()
        self.al_iniciar()
        reporte = self.reporte()
        self.assertEqual(reporte.count("Universal Control listo."), 1, reporte)
        self.assertEqual(len([l for l in reporte.splitlines() if l[:2] == "20"]), 1, reporte)
        carpeta = self.home / "Library" / "Logs" / "claude-code-entorno"
        self.assertEqual([p.name for p in carpeta.iterdir()], ["universal-control.log"])

    def test_al_iniciar_espera_a_que_se_unan(self):
        self.marcar(".une-al-segundo")
        # Espera holgada: al unirse en el segundo intento termina de inmediato, y así una
        # máquina lenta no deja el primer intento como el único.
        self.env["UC_ESPERA"] = "30"
        codigo, salida = self.al_iniciar()
        self.assertEqual((codigo, salida), (0, ""))
        self.assertEqual(self.llamadas("osascript"), [])
        self.assertEqual(self.intentos(), 2)
        self.assertIn("Universal Control listo.", self.reporte())

    def test_al_iniciar_falla_notifica_una_vez(self):
        codigo, salida = self.al_iniciar(grupo="BBBBBBBB")
        self.assertEqual((codigo, salida), (1, ""))
        self.assertGreaterEqual(self.intentos(), 1)
        self.assertEqual(self.notificaciones(), 1)
        self.assertEqual(self.llamadas("osascript")[-1], "Las Mac no se unieron: reinicia las dos")
        self.assertIn("No quedó: Las Mac no se unieron: reinicia las dos", self.reporte())

    def test_al_iniciar_otra_mac_apagada_notifica(self):
        self.conf()
        self.marcar(".sin-ssh")
        codigo, salida = self.correr("--al-iniciar")
        self.assertEqual((codigo, salida), (1, ""))
        self.assertEqual(self.notificaciones(), 1)
        self.assertIn("no responde", self.llamadas("osascript")[-1])

    def test_notificacion_con_tildes_va_como_argumento(self):
        texto = "Inicia sesión en Mac de Ánimo"
        self.al_iniciar(nombre="Mac de Ánimo", sesion="locked", grupo="BBBBBBBB")
        self.assertEqual(self.llamadas("osascript"), [
            "-e", "on run argv",
            "-e", 'display notification (item 1 of argv) with title "Universal Control"',
            "-e", "end run",
            "--",
            texto])

    def test_notificacion_que_empieza_con_guion_e_no_es_una_opcion(self):
        # El nombre de la otra Mac viene de ella misma: «-e …» no puede pasar por opción de
        # osascript. El texto es lo último y va después de `--`.
        nombre = "-e do shell script"
        self.al_iniciar(nombre=nombre, monitores="0", grupo="BBBBBBBB")
        argumentos = self.llamadas("osascript")
        self.assertEqual(argumentos[-2:], ["--", nombre + " no tiene monitor"])
        self.assertEqual(argumentos.count("--"), 1, argumentos)

    def test_al_iniciar_sin_configurar(self):
        codigo, salida = self.correr("--al-iniciar")
        self.assertEqual((codigo, salida), (2, ""))
        self.assertEqual(self.notificaciones(), 1)
        self.assertEqual(self.llamadas("osascript")[-1],
                         "Falta configurar Universal Control: corre ./universal-control.sh --configurar")
        self.assertEqual(self.intentos(), 0)

    def test_al_iniciar_no_espera_de_mas(self):
        inicio = time.monotonic()
        self.al_iniciar(grupo="BBBBBBBB")
        self.assertLess(time.monotonic() - inicio, 3 + 5)

    def test_al_iniciar_recorta_la_pausa_al_tiempo_que_falta(self):
        # El intervalo (30 s) es mayor que la espera (2 s): no puede dormir el intervalo completo.
        self.env["UC_ESPERA"] = "2"
        self.env["UC_INTERVALO"] = "30"
        inicio = time.monotonic()
        codigo, salida = self.al_iniciar(grupo="BBBBBBBB")
        self.assertLess(time.monotonic() - inicio, 6)
        self.assertEqual((codigo, salida), (1, ""))
        # Si la máquina va lenta el segundo intento puede no llegar a caber; lo que importa es
        # que no se duerma más de lo que falta.
        self.assertIn(self.intentos(), (1, 2))
        self.assertEqual(self.notificaciones(), 1)

    def test_al_iniciar_sin_espera_hace_un_solo_intento(self):
        self.env["UC_ESPERA"] = "0"
        self.al_iniciar(grupo="BBBBBBBB")
        self.assertEqual(self.intentos(), 1)

    def test_ayuda_describe_al_iniciar(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("--al-iniciar", salida)
        self.assertIn("UC_ESPERA", salida)

    # -------------------------------------------------- --instalar y --quitar
    @property
    def plist(self):
        return self.home / PLIST

    def cargado(self):
        return plistlib.loads(self.plist.read_bytes())

    def test_instalar_escribe_el_plist_y_lo_carga(self):
        self.conf()
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 0, salida)
        p = self.cargado()
        self.assertEqual(p["Label"], ETIQUETA)
        self.assertEqual(p["ProgramArguments"],
                         ["/bin/bash", str(SCRIPT.resolve()), "--al-iniciar"])
        self.assertIs(p["RunAtLoad"], True)
        self.assertEqual(p["EnvironmentVariables"]["PATH"], "/usr/bin:/bin:/usr/sbin:/sbin")
        self.assertEqual(p["StandardErrorPath"], str(
            self.home / "Library" / "Logs" / "claude-code-entorno"
            / "universal-control.errores.log"))
        self.assertEqual(self.llamadas("launchctl"), [
            "bootout gui/501/" + ETIQUETA,
            "bootstrap gui/501 " + str(self.plist)])

    def test_instalar_crea_las_carpetas(self):
        self.conf()
        self.assertFalse((self.home / "Library" / "LaunchAgents").exists())
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 0, salida)
        self.assertTrue((self.home / "Library" / "Logs" / "claude-code-entorno").is_dir())

    def test_instalar_sin_configurar(self):
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 2, salida)
        self.assertIn("Falta configurar: ./universal-control.sh --configurar "
                      "<usuario>@<mac>.local", salida)
        self.assertFalse(self.plist.exists())
        self.assertEqual(self.llamadas("launchctl"), [])

    def test_instalar_dos_veces(self):
        self.conf()
        self.assertEqual(self.correr("--instalar")[0], 0)
        primero = self.plist.read_bytes()
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(self.plist.read_bytes(), primero)
        orden = [l.split()[0] for l in self.llamadas("launchctl")]
        self.assertEqual(orden, ["bootout", "bootstrap", "bootout", "bootstrap"])

    def test_instalar_sigue_si_el_bootout_falla(self):
        self.conf()
        (self.home / ".falla-bootout").write_text("no estaba cargada\n", encoding="utf-8")
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 0, salida)
        self.assertTrue(self.llamadas("launchctl")[-1].startswith("bootstrap gui/501 "))

    def test_instalar_con_bootstrap_fallido(self):
        self.conf()
        (self.home / ".falla-bootstrap").write_text("Bootstrap failed: 5\n", encoding="utf-8")
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 1, salida)
        self.assertIn("No pude cargar la tarea con launchctl", salida)
        self.assertIn("Bootstrap failed: 5", salida)
        self.assertNotIn("Listo", salida)

    def test_instalar_con_plist_mal_formado(self):
        self.conf()
        (self.bin / "plutil").write_text(
            "#!/bin/sh\necho 'XML parse error'\nexit 1\n", encoding="utf-8")
        (self.bin / "plutil").chmod(0o755)
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 1, salida)
        self.assertIn("El plist quedó mal", salida)
        self.assertEqual(self.llamadas("launchctl"), [])

    def test_instalar_valida_el_plist_con_plutil_lint(self):
        self.conf()
        (self.bin / "plutil").write_text(
            '#!/bin/sh\necho "$*" >> "$HOME/llamadas-plutil.txt"\nexit 0\n', encoding="utf-8")
        (self.bin / "plutil").chmod(0o755)
        self.assertEqual(self.correr("--instalar")[0], 0)
        (llamada,) = self.llamadas("plutil")
        self.assertTrue(llamada.startswith("-lint "), llamada)

    def test_instalar_sin_plutil_sigue(self):
        self.conf()
        # PATH sin /usr/bin: solo los falsos y las herramientas que el script necesita.
        tools = self.tmp / "tools"
        tools.mkdir()
        for nombre in ("bash", "dirname", "basename", "mkdir", "mv", "rm", "sed", "env"):
            for base in ("/bin", "/usr/bin"):
                if (Path(base) / nombre).exists():
                    (tools / nombre).symlink_to(Path(base) / nombre)
                    break
        self.assertFalse((tools / "plutil").exists())
        self.env["PATH"] = os.pathsep.join([str(self.bin), str(tools)])
        codigo, salida = self.correr("--instalar")
        self.assertEqual(codigo, 0, salida)
        self.assertEqual(self.cargado()["Label"], ETIQUETA)

    @unittest.skipUnless(shutil.which("plutil"), "plutil es de macOS")
    def test_instalar_con_simbolos_xml_en_la_ruta(self):
        self.conf()
        carpeta = self.tmp / "a&b<c>d\"e'f"
        carpeta.mkdir()
        copia = carpeta / "universal-control.sh"
        shutil.copy(str(SCRIPT), str(copia))
        r = subprocess.run(["bash", str(copia), "--instalar"], stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=self.env, timeout=60)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        self.assertEqual(self.cargado()["ProgramArguments"],
                         ["/bin/bash", str(copia.resolve()), "--al-iniciar"])
        self.assertEqual(subprocess.run(["plutil", "-lint", str(self.plist)],
                                        stdout=subprocess.DEVNULL).returncode, 0)

    def test_quitar(self):
        self.conf()
        self.correr("--instalar")
        (self.home / "llamadas-launchctl.txt").unlink()
        codigo, salida = self.correr("--quitar")
        self.assertEqual(codigo, 0, salida)
        self.assertFalse(self.plist.exists())
        self.assertEqual(self.llamadas("launchctl"), ["bootout gui/501/" + ETIQUETA])

    def test_quitar_sin_nada_instalado(self):
        (self.home / ".falla-bootout").write_text("no cargada\n", encoding="utf-8")
        codigo, salida = self.correr("--quitar")
        self.assertEqual(codigo, 0, salida)
        self.assertFalse(self.plist.exists())

    def test_quitar_no_pide_configuracion(self):
        codigo, salida = self.correr("--quitar")
        self.assertEqual(codigo, 0, salida)
        self.assertNotIn("Falta configurar", salida)

    def test_ayuda_describe_instalar_y_quitar(self):
        codigo, salida = self.correr("--ayuda")
        self.assertEqual(codigo, 0, salida)
        self.assertIn("--instalar", salida)
        self.assertIn("--quitar", salida)

    # -------------------------------------------------- por una tubería
    def test_estado_por_bash_s(self):
        directo = self.estado()
        with open(str(SCRIPT), "rb") as f:
            r = subprocess.run(["bash", "-s", "--", "--estado"], stdin=f,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               env=self.env, timeout=60)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        por_tuberia = dict(l.split("=", 1) for l in salida.splitlines() if "=" in l)
        self.assertEqual(por_tuberia, directo)


# Lo que el script nunca debe contener: solo mira, no cambia ajustes ni detiene procesos.
PROHIBIDO = ("defaults write", "defaults delete", "killall", "pkill", "kill ",
             "networksetup -set", "launchctl kickstart", "shutdown", "reboot")


def prohibido_en(texto):
    """Lo prohibido que aparece en el código de `texto` (sin las líneas de comentario)."""
    codigo = "\n".join(l for l in texto.splitlines() if not l.lstrip().startswith("#"))
    return [p for p in PROHIBIDO if p in codigo]


class UniversalControlSoloMira(unittest.TestCase):
    def test_el_detector_encuentra_lo_prohibido_y_salta_los_comentarios(self):
        for p in PROHIBIDO:
            self.assertIn(p, prohibido_en("echo hola\n  %s algo\n" % p), p)
            self.assertEqual(prohibido_en("# %s algo\n  # %s\n" % (p, p)), [], p)

    def test_el_script_nunca_cambia_nada(self):
        self.assertEqual(prohibido_en(SCRIPT.read_text(encoding="utf-8")), [])


if __name__ == "__main__":
    unittest.main()

"""Pruebas de herramientas/fusionar_settings.py."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import fusionar_settings as fs  # noqa: E402

BASE = RAIZ / "claude" / "settings.base.json"
TODOS = {"guard-kill.py", "cbm-code-discovery-gate", "cbm-session-reminder",
         "guard-fable.py", "guard-subagentes.py", "memoria-maestra.py", "jev-reintento.py"}


def comandos(settings, evento):
    return [(g.get("matcher"), h["command"]) for g in settings.get("hooks", {}).get(evento, [])
            for h in g["hooks"]]


class Fusion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.destino = self.dir / "settings.json"

    def tearDown(self):
        self.tmp.cleanup()

    def aplicar(self, **kw):
        kw.setdefault("scripts_disponibles", TODOS)
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = fs.aplicar(BASE, self.destino, **kw)
        return codigo, salida.getvalue()

    def leer(self):
        return json.loads(self.destino.read_text(encoding="utf-8"))

    def respaldos(self):
        return sorted(self.dir.glob("settings.json.bak-*"))

    def test_crea_desde_cero_e_idempotente(self):
        codigo, _ = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 0)
        primero = self.leer()
        self.assertEqual(primero["model"], "haiku")
        self.assertIn(("Bash|PowerShell", "python3 ~/.claude/hooks/guard-kill.py"),
                      comandos(primero, "PreToolUse"))
        self.assertEqual(len(comandos(primero, "SessionStart")), 5)  # 4 de codebase-memory y la de memoria
        self.assertEqual(self.respaldos(), [])  # no había nada que respaldar
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertIn("ya estaba al día", salida)
        self.assertEqual(self.leer(), primero)
        self.assertEqual(self.respaldos(), [])

    def test_conserva_lo_existente_y_respalda(self):
        propio = {"model": "sonnet", "theme": "light", "env": {"MI_VAR": "1"},
                  "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "mi-script"}]}]}}
        self.destino.write_text(json.dumps(propio), encoding="utf-8")
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 0)
        r = self.leer()
        self.assertEqual(r["model"], "sonnet")
        self.assertEqual(r["theme"], "light")
        self.assertEqual(r["env"], {"MI_VAR": "1"})
        self.assertIn((None, "mi-script"), comandos(r, "Stop"))
        self.assertIn((None, "python3 ~/.claude/hooks/memoria-maestra.py fin"), comandos(r, "Stop"))
        self.assertEqual(r["tui"], "fullscreen")
        self.assertIn("Se conserva tu valor de model", salida)
        self.assertEqual(len(self.respaldos()), 1)
        self.assertEqual(json.loads(self.respaldos()[0].read_text()), propio)

    def test_no_duplica_hook_escrito_distinto(self):
        """guard-kill ya instalado para Bash: solo falta cubrir PowerShell."""
        propio = {"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [
            {"type": "command", "command": "~/.claude/hooks/guard-kill.py", "timeout": 10}]}]}}
        self.destino.write_text(json.dumps(propio), encoding="utf-8")
        self.aplicar(python_hooks="python3")
        guard = [c for c in comandos(self.leer(), "PreToolUse") if "guard-kill" in c[1]]
        self.assertEqual(guard, [("Bash", "~/.claude/hooks/guard-kill.py"),
                                 ("PowerShell", "python3 ~/.claude/hooks/guard-kill.py")])
        _, salida = self.aplicar(python_hooks="python3")
        self.assertIn("ya estaba al día", salida)

    def test_windows(self):
        self.aplicar(plataforma="windows", python_hooks="py -3",
                     env_extra={"CLAUDE_CODE_GIT_BASH_PATH": "D:\\Git\\bin\\bash.exe"})
        r = self.leer()
        self.assertEqual(r["statusLine"]["command"], "bash ~/.claude/statusline.sh")
        pre = comandos(r, "PreToolUse")
        self.assertIn(("Bash|PowerShell", "py -3 ~/.claude/hooks/guard-kill.py"), pre)
        self.assertIn(("Grep|Glob", "bash ~/.claude/hooks/cbm-code-discovery-gate"), pre)
        self.assertEqual(r["env"]["CLAUDE_CODE_GIT_BASH_PATH"], "D:\\Git\\bin\\bash.exe")

    def test_sin_codebase_memory(self):
        self.aplicar(python_hooks="python3", sin_codebase_memory=True)
        r = self.leer()
        self.assertNotIn("cbm-session-reminder", [c for _, c in comandos(r, "SessionStart")])
        self.assertEqual([m for m, _ in comandos(r, "PreToolUse")],
                         ["Bash|PowerShell", "Agent|Task|Workflow", "Agent|Task|Workflow|Bash|PowerShell|Write|Edit|NotebookEdit"])

    def test_omite_hooks_sin_script(self):
        _, salida = self.aplicar(python_hooks="python3", scripts_disponibles={"guard-kill.py"})
        self.assertNotIn("SessionStart", self.leer()["hooks"])
        self.assertIn("no existe ~/.claude/hooks/cbm-session-reminder", salida)

    def test_aviso_de_permisos_es_opcional(self):
        self.aplicar(python_hooks="python3")
        self.assertNotIn("skipDangerousModePermissionPrompt", self.leer())
        self.aplicar(python_hooks="python3",
                     ajustes_extra={"skipDangerousModePermissionPrompt": True})
        self.assertIs(self.leer()["skipDangerousModePermissionPrompt"], True)
        _, salida = self.aplicar(python_hooks="python3",
                                 ajustes_extra={"skipDangerousModePermissionPrompt": True})
        self.assertIn("ya estaba al día", salida)

    def test_simular_no_escribe(self):
        codigo, salida = self.aplicar(python_hooks="python3", simular=True)
        self.assertEqual(codigo, 0)
        self.assertIn("[simular] haría:", salida)
        self.assertFalse(self.destino.exists())

    def test_json_roto_no_se_toca(self):
        self.destino.write_text("{ esto no es json", encoding="utf-8")
        codigo, salida = self.aplicar(python_hooks="python3")
        self.assertEqual(codigo, 1)
        self.assertEqual(self.destino.read_text(encoding="utf-8"), "{ esto no es json")
        self.assertEqual(self.respaldos(), [])

    def test_clave_hook(self):
        self.assertEqual(fs.clave_hook('"C:/Program Files/Python/python.exe" '
                                       '~/.claude/hooks/guard-kill.py'), "guard-kill.py")
        self.assertEqual(fs.clave_hook("C:\\x\\.claude\\hooks\\guard-kill.py"), "guard-kill.py")
        self.assertEqual(fs.clave_hook("echo  hola"), "echo hola")


def sellos_falsos(carpeta, nombre, cuantos, desde=1):
    """Crea `cuantos` respaldos <nombre>.bak-AAAAMMDD-HHMMSS con sellos crecientes y devuelve sus rutas."""
    rutas = []
    for i in range(desde, desde + cuantos):
        r = carpeta / ("%s.bak-20250101-0000%02d" % (nombre, i))
        r.write_text("viejo %d" % i, encoding="utf-8")
        rutas.append(r)
    return rutas


class PodaDeRespaldos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.destino = self.dir / "settings.json"

    def tearDown(self):
        self.tmp.cleanup()

    def nombres(self, patron="settings.json.bak-*"):
        return sorted(p.name for p in self.dir.glob(patron))

    def test_conserva_los_3_mas_recientes_y_borra_el_resto(self):
        sellos_falsos(self.dir, "settings.json", 6)
        borrados = fs.podar_respaldos(self.destino)
        self.assertEqual(self.nombres(), ["settings.json.bak-20250101-000004",
                                          "settings.json.bak-20250101-000005",
                                          "settings.json.bak-20250101-000006"])
        self.assertEqual(len(borrados), 3)

    def test_con_3_o_menos_no_borra_nada(self):
        sellos_falsos(self.dir, "settings.json", 3)
        self.assertEqual(fs.podar_respaldos(self.destino), [])
        self.assertEqual(len(self.nombres()), 3)

    def test_nunca_toca_otros_archivos(self):
        sellos_falsos(self.dir, "settings.json", 5)
        ajenos = ["settings.json", "settings.json.bak", "settings.json.bak-1",
                  "settings.json.bak-20250101-000001-2",     # colisión de sello: no es el formato exacto
                  "settings.json.bak-20250101-000001.txt",
                  "settings.json.bak-2025-01-01",
                  "otro.json.bak-20240101-000001",           # respaldo de OTRO archivo
                  "xsettings.json.bak-20240101-000001",
                  "settings.json.bak-20240101-000001x"]
        for n in ajenos:
            (self.dir / n).write_text("ajeno", encoding="utf-8")
        carpeta_falsa = self.dir / "settings.json.bak-20240101-000009"   # una carpeta con ese nombre
        carpeta_falsa.mkdir()
        fs.podar_respaldos(self.destino)
        for n in ajenos:
            self.assertTrue((self.dir / n).exists(), n)
        self.assertTrue(carpeta_falsa.is_dir())
        exactos = [p for p in self.dir.glob("settings.json.bak-????????-??????") if p.is_file()]
        self.assertEqual(len(exactos), 3)

    def test_aplicar_poda_tras_respaldar(self):
        self.destino.write_text(json.dumps({"theme": "light"}), encoding="utf-8")
        sellos_falsos(self.dir, "settings.json", 5)
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = fs.aplicar(BASE, self.destino, python_hooks="python3", scripts_disponibles=TODOS)
        self.assertEqual(codigo, 0)
        quedan = self.nombres()
        self.assertEqual(len(quedan), 3)
        # El respaldo nuevo (sello de hoy) se conserva; los más viejos se fueron.
        self.assertNotIn("settings.json.bak-20250101-000001", quedan)
        self.assertNotIn("settings.json.bak-20250101-000003", quedan)
        self.assertIn("settings.json.bak-20250101-000005", quedan)


class PodaEnInstalarArchivo(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, str(RAIZ / "herramientas"))
        import instalar_comun
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.inst = instalar_comun.Instalador.__new__(instalar_comun.Instalador)
        self.inst.simular = False
        self.inst.info = lambda *a, **k: None

    def tearDown(self):
        self.tmp.cleanup()

    def test_tras_respaldar_conserva_3_de_ese_archivo(self):
        destino = self.dir / "regla.md"
        destino.write_text("v0", encoding="utf-8")
        sellos_falsos(self.dir, "regla.md", 5)
        otro = sellos_falsos(self.dir, "otra.md", 5)
        self.inst.instalar_archivo(b"v1", destino, "regla.md")
        self.assertEqual(destino.read_bytes(), b"v1")
        propios = sorted(p.name for p in self.dir.glob("regla.md.bak-*"))
        self.assertEqual(len(propios), 3)
        self.assertEqual(propios[:2], ["regla.md.bak-20250101-000004", "regla.md.bak-20250101-000005"])
        self.assertTrue(all(p.exists() for p in otro))  # los de otro archivo no se tocan
        nuevo = [n for n in propios if not n.startswith("regla.md.bak-20250101")]
        self.assertEqual(len(nuevo), 1)
        self.assertEqual((self.dir / nuevo[0]).read_bytes(), b"v0")


if __name__ == "__main__":
    unittest.main()

"""Pruebas del hook guard-kill.py (casos permitidos y bloqueados).

Se corren con:  python3 -m unittest discover -s pruebas -v
No necesitan nada instalado: pgrep y la tabla de procesos se sustituyen por datos
de ejemplo, así que el resultado no depende de lo que esté abierto en la máquina.
"""
import base64
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-kill.py"


def cargar_hook():
    spec = importlib.util.spec_from_file_location("guard_kill", str(HOOK))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


gk = cargar_hook()

# Tabla de procesos de ejemplo: PID -> (PPID, línea de comando)
TABLA = {
    100: (1, "/Applications/iTerm.app/Contents/MacOS/iTerm2"),
    101: (1, "/Applications/Utilities/Notification Center.app/x"),
    200: (1, "-zsh"),
    300: (1, "/opt/herramientas/claude --resume"),
    400: (300, "node /tmp/servidor-de-otra-sesion.js"),
    500: (1, "/tmp/mi-servidor-unico-de-prueba --puerto 9000"),
    600: (1, "iTermServer-9.9.9 /dev/ttys001"),
}


def pgrep_falso(args):
    """Imita a pgrep: busca el patrón (o el nombre exacto con -x) en la tabla."""
    if "-x" in args:
        nombre = args[args.index("-x") + 1]
        return [p for p, (_, c) in TABLA.items()
                if c.split(" ", 1)[0].rsplit("/", 1)[-1] == nombre]
    patron = gk.pattern_of(args)
    if "-i" in args:
        return [p for p, (_, c) in TABLA.items() if patron.lower() in c.lower()]
    return [p for p, (_, c) in TABLA.items() if patron in c]


class GuardKill(unittest.TestCase):
    def setUp(self):
        self._orig = (gk.pgrep, gk.proc_table)
        gk.pgrep = pgrep_falso
        gk.proc_table = lambda: dict(TABLA)

    def tearDown(self):
        gk.pgrep, gk.proc_table = self._orig

    def decidir(self, comando, modo="bash"):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            try:
                gk.analyze(comando, modo)
            except SystemExit:
                datos = json.loads(salida.getvalue())
                return datos["hookSpecificOutput"]["permissionDecision"]
        return "allow"

    def assertPermitido(self, comando, modo="bash"):
        self.assertEqual(self.decidir(comando, modo), "allow", comando)

    def assertBloqueado(self, comando, modo="bash"):
        self.assertEqual(self.decidir(comando, modo), "deny", comando)

    # ---------------------------------------------------------- permitidos
    def test_permitidos_bash(self):
        for c in [
            "ls -la",
            "echo kill",
            "kill 12345",
            "kill -9 4242",
            "kill -TERM 4242 4243",
            "kill -s KILL 4242",
            "kill -1 4242",  # señal 1 (HUP) a un PID concreto
            'kill "$PID_SERVIDOR"',
            "pkill -f mi-servidor-unico-de-prueba",
            "pgrep -f mi-servidor-unico-de-prueba | xargs kill",
            "killall -s node",
            "ps aux | grep mi-servidor-unico | awk '{print $2}' | xargs kill",
            "taskkill /PID 1234 /F",
            "taskkill //PID 1234 //T",
            'taskkill /FI "PID eq 1234"',
            "tskill 1234",
            "wmic process where processid=1234 delete",
            "git commit -m 'arregla kill del servidor'",
        ]:
            with self.subTest(c):
                self.assertPermitido(c)

    def test_permitidos_powershell(self):
        for c in [
            "Stop-Process -Id 1234",
            "Stop-Process 1234 -Force",
            "kill 1234",
            "Get-Process -Id 42 | Stop-Process",
            "Stop-Process -Name node -WhatIf",
            "$p = Start-Process notepad -PassThru; Stop-Process -Id $p.Id",
            "Get-Process | Sort-Object CPU",
        ]:
            with self.subTest(c):
                self.assertPermitido(c, "ps")

    # ---------------------------------------------------------- bloqueados
    def test_bloqueados_bash(self):
        for c in [
            "kill -- -1",
            "kill -TERM -1",
            "kill 0",
            "kill -9 -1",
            "pkill -f cat",
            "pkill -f 'cat' -U $(id -u)",
            "pkill -f .",
            "killall iTerm2",
            "killall -u $USER",
            "pgrep -f Notification | xargs kill",
            "pgrep -f node | xargs -r kill -9",
            "kill $(pgrep -f claude)",
            "kill `pgrep -f iTerm`",
            "ps aux | grep -i iterm | awk '{print $2}' | xargs kill -9",
            "ps aux | awk '{print $2}' | xargs kill",
            "sudo pkill -f cat",
            "bash -c 'pkill -f cat'",
            "sh -lc \"killall iTerm2\"",
        ]:
            with self.subTest(c):
                self.assertBloqueado(c)

    def test_bloqueados_windows_desde_bash(self):
        for c in [
            "taskkill /IM node.exe /F",
            "taskkill //IM node.exe //F",
            "TASKKILL /im chrome.exe",
            "taskkill -im code.exe",
            'taskkill /F /FI "IMAGENAME eq node.exe"',
            "cmd /c taskkill /IM node.exe",
            "cmd.exe //c taskkill /f /im node.exe",
            "tskill notepad",
            'wmic process where name="node.exe" delete',
            "wmic process where name='node.exe' call terminate",
            'powershell -NoProfile -Command "Stop-Process -Name node"',
            "pwsh -c 'Get-Process node | Stop-Process'",
            "powershell.exe -ExecutionPolicy Bypass -c \"spps -n node\"",
        ]:
            with self.subTest(c):
                self.assertBloqueado(c)

    def test_bloqueado_comando_codificado(self):
        codificado = base64.b64encode("Stop-Process -Name node".encode("utf-16-le")).decode()
        self.assertBloqueado("powershell -EncodedCommand " + codificado)
        self.assertBloqueado("powershell -enc " + codificado)

    def test_bloqueados_powershell(self):
        for c in [
            "Stop-Process -Name node",
            "Stop-Process -n node -Force",
            "Stop-Process -Name:node",
            "spps -Name chrome",
            "kill -Name node",
            "Get-Process node | Stop-Process",
            "Get-Process | Where-Object { $_.Name -like '*node*' } | Stop-Process -Force",
            "ps node | kill",
            "Stop-Process -Id (Get-Process node).Id",
            "(Get-Process node).Kill()",
            "Get-Process chrome | ForEach-Object { $_.Kill() }",
            "[System.Diagnostics.Process]::GetProcessesByName('node') | % { $_.Kill() }",
            "$procesos | Stop-Process",
            "Stop-Process -InputObject $procesos",
            "taskkill /IM node.exe /F",
            "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Invoke-CimMethod -MethodName Terminate",
            "Get-Process node | % { Stop-Process -Id $_.Id }",
        ]:
            with self.subTest(c):
                self.assertBloqueado(c, "ps")

    def test_protegidos(self):
        """Lo que atraparía un patrón cuenta como protegido según su tipo."""
        tabla = dict(TABLA)
        self.assertIn("sistema", gk.why_protected(100, tabla, [], None))
        self.assertIn("terminal", gk.why_protected(200, tabla, [], None))
        self.assertIn("sesión de Claude", gk.why_protected(300, tabla, [], None))
        self.assertIn("otra sesión", gk.why_protected(400, tabla, [], None))
        self.assertIsNone(gk.why_protected(500, tabla, [], None))
        self.assertIn("sistema", gk.why_protected(600, tabla, [], None))  # iTermServer-*

    def test_sin_pgrep_patron_corto(self):
        """Sin pgrep (por ejemplo en Windows) un -f corto se bloquea igual."""
        gk.pgrep = lambda args: None
        self.assertBloqueado("pkill -f cat")
        self.assertPermitido("pkill -f mi-servidor-unico-de-prueba")


class GuardKillDeExtremoAExtremo(unittest.TestCase):
    """Corre el hook como lo hace Claude Code: JSON por stdin, respuesta por stdout."""

    def correr(self, entrada):
        r = subprocess.run([sys.executable, str(HOOK)], input=entrada.encode("utf-8"),
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        return r.stdout.decode("utf-8")

    def evento(self, comando, herramienta="Bash"):
        return json.dumps({"hook_event_name": "PreToolUse", "tool_name": herramienta,
                           "tool_input": {"command": comando}})

    def test_bloquea_taskkill(self):
        salida = json.loads(self.correr(self.evento("taskkill /IM node.exe /F")))
        self.assertEqual(salida["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertIn("PID", salida["hookSpecificOutput"]["permissionDecisionReason"])

    def test_bloquea_stop_process_en_powershell(self):
        salida = json.loads(self.correr(self.evento("Stop-Process -Name node", "PowerShell")))
        self.assertEqual(salida["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_ejemplo_de_agents_md(self):
        """El JSON con el que AGENTS.md comprueba el hook instalado debe bloquearse."""
        ejemplo = RAIZ / "pruebas" / "datos" / "hook-taskkill.json"
        salida = json.loads(self.correr(ejemplo.read_text(encoding="utf-8")))
        self.assertEqual(salida["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_permite_kill_por_pid(self):
        self.assertEqual(self.correr(self.evento("kill 999999")), "")

    def test_entrada_rota_no_bloquea(self):
        self.assertEqual(self.correr("esto no es json"), "")
        self.assertEqual(self.correr(""), "")


if __name__ == "__main__":
    unittest.main()

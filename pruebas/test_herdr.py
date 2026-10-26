"""Pruebas del paso de herdr de instalar_comun.py (config, integración, skill, plugins y Ghostty).

Se corre instalar_comun.py de verdad, con HOME en una carpeta temporal y con `herdr`,
`claude` y `npx` de mentira que anotan cada llamada: no usa internet ni toca tu
configuración ni tu sesión de herdr. El PATH solo tiene los programas falsos y
/usr/bin:/bin, para que no aparezca el herdr real.
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
CONFIG_HERDR = RAIZ / "herdr" / "config.toml"
PLANTILLA_GHOSTTY = RAIZ / "ghostty" / "config"
ID_TELEGRAM = "permgps.telegram-agents"

CLAUDE_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-claude.txt"
case "$*" in
  *--json*) echo "[]" ;;
  "mcp get"*) exit 1 ;;
esac
exit 0
"""

# herdr de mentira: recuerda lo instalado con archivos marcador en HOME.
HERDR_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-herdr.txt"
case "$*" in
  "integration status")
    if [ -f "$HOME/.marca-integracion" ]; then
      echo "claude: current (v11) ($HOME/.claude/hooks/herdr-agent-state.sh)"
    else
      echo "claude: not installed ($HOME/.claude/hooks/herdr-agent-state.sh)"
    fi ;;
  "integration install claude") touch "$HOME/.marca-integracion" ;;
  "plugin list --json")
    if [ -f "$HOME/.marca-plugin" ]; then
      echo '{"result":{"plugins":[{"plugin_id":"permgps.telegram-agents","source":{"kind":"github","owner":"permgps","repo":"herdr-telegram-agents"}}]}}'
    else
      echo '{"result":{"plugins":[]}}'
    fi ;;
  "plugin install permgps/herdr-telegram-agents --yes") touch "$HOME/.marca-plugin" ;;
  "plugin config-dir permgps.telegram-agents")
    echo "$HOME/.config/herdr/plugins/config/permgps.telegram-agents" ;;
  "server reload-config") echo "no server" >&2; exit 1 ;;
esac
exit 0
"""

# npx de mentira: «instala» la skill creando su SKILL.md.
NPX_FALSO = """#!/bin/sh
echo "$*" >> "$HOME/llamadas-npx.txt"
for a in "$@"; do
  case "$a" in
    */*@*) s="${a##*@}"; mkdir -p "$HOME/.claude/skills/$s"; echo "# $s" > "$HOME/.claude/skills/$s/SKILL.md" ;;
  esac
done
exit 0
"""


class PasoHerdr(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.falso("claude", CLAUDE_FALSO)
        self.env = {"HOME": str(self.home), "TMPDIR": str(self.tmp), "PYTHONIOENCODING": "utf-8",
                    "PATH": os.pathsep.join([str(self.bin), "/usr/bin", "/bin"])}

    def tearDown(self):
        shutil.rmtree(str(self.tmp), ignore_errors=True)

    def falso(self, nombre, guion):
        ruta = self.bin / nombre
        ruta.write_text(guion, encoding="utf-8")
        ruta.chmod(0o755)
        return ruta

    def correr(self, *opciones):
        args = [sys.executable, str(INSTALAR_COMUN), "--plataforma", "unix",
                "--sin-codebase-memory"] + list(opciones)
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, env=self.env, timeout=120)
        salida = r.stdout.decode("utf-8", "replace")
        self.assertEqual(r.returncode, 0, salida)
        return salida

    def llamadas(self, programa="herdr"):
        archivo = self.home / ("llamadas-%s.txt" % programa)
        return archivo.read_text(encoding="utf-8") if archivo.exists() else ""

    @property
    def config(self):
        return self.home / ".config" / "herdr" / "config.toml"

    def test_instala_config_integracion_y_plugin(self):
        self.falso("herdr", HERDR_FALSO)
        salida = self.correr("--sin-skills")
        self.assertEqual(self.config.read_bytes(), CONFIG_HERDR.read_bytes())
        llamadas = self.llamadas()
        self.assertIn("integration install claude", llamadas)
        self.assertIn("plugin install permgps/herdr-telegram-agents --yes", llamadas)
        self.assertIn("server reload-config", llamadas)  # falla sin servidor, pero no es error
        # El bot de Telegram se configura a mano: queda como tarea pendiente.
        self.assertIn("%s.setup" % ID_TELEGRAM, salida)

    def test_segunda_corrida_no_repite_nada(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills")
        primeras = self.llamadas()
        salida = self.correr("--sin-skills")
        nuevas = self.llamadas()[len(primeras):]
        self.assertNotIn("integration install", nuevas)
        self.assertNotIn("plugin install", nuevas)
        self.assertIn("al día: %s" % self.config, salida)
        self.assertEqual([p.name for p in self.home.rglob("*.bak-*")], [])

    def test_config_distinta_se_respalda(self):
        self.falso("herdr", HERDR_FALSO)
        self.config.parent.mkdir(parents=True)
        self.config.write_text("# mi config vieja\n", encoding="utf-8")
        self.correr("--sin-skills")
        respaldos = list(self.config.parent.glob("config.toml.bak-*"))
        self.assertEqual(len(respaldos), 1)
        self.assertEqual(respaldos[0].read_text(encoding="utf-8"), "# mi config vieja\n")
        self.assertEqual(self.config.read_bytes(), CONFIG_HERDR.read_bytes())

    def test_plugin_configurado_no_queda_pendiente(self):
        self.falso("herdr", HERDR_FALSO)
        carpeta = self.home / ".config" / "herdr" / "plugins" / "config" / ID_TELEGRAM
        carpeta.mkdir(parents=True)
        (carpeta / "config.json").write_text("{}", encoding="utf-8")
        salida = self.correr("--sin-skills")
        self.assertNotIn("%s.setup" % ID_TELEGRAM, salida)

    def test_skill_de_herdr(self):
        self.falso("herdr", HERDR_FALSO)
        self.falso("npx", NPX_FALSO)
        self.correr()
        self.assertIn("herdrdev/herdr@herdr", self.llamadas("npx"))
        self.assertTrue((self.home / ".claude" / "skills" / "herdr" / "SKILL.md").is_file())

    def test_sin_skills_no_instala_la_skill_de_herdr(self):
        self.falso("herdr", HERDR_FALSO)
        self.falso("npx", NPX_FALSO)
        self.correr("--sin-skills")
        self.assertNotIn("herdrdev/herdr", self.llamadas("npx"))

    def test_sin_plugins_herdr(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills", "--sin-plugins-herdr")
        self.assertNotIn("plugin install", self.llamadas())
        self.assertTrue(self.config.is_file())

    def test_sin_herdr_no_toca_nada(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills", "--sin-herdr", "--ghostty")
        self.assertEqual(self.llamadas(), "")
        self.assertFalse(self.config.exists())
        self.assertFalse((self.home / ".config" / "ghostty" / "config").exists())

    def test_herdr_no_instalado_avisa_sin_fallar(self):
        salida = self.correr("--sin-skills")
        self.assertIn("No encontré herdr", salida)
        self.assertFalse(self.config.exists())

    def test_ghostty_con_la_ruta_de_herdr(self):
        herdr = self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills", "--ghostty")
        texto = (self.home / ".config" / "ghostty" / "config").read_text(encoding="utf-8")
        self.assertIn("command = %s" % herdr, texto)
        self.assertNotIn("{{", texto)
        self.assertIn("theme = Kanagawa Wave", texto)

    def test_sin_opcion_ghostty_no_lo_toca(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills")
        self.assertFalse((self.home / ".config" / "ghostty" / "config").exists())

    def test_simular_no_cambia_nada(self):
        self.falso("herdr", HERDR_FALSO)
        salida = self.correr("--sin-skills", "--simular", "--ghostty")
        self.assertFalse(self.config.exists())
        self.assertFalse((self.home / ".config" / "ghostty").exists())
        self.assertNotIn("install", self.llamadas())
        self.assertIn("[simular] haría: herdr plugin install permgps/herdr-telegram-agents --yes", salida)

    def test_instala_el_tema_kanagawa_de_claude_code(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills")
        tema = self.home / ".claude" / "themes" / "kanagawa.json"
        self.assertEqual(tema.read_bytes(), (RAIZ / "claude" / "themes" / "kanagawa.json").read_bytes())
        ajustes = (self.home / ".claude" / "settings.json").read_text(encoding="utf-8")
        self.assertIn('"theme": "custom:kanagawa"', ajustes)

    def test_instala_la_config_de_neovim_si_no_hay_una(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills")
        nvim = self.home / ".config" / "nvim"
        self.assertTrue((nvim / "init.lua").is_file())
        self.assertIn("kanagawa", (nvim / "lua" / "plugins" / "tema.lua").read_text(encoding="utf-8"))

    def test_no_pisa_una_config_de_neovim_que_ya_era_tuya(self):
        self.falso("herdr", HERDR_FALSO)
        propia = self.home / ".config" / "nvim" / "init.lua"
        propia.parent.mkdir(parents=True)
        propia.write_text("-- mi config\n", encoding="utf-8")
        salida = self.correr("--sin-skills")
        self.assertEqual(propia.read_text(encoding="utf-8"), "-- mi config\n")
        self.assertFalse((propia.parent / "lua" / "plugins" / "tema.lua").exists())
        self.assertIn("ya tienes una config de Neovim", salida)

    def test_sin_nvim_no_toca_neovim(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills", "--sin-nvim")
        self.assertFalse((self.home / ".config" / "nvim").exists())

    def test_neovim_simulado_no_copia_nada(self):
        self.falso("herdr", HERDR_FALSO)
        self.correr("--sin-skills", "--simular")
        self.assertFalse((self.home / ".config" / "nvim").exists())


class ArchivosDelRepo(unittest.TestCase):
    def test_config_herdr_sin_datos_personales(self):
        texto = CONFIG_HERDR.read_text(encoding="utf-8")
        self.assertNotIn("/Users/", texto)
        self.assertNotIn("bot_token", texto)

    def test_config_herdr_usa_kanagawa_y_abre_neovim_en_ventana_flotante(self):
        texto = CONFIG_HERDR.read_text(encoding="utf-8")
        self.assertIn("Kanagawa", texto)
        self.assertIn('command = "nvim ."', texto)

    def test_config_de_neovim_sin_datos_personales(self):
        archivos = [f for f in (RAIZ / "nvim").rglob("*") if f.is_file()]
        self.assertTrue(archivos)
        for f in archivos:
            texto = f.read_text(encoding="utf-8")
            self.assertNotIn("/Users/", texto, f)
            self.assertNotIn(Path.home().name, texto, f)

    def test_plantilla_ghostty_usa_el_marcador(self):
        texto = PLANTILLA_GHOSTTY.read_text(encoding="utf-8")
        self.assertIn("command = {{RUTA_HERDR}}", texto)
        self.assertNotIn("/opt/homebrew", texto)


if __name__ == "__main__":
    unittest.main()

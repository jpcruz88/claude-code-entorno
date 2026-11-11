"""claude/hooks/guard-fable.py: bloquea elegir Fable, salvo en subagentes con tope de uso.

En Agent y Task, Fable lo decide guard-subagentes.py (lo baja según el uso de la cuenta),
así que este hook lo deja pasar solo si ese guardián está instalado a su lado. En
workflows, comandos y archivos sigue bloqueado.

Las pruebas arman el nombre del modelo con una constante: el propio hook bloquea
escribir un archivo que fije ese modelo de forma literal.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "guard-fable.py"
MAS_CAPAZ = "fable"


def correr(entrada, hook=HOOK):
    entorno = {k: v for k, v in os.environ.items() if k != "CLAUDE_PERMITIR_FABLE"}
    r = subprocess.run([sys.executable, str(hook)], input=json.dumps(entrada).encode(),
                       capture_output=True, timeout=30, env=entorno)
    assert r.returncode == 0, r.stderr
    return r.stdout.decode().strip()


def agente(modelo, herramienta="Agent"):
    entrada = {"description": "x", "prompt": "y", "effort": "high"}
    entrada["model"] = modelo
    return {"tool_name": herramienta, "tool_input": entrada}


def negado(salida):
    return bool(salida) and json.loads(salida)["hookSpecificOutput"]["permissionDecision"] == "deny"


class GuardFable(unittest.TestCase):
    def test_es_python_valido(self):
        compile(HOOK.read_text(encoding="utf-8"), str(HOOK), "exec")

    def test_agente_con_haiku_pasa(self):
        self.assertEqual(correr({"tool_name": "Agent", "tool_input": {"model": "haiku"}}), "")

    def test_herramienta_no_revisada_pasa(self):
        self.assertEqual(correr({"tool_name": "Read", "tool_input": {"file_path": "x"}}), "")

    def test_subagente_pasa_si_el_guardian_de_topes_esta_al_lado(self):
        for herramienta in ("Agent", "Task"):
            for modelo in (MAS_CAPAZ, "claude-%s-5-2" % MAS_CAPAZ):
                with self.subTest(herramienta=herramienta, modelo=modelo):
                    self.assertEqual(correr(agente(modelo, herramienta)), "")

    def test_subagente_se_bloquea_sin_el_guardian_de_topes(self):
        carpeta = tempfile.mkdtemp(prefix="solo-fable-")
        self.addCleanup(shutil.rmtree, carpeta, True)
        copia = Path(carpeta, "guard-fable.py")
        shutil.copy(str(HOOK), str(copia))
        self.assertTrue(negado(correr(agente(MAS_CAPAZ), hook=copia)))

    def test_workflow_sigue_bloqueado(self):
        guion = "await agent('x', {model: '%s', effort: 'high'})" % MAS_CAPAZ
        self.assertTrue(negado(correr({"tool_name": "Workflow", "tool_input": {"script": guion}})))

    def test_comando_sigue_bloqueado(self):
        comando = "claude --model %s -p hola" % MAS_CAPAZ
        self.assertTrue(negado(correr({"tool_name": "Bash", "tool_input": {"command": comando}})))


def bash(comando):
    return {"tool_name": "Bash", "tool_input": {"command": comando}}


class FalsosNegativos(unittest.TestCase):
    """Formas de fijar el modelo que antes pasaban."""

    def setUp(self):
        self.carpeta = Path(tempfile.mkdtemp(prefix="fable-cfg-"))
        self.addCleanup(shutil.rmtree, str(self.carpeta), True)

    def archivo(self, nombre, contenido):
        ruta = self.carpeta / nombre
        ruta.write_text(contenido, encoding="utf-8")
        return str(ruta)

    def editar(self, ruta, viejo, nuevo, **extra):
        entrada = {"file_path": ruta, "old_string": viejo, "new_string": nuevo}
        entrada.update(extra)
        return {"tool_name": "Edit", "tool_input": entrada}

    def test_edit_que_solo_cambia_el_nombre_del_modelo_se_bloquea(self):
        ruta = self.archivo("settings.json", '{\n  "model": "opus"\n}\n')
        self.assertTrue(negado(correr(self.editar(ruta, "opus", MAS_CAPAZ))))
        self.assertTrue(negado(correr(self.editar(ruta, '"opus"', '"%s"' % MAS_CAPAZ))))

    def test_edit_de_id_completo_en_variable_de_entorno_se_bloquea(self):
        ruta = self.archivo("settings.json",
                            '{"env": {"ANTHROPIC_MODEL": "claude-opus-5-5"}}\n')
        nuevo = "claude-%s-5-1" % MAS_CAPAZ
        self.assertTrue(negado(correr(self.editar(ruta, "claude-opus-5-5", nuevo))))

    def test_edit_sin_poder_leer_el_archivo_mira_el_texto_viejo(self):
        ruta = str(self.carpeta / "no-existe.json")
        self.assertTrue(negado(correr(self.editar(ruta, "sonnet", MAS_CAPAZ))))

    def test_edit_ajeno_en_un_archivo_que_ya_lo_menciona_pasa(self):
        ruta = self.archivo("notas.txt", "model: %s\ncolor: azul\n" % MAS_CAPAZ)
        self.assertEqual(correr(self.editar(ruta, "azul", "verde")), "")

    def test_edit_de_otro_texto_con_la_palabra_pasa(self):
        ruta = self.archivo("notas.txt", "La ruta del barco.\n")
        self.assertEqual(correr(self.editar(ruta, "barco", MAS_CAPAZ)), "")

    def test_variable_de_modelo_en_json_se_bloquea(self):
        for clave in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
                      "CLAUDE_CODE_SUBAGENT_MODEL"):
            with self.subTest(clave=clave):
                contenido = '{"env": {"%s": "claude-%s-5-1"}}' % (clave, MAS_CAPAZ)
                escribir = {"tool_name": "Write", "tool_input": {
                    "file_path": str(self.carpeta / "settings.json"), "content": contenido}}
                self.assertTrue(negado(correr(escribir)))

    def test_variable_de_modelo_en_yaml_se_bloquea(self):
        contenido = "env:\n  ANTHROPIC_MODEL: %s\n" % MAS_CAPAZ
        escribir = {"tool_name": "Write", "tool_input": {
            "file_path": str(self.carpeta / "config.yaml"), "content": contenido}}
        self.assertTrue(negado(correr(escribir)))

    def test_claude_config_set_model_se_bloquea(self):
        for comando in ("claude config set model %s" % MAS_CAPAZ,
                        "claude config set -g model claude-%s-5-1" % MAS_CAPAZ,
                        "claude config set --global model '%s'" % MAS_CAPAZ):
            with self.subTest(comando=comando):
                self.assertTrue(negado(correr(bash(comando))))

    def test_claude_config_set_otro_modelo_pasa(self):
        self.assertEqual(correr(bash("claude config set model sonnet")), "")


class ConfiguracionDeJev(unittest.TestCase):
    """Solo el usuario cambia ~/.claude/jev/config.json y ~/.claude/jev/clave."""
    CONFIG = "~/.claude/jev/config.json"
    CLAVE = "~/.claude/jev/clave"

    def correr_sin_permiso(self, entrada, permitir_fable=False):
        entorno = {k: v for k, v in os.environ.items() if k != "CLAUDE_PERMITIR_FABLE"}
        if permitir_fable:
            entorno["CLAUDE_PERMITIR_FABLE"] = "1"
        r = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(entrada).encode(),
                           capture_output=True, timeout=30, env=entorno)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.decode().strip()

    def escribir(self, ruta, herramienta="Write"):
        entrada = {"file_path": ruta, "content": "{}"}
        if herramienta == "Edit":
            entrada = {"file_path": ruta, "old_string": "a", "new_string": "b"}
        return {"tool_name": herramienta, "tool_input": entrada}

    def test_write_y_edit_se_bloquean(self):
        home = os.path.expanduser("~")
        for ruta in (self.CONFIG, self.CLAVE, home + "/.claude/jev/config.json",
                     home + "/.claude/jev/../jev/clave"):
            for herramienta in ("Write", "Edit"):
                with self.subTest(ruta=ruta, herramienta=herramienta):
                    salida = correr(self.escribir(ruta, herramienta))
                    self.assertTrue(negado(salida))
                    self.assertIn("solo el usuario", salida.lower())

    def test_bloqueo_sigue_con_permiso_de_fable(self):
        self.assertTrue(negado(self.correr_sin_permiso(self.escribir(self.CLAVE), True)))

    def test_comandos_que_escriben_se_bloquean(self):
        for comando in (
                "echo '{}' > ~/.claude/jev/config.json",
                "printf x >> \"$HOME/.claude/jev/clave\"",
                "echo x | tee ~/.claude/jev/clave",
                "echo x | tee -a ${HOME}/.claude/jev/config.json > /dev/null",
                "cp /tmp/otra.json ~/.claude/jev/config.json",
                "mv /tmp/otra ~/.claude/jev/clave",
                "mv ~/.claude/jev/clave /tmp/robada",
                "rm -f ~/.claude/jev/config.json",
                "sed -i '' 's/a/b/' ~/.claude/jev/config.json",
                "cd /tmp && cp nueva.json ~/.claude/jev/config.json"):
            with self.subTest(comando=comando):
                self.assertTrue(negado(correr(bash(comando))))

    def test_powershell_que_escribe_se_bloquea(self):
        entrada = {"tool_name": "PowerShell", "tool_input": {
            "command": "Set-Content -Path $HOME\\.claude\\jev\\clave -Value x"}}
        self.assertTrue(negado(correr(entrada)))

    def test_lecturas_y_otros_archivos_pasan(self):
        for comando in ("cat ~/.claude/jev/config.json",
                        "cat ~/.claude/jev/config.json > /tmp/copia.json",
                        "cp ~/.claude/jev/config.json /tmp/copia.json",
                        "jq . ~/.claude/jev/config.json",
                        "echo x > ~/.claude/jev/limites.json",
                        "echo x >> ~/.claude/jev/decisiones.jsonl",
                        "cp a ~/.claude/jev/config.json.bak"):
            with self.subTest(comando=comando):
                self.assertEqual(correr(bash(comando)), "")
        for ruta in ("~/.claude/jev/limites.json", "~/.claude/jev/decisiones.jsonl"):
            with self.subTest(ruta=ruta):
                self.assertEqual(correr(self.escribir(ruta)), "")
        lectura = {"tool_name": "Read", "tool_input": {"file_path": self.CONFIG}}
        self.assertEqual(correr(lectura), "")


class RutasLibres(unittest.TestCase):
    """Dentro de un repo, la documentación, las reglas y las pruebas pueden HABLAR del modelo."""

    def setUp(self):
        self.repo = Path(tempfile.mkdtemp(prefix="fable-repo-"))
        self.addCleanup(shutil.rmtree, str(self.repo), True)
        (self.repo / ".git").mkdir()
        self.contenido = "Ejemplo: model: %s\n" % MAS_CAPAZ

    def escribir(self, relativa, raiz=None):
        ruta = (raiz or self.repo) / relativa
        return correr({"tool_name": "Write", "tool_input": {
            "file_path": str(ruta), "content": self.contenido}})

    def test_docs_reglas_y_pruebas_del_repo_pasan(self):
        for relativa in ("docs/modelos.md", "claude/rules/nunca.md", "pruebas/notas.md",
                         "pruebas/test_algo.py", "pruebas/algo_test.py"):
            with self.subTest(relativa=relativa):
                self.assertEqual(self.escribir(relativa), "")

    def test_settings_y_scripts_siguen_bloqueados(self):
        for relativa in ("docs/settings.json", "claude/rules/settings.local.json",
                         "pruebas/settings.json", "docs/instalar.sh", "pruebas/arrancar.py",
                         "claude/settings.base.json", "notas.md"):
            with self.subTest(relativa=relativa):
                self.assertTrue(negado(self.escribir(relativa)))

    def test_fuera_de_un_repo_no_se_libera(self):
        suelta = Path(tempfile.mkdtemp(prefix="fable-suelta-"))
        self.addCleanup(shutil.rmtree, str(suelta), True)
        self.assertTrue(negado(self.escribir("docs/modelos.md", raiz=suelta)))


if __name__ == "__main__":
    unittest.main()

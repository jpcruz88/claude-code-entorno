"""claude/hooks/memoria-maestra.py: la memoria de Claude vive en un repo privado del usuario.

Las pruebas usan un remoto local (repo bare) en lugar de GitHub, y una carpeta de
memoria temporal, así que no tocan la memoria real ni la cuenta de nadie.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOOK = RAIZ / "claude" / "hooks" / "memoria-maestra.py"
sys.path.insert(0, str(HOOK.parent))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("memoria_maestra", HOOK)
mm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mm)


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd)] + list(args), capture_output=True, text=True)


class ConFondo(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.remoto = self.tmp / "remoto.git"
        subprocess.run(["git", "init", "-q", "--bare", str(self.remoto)], check=True)
        self.memoria = self.tmp / "memoria-viva"
        self.memoria.mkdir()
        (self.memoria / "MEMORY.md").write_text("- [x](x.md) — gancho\n", encoding="utf-8")
        (self.memoria / "x.md").write_text("---\nname: x\n---\nDato\n", encoding="utf-8")
        self.clon = self.tmp / "memoria-maestra"
        self.config = self.tmp / "config.json"

    def tearDown(self):
        import shutil
        shutil.rmtree(str(self.tmp), ignore_errors=True)


class Configurar(ConFondo):
    def test_crea_clon_mueve_la_memoria_y_la_enlaza(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        self.assertTrue(self.memoria.is_symlink())
        self.assertEqual(self.memoria.resolve(), (self.clon / "memoria" / "principal").resolve())
        self.assertEqual((self.clon / "memoria" / "principal" / "x.md").read_text(encoding="utf-8").splitlines()[-1], "Dato")

    def test_sube_al_remoto_privado(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        ls = subprocess.run(["git", "--git-dir", str(self.remoto), "ls-tree", "-r", "--name-only", "HEAD"],
                            capture_output=True, text=True).stdout
        self.assertIn("memoria/principal/MEMORY.md", ls)

    def test_guarda_la_configuracion(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        datos = json.loads(self.config.read_text(encoding="utf-8"))
        self.assertEqual(datos["clon"], str(self.clon))

    def test_segunda_vez_no_repite_ni_rompe_nada(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        self.assertTrue(self.memoria.is_symlink())
        self.assertTrue((self.clon / "memoria" / "principal" / "MEMORY.md").is_file())

    def test_otra_maquina_mezcla_sin_pisar_lo_del_remoto(self):
        # Primera máquina sube su memoria.
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        # Segunda máquina con una memoria distinta y un archivo que el remoto no tiene.
        otra = self.tmp / "otra-maquina-memoria"
        otra.mkdir()
        (otra / "x.md").write_text("version local\n", encoding="utf-8")
        (otra / "nuevo.md").write_text("solo aqui\n", encoding="utf-8")
        clon2 = self.tmp / "clon2"
        cfg2 = self.tmp / "config2.json"
        mm.configurar(otra, clon2, str(self.remoto), cfg2)
        self.assertEqual((clon2 / "memoria" / "principal" / "x.md").read_text(encoding="utf-8").splitlines()[-1], "Dato")
        self.assertTrue((clon2 / "memoria" / "principal" / "nuevo.md").is_file())


class Sincronizar(ConFondo):
    def test_sin_cambios_no_hace_commit(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        antes = git(self.clon, "rev-list", "--count", "HEAD").stdout.strip()
        mm.sincronizar(self.clon)
        self.assertEqual(git(self.clon, "rev-list", "--count", "HEAD").stdout.strip(), antes)

    def test_cambio_en_la_memoria_se_comitea_y_sube(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        (self.memoria / "nuevo.md").write_text("dato nuevo\n", encoding="utf-8")
        mm.sincronizar(self.clon)
        self.assertEqual(git(self.clon, "status", "--porcelain").stdout.strip(), "")
        ls = subprocess.run(["git", "--git-dir", str(self.remoto), "ls-tree", "-r", "--name-only", "HEAD"],
                            capture_output=True, text=True).stdout
        self.assertIn("memoria/principal/nuevo.md", ls)


class Hooks(ConFondo):
    def correr(self, modo, entrada, config):
        entorno = dict(os.environ, MEMORIA_MAESTRA_CONFIG=str(config))
        r = subprocess.run([sys.executable, str(HOOK), modo], input=json.dumps(entrada).encode(),
                           capture_output=True, timeout=60, env=entorno)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.decode("utf-8").strip()

    def test_inicio_sin_config_pregunta_al_usuario(self):
        salida = self.correr("inicio", {"cwd": str(self.tmp)}, self.config)
        contexto = json.loads(salida)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("memoria maestra", contexto)
        self.assertIn("privado", contexto.lower())

    def test_inicio_con_config_no_pregunta(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        self.assertEqual(self.correr("inicio", {"cwd": str(self.tmp)}, self.config), "")

    def test_fin_sin_config_no_hace_nada(self):
        self.assertEqual(self.correr("fin", {}, self.config), "")

    def test_fin_sincroniza(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        (self.memoria / "otro.md").write_text("otro\n", encoding="utf-8")
        self.correr("fin", {}, self.config)
        self.assertEqual(git(self.clon, "status", "--porcelain").stdout.strip(), "")


class OtrosProyectos(ConFondo):
    def setUp(self):
        super().setUp()
        self.claude = self.tmp / "claude-config"
        self.env_extra = {"CLAUDE_CONFIG_DIR": str(self.claude)}

    def correr_inicio(self, cwd):
        entorno = dict(os.environ, MEMORIA_MAESTRA_CONFIG=str(self.config), **self.env_extra)
        r = subprocess.run([sys.executable, str(HOOK), "inicio"],
                           input=json.dumps({"cwd": str(cwd)}).encode(), capture_output=True,
                           timeout=60, env=entorno)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_slug_legible_del_proyecto(self):
        self.assertEqual(mm.slug_proyecto("/tmp/Mi Proyecto Nuevo"), "mi-proyecto-nuevo")

    def test_abrir_otro_proyecto_enlaza_y_sube_su_memoria(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        otro = self.tmp / "Proyecto Ajeno"
        otro.mkdir()
        carpeta = mm.carpeta_memoria(str(otro), self.claude)
        carpeta.mkdir(parents=True)
        (carpeta / "dato.md").write_text("de otro proyecto\n", encoding="utf-8")
        self.correr_inicio(otro)
        mm.sincronizar(self.clon)  # lo que hace el hook al terminar la sesión
        slug = mm.slug_proyecto(str(otro))
        self.assertTrue(carpeta.is_symlink())
        self.assertEqual((self.clon / "memoria" / slug / "dato.md").read_text(encoding="utf-8"),
                         "de otro proyecto\n")
        ls = subprocess.run(["git", "--git-dir", str(self.remoto), "ls-tree", "-r", "--name-only", "HEAD"],
                            capture_output=True, text=True).stdout
        self.assertIn("memoria/" + slug + "/dato.md", ls)

    def test_abrir_proyecto_sin_memoria_crea_su_carpeta(self):
        mm.configurar(self.memoria, self.clon, str(self.remoto), self.config)
        nuevo = self.tmp / "Nuevo"
        nuevo.mkdir()
        self.correr_inicio(nuevo)
        carpeta = mm.carpeta_memoria(str(nuevo), self.claude)
        self.assertTrue(carpeta.is_symlink())
        self.assertTrue((self.clon / "memoria" / mm.slug_proyecto(str(nuevo))).is_dir())


class Carpeta(unittest.TestCase):
    def test_carpeta_de_memoria_del_proyecto(self):
        # Partido: la prueba no debe llevar la ruta real del disco.
        disco = "KING" + "STON"
        ruta = mm.carpeta_memoria("/Volumes/" + disco + "/Proyectos", Path("/tmp/cfg"))
        self.assertEqual(ruta.name, "memory")
        self.assertEqual(ruta.parent.name, "-Volumes-" + disco + "-Proyectos")


if __name__ == "__main__":
    unittest.main()

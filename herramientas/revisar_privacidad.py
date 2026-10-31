#!/usr/bin/env python3
"""Busca en el repo datos que no deben publicarse. Si encuentra algo, sale con 1.

Revisa los archivos que irían al repo (su contenido y su nombre: los versionados
y los nuevos que no están ignorados) y, con --historial, también todo lo ya
guardado en commits anteriores, sus mensajes, y el autor y el committer de cada
commit: solo se acepta la identidad acordada, que es la de `git config --local
user.name` / `user.email` de este repo (así el correo no se escribe en ningún
archivo).

Busca dos tipos de cosas:
1. Patrones genéricos (están aquí mismo): rutas de usuario (/Users/<nombre>,
   /home/<nombre>, C:\\Users\\<nombre>), discos montados (/Volumes/<nombre>),
   claves y tokens (sk-…, ghp_…, github_pat_…, AKIA…, llaves privadas), una
   CONTEXT7_API_KEY con valor, IPs, correos, nombres de equipo internos y
   perfiles de AWS con valor.
2. Términos privados: nombres de clientes, teléfonos… Esos NO se escriben en el
   repo (sería publicarlos). Viven en un archivo aparte, fuera del repo:
     - el que diga la variable ENTORNO_TERMINOS_PRIVADOS, o
     - ../claude-code-entorno-privado/terminos-privados.txt (junto al repo).
   Un término por línea; «#» para comentarios; sin distinguir mayúsculas. Una
   línea entre barras (/\\bacme\\b/) se usa como expresión regular.
   Además se agregan solos tu usuario, tu carpeta personal y el nombre del equipo.
"""
import argparse
import getpass
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

PATRONES = [
    ("ruta de usuario de macOS", re.compile(r"/Users/[A-Za-z0-9._-]+")),
    ("ruta de usuario de Linux", re.compile(r"/home/[a-z_][a-z0-9._-]*")),
    ("ruta de usuario de Windows", re.compile(r"[A-Za-z]:(\\\\|\\|/)Users(\\\\|\\|/)[A-Za-z0-9._-]+",
                                              re.I)),
    ("disco montado de macOS", re.compile(r"/Volumes/[A-Za-z0-9]")),
    ("clave tipo sk-", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}")),
    ("token de GitHub", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}")),
    ("token de GitHub", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("clave de Context7", re.compile(r"\bctx7sk[-_][A-Za-z0-9]")),
    ("clave de AWS", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("token de Slack", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}")),
    ("llave privada", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("IP", re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")),
    ("correo", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("nombre de equipo interno",
     re.compile(r"(?<![.\w-])[a-z0-9-]+\.(local|lan|internal|corp|intranet|home\.arpa)\b(?![.\w])",
                re.I)),
    ("teléfono", re.compile(r"(?<![\w.])\+?\d{2,3}[ .-]\d{3,4}[ .-]\d{4}(?![\w.])")),
]
# Variables que nunca deben llevar un valor escrito en el repo
# (no cuenta si es una referencia: ${VAR}, $VAR o $env:VAR)
VARIABLES = re.compile(r"(?<![${:])\b(CONTEXT7_API_KEY|AWS_PROFILE|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY"
                       r"|ANTHROPIC_API_KEY|GITHUB_TOKEN)['\"]?\s*[=:]\s*['\"]?([^\s'\"]*)")
IPS_PERMITIDAS = {"127.0.0.1", "0.0.0.0", "255.255.255.255"}
CORREOS_PERMITIDOS = re.compile(r"(noreply@anthropic\.com|@ejemplo\.(com|org|invalid)"
                                r"|@example\.(com|org)|^git@github\.com$)", re.I)
TAMANO_MAXIMO = 2 * 1024 * 1024


MARCADOR_EJEMPLO = "privacidad-ok"  # en una línea: un ejemplo falso, no un dato real


def valor_es_marcador(valor):
    """${VAR}, $env:VAR, %VAR%, <tu-clave>, vacío: no son valores reales."""
    return (not valor or valor.startswith(("$", "%", "<", "{", "(", "`")) or valor in ("...", "…"))


def terminos_privados(archivo):
    terminos = []
    if archivo and Path(archivo).is_file():
        for linea in Path(archivo).read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#"):
                continue
            if len(linea) > 2 and linea.startswith("/") and linea.endswith("/"):
                terminos.append((linea, re.compile(linea[1:-1], re.I)))
            else:
                terminos.append((linea, re.compile(re.escape(linea), re.I)))
    automaticos = set()
    try:
        automaticos.add(getpass.getuser())
    except Exception:
        pass
    automaticos.add(str(Path.home()))
    try:
        automaticos.add(socket.gethostname().split(".")[0])
    except Exception:
        pass
    for t in automaticos:
        if t and len(t) >= 4 and t.lower() not in ("root", "user", "runner", "admin", "localhost"):
            terminos.append(("(automático) " + t, re.compile(re.escape(t), re.I)))
    return terminos


def enmascarar(texto):
    texto = texto.strip()
    if len(texto) <= 6:
        return texto[:2] + "…"
    return texto[:4] + "…" + texto[-2:]


def revisar_texto(texto, origen, terminos):
    hallazgos = []
    for n, linea in enumerate(texto.splitlines(), 1):
        # Un ejemplo falso a propósito (p. ej. un token de prueba) se marca en su línea.
        # Solo omite los patrones genéricos; los términos privados se revisan siempre.
        ejemplo = MARCADOR_EJEMPLO in linea
        for tipo, patron in ([] if ejemplo else PATRONES):
            for m in patron.finditer(linea):
                valor = m.group(0)
                if tipo == "IP" and (valor in IPS_PERMITIDAS or
                                     any(int(x) > 255 for x in valor.split("."))):
                    continue
                if tipo == "correo" and CORREOS_PERMITIDOS.search(valor):
                    continue
                hallazgos.append((origen, n, tipo, enmascarar(valor)))
        for m in ([] if ejemplo else VARIABLES.finditer(linea)):
            if not valor_es_marcador(m.group(2)):
                hallazgos.append((origen, n, "%s con valor" % m.group(1), enmascarar(m.group(2))))
        for nombre, patron in terminos:
            if patron.search(linea):
                hallazgos.append((origen, n, "término privado", nombre if nombre.startswith("/")
                                  else enmascarar(nombre)))
    return hallazgos


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo)] + list(args), stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL)
    return r.returncode, r.stdout


def archivos_del_repo(repo):
    codigo, salida = git(repo, "ls-files", "-co", "--exclude-standard", "-z")
    if codigo == 0:
        return [p for p in salida.decode("utf-8").split("\0") if p]
    return [str(p.relative_to(repo)) for p in repo.rglob("*")
            if p.is_file() and ".git" not in p.parts]


def es_binario(datos):
    return b"\0" in datos[:8192]


def revisar_identidades(repo):
    """Autor y committer de todos los commits deben ser la identidad local acordada."""
    nombre = git(repo, "config", "--local", "user.name")[1].decode("utf-8", "replace").strip()
    correo = git(repo, "config", "--local", "user.email")[1].decode("utf-8", "replace").strip()
    if not nombre or not correo:
        return [("configuración de git", 0, "faltan user.name / user.email locales "
                 "(la identidad acordada para los commits)", "")]
    codigo, salida = git(repo, "log", "--all", "--format=%h%x00%an%x00%ae%x00%cn%x00%ce")
    hallazgos = []
    if codigo != 0:
        return hallazgos  # todavía no hay commits
    for linea in salida.decode("utf-8", "replace").splitlines():
        partes = linea.split("\0")
        if len(partes) != 5:
            continue
        h, an, ae, cn, ce = partes
        if (an, ae) != (nombre, correo):
            hallazgos.append(("commit " + h, 0, "autor distinto del acordado", enmascarar(ae)))
        if (cn, ce) != (nombre, correo):
            hallazgos.append(("commit " + h, 0, "committer distinto del acordado", enmascarar(ce)))
    return hallazgos


def revisar(repo, terminos, historial=False):
    hallazgos = []
    for relativo in archivos_del_repo(repo):
        hallazgos += [(o, n, "nombre de archivo: " + t, v)
                      for o, n, t, v in revisar_texto(relativo, relativo, terminos)]
        ruta = repo / relativo
        if not ruta.is_file() or ruta.stat().st_size > TAMANO_MAXIMO:
            continue
        datos = ruta.read_bytes()
        if es_binario(datos):
            continue
        hallazgos += revisar_texto(datos.decode("utf-8", "replace"), relativo, terminos)
    if historial:
        hallazgos += revisar_identidades(repo)
        codigo, salida = git(repo, "log", "--all", "--format=%B%x00")
        if codigo == 0:
            for i, mensaje in enumerate(salida.decode("utf-8", "replace").split("\0")):
                hallazgos += revisar_texto(mensaje, "mensaje de commit #%d" % (i + 1), terminos)
        codigo, salida = git(repo, "rev-list", "--all", "--objects")
        if codigo == 0:
            vistos = set()
            for linea in salida.decode("utf-8", "replace").splitlines():
                partes = linea.split(" ", 1)
                if len(partes) < 2 or partes[0] in vistos:
                    continue
                vistos.add(partes[0])
                hallazgos += [("historial:" + partes[1], n, "nombre de archivo: " + t, v)
                              for _, n, t, v in revisar_texto(partes[1], "", terminos)]
                c, tipo = git(repo, "cat-file", "-t", partes[0])
                if tipo.strip() != b"blob":
                    continue
                c, datos = git(repo, "cat-file", "-p", partes[0])
                if c == 0 and not es_binario(datos) and len(datos) <= TAMANO_MAXIMO:
                    hallazgos += revisar_texto(datos.decode("utf-8", "replace"),
                                               "historial:%s" % partes[1], terminos)
    return hallazgos


def archivo_terminos_por_omision(repo):
    return os.environ.get("ENTORNO_TERMINOS_PRIVADOS") or str(
        repo.parent / "claude-code-entorno-privado" / "terminos-privados.txt")


def main(argv=None):
    p = argparse.ArgumentParser(description="Busca datos privados en el repo.")
    p.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent))
    p.add_argument("--terminos", default=None, help="archivo de términos privados")
    p.add_argument("--historial", action="store_true",
                   help="revisar también commits anteriores y sus mensajes")
    a = p.parse_args(argv)
    repo = Path(a.repo).resolve()
    archivo = a.terminos or archivo_terminos_por_omision(repo)
    if Path(archivo).is_file():
        try:
            Path(archivo).resolve().relative_to(repo)
            print("ERROR: el archivo de términos privados está dentro del repo; sácalo.")
            return 1
        except ValueError:
            pass
        print("Términos privados: archivo externo encontrado.")
    else:
        print("AVISO: no encontré el archivo de términos privados (ver README); solo reviso "
              "patrones genéricos, tu usuario y el nombre del equipo.")
    terminos = terminos_privados(archivo)
    hallazgos = revisar(repo, terminos, a.historial)
    if hallazgos:
        print("Se encontraron %d posibles datos privados:" % len(hallazgos))
        for origen, n, tipo, valor in hallazgos:
            print("  %s:%d  %s  [%s]" % (origen, n, tipo, valor))
        return 1
    print("Revisión de privacidad: limpio (%d términos privados, %d patrones genéricos)."
          % (len(terminos), len(PATRONES) + 1))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    sys.exit(main())

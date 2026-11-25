#!/usr/bin/env python3
"""SessionStart: el hilo literal de la conversación no se pierde.

Cuando una sesión se compacta, Claude sigue con un resumen escrito por un modelo, y
ese resumen puede cambiar lo que el usuario dijo. Este hook no resume nada: lee la
transcripción de la sesión y devuelve los mensajes del usuario tal como los escribió.

Como hook (sin argumentos, el evento llega por stdin):
- Tras compactar o reanudar (`compact`, `resume`): mete en el contexto los mensajes
  literales del usuario de esta sesión y los archivos editados.
- Al abrir o limpiar (`startup`, `clear`): apunta a la sesión anterior del proyecto,
  con su último mensaje literal y los comandos para leerla o buscar en ella.

Como comando:
  python3 hilo.py buscar "<término>" [--todos] [--max N]   citas de sesiones pasadas
  python3 hilo.py ver <id de sesión | ultima>              una sesión entera, literal

No guarda nada: lee las transcripciones que Claude Code ya conserva en
`~/.claude/projects/`. Cualquier fallo propio como hook sale con código 0 y sin texto.
"""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

LIMITE_CONTEXTO = 9000      # sobre 10.000 caracteres Claude Code lo manda a un archivo
MAX_MENSAJE = 700           # un mensaje más largo se recorta en el contexto (no en `ver`)
MAX_ARCHIVOS = 30
MARGEN_CITA = 180
HERRAMIENTAS_DE_EDICION = ("Edit", "Write", "NotebookEdit", "MultiEdit")

COMANDO = re.compile(r"<command-name>\s*(/[^<\s]+)\s*</command-name>", re.S)
ARGUMENTOS = re.compile(r"<command-args>(.*?)</command-args>", re.S)
# Texto que llega con rol de usuario pero no lo escribió el usuario.
NO_ES_DEL_USUARIO = ("<local-command", "<task-notification", "<system-reminder",
                     "[Request interrupted", "[SYSTEM NOTIFICATION")
SIN_TILDES = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")

AVISO_HILO = (
    "Hilo literal de esta sesión (hook hilo.py). Son los mensajes del usuario tal como "
    "los escribió, sacados de la transcripción: no es un resumen. Si el resumen de la "
    "compactación los contradice, valen las citas."
)


# --------------------------------------------------------------- transcripciones

def plano(texto):
    """Minúsculas y sin tildes, con la misma longitud que el original."""
    return texto.translate(SIN_TILDES).lower()


def carpeta_proyecto(home, cwd):
    """Carpeta donde Claude Code guarda las transcripciones de ese directorio."""
    return Path(home) / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(cwd or ""))


def _hora(marca):
    """Marca ISO de la transcripción como fecha y hora locales; None si no se entiende."""
    try:
        return datetime.fromisoformat(str(marca).replace("Z", "+00:00")).astimezone()
    except (TypeError, ValueError):
        return None


def _texto_de(contenido):
    """Texto de un `message.content`; None si es el resultado de una herramienta."""
    if isinstance(contenido, str):
        return contenido
    if not isinstance(contenido, list):
        return None
    partes = []
    for bloque in contenido:
        if not isinstance(bloque, dict):
            continue
        if bloque.get("type") == "tool_result":
            return None
        if bloque.get("type") == "text" and isinstance(bloque.get("text"), str):
            partes.append(bloque["text"])
    return "\n".join(partes)


def _mensaje_del_usuario(d):
    """El texto si la línea es un mensaje que escribió el usuario; si no, None."""
    if d.get("isMeta") or d.get("isCompactSummary") or d.get("toolUseResult") is not None:
        return None
    origen = d.get("origin")
    if isinstance(origen, dict) and origen.get("kind") != "human":
        return None
    mensaje = d.get("message")
    texto = _texto_de(mensaje.get("content")) if isinstance(mensaje, dict) else None
    texto = (texto or "").strip()
    if not texto:
        return None
    comando = COMANDO.search(texto) if texto.startswith("<command-") else None
    if comando:
        args = ARGUMENTOS.search(texto)
        args = args.group(1).strip() if args else ""
        return "%s %s" % (comando.group(1), args) if args else None
    if texto.startswith(NO_ES_DEL_USUARIO):
        return None
    return texto


def _lineas(archivo, solo_usuario=False):
    """Las líneas de la transcripción que son de usuario o de Claude, ya como dict."""
    try:
        with open(archivo, encoding="utf-8", errors="replace") as f:
            for linea in f:
                if '"user"' not in linea and (solo_usuario or '"assistant"' not in linea):
                    continue
                try:
                    d = json.loads(linea)
                except ValueError:
                    continue
                if isinstance(d, dict) and d.get("type") in ("user", "assistant"):
                    yield d
    except OSError:
        return


def extraer(archivo, solo_usuario=False):
    """Lo literal de una sesión: mensajes del usuario, archivos editados y último resumen."""
    mensajes, archivos, resumen = [], [], None
    for d in _lineas(archivo, solo_usuario):
        mensaje = d.get("message") if isinstance(d.get("message"), dict) else {}
        if d["type"] == "user":
            if d.get("isCompactSummary"):
                resumen = (_texto_de(mensaje.get("content")) or "").strip() or resumen
                continue
            texto = _mensaje_del_usuario(d)
            if texto:
                mensajes.append({"texto": texto, "hora": _hora(d.get("timestamp"))})
            continue
        contenido = mensaje.get("content")
        for bloque in contenido if isinstance(contenido, list) else []:
            if (isinstance(bloque, dict) and bloque.get("type") == "tool_use"
                    and bloque.get("name") in HERRAMIENTAS_DE_EDICION):
                entrada = bloque.get("input") if isinstance(bloque.get("input"), dict) else {}
                ruta = entrada.get("file_path") or entrada.get("notebook_path")
                if isinstance(ruta, str) and ruta:
                    if ruta in archivos:
                        archivos.remove(ruta)
                    archivos.append(ruta)      # el editado más reciente queda al final
    return {"mensajes": mensajes, "archivos": archivos, "resumen": resumen}


def sesiones_de(carpeta):
    """Transcripciones de una carpeta de proyecto, la más reciente primero. Sin subagentes."""
    try:
        archivos = [p for p in Path(carpeta).glob("*.jsonl") if p.is_file()]
    except OSError:
        return []
    return sorted(archivos, key=lambda p: p.stat().st_mtime, reverse=True)


# ------------------------------------------------------------------- el contexto

def _renglon(mensaje, maximo=None):
    texto = mensaje["texto"]
    if maximo and len(texto) > maximo:
        texto = texto[:maximo].rstrip() + " …[recortado]"
    hora = mensaje["hora"].strftime("%m-%d %H:%M") if mensaje["hora"] else "sin hora"
    return "[%s] %s" % (hora, texto)


def texto_hilo(datos, sesion):
    """El hilo de la sesión para el contexto: el primer mensaje y los últimos que quepan."""
    mensajes = datos["mensajes"]
    if not mensajes:
        return None
    pie = ""
    if datos["archivos"]:
        pie = "\n\nArchivos editados en la sesión:\n" + "\n".join(
            "- " + ruta for ruta in datos["archivos"][-MAX_ARCHIVOS:])
    nota = ("(%d mensajes intermedios omitidos; todos con "
            "`python3 ~/.claude/hooks/hilo.py ver %s`)")
    renglones = [_renglon(m, MAX_MENSAJE) for m in mensajes]
    libre = (LIMITE_CONTEXTO - len(AVISO_HILO) - len(pie) - len(renglones[0])
             - len(nota) - len(str(sesion)) - 20)
    ultimos = []
    for renglon in reversed(renglones[1:]):
        if len(renglon) + 1 > libre:
            break
        libre -= len(renglon) + 1
        ultimos.insert(0, renglon)
    omitidos = len(renglones) - 1 - len(ultimos)
    cuerpo = [renglones[0]]
    if omitidos:
        cuerpo.append(nota % (omitidos, sesion))
    return AVISO_HILO + "\n\n" + "\n".join(cuerpo + ultimos) + pie


def texto_sesion_anterior(carpeta, sesion_actual):
    """Apunta a la sesión anterior del proyecto, con su último mensaje literal."""
    for archivo in sesiones_de(carpeta)[:4]:
        if archivo.stem == sesion_actual:
            continue
        mensajes = extraer(archivo, solo_usuario=True)["mensajes"]
        if not mensajes:
            continue
        ultimo = mensajes[-1]["texto"]
        if len(ultimo) > 300:
            ultimo = ultimo[:300].rstrip() + "…"
        fecha = datetime.fromtimestamp(archivo.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
        return (
            "Sesión anterior de este proyecto (hook hilo.py): %s, del %s, con %d mensajes "
            "del usuario. Su último mensaje, literal: «%s». La sesión entera, literal, sale "
            "con `python3 ~/.claude/hooks/hilo.py ver %s`. Lo dicho en sesiones pasadas se "
            "busca con `python3 ~/.claude/hooks/hilo.py buscar \"<término>\"`."
            % (archivo.stem, fecha, len(mensajes), ultimo, archivo.stem)
        )
    return None


def main(evento, home):
    """Devuelve el JSON que el hook debe imprimir, o None si no hay nada que decir."""
    if not isinstance(evento, dict) or evento.get("hook_event_name") != "SessionStart":
        return None
    ruta = evento.get("transcript_path")
    sesion = str(evento.get("session_id") or "")
    if evento.get("source") in ("compact", "resume"):
        texto = texto_hilo(extraer(ruta), sesion) if ruta else None
    else:
        carpeta = Path(ruta).parent if ruta else carpeta_proyecto(home, evento.get("cwd"))
        texto = texto_sesion_anterior(carpeta, sesion)
    if not texto:
        return None
    return {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": texto}}


# -------------------------------------------------------------------- el comando

def _cita(texto, termino_plano):
    """Fragmento del texto alrededor de la primera aparición del término; None si no está."""
    pos = plano(texto).find(termino_plano)
    if pos < 0:
        return None
    ini = max(0, pos - MARGEN_CITA)
    fin = min(len(texto), pos + len(termino_plano) + MARGEN_CITA)
    cita = " ".join(texto[ini:fin].split())
    return ("…" if ini else "") + cita + ("…" if fin < len(texto) else "")


def buscar(termino, home, cwd=None, todos=False, maximo=20):
    """Citas de sesiones pasadas que contienen el término, la sesión más reciente primero."""
    buscado = plano(termino.strip())
    if not buscado:
        return []
    raiz = Path(home) / ".claude" / "projects"
    if todos:
        try:
            carpetas = [p for p in raiz.iterdir() if p.is_dir()]
        except OSError:
            carpetas = []
    else:
        carpetas = [carpeta_proyecto(home, cwd)]
    archivos = sorted((a for c in carpetas for a in sesiones_de(c)),
                      key=lambda p: p.stat().st_mtime, reverse=True)
    resultados = []
    for archivo in archivos:
        try:
            with open(archivo, encoding="utf-8", errors="replace") as f:
                candidatas = [l for l in f if buscado in plano(l)]
        except OSError:
            continue
        for linea in candidatas:
            try:
                d = json.loads(linea)
            except ValueError:
                continue
            if not isinstance(d, dict):
                continue
            if d.get("type") == "user":
                quien, texto = "usuario", _mensaje_del_usuario(d)
            elif d.get("type") == "assistant":
                mensaje = d.get("message") if isinstance(d.get("message"), dict) else {}
                quien, texto = "Claude", _texto_de(mensaje.get("content"))
            else:
                continue
            cita = _cita(texto, buscado) if texto else None
            if not cita:
                continue
            hora = _hora(d.get("timestamp"))
            resultados.append({
                "quien": quien, "sesion": archivo.stem, "proyecto": archivo.parent.name,
                "fecha": hora.strftime("%Y-%m-%d") if hora else "sin fecha",
                "hora": hora.strftime("%H:%M") if hora else "", "cita": cita})
            if len(resultados) >= maximo:
                return resultados
    return resultados


def _archivo_de(sesion, home, cwd):
    if sesion == "ultima":
        archivos = sesiones_de(carpeta_proyecto(home, cwd))
        return archivos[0] if archivos else None
    raiz = Path(home) / ".claude" / "projects"
    try:
        encontrados = sorted(raiz.glob("*/%s*.jsonl" % sesion),
                             key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        encontrados = []
    return encontrados[0] if encontrados else None


def cli(args, home, cwd):
    """`buscar` y `ver`. Devuelve el código de salida."""
    if len(args) >= 2 and args[0] == "buscar":
        maximo = 20
        if "--max" in args and args.index("--max") + 1 < len(args):
            try:
                maximo = int(args[args.index("--max") + 1])
            except ValueError:
                pass
        resultados = buscar(args[1], home, cwd, todos="--todos" in args, maximo=maximo)
        if not resultados:
            print("Sin resultados para «%s»%s. No hay registro de eso en las transcripciones."
                  % (args[1], "" if "--todos" in args else " en este proyecto (prueba --todos)"))
            return 1
        for r in resultados:
            print("%s %s · %s · sesión %s · %s\n  «%s»\n" % (
                r["fecha"], r["hora"], r["quien"], r["sesion"], r["proyecto"], r["cita"]))
        return 0
    if len(args) >= 2 and args[0] == "ver":
        archivo = _archivo_de(args[1], home, cwd)
        if archivo is None:
            print("No encontré la sesión «%s»." % args[1])
            return 1
        datos = extraer(archivo)
        print("Sesión %s (%s). Mensajes del usuario, literales:\n" % (
            archivo.stem, archivo.parent.name))
        for mensaje in datos["mensajes"]:
            print(_renglon(mensaje) + "\n")
        if datos["archivos"]:
            print("Archivos editados:\n" + "\n".join("- " + r for r in datos["archivos"]) + "\n")
        if datos["resumen"]:
            print("Resumen de la última compactación (escrito por el modelo, no literal):\n"
                  + datos["resumen"])
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(cli(sys.argv[1:], Path.home(), os.getcwd()))
    try:
        salida = main(json.loads(sys.stdin.read()), Path.home())
        if salida:
            print(json.dumps(salida, ensure_ascii=False))
    except Exception:
        pass
    sys.exit(0)

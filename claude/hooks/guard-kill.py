#!/usr/bin/env python3
"""PreToolUse(Bash|PowerShell): bloquea los comandos que matan procesos en masa.

Motivo: una sesión ejecutó `pkill -f 'cat'` y, como «cat» aparece en muchas rutas
(/Applications, Notification, Communication...), cerró de golpe pestañas de la
terminal, Claude Desktop y varias apps.

Qué hace:
- macOS y Linux: para cada pkill / killall / `pgrep | xargs kill` /
  `ps | grep | xargs kill`, pregunta a pgrep qué procesos atraparía AHORA. Si alguno
  es una app o proceso del sistema, un shell de terminal, una sesión de Claude (o
  algo que cuelga de otra sesión), o son demasiados, lo deniega.
- Windows: deniega `taskkill /IM <nombre>` (y /FI que no sea por PID),
  `tskill <nombre>`, `Stop-Process -Name …`, `Get-Process <nombre> | Stop-Process`,
  `(Get-Process <nombre>).Kill()` y `wmic process … delete`.
- Matar por PID concreto siempre pasa: `kill <PID>`, `taskkill /PID <PID>`,
  `Stop-Process -Id <PID>`. Excepción: `kill -9 -1`, `kill -- -1` y `kill 0`
  (el PID -1 son todos tus procesos; el 0, todo el grupo).

Funciona con `python` o `python3` (3.6 o más nuevo), sin dependencias. Si algo
falla dentro del guardián, deja pasar el comando: un error propio nunca debe
frenar el trabajo normal.
"""
import base64
import getpass
import json
import os
import re
import shlex
import subprocess
import sys

ES_WINDOWS = os.name == "nt"
MAX_MATCHES = 10
MIN_F_PATTERN = 10  # largo mínimo de un patrón -f que no se pudo resolver
SYSTEM_PREFIXES = ("/Applications/", "/System/", "/Library/", "/usr/libexec/",
                   "/usr/sbin/", "/sbin/", "/Volumes/")
SYSTEM_NAMES = {"login", "launchd", "loginwindow", "WindowServer", "Finder",
                "Dock", "SystemUIServer", "iTerm2", "Terminal", "claude",
                "sshd", "tmux", "screen", "systemd", "gnome-shell", "Xorg",
                "Xwayland"}
SYSTEM_NAME_PREFIXES = ("iTermServer",)  # el nombre lleva la versión: iTermServer-3.x
WRAPPERS = {"sudo", "command", "exec", "nohup", "time", "builtin"}
SIGNAL_RE = re.compile(r"^-(\d+|(SIG)?[A-Z][A-Z0-9]+)$")
REDIR_RE = re.compile(r"^(\d*|&)(>>?|<)(&?\d+|&-)?(.*)$")

# Si el comando no contiene ninguna de estas palabras, no hay nada que revisar.
DISPARADORES = ("kill", "stop-process", "spps", "wmic", "terminate", "win32_process",
                "powershell", "pwsh")
SHELLS_POSIX = {"bash", "sh", "zsh", "dash", "ksh"}
SHELLS_PS = {"powershell", "pwsh"}
CONSEJO_PID = ("Mata solo por PID concreto (`kill <PID>`, el que guardaste con $! "
               "o viste con `pgrep -fl`), o usa un patrón más largo y único.")
CONSEJO_PID_WIN = ("Mata solo por PID concreto: `taskkill /PID <PID>` o "
                   "`Stop-Process -Id <PID>` (búscalo antes con `Get-Process` o "
                   "`tasklist`).")


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


# ---------------------------------------------------------------- utilidades

def usuario_actual():
    try:
        return getpass.getuser()
    except Exception:
        return ""


def uid_actual():
    getuid = getattr(os, "getuid", None)  # no existe en Windows
    return str(getuid()) if getuid else ""


def expand(cmd):
    """Sustituye $(id -u), $USER y parecidos para poder consultar a pgrep."""
    user, uid = usuario_actual(), uid_actual()
    pares = []
    if uid:
        pares += [(r"\$\(\s*id\s+-u\s*\)", uid), (r"`\s*id\s+-u\s*`", uid),
                  (r"\$\{?UID\}?", uid)]
    if user:
        pares += [(r"\$\(\s*whoami\s*\)", user), (r"`\s*whoami\s*`", user),
                  (r"\$\{?USER\}?\b", user), (r"\$\{?LOGNAME\}?\b", user)]
    for pat, val in pares:
        cmd = re.sub(pat, lambda _m, v=val: v, cmd)
    return cmd


def separadores(modo):
    # En PowerShell las llaves delimitan bloques: `% { Stop-Process -Name $_ }`.
    # En bash, la comilla invertida abre una sustitución: kill `pgrep node`.
    return ";&|(){}\n" if modo == "ps" else ";&|()`\n"


def tokenize(cmd, modo="bash"):
    sep = separadores(modo)
    lex = shlex.shlex(cmd, posix=True, punctuation_chars=sep)
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    if modo in ("ps", "cmd"):
        lex.escape = ""  # la barra invertida es parte de las rutas de Windows
    try:
        return list(lex)
    except ValueError:  # comillas sin cerrar, heredocs raros...
        return re.findall(r"[%s]+|[^\s%s]+" % (re.escape(sep), re.escape(sep)), cmd)


def pipelines(tokens, modo="bash"):
    """Lista de pipelines; cada pipeline es una lista de segmentos (argv)."""
    sep = set(separadores(modo))
    out, pipe, seg = [], [], []
    for t in tokens:
        if t and set(t) <= sep:
            if seg:
                pipe.append(seg)
            seg = []
            if t != "|":
                if pipe:
                    out.append(pipe)
                pipe = []
        else:
            seg.append(t)
    if seg:
        pipe.append(seg)
    if pipe:
        out.append(pipe)
    return out


def strip_redirections(argv):
    out, skip = [], False
    for a in argv:
        if skip:
            skip = False
            continue
        m = REDIR_RE.match(a)
        if m:
            skip = not m.group(3) and not m.group(4)  # `2> archivo` separado
            continue
        out.append(a)
    return out


def strip_wrappers(argv):
    argv = strip_redirections(argv)
    i = 0
    while i < len(argv):
        a = argv[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", a):
            i += 1
        elif a in WRAPPERS:
            i += 1
        elif a == "env":
            i += 1
            while i < len(argv) and (argv[i].startswith("-") or "=" in argv[i]):
                i += 1
        elif a in ("timeout", "gtimeout"):
            i += 1
            while i < len(argv) and argv[i].startswith("-"):
                i += 1
            i += 1  # la duración
        else:
            break
    return argv[i:]


def nombre(argv0):
    """Nombre del programa sin ruta ni «.exe», en minúsculas."""
    base = argv0.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return base[:-4] if base.endswith(".exe") else base


# ------------------------------------------------- macOS / Linux: pgrep y ps

def proc_table():
    if ES_WINDOWS:
        return {}
    try:
        out = subprocess.run(["ps", "-A", "-ww", "-o", "pid=,ppid=,command="],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             universal_newlines=True, timeout=5).stdout
    except Exception:
        return {}
    table = {}
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            table[int(parts[0])] = (int(parts[1]), parts[2] if len(parts) > 2 else "")
    return table


def argv0(command):
    return command.split(" ", 1)[0]


def is_claude(command):
    return os.path.basename(argv0(command)) == "claude"


def ancestors(pid, table):
    seen = []
    while pid in table and pid not in seen and pid > 1:
        seen.append(pid)
        pid = table[pid][0]
    return seen


def why_protected(pid, table, my_chain, my_claude):
    ppid, command = table.get(pid, (0, ""))
    a0 = argv0(command)
    base = os.path.basename(a0)
    if pid in my_chain:
        return "es parte de esta misma sesión"
    if a0.startswith("-"):
        return "es un shell de una pestaña de terminal"
    if is_claude(command):
        return "es una sesión de Claude"
    if (command.startswith(SYSTEM_PREFIXES) or base in SYSTEM_NAMES
            or base.startswith(SYSTEM_NAME_PREFIXES)):
        return "es una app o proceso del sistema"
    for anc in ancestors(ppid, table):
        if is_claude(table[anc][1]) and anc != my_claude:
            return "cuelga de otra sesión de Claude (PID %d)" % anc
    return None


def pgrep(args):
    if ES_WINDOWS:
        return None
    try:
        r = subprocess.run(["pgrep"] + args, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, universal_newlines=True,
                           timeout=5)
    except Exception:
        return None
    if r.returncode not in (0, 1):
        return None
    return [int(p) for p in r.stdout.split() if p.isdigit()]


def evaluate(label, pgrep_args, pattern, uses_f):
    """Deniega si lo que atraparía el comando incluye algo protegido."""
    if pattern is not None and pattern.strip() in ("", ".", ".*", "^", "$"):
        deny("Bloqueado `%s`: el patrón «%s» atrapa todos tus procesos. "
             "Mata solo por PID concreto (`kill <PID>`)." % (label, pattern))
    if any("$" in a or "`" in a for a in pgrep_args):
        if uses_f and pattern is not None and len(pattern) < MIN_F_PATTERN:
            deny("Bloqueado `%s`: con -f, un patrón corto como «%s» coincide con "
                 "rutas de apps y del sistema. Usa `pgrep -fl` para ver el PID y "
                 "luego `kill <PID>`." % (label, pattern))
        return
    pids = pgrep(pgrep_args)
    if pids is None:
        if uses_f and pattern is not None and len(pattern) < MIN_F_PATTERN:
            deny("Bloqueado `%s`: patrón -f demasiado corto («%s»)." % (label, pattern))
        return
    table = proc_table()
    me = os.getpid()
    my_chain = ancestors(me, table)
    my_claude = next((p for p in my_chain if is_claude(table[p][1])), None)
    pids = [p for p in pids if p != me and p in table]
    hits = []
    for p in pids:
        why = why_protected(p, table, my_chain, my_claude)
        if why:
            hits.append("  %d  %s  ← %s" % (p, table[p][1][:90], why))
    if hits or len(pids) > MAX_MATCHES:
        lines = hits[:8] or ["  %d  %s" % (p, table[p][1][:90]) for p in pids[:8]]
        more = "\n  … y %d más" % (len(pids) - len(lines)) if len(pids) > len(lines) else ""
        deny("Bloqueado `%s`: atraparía %d procesos, incluidos algunos que no son "
             "de esta tarea:\n%s%s\n%s" % (label, len(pids), "\n".join(lines), more,
                                           CONSEJO_PID))


def pattern_of(args):
    """Último argumento que no es opción ni valor de opción (pgrep/pkill)."""
    takes_value = set("FGgPtUu")
    pat, skip = None, False
    for a in args:
        if skip:
            skip = False
            continue
        if a.startswith("-") and len(a) > 1:
            if a[-1] in takes_value and not SIGNAL_RE.match(a):
                skip = True
            continue
        pat = a
    return pat


def check_pkill(argv, label=None):
    args = [a for a in argv[1:] if not SIGNAL_RE.match(a) and a != "-I"]
    flags = "".join(a[1:] for a in args if a.startswith("-") and not a.startswith("--"))
    evaluate(label or " ".join(argv), args, pattern_of(args), "f" in flags)


def check_killall(argv):
    args = argv[1:]
    if any(a in ("-s", "-d") for a in args):  # simulación, no mata
        return
    names, user, regex, i = [], None, False, 0
    while i < len(args):
        a = args[i]
        if a in ("-u", "-t", "-c"):
            if a == "-u" and i + 1 < len(args):
                user = args[i + 1]
            i += 2
            continue
        if a == "-m":
            regex = True
        elif not a.startswith("-"):
            names.append(a)
        i += 1
    label = " ".join(argv)
    if not names:
        if user:
            deny("Bloqueado `%s`: killall -u sin nombre mata todos los procesos "
                 "del usuario." % label)
        return
    for n in names:
        sel = (["-u", user] if user else [])
        evaluate(label, sel + ([n] if regex else ["-x", n]), n, False)


def check_kill(argv):
    args, i = argv[1:], 0
    if args and args[0] in ("-s", "-n"):
        i = 2
    elif args and args[0].startswith("-") and args[0] not in ("--", "-l"):
        i = 1
    for a in args[i:]:
        if a == "--":
            continue
        if a in ("-1", "0"):
            deny("Bloqueado `%s`: `kill %s` manda la señal a todos tus procesos (o "
                 "a todo el grupo). Usa un PID concreto." % (" ".join(argv), a))


def check_ps_grep(segs, idx):
    """`ps … | grep patrón | … | xargs kill` equivale a `pkill -f patrón`."""
    label = " | ".join(" ".join(x) for x in segs)
    patron, ignora_mayus = None, False
    for g in segs[idx + 1:]:
        if nombre(g[0]) not in ("grep", "egrep", "fgrep", "rg"):
            continue
        opciones = [a for a in g[1:] if a.startswith("-")]
        if any("v" in o.lstrip("-") and not o.startswith("--") for o in opciones):
            continue  # `grep -v grep` solo quita líneas
        ignora_mayus = ignora_mayus or any(o in ("-i", "--ignore-case") for o in opciones)
        resto = [a for a in g[1:] if not a.startswith("-")]
        if resto:
            patron = resto[0]
            break
    if patron is None:
        deny("Bloqueado `%s`: manda a kill la lista de procesos sin filtrar. %s"
             % (label, CONSEJO_PID))
    evaluate(label, (["-i"] if ignora_mayus else []) + ["-f", patron], patron, True)


# ---------------------------------------------------------------- Windows

def _opcion_win(a):
    """Normaliza /IM, //IM (Git Bash) y -IM a «/im»."""
    a = a.lower()
    if a.startswith("//"):
        a = a[1:]
    if a.startswith("-"):
        a = "/" + a[1:]
    return a


def check_taskkill(argv):
    label = " ".join(argv)
    args = argv[1:]
    for i, a in enumerate(args):
        o = _opcion_win(a)
        if o == "/im":
            deny("Bloqueado `%s`: `taskkill /IM` mata por nombre todos los procesos "
                 "que se llamen así, también los de otras sesiones y apps. %s"
                 % (label, CONSEJO_PID_WIN))
        if o == "/fi":
            filtro = args[i + 1] if i + 1 < len(args) else ""
            if not re.match(r"^\s*pid\s+eq\s+\d+\s*$", filtro, re.I):
                deny("Bloqueado `%s`: `taskkill /FI` con un filtro que no es un PID "
                     "concreto puede atrapar muchos procesos. %s" % (label, CONSEJO_PID_WIN))


def check_tskill(argv):
    posicionales = [a for a in argv[1:] if not a.startswith(("/", "-"))]
    if posicionales and not posicionales[0].isdigit():
        deny("Bloqueado `%s`: `tskill <nombre>` mata por nombre. %s"
             % (" ".join(argv), CONSEJO_PID_WIN))


def check_wmic(argv):
    args = [a.lower() for a in argv[1:]]
    texto = " ".join(args)
    if "process" in args and ("delete" in args or "terminate" in texto):
        if not re.search(r"processid\s*=\s*['\"]?\d+", texto):
            deny("Bloqueado `%s`: `wmic process … delete/terminate` sin un ProcessId "
                 "concreto. %s" % (" ".join(argv), CONSEJO_PID_WIN))


def es_stop(n, modo):
    return n in ("stop-process", "spps") or (modo == "ps" and n == "kill")


def es_getproc(n, modo):
    return n in ("get-process", "gps") or (modo == "ps" and n == "ps")


def parametros_ps(args):
    """Separa `-Nombre[:valor]` (en minúsculas, sin guion) de los posicionales."""
    params, posicionales, i = [], [], 0
    while i < len(args):
        a = args[i]
        if a.startswith("-") and len(a) > 1 and not a[1:].lstrip("-").isdigit():
            p = a[1:].split(":", 1)[0].lower()
            params.append(p)
            if p in ("id", "name", "inputobject") and ":" not in a:
                i += 1  # se salta el valor
        else:
            posicionales.append(a)
        i += 1
    return params, posicionales


def _es_prefijo(p, completo, minimo=1):
    return len(p) >= minimo and completo.startswith(p)


def pide_id(argv):
    params, _ = parametros_ps(argv[1:])
    return "id" in params


def revisar_powershell(cmd, todos, modo):
    planos = [s for segs in todos for s in segs]
    low = cmd.lower()
    hay_stop = any(es_stop(nombre(s[0]), modo) for s in planos)
    getproc_por_nombre = ("getprocessesbyname" in low or any(
        es_getproc(nombre(s[0]), modo) and not pide_id(s) for s in planos))
    if (hay_stop or re.search(r"\.kill\s*\(", cmd, re.I)) and getproc_por_nombre:
        deny("Bloqueado `%s`: busca procesos por nombre (Get-Process) para matarlos. "
             "%s" % (cmd.strip()[:200], CONSEJO_PID_WIN))
    if re.search(r"win32_process", low) and re.search(
            r"terminate|remove-wmiobject|remove-ciminstance", low):
        if not re.search(r"(processid|handle)\s*(=|-eq)\s*['\"]?\d+", low):
            deny("Bloqueado `%s`: termina procesos de Win32_Process sin un "
                 "ProcessId concreto. %s" % (cmd.strip()[:200], CONSEJO_PID_WIN))
    for segs in todos:
        for idx, s in enumerate(segs):
            if not es_stop(nombre(s[0]), modo):
                continue
            label = " ".join(s)
            params, posicionales = parametros_ps(s[1:])
            if any(_es_prefijo(p, "whatif") for p in params):
                continue  # solo simula
            if any(_es_prefijo(p, "name") for p in params):
                deny("Bloqueado `%s`: `Stop-Process -Name` mata todos los procesos con "
                     "ese nombre, también los de otras sesiones y apps. %s"
                     % (label, CONSEJO_PID_WIN))
            if any(_es_prefijo(p, "inputobject", 2) for p in params):
                deny("Bloqueado `%s`: `Stop-Process -InputObject` no deja ver qué "
                     "procesos mata. %s" % (label, CONSEJO_PID_WIN))
            if "id" in params or posicionales or idx == 0:
                continue
            if not any(es_getproc(nombre(x[0]), modo) and pide_id(x) for x in segs[:idx]):
                deny("Bloqueado `%s`: Stop-Process recibe por tubería procesos que no "
                     "son un PID concreto. %s" % (" | ".join(" ".join(x) for x in segs),
                                                  CONSEJO_PID_WIN))


# ------------------------------------------------ comandos dentro de comandos

def argumento_c(argv):
    """Texto de `bash -c "…"` (también -lc, -ec…)."""
    for i, a in enumerate(argv[1:], 1):
        if re.match(r"^-[A-Za-z]*c[A-Za-z]*$", a) and i + 1 < len(argv):
            return argv[i + 1]
    return None


def comando_powershell(argv):
    """Texto de `powershell -Command …` o de `-EncodedCommand <base64>`."""
    args = argv[1:]
    con_valor = ("executionpolicy", "ex", "ep", "windowstyle", "w", "outputformat",
                 "of", "inputformat", "if", "configurationname", "version", "v",
                 "psconsolefile", "workingdirectory", "wd")
    i = 0
    while i < len(args):
        a = args[i]
        if not a.startswith("-"):
            return " ".join(args[i:])  # powershell.exe toma el resto como comando
        p = a.lstrip("-").lower()
        if p in ("e", "ec") or _es_prefijo(p, "encodedcommand", 3):
            if i + 1 < len(args):
                try:
                    return base64.b64decode(args[i + 1]).decode("utf-16-le", "replace")
                except Exception:
                    return None
            return None
        if _es_prefijo(p, "command"):
            return " ".join(args[i + 1:])
        if p in ("f", "file"):
            return None  # un archivo .ps1: no se puede revisar desde aquí
        i += 2 if p in con_valor else 1
    return None


def comando_cmd(argv):
    """Texto de `cmd /c …` o `cmd /k …`."""
    for i, a in enumerate(argv[1:], 1):
        if _opcion_win(a) in ("/c", "/k"):
            return " ".join(argv[i + 1:])
    return None


# ---------------------------------------------------------------- análisis

def analyze(cmd, modo="bash", depth=0):
    if depth > 3:
        return
    if not any(t in cmd.lower() for t in DISPARADORES):
        return
    todos = []
    for pipe in pipelines(tokenize(expand(cmd), modo), modo):
        segs = [s for s in (strip_wrappers(x) for x in pipe) if s]
        if segs:
            todos.append(segs)
    revisar_powershell(cmd, todos, modo)
    # `kill $(pgrep …)` / `kill `pidof …``: la lista de PIDs llega por sustitución.
    hay_kill = any(nombre(s[0]) == "kill" for segs in todos for s in segs)
    if hay_kill and modo != "ps":
        for segs in todos:
            for s in segs:
                n = nombre(s[0])
                if n == "pgrep" and re.search(r"(\$\(|`)\s*pgrep\b", cmd):
                    check_pkill(s, label=cmd.strip())
                elif n == "pidof" and re.search(r"(\$\(|`)\s*pidof\b", cmd):
                    for prog in [a for a in s[1:] if not a.startswith("-")]:
                        evaluate(cmd.strip(), ["-x", prog], prog, False)
    for segs in todos:
        nombres = [nombre(s[0]) for s in segs]
        feeds_kill = any(n == "kill" or (n == "xargs" and "kill" in s)
                         for n, s in zip(nombres[1:], segs[1:]))
        for idx, (n, s) in enumerate(zip(nombres, segs)):
            ultimo = idx == len(segs) - 1
            if n in SHELLS_POSIX:
                sub = argumento_c(s)
                if sub:
                    analyze(sub, "bash", depth + 1)
            elif n in SHELLS_PS:
                sub = comando_powershell(s)
                if sub:
                    analyze(sub, "ps", depth + 1)
            elif n == "cmd":
                sub = comando_cmd(s)
                if sub:
                    analyze(sub, "cmd", depth + 1)
            elif n == "pkill":
                check_pkill(s)
            elif n == "killall":
                check_killall(s)
            elif n == "kill":
                check_kill(s)
            elif n == "pgrep" and feeds_kill and not ultimo:
                check_pkill(s, label=" | ".join(" ".join(x) for x in segs))
            elif n == "ps" and modo != "ps" and feeds_kill and not ultimo:
                check_ps_grep(segs, idx)
            elif n == "xargs" and "kill" in s:
                check_kill(s[s.index("kill"):])
            elif n == "taskkill":
                check_taskkill(s)
            elif n == "tskill":
                check_tskill(s)
            elif n == "wmic":
                check_wmic(s)


def main():
    try:
        crudo = sys.stdin.buffer.read() if hasattr(sys.stdin, "buffer") else sys.stdin.read()
        if isinstance(crudo, bytes):
            crudo = crudo.decode("utf-8", "replace")
        data = json.loads(crudo)
    except Exception:
        return
    if not isinstance(data, dict):
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    modo = "ps" if data.get("tool_name") == "PowerShell" else "bash"
    try:
        analyze(cmd, modo)
    except SystemExit:
        raise
    except Exception:
        pass  # ante un fallo del guardián, no bloquear el trabajo normal


if __name__ == "__main__":
    main()

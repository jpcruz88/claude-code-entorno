# Universal Control: plan de construcción

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para llevar la cuenta.

**Objetivo:** `universal-control.sh` revisa desde la Mac que manda que las dos Mac
puedan usar Universal Control, corre solo al iniciar sesión y avisa con una
notificación únicamente si algo falla.

**Arquitectura:** un solo script de bash con modos. El modo `--estado` imprime el
estado de la Mac donde corre en líneas `clave=valor`. La Mac que manda lo corre en
sí misma y en la otra, mandándose a sí mismo por SSH con `bash -s -- --estado`.
Después compara los dos estados con `evaluar`. Encima de eso van el modo manual,
el de inicio de sesión (espera y notificación), `--configurar` e
`--instalar`/`--quitar` (tarea de launchd).

**Tecnología:** bash 3.2 (el de macOS), herramientas del sistema (`log`, `defaults`,
`ssh`, `osascript`, `launchctl`, `system_profiler`, `networksetup`, `scutil`,
`shasum`) y pruebas con `unittest` de Python y comandos falsos en el `PATH`.

**Diseño:** `docs/superpowers/specs/2026-10-21-universal-control-design.md`
(léelo antes de empezar: la tabla de señales de los registros y la tabla de fallas
son la referencia).

## Restricciones generales

- Repo público: nada de nombres de equipos, usuarios, IPs, correos, DSID ni rutas
  personales en el código, las pruebas, el README ni los commits. En las pruebas,
  las direcciones `.local` se arman por partes (`"ana@estudio" + LOCAL`), como en
  `pruebas/test_conectar.py`.
- Estilo de `conectar.sh`: `#!/usr/bin/env bash`, `set -uo pipefail`, la ayuda en
  el comentario del principio (y `uso()` la imprime), mensajes y comentarios en
  español. Junto a «», tildes o eñes se escribe `${VAR}`, nunca `$VAR`: lo revisa
  `pruebas/test_scripts_shell.py`.
- El programa nunca cambia ajustes, nunca reinicia y nunca detiene procesos.
- SSH siempre con `-o BatchMode=yes -o ConnectTimeout=5`. En los modos sin
  terminal nada pregunta ni espera una entrada.
- Pruebas: `python3 -m unittest discover -s pruebas`, con `HOME` en una carpeta
  temporal y comandos falsos delante en el `PATH`. Nunca configuración real,
  conexiones reales ni notificaciones reales.
- Dentro del script, `log` se llama por su nombre y no por `/usr/bin/log`: corre en
  bash, donde `log` no es un comando interno, y así se puede sustituir en las
  pruebas. La advertencia sobre zsh es para el README.
- Rutas fijas:
  - configuración: `$HOME/.config/claude-code-entorno/universal-control.conf`;
  - reporte: `$HOME/Library/Logs/claude-code-entorno/universal-control.log`;
  - tarea de inicio de sesión: `$HOME/Library/LaunchAgents/com.claude-code-entorno.universal-control.plist`
    (etiqueta `com.claude-code-entorno.universal-control`).
- Espera al iniciar sesión: `UC_ESPERA` segundos (300 por omisión), revisando cada
  `UC_INTERVALO` segundos (15 por omisión).
- Códigos de salida: 0 listo, 1 no listo, 2 falta configurar o el uso es incorrecto.
- Trabajo en la rama `universal-control`. Cada commit lleva un mensaje en español y
  termina solo con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  No se hace `push` sin que el usuario lo confirme.

## Lo que más puede fallar sin que una prueba lo cubra

Estos casos van como pruebas en la tarea que es dueña del código:

1. **Estado remoto incompleto.** SSH entra, pero el script falla allá y faltan
   claves: no debe romperse, tiene que decir "no listo" con la causa genérica y no
   inventar otra causa (tarea 3).
2. **Mismo grupo en otro orden o con un tercer equipo.** `[A,B]` contra `[B,A]`, o
   `[A,B,C]` en las dos con un iPad dentro, cuentan como listo (tarea 3).
3. **Nombres con espacios y tildes** ("Mac de Ánimo") en el reporte y en la
   notificación: se pasan a `osascript` como argumento, nunca dentro del código
   AppleScript (tarea 4).
4. **Tarea instalada pero sin configuración.** `--al-iniciar` sin `.conf` avisa
   "Falta configurar" una vez y sale con 2, sin esperar (tarea 4).
5. **Un `Excluded` viejo.** Solo cuenta el `Excluded` del último bloque de
   evaluación, es decir, el que va justo antes del último `Selected circle`. Uno de
   bloques anteriores no debe culpar a nadie (tarea 1).

---

### Tarea 1: estado de una Mac (`--estado`)

**Archivos:**
- Crear: `universal-control.sh`
- Crear: `pruebas/test_universal_control.py`

**Interfaces:**
- Produce: `./universal-control.sh --estado` imprime exactamente estas claves, una
  por línea, en este orden, y sale con 0:

  ```
  nombre=<scutil --get ComputerName>
  macos=<sw_vers -productVersion>
  cuenta=<12 primeros hex de sha256 del DSID, o vacío>
  wifi=1|0|?
  bluetooth=1|0|?
  handoff=1|0
  universal_control=1|0
  compartir_internet=1|0
  monitores=<número>
  admin=1|0
  sesion=<último estado de LOGN, p. ej. unlocked>|?
  id=<ID propio de Universal Control>|<vacío>
  grupo=<IDs del último Selected circle separados por coma>|<vacío>
  excluidos=<IDs del Excluded de ese mismo bloque>|<vacío>
  ```

- Produce: una función de bash por clave o un `estado_local` que las imprime. Las
  tareas siguientes solo usan la salida de texto.

**Fuentes de cada clave** (las del script de diagnóstico, adaptadas):
- **`cuenta`:** el primer archivo cuyo nombre sea solo dígitos en
  `$HOME/Library/Application Support/iCloud/Accounts/`. Si no hay, `AccountDSID`
  de `defaults read "$HOME/Library/Preferences/MobileMeAccounts" Accounts`.
  Después, `printf %s "$dsid" | shasum -a 256 | cut -c1-12`. El DSID nunca se
  imprime.
- **`wifi`:** con `networksetup -listallhardwareports` saca la interfaz de
  "Wi-Fi" y luego `networksetup -getairportpower <if>`; vale 1 si termina en "On".
- **`bluetooth`:** `system_profiler SPBluetoothDataType`, línea `State: On|Off`.
- **`handoff`:** 0 si `defaults -currentHost read com.apple.coreservices.useractivityd`
  da `0` en `ActivityAdvertisingAllowed` o en `ActivityReceivingAllowed`. Si no, 1.
- **`universal_control`:** 0 si `defaults read com.apple.universalcontrol` da `1`
  en `Disable`, `DisableMagicEdges` o `DisableAutoConnect`. Que falte la clave
  significa encendido.
- **`compartir_internet`:** 1 si `pgrep -x InternetSharing` lo encuentra, o si
  `defaults read /Library/Preferences/SystemConfiguration/com.apple.nat NAT` tiene
  `Enabled = 1;` en el primer nivel (4 espacios de sangría). Los `Enabled` de los
  subdiccionarios no cuentan.
- **`monitores`:** cuántas líneas `Resolution:` hay en `system_profiler SPDisplaysDataType`.
- **`admin`:** 1 si `id -Gn` incluye `admin`.
- **Registros:** una sola llamada a
  `log show --last 24h --info --style compact --predicate 'subsystem == "com.apple.universalcontrol" && (category IN {"CIRC","LOGN"} || eventMessage CONTAINS "Device Found")'`.
  Se recorren las líneas en orden:
  - `Login Status: 'x' -> 'y'` deja `sesion=y`;
  - `IDS <ID>: ... Device Found` (también `Ineligible Device Found`) agrega `<ID>`
    a los encontrados;
  - `Excluded the following unavailable devices: [..]` guarda una lista pendiente;
  - `Selected circle: [..]` fija `grupo` y fija `excluidos` con la lista pendiente,
    y luego la vacía.
  - `id` es el primer ID de `grupo` que no está entre los encontrados.

- [ ] **Paso 1: crear la rama y escribir las pruebas que fallan**

  `git switch -c universal-control`. En `pruebas/test_universal_control.py`, una
  clase con el mismo armado que `ConectarSh`: `setUp` con `HOME` y `bin`
  temporales, `FALSOS` y `correr(*args, entrada=None)`. Los falsos de esta tarea,
  en el estado "todo bien":
  - `scutil`: "Mac mini de prueba";
  - `sw_vers`: 27.0.1;
  - `networksetup`: Wi-Fi en en1, "On";
  - `system_profiler`: `State: On` y una `Resolution:`;
  - `defaults`: useractivityd da 1, universalcontrol sale con 1 (no existe), `nat`
    imprime `{\n    Enabled = 0;\n}`;
  - `pgrep`: sale con 1;
  - `id`: `staff admin`;
  - `log`: hace `cat "$HOME/log.txt"`.

  Cada caso cambia su falso con marcas en `$HOME`, como `conectar.sh`. La cuenta es
  el archivo `HOME/Library/Application Support/iCloud/Accounts/1234567890`.
  `log.txt` "todo bien": una línea `IDS BBBBBBBB: Device Found SF <BLE ...>, Md Mac16,10`,
  una `Login Status: 'locked' -> 'unlocked'` y una `Selected circle: [AAAAAAAA,BBBBBBBB]`,
  con el prefijo de `--style compact`
  (`2026-10-21 15:09:33.587 I  UniversalControl[1:2] [com.apple.universalcontrol:CIRC] `).

  ```python
  def estado(self, *args):
      codigo, salida = self.correr("--estado", *args)
      self.assertEqual(codigo, 0, salida)
      return dict(l.split("=", 1) for l in salida.splitlines() if "=" in l)

  def test_estado_todo_bien(self):
      e = self.estado()
      self.assertEqual(e["nombre"], "Mac mini de prueba")
      self.assertEqual(e["macos"], "27.0.1")
      self.assertEqual(e["cuenta"], hashlib.sha256(b"1234567890").hexdigest()[:12])
      for k in ("wifi", "bluetooth", "handoff", "universal_control", "admin"):
          self.assertEqual(e[k], "1", k)
      self.assertEqual((e["compartir_internet"], e["monitores"]), ("0", "1"))
      self.assertEqual((e["sesion"], e["id"]), ("unlocked", "AAAAAAAA"))
      self.assertEqual((e["grupo"], e["excluidos"]), ("AAAAAAAA,BBBBBBBB", ""))

  def test_estado_no_imprime_el_dsid(self):          # "1234567890" no sale nunca
  def test_cuenta_desde_mobilemeaccounts(self):      # sin carpeta iCloud; defaults da AccountDSID
  def test_sin_cuenta_queda_vacia(self):             # cuenta == ""
  def test_compartir_internet_por_proceso(self):     # pgrep encuentra InternetSharing -> "1"
  def test_compartir_internet_interruptor_sin_puertos(self):  # NAT con "    Enabled = 1;" y SharingDevices vacío -> "1"
  def test_enabled_de_subdiccionario_no_cuenta(self):  # solo "        Enabled = 1;" (8 espacios) -> "0"
  def test_wifi_bluetooth_handoff_uc_apagados(self):   # cada uno -> "0"
  def test_sin_monitor(self):                         # monitores == "0"
  def test_no_admin(self):                            # id sin admin -> admin == "0"
  def test_excluido_del_ultimo_bloque(self):
      # log: Excluded [AAAAAAAA] + Selected circle [BBBBBBBB] -> excluidos == "AAAAAAAA", id == "BBBBBBBB"
  def test_excluido_viejo_no_cuenta(self):
      # Excluded [AAAAAAAA], Selected [BBBBBBBB], luego Selected [AAAAAAAA,BBBBBBBB] -> excluidos == ""
  def test_sin_registros(self):                       # log.txt vacío -> sesion "?", id/grupo/excluidos ""
  def test_estado_por_bash_s(self):
      # subprocess.run(["bash", "-s", "--", "--estado"], stdin=open(script)) da las mismas claves
  ```

  Cada prueba sin cuerpo arriba cambia una sola cosa del estado "todo bien" y
  comprueba solo la clave que indica el comentario.

- [ ] **Paso 2: correrlas y ver que fallan**

  Corre `python3 -m unittest pruebas.test_universal_control -v`. Deben FALLAR
  porque `universal-control.sh` no existe (código distinto de 0 o archivo no
  encontrado), no por errores de la prueba.

- [ ] **Paso 3: implementar `--estado` en `universal-control.sh`**

  Con la cabecera de ayuda, `uso()`, la lectura de opciones como en `conectar.sh`
  (`--estado`, `--ayuda`; un modo desconocido sale con 2) y lo que se describe en
  "Fuentes de cada clave". Si un comando falta o falla, la clave sale como `?` o
  vacía, nunca aborta. No se usa `BASH_SOURCE` en esta ruta del código.

- [ ] **Paso 4: correr las pruebas: todas en verde**

  Corre `python3 -m unittest discover -s pruebas`. Esperado: `OK`. Si algo de la
  suite completa falla, se reporta por su nombre.

- [ ] **Paso 5: commit**

  `git add universal-control.sh pruebas/test_universal_control.py` y commit con
  "universal-control.sh: estado de Universal Control de una Mac".

### Tarea 2: `--configurar <usuario>@<mac>.local`

**Archivos:**
- Modificar: `universal-control.sh`
- Modificar: `pruebas/test_universal_control.py`

**Interfaces:**
- Produce: el archivo de configuración con dos líneas, `DESTINO=<usuario>@<mac>.local`
  y `NOMBRE=<ComputerName de la otra Mac>`. Se lee línea por línea (`IFS='=' read`),
  **nunca con `source`**. Lo usan las tareas 3, 4 y 5 con
  `leer_conf` → variables `DESTINO` y `NOMBRE`, y `leer_conf` devuelve 1 si falta el
  archivo o `DESTINO`.
- Produce: la constante `SSH_OPCIONES=(-o BatchMode=yes -o ConnectTimeout=5)`.

- [ ] **Paso 1: escribir las pruebas que fallan**

  Agregar un `ssh` falso: anota "$*" en `llamadas-ssh.txt` y sale con 255 si existe
  la marca `.sin-ssh`. Si recibe `scutil`, imprime "Mac del estudio". Si no, hace
  `cat "$HOME/estado-remoto.txt"`.

  ```python
  def test_configurar_guarda_destino_y_nombre(self):
      codigo, salida = self.correr("--configurar", DESTINO)
      self.assertEqual(codigo, 0, salida)
      conf = (self.home / ".config/claude-code-entorno/universal-control.conf").read_text()
      self.assertIn("DESTINO=" + DESTINO, conf)
      self.assertIn("NOMBRE=Mac del estudio", conf)
      self.assertIn("-o BatchMode=yes", self.llamadas("ssh")[0])
      self.assertIn("-o ConnectTimeout=5", self.llamadas("ssh")[0])

  def test_configurar_sin_llave_no_guarda_y_dice_como(self):
      self.marcar(".sin-ssh")
      codigo, salida = self.correr("--configurar", DESTINO)
      self.assertEqual(codigo, 1, salida)
      self.assertFalse((self.home / ".config/claude-code-entorno/universal-control.conf").exists())
      self.assertIn("./conectar.sh " + DESTINO, salida)
      self.assertIn("ssh-copy-id", salida)

  def test_configurar_rechaza_direccion_sin_arroba(self):  # "estudio" + LOCAL -> código 2, no llama ssh
  def test_configurar_otra_vez_reemplaza(self):           # dos veces con destinos distintos -> queda el último
  ```

- [ ] **Paso 2: correrlas y ver que fallan** (`--configurar` es una opción desconocida y sale con 2).
- [ ] **Paso 3: implementar `configurar` y `leer_conf`**. Crea la carpeta con
  `mkdir -p` y escribe el archivo de una vez.
- [ ] **Paso 4: correr la suite completa: `OK`.**
- [ ] **Paso 5: commit** "universal-control.sh: --configurar guarda la otra Mac".

### Tarea 3: revisión a mano (sin opciones) y `evaluar`

**Archivos:**
- Modificar: `universal-control.sh`
- Modificar: `pruebas/test_universal_control.py`

**Interfaces:**
- Consume: `--estado` (tarea 1), `leer_conf` y `SSH_OPCIONES` (tarea 2).
- Produce: `revisar_una_vez`. Escribe el reporte en la salida y deja dos globales:
  `LISTO` (1 o 0) y `CAUSA` (el texto de la falla, vacío si está listo). Devuelve 0
  si está listo y 1 si no. El estado remoto se pide con
  `ssh "${SSH_OPCIONES[@]}" "$DESTINO" 'bash -s -- --estado' < "$SCRIPT"`, donde
  `SCRIPT` es la ruta absoluta del propio script.
- Produce: `./universal-control.sh` sin opciones. Sin configuración imprime
  "Falta configurar: ./universal-control.sh --configurar <usuario>@<mac>.local" y
  sale con 2. Con configuración llama a `revisar_una_vez`, imprime el reporte y
  sale con 0 o 1.

**Reglas de `evaluar`** (local = esta Mac; remoto = la otra, con su `nombre=` o, si
no llegó, el `NOMBRE` de la configuración):
1. Si `ssh` sale con 255 (no pudo conectar): `CAUSA="${NOMBRE} no responde: ¿está prendida y con sesión iniciada?"`.
   Con cualquier otro código, se usa lo que haya llegado: las claves que falten
   cuentan como `?` o vacías.
2. Si `admin=0` en una Mac: `CAUSA="No puedo leer los registros de <Mac>: el usuario <usuario> tiene que ser administrador"`.
   El usuario es `${DESTINO%@*}` para la remota y `$USER` para esta.
3. **Listo** si los `grupo` de las dos, como conjuntos, son iguales, no vacíos y
   de al menos dos IDs. Entonces `LISTO=1` y la última línea del reporte es
   `Universal Control listo.`. Las revisiones de ajustes que salgan mal se
   imprimen como líneas `⚠️`, pero no cambian `LISTO`.
4. Si no está listo, `CAUSA` es la **primera** que se cumpla:
   1. `cuenta` vacía en una Mac: "<Mac> no tiene sesión iniciada en una cuenta de Apple";
   2. cuentas distintas: "Las dos Mac tienen cuentas de Apple distintas";
   3. `macos` distinto: "Versiones distintas: <v> en <local>, <v> en <remota>. Actualiza la que va atrás";
   4. `compartir_internet=1`: "Apaga Compartir Internet en <Mac>";
   5. `wifi|bluetooth|handoff|universal_control=0`: "Enciende <Wi-Fi|Bluetooth|Handoff|Universal Control> en <Mac>";
   6. `monitores=0`: "<Mac> no tiene monitor";
   7. remota con `sesion` distinto de `unlocked`: "Inicia sesión en <remota>";
   8. `excluidos` de la remota contiene el `id` local: "<remota> no ve a <local> por Bluetooth: reinicia <local>".
      Al revés: "<local> no ve a <remota> por Bluetooth: reinicia <remota>";
   9. si no: "Las Mac no se unieron: reinicia las dos".

   La última línea del reporte es `No quedó: ${CAUSA}`.
5. El reporte tiene una línea por revisión y por Mac (✅/❌, con su nombre). Nunca
   muestra `cuenta`: dice "misma cuenta de Apple" o "cuentas distintas".

- [ ] **Paso 1: escribir las pruebas que fallan**

  El `estado-remoto.txt` "todo bien" es el mismo estado de la tarea 1 con
  `nombre=Mac del estudio`, `id=BBBBBBBB`, `grupo=AAAAAAAA,BBBBBBBB` y la misma
  `cuenta`. Un ayudante `remoto(**cambios)` lo reescribe.

  ```python
  def test_sin_configurar(self):            # código 2, "Falta configurar"
  def test_listo(self):                     # código 0, última línea "Universal Control listo."
  def test_listo_en_otro_orden_y_con_ipad(self):
      # local grupo [AAAAAAAA,BBBBBBBB,CCCCCCCC], remoto "CCCCCCCC,BBBBBBBB,AAAAAAAA" -> código 0
  def test_listo_aunque_un_ajuste_salga_mal(self):
      # remoto compartir_internet=1 con grupos unidos -> código 0, "⚠️" y "Compartir Internet" en el reporte
  def test_no_responde(self):               # .sin-ssh -> código 1, "Mac del estudio no responde: ¿está prendida y con sesión iniciada?"
  def test_remota_no_admin(self):           # admin=0 -> "el usuario ana tiene que ser administrador"
  def test_estado_remoto_incompleto(self):  # remoto solo "nombre=Mac del estudio" -> código 1, "Las Mac no se unieron: reinicia las dos"
  def test_no_muestra_la_cuenta(self):      # el hash no aparece en la salida
  ```

  Más una prueba por cada causa del punto 4. En cada una, los grupos están
  separados (remoto `grupo=BBBBBBBB`), se cambia solo lo de esa fila y se comprueba
  el texto exacto de `CAUSA`. En la fila 8 se prueban las dos direcciones.
  También se prueba el orden: con las filas 3 y 4 a la vez, sale la 3.

- [ ] **Paso 2: correrlas y ver que fallan** (sin opciones hoy no hay reporte).
- [ ] **Paso 3: implementar `evaluar`, `revisar_una_vez` y el modo sin opciones.**
  Los estados se guardan en archivos temporales dentro de `TMPDIR`, que se borran
  al salir (`trap`).
- [ ] **Paso 4: correr la suite completa: `OK`.**
- [ ] **Paso 5: commit** "universal-control.sh: revisa las dos Mac y dice qué falla".

### Tarea 4: modo de inicio de sesión (`--al-iniciar`) y notificación

**Archivos:**
- Modificar: `universal-control.sh`
- Modificar: `pruebas/test_universal_control.py`

**Interfaces:**
- Consume: `leer_conf` y `revisar_una_vez` (tareas 2 y 3).
- Produce: `./universal-control.sh --al-iniciar`. Repite `revisar_una_vez` cada
  `UC_INTERVALO` segundos hasta que esté listo o se acabe `UC_ESPERA`. El tiempo se
  revisa antes de cada nuevo intento. Al terminar:
  - escribe el reporte del último intento, con fecha y hora en la primera línea,
    en la ruta del reporte (crea la carpeta);
  - si está listo, no imprime nada, no notifica y sale con 0;
  - si no, notifica **una vez** con `CAUSA` y sale con 1;
  - sin configuración, notifica "Falta configurar Universal Control: corre ./universal-control.sh --configurar"
    y sale con 2, sin esperar.
- Produce: `notificar <texto>`, que corre:
  `osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Universal Control"' -e 'end run' "$texto"`.

- [ ] **Paso 1: escribir las pruebas que fallan**

  Agregar un `osascript` falso que anota cada argumento en una línea de
  `llamadas-osascript.txt`. El `ssh` falso cuenta sus llamadas en `$HOME/intentos`
  y, con la marca `.une-al-segundo`, devuelve grupos separados en el primer intento
  y unidos desde el segundo. Las pruebas corren con `UC_ESPERA=3` y `UC_INTERVALO=1`
  en el entorno.

  ```python
  def test_al_iniciar_listo_no_notifica(self):
      codigo, salida = self.correr("--al-iniciar")
      self.assertEqual((codigo, salida), (0, ""))
      self.assertEqual(self.llamadas("osascript"), [])
      self.assertIn("Universal Control listo.", self.reporte())

  def test_al_iniciar_espera_a_que_se_unan(self):     # .une-al-segundo -> código 0, sin osascript, intentos == 2
  def test_al_iniciar_falla_notifica_una_vez(self):
      # grupos separados todo el tiempo -> código 1, exactamente un osascript cuyo último
      # argumento es "Las Mac no se unieron: reinicia las dos"
  def test_al_iniciar_otra_mac_apagada_notifica(self):  # .sin-ssh -> "no responde" en la notificación
  def test_notificacion_con_tildes_va_como_argumento(self):
      # remoto nombre="Mac de Ánimo", sesion=locked y grupo=BBBBBBBB -> último argumento "Inicia sesión en Mac de Ánimo";
      # el texto no aparece dentro de ningún argumento -e
  def test_al_iniciar_sin_configurar(self):            # código 2, una notificación con "Falta configurar", intentos == 0
  def test_al_iniciar_no_espera_de_mas(self):          # tarda menos de UC_ESPERA + 5 s
  ```

- [ ] **Paso 2: correrlas y ver que fallan.**
- [ ] **Paso 3: implementar `--al-iniciar` y `notificar`.**
- [ ] **Paso 4: correr la suite completa: `OK`.**
- [ ] **Paso 5: commit** "universal-control.sh: revisa al iniciar sesión y avisa solo si falla".

### Tarea 5: `--instalar` y `--quitar` (tarea de launchd)

**Archivos:**
- Modificar: `universal-control.sh`
- Modificar: `pruebas/test_universal_control.py`

**Interfaces:**
- Consume: `leer_conf` (tarea 2).
- Produce: `--instalar`. Sin configuración sale con 2 y el mismo "Falta configurar".
  Si hay configuración, escribe el plist con:
  - `Label` = la etiqueta;
  - `ProgramArguments` = `["/bin/bash", "<ruta absoluta del script>", "--al-iniciar"]`;
  - `RunAtLoad` = verdadero;
  - `EnvironmentVariables.PATH` = `/usr/bin:/bin:/usr/sbin:/sbin`;
  - `StandardErrorPath` = `$HOME/Library/Logs/claude-code-entorno/universal-control.errores.log`.

  Luego corre `launchctl bootout gui/<uid>/<etiqueta>` (sin importar si falla) y
  `launchctl bootstrap gui/<uid> <plist>`. Repetirlo da el mismo resultado.
- Produce: `--quitar`. Corre `launchctl bootout gui/<uid>/<etiqueta>` (sin importar
  si falla) y borra el plist. Sale con 0 aunque no hubiera nada.

- [ ] **Paso 1: escribir las pruebas que fallan**

  Agregar un `launchctl` falso que anota sus argumentos.

  ```python
  def test_instalar_escribe_el_plist_y_lo_carga(self):
      self.configurar()
      codigo, salida = self.correr("--instalar")
      self.assertEqual(codigo, 0, salida)
      p = plistlib.loads(self.plist.read_bytes())
      self.assertEqual(p["Label"], "com.claude-code-entorno.universal-control")
      self.assertEqual(p["ProgramArguments"], ["/bin/bash", str(SCRIPT), "--al-iniciar"])
      self.assertTrue(p["RunAtLoad"])
      self.assertEqual(p["EnvironmentVariables"]["PATH"], "/usr/bin:/bin:/usr/sbin:/sbin")
      self.assertTrue(any(l.startswith("bootstrap gui/") for l in self.llamadas("launchctl")))

  def test_instalar_sin_configurar(self):    # código 2, sin plist, sin launchctl
  def test_instalar_dos_veces(self):         # mismo plist, bootout antes de cada bootstrap
  def test_quitar(self):                     # sin plist y "bootout gui/" en las llamadas
  def test_quitar_sin_nada_instalado(self):  # código 0
  ```

- [ ] **Paso 2: correrlas y ver que fallan.**
- [ ] **Paso 3: implementar `instalar` y `quitar`.** El plist se escribe como XML
  fijo con `printf`, escapando `&`, `<` y `>` en la ruta. Al final se valida con
  `plutil -lint` si existe.
- [ ] **Paso 4: correr la suite completa: `OK`.**
- [ ] **Paso 5: commit** "universal-control.sh: --instalar y --quitar el arranque automático".

### Tarea 6: README y revisión de privacidad

**Archivos:**
- Modificar: `README.md`:
  - sección nueva `## Universal Control`, después de `## Conectar dos Macs`;
  - una línea en `## Estructura`;
  - una mención en `## Pruebas`.
- Agregar al commit: `docs/superpowers/specs/2026-10-21-universal-control-design.md`
  y este plan.

- [ ] **Paso 1: escribir la sección** con los requisitos (los 8 del diseño), el paso
  a paso (activar Universal Control, `./conectar.sh` para la llave,
  `--configurar`, `--instalar`, `--quitar`), qué hace al iniciar sesión, qué hacer
  cuando avisa (la tabla de fallas en palabras sencillas) y lo que se aprendió:
  - Compartir Internet con el interruptor encendido y sin puertos cuenta como encendido;
  - versiones distintas de macOS impiden que se detecten;
  - reiniciar cuando una no ve a la otra por Bluetooth;
  - en zsh se usa `/usr/bin/log`.
- [ ] **Paso 2: revisar la privacidad.** Corre
  `python3 herramientas/revisar_privacidad.py --repo .`. Esperado: "limpio". Si
  `gitleaks` está instalado, corre también `./exportar.sh`, que debe terminar en
  "Todo limpio". Si falta, se dice en el reporte y no se instala.
- [ ] **Paso 3: correr la suite completa: `OK`.**
- [ ] **Paso 4: commit** "README: Universal Control entre dos Mac", con el diseño y
  el plan.

### Tarea 7: prueba en las dos Mac de verdad

Sin código. La hace quien coordina, con el usuario, usando la dirección real que él
dio. Esa dirección no se escribe en el repo.

- [ ] **Paso 1:** `./universal-control.sh --configurar <usuario>@<mac>.local` →
  código 0 y el nombre real de la otra Mac en la configuración.
- [ ] **Paso 2:** `./universal-control.sh` → código 0 y `Universal Control listo.`.
  Se comparan las líneas del reporte con lo visto hoy en los registros.
- [ ] **Paso 3:** con permiso del usuario, `./universal-control.sh --instalar` →
  `launchctl print gui/$(id -u)/com.claude-code-entorno.universal-control` muestra
  la tarea, y el reporte se actualiza sin ninguna notificación.
- [ ] **Paso 4:** prueba de falla, con permiso del usuario: apagar Handoff en la
  otra Mac, correr `UC_ESPERA=30 ./universal-control.sh --al-iniciar`, confirmar
  que llega **una** notificación y volver a encender Handoff.
- [ ] **Paso 5:** pedir al usuario que confirme antes del `push` de la rama, o de
  fusionarla a `main`, según `superpowers:finishing-a-development-branch`.

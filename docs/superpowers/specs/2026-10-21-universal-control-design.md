# Universal Control entre dos Mac: revisión automática al iniciar sesión

Fecha: 21 de octubre de 2026

## Para qué es

El usuario tiene dos Mac mini, cada una con su propio monitor, y usa Universal
Control (viene con macOS) para mover el cursor y el teclado de una a otra. El
teclado y el mouse Bluetooth están siempre conectados a una de las dos: la **Mac
que manda**. La otra es la **Mac que recibe**.

Configurarlo costó una tarde: el cursor no pasaba y nada en los Ajustes del Sistema
decía por qué. La causa salió de los registros del sistema de las dos Mac. Este
programa automatiza esa revisión: cada vez que el usuario prende las Mac, revisa
las dos desde la Mac que manda y solo avisa si algo impide que Universal Control
funcione, diciendo qué hacer.

## Objetivos

- Revisar las dos Mac desde la Mac que manda, entrando a la otra por SSH.
- Correr solo al iniciar sesión en la Mac que manda, sin abrir nada.
- Quedarse en silencio si todo está bien. Si algo falla, mandar una notificación
  de macOS con la causa principal y qué hacer.
- Correrlo a mano en la terminal para ver el reporte completo.
- Vivir en el repo `claude-code-entorno`, con pruebas y una sección en el README.

## Fuera de alcance

- Cambiar ajustes por su cuenta. El programa solo revisa y dice qué hacer.
  Tampoco reinicia nada ni detiene procesos.
- Más de dos Mac, iPad o Windows. Compartir el teclado con una PC con Windows
  (por ejemplo, con Deskflow) es otro proyecto, para después.
- Configurar la llave SSH: eso ya lo hace `conectar.sh`, o un `ssh-copy-id` a mano.

## Lo que haría que fallara aunque funcione

- **Avisos falsos o ruido:** una notificación cuando todo está bien, o un aviso
  que no dice qué hacer.
- **Datos privados en el repo**, que es público: correo o número de la cuenta de
  Apple, nombres de equipos, usuarios, IPs o rutas personales.
- **Que se quede colgado o pida algo al arrancar**, sin terminal.
- **Que cambie la configuración del usuario.**

## Cómo funciona Universal Control (lo que se aprendió)

### Requisitos que hay que revisar en las dos Mac

1. La misma cuenta de Apple.
2. La misma versión de macOS. Con versiones distintas (27.0.1 y 26.6.2), la Mac
   con la versión vieja nunca detectó a la nueva.
3. Wi-Fi y Bluetooth encendidos. Wi-Fi tiene que estar encendido aunque la Mac use
   cable.
4. Handoff encendido.
5. Las opciones de Universal Control encendidas (Ajustes > Pantallas > Avanzado).
6. Compartir Internet **apagado**. Ojo: si el interruptor principal está encendido
   pero sin ningún puerto marcado, sigue contando como encendido. En
   `/Library/Preferences/SystemConfiguration/com.apple.nat.plist`, `NAT.Enabled`
   queda en `1` y el proceso `InternetSharing` sigue corriendo.
7. Un monitor conectado en cada Mac.
8. La Mac que recibe responde por SSH (Sesión remota encendida), y el usuario con
   el que se entra es **administrador**. Sin eso no puede leer los registros:
   `/var/db/diagnostics` es `root:admin` con permisos 750, y con `BatchMode` no hay
   `sudo`. Si no es administrador, el programa lo dice en el reporte y en el aviso.

### Cómo leer la cuenta en macOS 27

`~/Library/Preferences/MobileMeAccounts.plist` ya no existe en macOS 27. La señal
que funciona es un archivo cifrado por cuenta en
`~/Library/Application Support/iCloud/Accounts/`, cuyo nombre es solo dígitos: el
DSID de la cuenta. En macOS anteriores, `AccountDSID` sale de `MobileMeAccounts`.
El programa compara el DSID de las dos Mac y solo dice "igual" o "distinto": nunca
lo imprime, nunca lo guarda y nunca muestra el correo.

El script de diagnóstico que se usó (fuera del repo) ya lee esto. Sus pruebas
estaban en una carpeta temporal y se borraron al reiniciar, así que aquí hay que
escribirlas de nuevo.
Puede servir de punto de partida para estas revisiones, pero su modo `--arreglar`
no se trae: cierra procesos por nombre (`killall`) y cambia ajustes.

### Señales en los registros

Los registros son la única forma de saber si las dos Mac de verdad se reconocen.
Se leen con `/usr/bin/log show` y el predicado `subsystem == "com.apple.universalcontrol"`.
En zsh, `log` es un comando interno: hay que usar siempre la ruta completa. Los
mensajes salen con `--info`.

Cada equipo tiene un ID de 8 caracteres hexadecimales, el mismo en los registros
de las dos Mac. En los ejemplos, `AAAAAAAA` es la Mac que manda y `BBBBBBBB` la
que recibe.

| Categoría | Mensaje | Qué significa |
|---|---|---|
| `LINK` | `IDS BBBBBBBB: Device Found SF <BLE ...>, Md Mac16,10, SV 700, AL Screen(7)` | Encontró la otra Mac por Bluetooth y sabe que está activa (`AL` es el nivel de actividad). |
| `LINK` | `IDS AAAAAAAA: Device Found SF <iWiFi ...>, ... AL Unknown(0)` | La encontró solo por la red Wi-Fi. No basta: sin el aviso por Bluetooth no sabe si está activa. |
| `DISC` | `IDS BBBBBBBB: Device Available` | La marcó como disponible para Universal Control. |
| `CIRC` | `Excluded the following unavailable devices: [AAAAAAAA]` | La deja fuera por no disponible. Esta fue la falla de hoy. |
| `CIRC` | `Selected circle: [AAAAAAAA,BBBBBBBB]` | Las dos están en el mismo grupo: **listas**, el cursor puede cruzar. Si sale solo un ID, están separadas. |
| `CIRC` | `Device views: [AAAAAAAA: <SYNC:[...],CONN:[AAAAAAAA,BBBBBBBB],SRC:'AAAAAAAA'>, ...]` | `CONN` con los dos IDs y `SRC` con la que manda solo aparecen después de que el cursor cruzó. Al arrancar no se espera verlos. |
| `LOGN` | `Login Status: 'locked' -> 'unlocked'` | La sesión de esa Mac está abierta. Con la pantalla bloqueada no se une al grupo. |

"Listo" significa que el último `Selected circle` de **las dos** Mac contiene
los dos IDs. **Los registros deciden si hay aviso:** si las dos están listas, el
programa no avisa, aunque alguna revisión de ajustes salga mal o no se pueda leer.
Esas fallas van solo al reporte. Las revisiones de ajustes sirven para explicar la
causa cuando no están listas. Para saber cuál es el ID propio de cada Mac: los mensajes
`IDS <ID>: Device Found` solo nombran a los otros equipos (iPhone, Watch, iPad y
la otra Mac), y los nombres de modelo (`Md Mac16,10`) dicen cuál es Mac. El
`Selected circle` de una Mac sola contiene solo su propio ID.

### Qué falló hoy y en qué orden se arregló

1. Compartir Internet estaba encendido en la Mac que recibe: se apagó. No bastó.
2. Las versiones de macOS eran distintas: se actualizó la Mac vieja. Desde
   entonces la nueva aparecía en ella por Wi-Fi, pero no por Bluetooth.
3. La Mac que manda llevaba casi 5 días sin reiniciarse, desde su propia
   actualización. Al reiniciarla, la otra recibió su aviso por Bluetooth, la marcó
   disponible y las dos formaron un solo grupo. Así quedó resuelto.

Apagar y prender Handoff no cambió nada.

## Cómo se usa

- **A mano:** `./universal-control.sh` hace todas las revisiones y muestra el
  reporte completo en la terminal: un renglón por revisión, con ✅ o ❌ y qué hacer.
- **Configurar una vez:** un modo que guarda la dirección de la Mac que recibe
  (`<usuario>@<mac>.local`) y comprueba que el SSH entre sin contraseña. Si no
  entra, dice cómo arreglarlo (`./conectar.sh` o `ssh-copy-id`) y no guarda nada.
- **Instalar y quitar el arranque automático:** un modo crea una tarea de inicio de
  sesión de macOS (`~/Library/LaunchAgents/`) en la Mac que manda, y otro la quita.
- **Al iniciar sesión** (el modo que corre la tarea): no pregunta nada, espera
  hasta 5 minutos a que la otra Mac responda y a que se forme el grupo, y:
  - si todo está bien, no dice nada y solo escribe el reporte en el archivo;
  - si algo falla al terminar la espera, manda **una** notificación con la causa
    más importante y qué hacer;
  - si la otra Mac no responde (apagada, sin red o esperando su contraseña),
    también avisa, por ejemplo: "<otra Mac> no responde: ¿está prendida y con
    sesión iniciada?".

Cómo arranca el usuario: las dos Mac tienen FileVault y no inician sesión solas.
Cada una pide la contraseña antes de arrancar macOS, y hasta entonces no responde
por la red, igual que si estuviera apagada. El usuario inicia sesión en las dos,
en cualquier orden, con menos de un minuto entre una y otra. Por eso alcanzan los 5
minutos de espera. Si la otra Mac ya estaba lista antes, no hay que esperar.

### De la falla al aviso

Se reporta la primera falla de esta lista, porque las de abajo suelen ser
consecuencia de las de arriba:

| Falla | Aviso (idea) |
|---|---|
| La otra Mac no responde por SSH | "<otra Mac> no responde: ¿está prendida y con sesión iniciada?" |
| El usuario de SSH en la otra Mac no es administrador | "No puedo leer los registros de <otra Mac>: el usuario <usuario> tiene que ser administrador" |
| Cuentas de Apple distintas | "Las dos Mac tienen cuentas de Apple distintas" |
| Versiones de macOS distintas | "Versiones distintas: 27.0.1 aquí, 26.6.2 en <otra Mac>. Actualiza la vieja" |
| Compartir Internet encendido | "Apaga Compartir Internet en <Mac>" |
| Wi-Fi, Bluetooth, Handoff o Universal Control apagado | "Enciende <cosa> en <Mac>" |
| Sin monitor | "<Mac> no tiene monitor" |
| Sesión bloqueada en la otra Mac | "Inicia sesión en <otra Mac>" |
| Una Mac no ve a la otra como disponible | "<Mac A> no ve a <Mac B> por Bluetooth: reinicia <Mac B>" |
| Grupos separados sin otra causa | "Las Mac no se unieron: reinicia las dos" |

## Decisiones tomadas

Del usuario:

- Corre solo cada vez que prende las Mac y revisa las dos desde una.
- Avisa solo cuando algo falla, también si la otra Mac está apagada.
- Nunca cambia ajustes por su cuenta.
- Va en el repo `claude-code-entorno`, con sus datos fuera del repo.

Decisiones mías (de quien escribe este diseño):

- El nombre es `universal-control.sh`, en la raíz del repo, junto a `conectar.sh`,
  y en bash como él.
- La espera al iniciar sesión es de hasta 5 minutos.
- La dirección de la otra Mac se guarda en
  `~/.config/claude-code-entorno/universal-control.conf`, junto al `terminal.sh`
  que ya vive ahí. Se usa el nombre `.local` y no la IP, porque la IP cambia al
  reiniciar.
- El reporte se escribe en `~/Library/Logs/claude-code-entorno/universal-control.log`.
- La notificación se manda con `osascript` (`display notification`), sin instalar
  nada.
- Los registros deciden si hay aviso. Las revisiones de ajustes solo explican la
  causa (ver "Señales en los registros").
- Versiones de macOS: cualquier diferencia, también en el último número, se
  reporta como causa, pero solo cuando las Mac no están listas.

## Restricciones

- **Repo público:** nada de datos personales, ni en el código, ni en las pruebas,
  ni en el README. En las pruebas, las direcciones se arman por partes, como en
  `pruebas/test_conectar.py`, para que la revisión de privacidad no las tome por
  reales. `./exportar.sh` tiene que terminar limpio antes del commit. Hay que
  comprobar que `exportar.sh` no borre ni sobrescriba los archivos nuevos.
- **Pruebas:** con `unittest` en `pruebas/` (`python3 -m unittest discover -s pruebas`),
  corriendo el script de verdad con `HOME` en una carpeta temporal y con comandos
  falsos delante en el `PATH`: `ssh`, `log`, `defaults`, `osascript`, `pgrep`,
  `system_profiler`, `networksetup`, `launchctl` y los que haga falta. Nunca contra
  la configuración real, nunca una notificación real, nunca una conexión real. Que
  las pruebas cubran cada fila de la tabla de fallas y el caso de todo bien sin
  notificación.
- **Estilo:** como `conectar.sh`: `set -uo pipefail`, ayuda en el comentario del
  principio, mensajes y comentarios en español.
- **Sin terminal:** al iniciar sesión nada puede preguntar ni quedarse esperando.
  El SSH va con `BatchMode=yes` y un tiempo de espera corto.
- **Procesos:** el programa no mata procesos. Si alguna vez hiciera falta, solo por
  PID.
- **Para la Mac que recibe:** las revisiones se corren por SSH en la otra Mac sin
  dejar archivos en ella, o borrándolos al terminar. Si se manda el script con
  `bash -s`, ojo con la guarda `BASH_SOURCE` del script de diagnóstico, que en ese
  caso no funciona.

## README

Una sección "Universal Control" con:

- los requisitos y el paso a paso para activarlo;
- cómo configurar e instalar el programa, y cómo quitarlo;
- qué hacer cuando falla, con la lista de "qué falló hoy";
- que en zsh los registros se leen con `/usr/bin/log`.

## Lo que se deja a quien lo construya

- Los nombres de las opciones, la etiqueta de la tarea de inicio de sesión y cómo
  se organiza el código por dentro.
- Cómo interpretar los registros, con las señales de arriba como guía, y cada
  cuánto revisar durante la espera.
- Si el instalador (`instalar.sh`) ofrece instalar el arranque automático o si se
  hace solo desde `universal-control.sh`.
- Cuántas horas de registros mirar. Basta con las del arranque actual.

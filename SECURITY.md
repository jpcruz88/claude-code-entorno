# Seguridad

Este repo instala hooks, plugins y scripts que se ejecutan en tu computadora con
tus permisos. Trátalo como código: revisa lo que instalas.

## Reportar una vulnerabilidad

No abras un issue público con detalles de explotación. Escribe a través de la
función de **Security advisories** de GitHub en este repo (pestaña *Security* →
*Report a vulnerability*). Incluye:

- Qué archivo o paso del instalador está afectado.
- Cómo reproducirlo (sin datos reales: usa un HOME temporal).
- Qué impacto tiene.

## Lo que el repo protege

- **Secretos:** `pre-commit` y el CI corren `gitleaks` sobre lo que se guarda y
  sobre el historial. Un ejemplo falso de prueba se marca con
  `gitleaks:allow` y `privacidad-ok` en su línea.
- **Datos personales:** `herramientas/revisar_privacidad.py` busca rutas de
  usuario, correos, IPs y claves antes de cada commit y push.
- **Claves externas** (Context7, OpenCode, OpenRouter): nunca van al repo. Cada
  computadora las guarda como variable de entorno.

## Lo que el repo NO protege

- Las skills de terceros (`skills/lista.json`) son código sin auditar. Su
  contenido cambia cuando su dueño quiera. Instálalas con `--sin-skills` si la
  computadora no es tuya.
- Los plugins y mods se instalan con los permisos de tu usuario.
- El plugin de Telegram de herdr es de la comunidad.

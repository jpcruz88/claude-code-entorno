# ctx-budget

Avisa cuando el contexto cruza el 70 % y el 85 %, y pide a Claude guardar el handoff.

- **Para ti:** un toast al 70 % y, al 85 %, un toast con aviso sonoro.
- **Para Claude:** al cruzar cada umbral, el siguiente mensaje que mandes lleva una nota
  (tú no la ves y tu texto no cambia) que le pide actualizar `handoff.md` en la carpeta
  de memoria del proyecto antes de seguir. Es el último momento en que puede escribirlo
  con la conversación entera delante: después de compactar solo queda un resumen.
- Si el contexto baja del umbral (ya se compactó), la nota pendiente se descarta.
- Un comando (`/algo`) no gasta la nota: viaja con el siguiente mensaje normal.

Licencia: MIT (ver [../../LICENSE](../../LICENSE)).

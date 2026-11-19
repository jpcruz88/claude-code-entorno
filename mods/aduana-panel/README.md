# aduana-panel

Mod de Claude Code que dibuja una franja sobre el prompt con el avance de unas pruebas largas: la fase, una barra, las corridas hechas del total, el costo y las corridas que siguen en curso. Cuando terminan, avisa con un toast y deja la franja diez minutos.

Lee el archivo `~/.cache/detector-humo/en-curso.json`, que escribe el programa `herramientas/estado_en_curso.py` del repo privado Aduana mientras corren sus pruebas. Sin ese archivo, o si no se actualiza en dos minutos, la franja no sale. No escribe nada, no usa la red y no lee nada más.

## Uso

```text
claude plugin install aduana-panel@claude-code-entorno
```

Reinicia Claude una vez. Lanza el escritor junto a tus pruebas:

```text
herramientas/estado_en_curso.py --fase "Haiku:45:/ruta/al/registro.log" --fase "Sonnet:45:/ruta/otro.log"
```

Cada `--fase` es `titulo:total:registro`, donde el registro es la salida de `rondas_*.py`. El panel muestra la primera fase que aún no termina.

## Formato del archivo

```json
{"titulo": "Haiku", "hechas": 9, "total": 45, "invalidas": 0, "costo_usd": 1.5,
 "fase": 1, "fases": 2, "terminado": false, "actualizado": 1795056963192,
 "en_curso": [{"lado": "egm", "ronda": 1, "tarea": "limites-aviso", "modelo": "haiku", "seg": 279}]}
```

`actualizado` va en milisegundos desde 1970.

## Pruebas

```text
claude plugin test mods/aduana-panel
```

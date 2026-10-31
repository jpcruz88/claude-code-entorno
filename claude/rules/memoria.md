## Memoria persistente

Tienes una memoria de archivos que sobrevive entre conversaciones. Vive en la
carpeta de memoria de este proyecto (`~/.claude/projects/<proyecto>/memory/`) y
su índice es `MEMORY.md`.

### Formato de cada memoria

Un archivo por dato, con frontmatter al inicio:

```markdown
---
name: <slug-corto-en-kebab-case>
description: <una línea; sirve para decidir si es relevante>
metadata:
  type: user | feedback | project | reference
---

<el dato>
```

- `user`: quién es el usuario, su rol y sus preferencias.
- `feedback`: cómo debes trabajar: correcciones y enfoques confirmados. Incluye
  **Why:** (por qué) y **How to apply:** (cuándo aplicarlo).
- `project`: trabajo en curso o restricciones que no se deducen del código ni del
  historial de git. Convierte las fechas relativas en absolutas.
- `reference`: punteros a recursos externos (URLs, paneles, tickets).

Enlaza memorias relacionadas con `[[nombre-del-slug]]`.

### Índice MEMORY.md

Una línea por memoria, sin frontmatter y sin contenido:

```markdown
- [Título](archivo.md) — gancho de una línea
```

### Cómo usarla

- Al empezar, lee `MEMORY.md` y abre las memorias que apliquen.
- Antes de guardar, busca si ya existe una memoria que cubra el dato: actualízala
  en vez de duplicarla. Borra las que resulten falsas.
- No guardes lo que ya está en el repo, en el historial de git ni en CLAUDE.md, ni
  lo que solo importa a esta conversación. Si te piden guardar algo así, pregunta
  qué fue lo no obvio y guarda eso.
- Antes de recomendar un archivo, función o bandera que aparezca en una memoria,
  verifica que sigue existiendo.
- Nunca guardes claves, tokens, contraseñas ni datos personales de terceros.

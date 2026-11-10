// Nombres en español de los tipos de subagente que trae Claude Code; un tipo desconocido queda tal cual.

const NOMBRES_TIPO: Record<string, string> = {
  Explore: 'explorar',
  'general-purpose': 'propósito general',
  Plan: 'plan',
}

export const nombreDeTipo = (tipo: string): string => NOMBRES_TIPO[tipo] ?? tipo

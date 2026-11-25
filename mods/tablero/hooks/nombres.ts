// Nombres en español de los tipos de subagente que trae Claude Code; un tipo desconocido queda tal cual.

const NOMBRES_TIPO: Record<string, string> = {
  Explore: 'Explorar',
  'general-purpose': 'Propósito general',
  Plan: 'Plan',
}

export const nombreDeTipo = (tipo: string): string => NOMBRES_TIPO[tipo] ?? tipo

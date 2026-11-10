// El color de la paleta que corresponde a cada tono de texto.
import type { Colors } from './core'
import type { Tono } from './banda-modelo'

export const COLOR_DE: Record<Tono, keyof Colors> = {
  normal: 'text',
  tenue: 'dim',
  aviso: 'amber',
  peligro: 'warn',
  acento: 'main',
}

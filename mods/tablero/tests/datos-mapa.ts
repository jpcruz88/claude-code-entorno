import type { DatosMapa } from '../hooks/mapa'

// Datos de ejemplo del mapa, compartidos por las pruebas del mapa ancho y del angosto.
export const datos = (cards: number): DatosMapa => ({
  tiempo: '04:12',
  reloj: '21:40',
  rama: 'feat/tablero',
  version: '0.4.0',
  situacion: 'trabajando',
  detalle: { turno: '0:42' },
  estado: {
    costo: '$1.42',
    ultimoTurno: '$0.08',
    limites: [
      { etiqueta: '5 h', valor: 0.31, texto: '31%', reinicio: '3h10m' },
      { etiqueta: '7 d', valor: 0.62, texto: '62%', reinicio: '4d2h' },
    ],
    permisos: { pendientes: 2, denegados: 1, modo: 'acceptEdits' },
    bucles: 0,
    errores: 1,
    ediciones: 4,
    skills: 'tdd×2 caveman×1',
    mcp: 'codebase×3 ctx7×1',
  },
  asesor: { estado: 'de guardia', consultas: 2, permisos: 0, ultima: 'hace 2m' },
  lead: { modelo: 'Sonnet 5.5 · high', turno: '0:42', ctx: 0.38, mas: 128, menos: 34, respuestas: 17, delegando: true },
  jev: {
    filas: [
      { etiqueta: 'qué modelo', valor: 0.94, texto: '94% seguro · lo cambió Jev', corto: '94% · lo cambió Jev', color: 'jev' },
      { etiqueta: 'qué esfuerzo', valor: 0.86, texto: '86% seguro · igual a Claude', corto: '86% · igual a Claude', color: 'jev' },
      { etiqueta: 'reintentar', valor: 0.64, texto: '64% seguro · decide Claude', corto: '64% · decide Claude', color: 'warn' },
    ],
    decisiones: 1382,
    tope: 'tope semana +12 pts → sonnet',
  },
  tarjetas: Array.from({ length: cards }, (_, i) => ({
    nombre: `tarea ${i + 1}`,
    modelo: 'haiku · low',
    hechos: 2,
    total: 4,
    estado: i % 2 === 0 ? ('R' as const) : ('D' as const),
  })),
  registro: ['21:52 jev haiku   ·91', '21:54 jev sonnet  ·94'],
  asesorActivo: false,
  barra: { hechos: 1, total: cards },
})

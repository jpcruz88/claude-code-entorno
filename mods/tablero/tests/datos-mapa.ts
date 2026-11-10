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
      { etiqueta: '5h', valor: 0.31, texto: '31%', reinicio: '3h10m' },
      { etiqueta: '7d', valor: 0.62, texto: '62%', reinicio: '4d2h', ritmo: { texto: 'ámbar +9 pts', k: 'amb' } },
    ],
    permisos: { pendientes: 2, denegados: 1, modo: 'acceptEdits' },
    bucles: 0,
    errores: 1,
    ediciones: 4,
    costoMin: [0, 0, 0.01, 0.02, 0.04, 0.08, 0.02, 0],
    skills: 'tdd×2 caveman×1',
    mcp: 'codebase×3 ctx7×1',
  },
  asesor: { estado: '2 consultas', consultas: 2, ultima: 'hace 2m' },
  lead: { modelo: 'Sonnet 5.5 · high', turno: '0:42', ctx: 0.38, mas: 128, menos: 34, respuestas: 17, delegando: true },
  jev: {
    umbral: 0.8,
    recientes: [
      { hora: '21:54', txt: 'esfuerzo → medio', conf: 0.84 },
      { hora: '21:52', txt: 'modelo → sonnet', conf: 0.91 },
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
  registro: [
    { hora: '21:54', rol: 'jev', txt: 'esfuerzo → medio (0.84)' },
    { hora: '21:52', rol: 'jev', txt: 'modelo → sonnet (0.91)' },
  ],
  asesorActivo: false,
  barra: { hechos: Math.min(1, cards), total: cards },
  alDia: null,
})

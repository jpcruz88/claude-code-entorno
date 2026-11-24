// La vista del mapa: arma sus datos desde el estado del panel y los dibuja. Lo que lee viene ya resuelto de register.tsx
// (ritmo, tope, asesor); aquí solo se junta en la forma que pide mapa.ts.
import type { EngineInterface } from 'claude-code'

import type { AgentCard, Architect, JevEstado, Loop, Main, Receipt, Turn, Usage, Usos } from '../types'
import { fmtClock, fmtDuration, fmtTimer, fmtUsd, MOD_VERSION, prettyModel, type Colors, type Panel, type gateSummary } from './core'
import { leerAlDia } from './al-dia-modelo'
import { costoPorMinuto, type MuestraCosto } from './costo-min'
import { lineaRegistroJev, recientesJev, type NivelRitmo } from './jev-modelo'
import { nombreDeTipo } from './nombres'
import { restoCompacto } from './resumen-modelo'
import { situacionDe } from './situacion'
import { componerMapa, filasDeMapa, MAPA_ANCHO, SPARK_ANCHO, type DatosMapa, type TarjetaMapa, type Tinta } from './mapa'

type Elementos = ReturnType<EngineInterface['ui']['resolve']>
type GateSummary = ReturnType<typeof gateSummary>

/** Lo que el mapa necesita del panel, ya calculado en el render. */
export type EntradaMapa = {
  now: number
  rama: string | null
  u: Usage
  m: Main
  t: Turn
  r: Receipt | null
  s: GateSummary
  cards: AgentCard[]
  lp: Loop[]
  a: Architect
  jevs: JevEstado
  usos: Usos
  muestras: MuestraCosto[]
  panels: Panel[]
  jevN: number
  modelo: string
  agentesActivos: number
  /** Lo que lleva la ventana de contexto, en porcentaje; sin dato, null. */
  contexto: number | null
  asesorVisible: boolean
  asesorActivo: boolean
  /** El ritmo semanal ya con su tinta; sin dato, no se dibuja. */
  ritmo: { texto: string; k: Tinta } | undefined
  tope: { texto: string; nivel: NivelRitmo }
}

/** La tinta del mapa para un nivel de ritmo o de tope: verde, ámbar o rojo. */
export const tintaDeNivel = (n: NivelRitmo): Tinta => (n === 'verde' ? 'jev' : n === 'ambar' ? 'amb' : 'warn')

/** Los datos que pide componerMapa, a partir del estado del panel. */
export const datosDelMapa = (x: EntradaMapa): DatosMapa => {
  const { now, rama, u, m, t, r, s, cards, lp, a, jevs, usos, muestras, panels, jevN, modelo, agentesActivos, contexto, asesorVisible, asesorActivo, ritmo, tope } = x
  const juntar = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${k}×${n}`).join(' ')
  const ultimaConsulta = a.consults[a.consults.length - 1]
  const situacion = situacionDe({ trabajando: agentesActivos > 0 || m.isRunning, turnoActivo: m.isRunning, permisosPendientes: s.ask, rachaErrores: t.errorStreak })
  return {
    tiempo: u.startedAt ? fmtTimer(now - u.startedAt) : '--:--',
    reloj: fmtClock(now).slice(0, 5),
    rama: rama || null,
    version: MOD_VERSION,
    situacion,
    detalle: { turno: m.isRunning && t.startedAt ? fmtTimer(now - t.startedAt) : undefined, permisos: s.ask, errores: t.errorStreak },
    estado: {
      costo: `$${(u.costUsd ?? 0).toFixed(2)}`,
      ultimoTurno: r?.costDelta != null ? fmtUsd(r.costDelta) : null,
      limites: [
        { kind: 'five_hour', etiqueta: '5h' },
        { kind: 'seven_day', etiqueta: '7d' },
      ].flatMap(({ kind, etiqueta }) => {
        const l = u.limits.find(q => q.kind === kind)
        return l
          ? [{ etiqueta, valor: l.pct / 100, texto: `${Math.round(l.pct)}%`, reinicio: restoCompacto(l.resetsAt ?? null, now) || undefined, ritmo: kind === 'seven_day' ? ritmo : undefined }]
          : []
      }),
      permisos: { pendientes: s.ask, denegados: s.deny, modo: m.mode },
      bucles: lp.length,
      errores: t.errorStreak,
      ediciones: t.edits,
      costoMin: costoPorMinuto(muestras, now, SPARK_ANCHO),
      skills: juntar(usos.skills),
      mcp: juntar(usos.mcp),
    },
    asesor:
      asesorVisible && panels.includes('architect')
        ? {
            estado: asesorActivo ? 'asesorando' : `${a.consults.length} ${a.consults.length === 1 ? 'consulta' : 'consultas'}`,
            consultas: a.consults.length,
            ultima: ultimaConsulta ? `hace ${fmtDuration(now - ultimaConsulta.at)}` : null,
          }
        : null,
    lead: {
      modelo,
      turno: m.isRunning && t.startedAt ? fmtTimer(now - t.startedAt) : null,
      ctx: contexto === null ? null : contexto / 100,
      mas: u.linesAdded ?? 0,
      menos: u.linesRemoved ?? 0,
      respuestas: m.steps,
      delegando: agentesActivos > 0,
    },
    jev: {
      umbral: 0.8,
      recientes: recientesJev(jevs.decisiones),
      decisiones: jevN,
      tope: tope.texto,
      topeTinta: tintaDeNivel(tope.nivel),
    },
    tarjetas: cards.map((c): TarjetaMapa => ({
      nombre: nombreDeTipo(c.type),
      modelo: prettyModel(c.model),
      hechos: c.steps,
      // Nadie reporta un plan de pasos: sin total, el mapa muestra los pasos dados sin barra.
      total: null,
      estado: c.status === 'running' ? 'R' : c.status === 'done' ? 'D' : c.status === 'failed' ? 'F' : c.status === 'stopped' ? 'S' : 'Q',
    })),
    registro: jevs.decisiones.slice(-5).reverse().map(lineaRegistroJev),
    alDia: panels.includes('aldia') ? leerAlDia(jevs.alDia ?? null, now) : null,
    asesorActivo,
    barra: { hechos: cards.filter(c => c.status !== 'running').length, total: cards.length },
  }
}

/** La rejilla de 100 columnas, en el ancho del panel (ver mapa.ts). */
export const vistaMapa = (els: Elementos, C: Colors, datos: DatosMapa, W: number, now: number, animado: boolean) => {
  const { Box, Text } = els
  const colorDeTinta = (k: Tinta): string =>
    ({ fg: C.text, mut: C.faint, lead: C.main, jev: C.cleared, jevd: '#1f6f4f', enj: C.agent, ase: C.arch, warn: C.warn, box: C.dim, amb: C.amber, osc: '#101014' })[k]
  return (
    <Box flexDirection="column" width={W}>
      <Box flexDirection="column" width={Math.min(W, MAPA_ANCHO)}>
        {filasDeMapa(componerMapa(datos, now / 1000, W, animado)).map((tramos, y) => (
          <Text key={String(y)}>
            {tramos.map((tr, i) => (
              <Text key={String(i)} color={colorDeTinta(tr.k)} backgroundColor={tr.bg ? colorDeTinta(tr.bg) : undefined}>
                {tr.c}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

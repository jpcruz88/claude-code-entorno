/** Tipos de Jev. El contrato es autocontenido (no importa de hooks/): copia de hooks/jev-modelo.ts. */
export type TipoDecision = 'modelo' | 'esfuerzo' | 'reintento' | 'tope'

export type DecisionJev = {
  hora: number
  sessionId: string
  tipo: TipoDecision
  opcion: string | null
  confianza: number | null
  sharp: boolean
  claude: string | null
  aplicada: boolean
  descripcion: string
  motivo: string
}

/** Lo que escribe la statusline en limites.json (epoch en segundos). */
export type LimitesJev = {
  actualizado: number
  five_hour?: { usado: number; reinicio: number }
  seven_day?: { usado: number; reinicio: number }
}

export type Moment = 'before a plan' | 'error repeats' | 'before done'

export type Bucket = 'file' | 'shell' | 'other'

/** rule: settings allowed it. ask: put to the decider, outcome pending. cleared: asked, then ran. deny: refused. */
export type Verdict = 'rule' | 'ask' | 'cleared' | 'deny'

export type Main = {
  model: string
  effort: string
  mode: string
  steps: number
  isRunning: boolean
  /** The main loop's last answered request: time to its first piece of response. Null until one is
   *  measured, absent in older state; a `tokPerS` kept by 0.5.0 and earlier is ignored. */
  speed?: { ttftMs: number } | null
}

export type Usage = {
  pct: number | null
  tokens: number | null
  window: number
  /** The compaction window (`autoCompactWindow`, or the host's own) the host measures context against, when auto-compaction
   *  is on and the window is smaller than the model's; null when none is set or none could be read. */
  compactWindow: number | null
  /** The model window `compactWindow` was read for, so a model switch reads it again; 0 = not read yet. */
  compactFor: number
  /** Reads for this model window that came back with no breakdown or failed; it stops asking at 3. */
  compactMisses: number
  costUsd: number | null
  /** `resetsAt`: when the window resets, in ms since the epoch; null when the API gave no time,
   *  absent in state saved before it was kept. */
  limits: { kind: string; pct: number; resetsAt?: number | null }[]
  compactions: number
  lastCompactAt: number | null
  /** When the session began, in ms (`$.session.usage().startedAt`); null until read, absent in older state. */
  startedAt?: number | null
  /** Lines the session's edits add and remove, counted from the tools' input: an approximation. Absent in older state. */
  linesAdded?: number
  linesRemoved?: number
}

export type Consult = { id: string; at: number; endAt: number | null; moment: Moment; via: string }

export type Architect = { consults: Consult[]; ids: string[]; seen: string[]; lastAdvice: string }

export type Check = {
  id: string
  tool: string
  bucket: Bucket
  verdict: Verdict
  inSubagent: boolean
  /** El subagente en cuyo bucle se decidió la llamada; ausente en el lead. */
  agente?: string
  detail: string
  at: number
}

export type Tally = { rule: number; ask: number; cleared: number; deny: number }

export type Gate = { recent: Check[]; totals: Record<Bucket, Tally> }

export type ToolNote = { tool: string; text: string; isError: boolean }

export type AgentCard = {
  id: string
  type: string
  model: string
  description: string
  status: string
  spawnedAt: number
  endedAt: number | null
  /** The agent's context now: input + cache read + cache write of its latest step. */
  ctx: number
  /** Output tokens summed over its steps. */
  out: number
  steps: number
  lastStop: string | null
  tools: ToolNote[]
  answer: string
  /** La marca de Jev de este subagente (`jev ↑ sonnet`), o null si Jev no cambió lo que eligió Claude. */
  jev: string | null
}

/** A model loop whose id matches no card: a workflow agent, a compaction or a memory fork. */
export type Loop = { id: string; steps: number; firstAt: number; lastAt: number; isDone: boolean }

export type Turn = {
  edits: number
  errorStreak: number
  errors: number
  isReviewing: boolean
  startedAt: number
  costAtStart: number | null
}

export type Receipt = {
  durationMs: number
  agents: number
  edits: number
  errors: number
  costDelta: number | null
  reason: string
}

export type Layout = 'auto' | 'compact' | 'wide' | 'mini' | 'diagrama' | 'mapa'

export type View = { expanded: string | null; gateOpen: Bucket | null; layout: Layout | null }

export type Roster = { architectTypes: string[] }

/** Cuántas veces la sesión usó cada habilidad (herramienta Skill) y cada servidor MCP. */
export type Usos = { skills: Record<string, number>; mcp: Record<string, number> }

/** Los planes de trabajo (antes barra-plan): pasos planos, estado, la nota a leer y su reloj. */
export type EstadoPlan = 'running' | 'needs_input' | 'error' | 'done'
export type EstadoPaso = 'pending' | 'active' | 'done' | 'failed'
export type Paso = { title: string; status: EstadoPaso }
export type Plan = {
  id: string
  title: string
  pasos: Paso[]
  estado: EstadoPlan
  note: string | null
  startedAt: number
  endedAt: number | null
}

/** Lo que escribe herramientas/estado_en_curso.py de Aduana (antes el mod aduana-panel). */
export type CorridaViva = { lado: string; ronda: number; tarea: string; modelo: string; seg: number }
export type EstadoAduana = {
  titulo: string
  hechas: number
  total: number
  invalidas: number
  costo_usd: number
  fase: number
  fases: number
  terminado: boolean
  en_curso: CorridaViva[]
  actualizado: number
}

/** Lo que cada tablero deja en ~/.claude/tablero/sesiones/<id>.json para las demás sesiones y el presupuesto. */
export type RegistroSesion = {
  id: string
  nombre: string | null
  carpeta: string
  estado: 'trabajando' | 'espera' | 'inactiva'
  /** Desde cuándo está en ese estado (ms epoch). */
  desde: number
  costo: number
  /** El costo que tenía la sesión al empezar el día `dia`. */
  base: number
  /** El día local (AAAA-MM-DD) al que se refiere `base`. */
  dia: string
  actualizado: number
}

export type Extra = {
  linea: {
    actualizado: number
    session_id: string
    session_name: string | null
    thinking: boolean | null
    prompt_cache: { warm: boolean; ttl: string | null; expires_at: number | null; hit_ratio: number | null } | null
    pr: { number: number; url: string | null; review_state: string | null } | null
  } | null
  /** Milisegundos de turnos del lead terminados. */
  trabajoMs: number
  /** Tokens que las respuestas del lead leyeron de la cache. */
  cacheLeida: number
  /** El día local (AAAA-MM-DD) y el costo de la sesión al empezarlo, para el presupuesto. */
  dia: string
  base: number
}

declare module 'claude-code' {
  interface PluginState {
    'tablero': {
      meta: { schemaVersion: number }
      main: Main
      usage: Usage
      architect: Architect
      gate: Gate
      agents: AgentCard[]
      loops: Loop[]
      turn: Turn
      receipt: Receipt | null
      view: View
      roster: Roster
      /** Habilidades y servidores MCP usados en la sesión. */
      usos: Usos
      /** The git branch (or short commit) of the working folder; null outside a repository. */
      branch: string | null
      /** Las decisiones de Jev de la sesión y el último limites.json (ver JevEstado). */
      jev: JevEstado
      /** Los planes abiertos y los terminados hace menos de 30 s (herramienta plan_progress). */
      planes: Plan[]
      /** Las pruebas largas de Aduana en curso; null sin archivo o con uno ilegible. */
      aduana: EstadoAduana | null
      /** Lo que deja la statusline para esta sesión (linea-sesion.ts), el trabajo del lead y la cache leída. */
      extra: Extra
      /** El modo caveman que dicen los prompts de la sesión. */
      caveman: 'lite' | 'full' | 'ultra' | 'normal'
      /** Panel de progreso y de agentes (savvy-progress, adaptado). */
      'savvy-flujo': {
        title: string
        total: number
        done: number
        running: number
        phase: 'plan' | 'design' | 'delegate' | 'review' | 'close'
        isFinished: boolean
        tasks: { title: string; tier: string; after: number[] }[]
      } | null
      'savvy-agentes': {
        id: string
        agentId?: string
        type: string
        description: string
        model: string
        effort?: string
        status: 'running' | 'done' | 'failed'
        startedAt: number
        endedAt?: number
        contextTokens: number
        contextMax: number
        tokens: number
        costUsd: number
        steps: number
        round: number
        stepDone?: number
        stepTotal?: number
        stepNote?: string
      }[]
      'savvy-panel': { plegado: boolean; terminadosPlegados: boolean; autoAbiertoPara: string }
      'savvy-ahora': number
    }
  }
}

/**
 * Las decisiones de Jev de la sesión y el último limites.json. `limites` es el último limites.json válido: null sin
 * archivo; un archivo roto (a medio escribir) deja el anterior. Un valor guardado antes de existir se lee como null.
 * `alDia` es el texto de ~/.claude/al-dia/resultado.json tal como se leyó (null sin archivo). Se interpreta al dibujar.
 */
export type JevEstado = { decisiones: DecisionJev[]; limites: LimitesJev | null; alDia?: string | null }

/**
 * Obiettivi della modalità Zombie (Fase 13): generatore di Stazione 13 da riattivare e
 * difendere, evacuazione finale dopo l'ultima ondata su tutte le mappe. Regole pure.
 */

// --- Generatore ---------------------------------------------------------------------------
export type GeneratorState = 'off' | 'starting' | 'on'

export const GENERATOR = {
  /** Dalla terza ondata si può avviare (prima la mappa insegna le basi). */
  firstWave: 3,
  /** Secondi di avvio da difendere. */
  defendSeconds: 30,
  /** Resistenza del generatore durante l'avvio: gli zombie vicini lo attaccano. */
  health: 700,
  /** Gli zombie entro questo raggio preferiscono il generatore al giocatore. */
  aggroRange: 12,
  /** Sconto sulle postazioni con la corrente tornata. */
  discount: 0.25,
  /** Crediti a tutti quando riparte. */
  credits: 150,
  interactRange: 2.4,
} as const

export interface GeneratorStatus {
  state: GeneratorState
  /** Avanzamento 0–1 dell'avvio. */
  progress: number
  health: number
  /** Ondata dalla quale si può ritentare dopo un guasto. */
  retryWave: number
}

export function createGenerator(): GeneratorStatus {
  return { state: 'off', progress: 0, health: GENERATOR.health, retryWave: GENERATOR.firstWave }
}

export function canStartGenerator(status: GeneratorStatus, wave: number): boolean {
  return status.state === 'off' && wave >= status.retryWave
}

export function startGenerator(status: GeneratorStatus, wave: number): GeneratorStatus {
  if (!canStartGenerator(status, wave)) return status
  return { ...status, state: 'starting', progress: 0, health: GENERATOR.health }
}

/** Avanza l'avvio; se il generatore viene distrutto torna spento e si riprova all'ondata dopo. */
export function tickGenerator(status: GeneratorStatus, delta: number, damage: number, wave: number): { status: GeneratorStatus; event: 'started' | 'failed' | null } {
  if (status.state !== 'starting') return { status, event: null }
  const health = status.health - damage
  if (health <= 0) return { status: { state: 'off', progress: 0, health: GENERATOR.health, retryWave: wave + 1 }, event: 'failed' }
  const progress = Math.min(1, status.progress + delta / GENERATOR.defendSeconds)
  if (progress >= 1) return { status: { ...status, state: 'on', progress: 1, health }, event: 'started' }
  return { status: { ...status, progress, health }, event: null }
}

/** Prezzo di una postazione: scontato con la corrente tornata. */
export function getPoweredCost(cost: number, powered: boolean): number {
  return powered ? Math.max(1, Math.round(cost * (1 - GENERATOR.discount))) : cost
}

// --- Evacuazione --------------------------------------------------------------------------
export const EVACUATION = {
  /** Secondi da passare nella zona di estrazione (anche non di fila). */
  holdSeconds: 40,
  radius: 4.5,
  /** Zombie in arrivo continuo durante l'evacuazione. */
  spawnInterval: 0.55,
} as const

/** L'estrazione avanza solo con almeno un giocatore in piedi nella zona. */
export function tickEvacuation(progress: number, delta: number, anyoneInside: boolean): number {
  return anyoneInside ? Math.min(1, progress + delta / EVACUATION.holdSeconds) : progress
}

export function isInsideExtraction(x: number, z: number, point: { x: number; z: number }): boolean {
  return Math.hypot(x - point.x, z - point.z) <= EVACUATION.radius
}

import type { GraphicsQuality } from './graphics'
import type { EnemyKind, HitZone } from './types'

/**
 * Regole pure della "sensazione d'uccisione": livello del sangue, smembramento, stile della
 * caduta, pausa d'impatto, combo ed esecuzioni. Tutto deterministico con un `random` iniettato.
 */
export type GoreLevel = 'full' | 'reduced' | 'off'

export function normalizeGore(value: unknown): GoreLevel {
  return value === 'reduced' || value === 'off' ? value : 'full'
}

export type KillCause = 'bullet' | 'shotgun' | 'explosion' | 'melee' | 'execution'

export const PART_HEAD = 1
export const PART_LEFT_ARM = 2
export const PART_RIGHT_ARM = 4
export const PART_LEFT_LEG = 8
export const PART_RIGHT_LEG = 16
const ARMS = [PART_LEFT_ARM, PART_RIGHT_ARM]
const LEGS = [PART_LEFT_LEG, PART_RIGHT_LEG]

/** Tipi con una forma diversa dall'umanoide: il Bruto resta intero, è il boss. */
const NO_DISMEMBER: readonly EnemyKind[] = ['brute', 'tyrant']

export interface DismemberInput {
  cause: KillCause
  zone: HitZone | null
  kind: EnemyKind
  /** Distanza del colpo letale. */
  distance: number
  /** Danno in eccesso rispetto alla vita massima (0 = appena ucciso). */
  overkill: number
}

/**
 * Parti che si staccano all'uccisione (maschera di bit). Si calcola sempre come con il sangue
 * completo: in co-op lo decide l'host e ogni giocatore lo mostra secondo la propria impostazione.
 */
export function rollDismemberment(input: DismemberInput, random: () => number = Math.random): number {
  if (NO_DISMEMBER.includes(input.kind)) return 0
  const pick = (parts: number[]) => parts[Math.floor(random() * parts.length)] ?? parts[0]!
  if (input.cause === 'execution') return PART_HEAD
  if (input.cause === 'explosion') {
    let mask = pick([...ARMS, ...LEGS])
    if (random() < 0.45) mask |= pick([...ARMS, ...LEGS])
    if (random() < 0.25) mask |= PART_HEAD
    return mask
  }
  if (input.zone === 'head' && (input.cause === 'bullet' || input.cause === 'shotgun')) return PART_HEAD
  if (input.cause === 'shotgun' && input.distance < 6 && random() < 0.7) {
    return input.zone === 'legs' ? pick(LEGS) : pick(ARMS)
  }
  if (input.cause === 'bullet' && input.overkill > 0.5 && random() < 0.3) return pick(ARMS)
  return 0
}

export type FallStyle = 'back' | 'knees' | 'launch' | 'spin'
export const FALL_STYLES: readonly FallStyle[] = ['back', 'knees', 'launch', 'spin']

export function chooseFallStyle(cause: KillCause, zone: HitZone | null, random: () => number = Math.random): FallStyle {
  if (cause === 'explosion') return 'launch'
  if (zone === 'legs') return 'knees'
  if (cause === 'shotgun' || cause === 'execution' || zone === 'head') return 'back'
  const roll = random()
  return roll < 0.5 ? 'back' : roll < 0.75 ? 'spin' : 'knees'
}

/** Durata della caduta: abbastanza per vederla, non tanto da svuotare il pool dei modelli. */
export const FALL_DURATION = 1.05

/** Forza della spinta alla morte in base alla causa. */
export function getDeathImpulse(cause: KillCause, overkill: number): number {
  const base = cause === 'explosion' ? 7 : cause === 'shotgun' ? 4.5 : cause === 'execution' ? 3 : cause === 'melee' ? 2.5 : 1.6
  return base * (1 + Math.min(1, Math.max(0, overkill)) * 0.5)
}

export interface HitStopEvent {
  lethalHeadshot?: boolean
  boss?: boolean
  multiKill?: boolean
  execution?: boolean
}

/**
 * Pausa d'impatto in secondi. Solo in solitaria (in co-op il mondo non si ferma) e mai con
 * "Riduci movimento".
 */
export function getHitStop(event: HitStopEvent, coop: boolean, reducedMotion: boolean): number {
  if (coop || reducedMotion) return 0
  if (event.boss) return 0.12
  if (event.execution) return 0.09
  if (event.multiKill) return 0.06
  if (event.lethalHeadshot) return 0.045
  return 0
}

/** Durante la pausa d'impatto il mondo scorre a questa frazione della velocità. */
export const HIT_STOP_TIME_SCALE = 0.12

// --- Combo ---------------------------------------------------------------------------------
export const COMBO_WINDOW = 2.5
export const MAX_COMBO_MULTIPLIER = 2

export interface ComboState {
  count: number
  timer: number
  best: number
}

export function createCombo(): ComboState {
  return { count: 0, timer: 0, best: 0 }
}

export function registerComboKill(state: ComboState): { state: ComboState; announcement: string | null } {
  const count = state.count + 1
  return { state: { count, timer: COMBO_WINDOW, best: Math.max(state.best, count) }, announcement: getComboAnnouncement(count) }
}

export function tickCombo(state: ComboState, delta: number): ComboState {
  if (state.count === 0) return state
  const timer = state.timer - delta
  return timer <= 0 ? { count: 0, timer: 0, best: state.best } : { ...state, timer }
}

/** +5% dei crediti per ogni uccisione della combo dopo la prima, fino a ×2. */
export function getComboMultiplier(count: number): number {
  return 1 + Math.min(MAX_COMBO_MULTIPLIER - 1, Math.max(0, count - 1) * 0.05)
}

const ANNOUNCEMENTS: Record<number, string> = {
  2: 'DOPPIA',
  3: 'TRIPLA',
  5: 'MASSACRO',
  10: 'CARNEFICINA',
  20: 'INARRESTABILE',
  30: 'LEGGENDA',
}

export function getComboAnnouncement(count: number): string | null {
  if (ANNOUNCEMENTS[count]) return ANNOUNCEMENTS[count]!
  return count > 30 && count % 10 === 0 ? `LEGGENDA ×${count}` : null
}

// --- Esecuzioni ----------------------------------------------------------------------------
export const EXECUTION_HEALTH_SHARE = 0.2
export const EXECUTION_HEAL_SHARE = 0.1
export const EXECUTION_CREDITS = 3
/** Distanza entro cui l'indicatore d'esecuzione compare sopra lo zombie. */
export const EXECUTION_HINT_RANGE = 7

export function isExecutable(kind: EnemyKind, health: number, maxHealth: number, stunned: boolean): boolean {
  if (kind === 'brute' || kind === 'tyrant' || health <= 0) return false
  return stunned || health <= maxHealth * EXECUTION_HEALTH_SHARE
}

// --- Sangue e limiti -----------------------------------------------------------------------
export function getBloodCount(gore: GoreLevel, base: number): number {
  if (gore === 'off') return 0
  return gore === 'reduced' ? Math.ceil(base * 0.35) : base
}

const ACID_KINDS: readonly EnemyKind[] = ['spitter', 'bloater']
const METAL_KINDS: readonly EnemyKind[] = ['armored', 'shielder']

/** Colore del sangue: rosso scuro, acido per sputatori e gonfi; null = niente sangue. */
export function getBloodColor(kind: EnemyKind, gore: GoreLevel): number | null {
  if (gore === 'off') return null
  if (ACID_KINDS.includes(kind)) return 0x6fae2e
  if (METAL_KINDS.includes(kind)) return 0x5c1418
  return gore === 'reduced' ? 0x3a1013 : 0x7a0f18
}

/** Detriti (arti staccati) e macchie a terra contemporanei per preset. */
export const DEBRIS_LIMIT: Record<GraphicsQuality, number> = { low: 16, medium: 32, high: 48 }
export const BLOOD_POOL_LIMIT: Record<GraphicsQuality, number> = { low: 20, medium: 40, high: 72 }

// --- Medaglie di fine run ------------------------------------------------------------------
export interface RunFeats {
  bestCombo: number
  /** Uccisioni con colpo alla testa consecutive (la serie si rompe con un'uccisione al corpo). */
  headshotStreak: number
  explosiveKills: number
  executions: number
}

export type MedalTier = 'bronze' | 'silver' | 'gold'

export interface RunMedal {
  id: keyof RunFeats
  name: string
  tier: MedalTier
  value: number
}

const MEDAL_RULES: { id: keyof RunFeats; name: string; thresholds: [number, number, number] }[] = [
  { id: 'bestCombo', name: 'CARNEFICINA', thresholds: [5, 10, 20] },
  { id: 'headshotStreak', name: 'OCCHIO DI FALCO', thresholds: [5, 10, 20] },
  { id: 'explosiveKills', name: 'ARTIFICIERE', thresholds: [8, 20, 40] },
  { id: 'executions', name: 'BOIA', thresholds: [3, 8, 15] },
]

export function createFeats(): RunFeats {
  return { bestCombo: 0, headshotStreak: 0, explosiveKills: 0, executions: 0 }
}

/** Medaglie ottenute, con il grado più alto raggiunto per ciascuna. */
export function getRunMedals(feats: Partial<RunFeats>): RunMedal[] {
  const medals: RunMedal[] = []
  for (const rule of MEDAL_RULES) {
    const value = Math.max(0, Math.floor(Number(feats[rule.id]) || 0))
    const [bronze, silver, gold] = rule.thresholds
    const tier: MedalTier | null = value >= gold ? 'gold' : value >= silver ? 'silver' : value >= bronze ? 'bronze' : null
    if (tier) medals.push({ id: rule.id, name: rule.name, tier, value })
  }
  return medals
}

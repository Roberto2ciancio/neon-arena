/**
 * Carte della run (piano gameplay G4): modificatori scelti prima di iniziare che rendono la
 * partita più difficile o strana e moltiplicano frammenti ed esperienza di fine run. Il
 * punteggio della classifica non cambia, così le run restano confrontabili. Regole pure.
 */
import type { KeyValueStorage } from './progression'

export type RunModifierId = 'pistols-only' | 'one-hit' | 'giants' | 'fast' | 'no-shop' | 'fragile' | 'swarm' | 'night'

export interface RunModifierDefinition {
  id: RunModifierId
  name: string
  description: string
  icon: string
  /** Moltiplicatore di frammenti ed esperienza. */
  reward: number
}

export const RUN_MODIFIERS: Record<RunModifierId, RunModifierDefinition> = {
  'pistols-only': { id: 'pistols-only', name: 'SOLO PISTOLE', icon: '⌐', reward: 1.3, description: 'Niente arma principale: solo pistola e arma bianca. Le postazioni vendono solo pistole.' },
  'one-hit': { id: 'one-hit', name: 'UN COLPO E SEI A TERRA', icon: '☠', reward: 2, description: 'Qualsiasi colpo che supera lo scudo è fatale.' },
  giants: { id: 'giants', name: 'ZOMBIE GIGANTI', icon: '▲', reward: 1.3, description: 'Zombie più grossi e resistenti (+50% vita), appena più lenti.' },
  fast: { id: 'fast', name: 'ZOMBIE RAPIDI', icon: '»', reward: 1.4, description: 'Tutti gli zombie si muovono il 30% più veloci.' },
  'no-shop': { id: 'no-shop', name: 'NIENTE ACQUISTI', icon: '⊘', reward: 1.5, description: 'Postazioni e cassa misteriosa spente: resti con il tuo equipaggiamento.' },
  fragile: { id: 'fragile', name: 'FRAGILE', icon: '◇', reward: 1.3, description: 'Integrità massima dimezzata.' },
  swarm: { id: 'swarm', name: 'ORDA CONTINUA', icon: '⁂', reward: 1.4, description: 'Il 50% di zombie in più in ogni ondata.' },
  night: { id: 'night', name: 'NOTTE PERPETUA', icon: '◐', reward: 1.25, description: 'Luci basse e nebbia fitta per tutta la run.' },
}

export const RUN_MODIFIER_IDS = Object.keys(RUN_MODIFIERS) as RunModifierId[]
export const MAX_RUN_MODIFIERS = 3
export const MAX_REWARD_MULTIPLIER = 4
export const RUN_MODIFIERS_STORAGE_KEY = 'neon-arena:run-modifiers:v1'

export function isRunModifierId(value: unknown): value is RunModifierId {
  return typeof value === 'string' && value in RUN_MODIFIERS
}

/** Carte valide, senza doppioni e al massimo tre (le altre si scartano). */
export function normalizeRunModifiers(value: unknown): RunModifierId[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isRunModifierId))].slice(0, MAX_RUN_MODIFIERS)
}

export function getRewardMultiplier(modifiers: readonly RunModifierId[]): number {
  const total = modifiers.reduce((product, id) => product * RUN_MODIFIERS[id].reward, 1)
  return Math.round(Math.min(MAX_REWARD_MULTIPLIER, total) * 100) / 100
}

/** Attiva o toglie una carta; con tre carte già scelte la nuova non entra. */
export function toggleRunModifier(current: readonly RunModifierId[], id: RunModifierId): RunModifierId[] {
  if (current.includes(id)) return current.filter((entry) => entry !== id)
  if (current.length >= MAX_RUN_MODIFIERS) return [...current]
  return [...current, id]
}

/** Effetti numerici delle carte sulla partita. */
export interface RunModifierEffects {
  zombieHealth: number
  zombieSpeed: number
  zombieScale: number
  spawnCount: number
  maxHealth: number
  lightScale: number
  fogScale: number
  pistolsOnly: boolean
  oneHit: boolean
  noShop: boolean
}

export function getRunModifierEffects(modifiers: readonly RunModifierId[]): RunModifierEffects {
  const has = (id: RunModifierId) => modifiers.includes(id)
  return {
    zombieHealth: has('giants') ? 1.5 : 1,
    zombieSpeed: (has('giants') ? 0.9 : 1) * (has('fast') ? 1.3 : 1),
    zombieScale: has('giants') ? 1.3 : 1,
    spawnCount: has('swarm') ? 1.5 : 1,
    maxHealth: has('fragile') ? 0.5 : 1,
    lightScale: has('night') ? 0.45 : 1,
    fogScale: has('night') ? 1.6 : 1,
    pistolsOnly: has('pistols-only'),
    oneHit: has('one-hit'),
    noShop: has('no-shop'),
  }
}

export function loadRunModifiers(storage: KeyValueStorage): RunModifierId[] {
  try {
    return normalizeRunModifiers(JSON.parse(storage.getItem(RUN_MODIFIERS_STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function saveRunModifiers(storage: KeyValueStorage, modifiers: readonly RunModifierId[]): void {
  try {
    storage.setItem(RUN_MODIFIERS_STORAGE_KEY, JSON.stringify(normalizeRunModifiers(modifiers)))
  } catch {
    // Storage non disponibile: la scelta vale per questa sessione.
  }
}

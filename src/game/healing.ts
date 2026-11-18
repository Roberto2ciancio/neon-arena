import type { EnemyKind } from './types'

/** Sotto questa quota di vita compaiono bordo rosso, battito e avviso. */
export const LOW_HEALTH_SHARE = 0.35
/** Quota curata da un kit medico raccolto a terra. */
export const MEDKIT_PICKUP_HEAL = 0.25
export const MEDKIT_PICKUP_LIFETIME = 25
/** Secondi senza danni prima che parta la rigenerazione naturale. */
export const REGEN_DELAY = 6
/** Integrità al secondo della rigenerazione naturale. */
export const REGEN_PER_SECOND = 4
/** La rigenerazione naturale si ferma a metà vita: oltre servono kit e postazioni. */
export const REGEN_CAP_SHARE = 0.5

/**
 * Probabilità che uno zombie lasci un kit medico: rara a vita piena, tre volte più alta
 * sotto la soglia di vita bassa; il Bruto ne lascia sempre uno.
 */
export function getMedkitDropChance(kind: EnemyKind, healthShare: number): number {
  if (kind === 'brute') return 1
  const base = 0.025
  return healthShare < LOW_HEALTH_SHARE ? base * 3 : healthShare < 0.7 ? base * 1.6 : base
}

/** Integrità rigenerata in questo frame (0 se si è subito danno da poco o si è già a metà vita). */
export function getPassiveRegen(health: number, maxHealth: number, sinceDamage: number, delta: number): number {
  const cap = maxHealth * REGEN_CAP_SHARE
  if (sinceDamage < REGEN_DELAY || health <= 0 || health >= cap) return 0
  return Math.min(cap - health, REGEN_PER_SECOND * delta)
}

/**
 * Intensità dell'avviso di vita bassa (0 = nessun effetto, 1 = quasi morto) e intervallo
 * del battito cardiaco, più rapido quanto meno vita resta.
 */
export function getLowHealthWarning(health: number, maxHealth: number): { intensity: number; heartbeatInterval: number } {
  const share = maxHealth > 0 ? health / maxHealth : 0
  if (health <= 0 || share >= LOW_HEALTH_SHARE) return { intensity: 0, heartbeatInterval: 0 }
  const intensity = Math.min(1, (LOW_HEALTH_SHARE - share) / LOW_HEALTH_SHARE + 0.25)
  return { intensity, heartbeatInterval: 1.2 - intensity * 0.6 }
}

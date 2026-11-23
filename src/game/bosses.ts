/**
 * Regole pure dei boss (Fase 13): fasi del Bruto in base alla vita, onda d'urto del colpo a
 * terra e boss nuovo di Distretto Zero (il Tiranno). Il comportamento sta in `Game.ts`.
 */
export type BossPhase = 1 | 2 | 3

export interface BrutePhaseRules {
  /** Attesa fra una carica e l'altra. */
  chargeCooldown: number
  /** Moltiplicatore della velocità durante la carica. */
  chargeSpeed: number
  /** Secondi di nucleo esposto dopo una carica. */
  coreExposed: number
  /** Colpo a terra con onda d'urto (dalla fase 2). */
  groundSlam: boolean
  /** Moltiplicatore della velocità di camminata. */
  speed: number
}

export const BRUTE_PHASES: Record<BossPhase, BrutePhaseRules> = {
  1: { chargeCooldown: 4.5, chargeSpeed: 5.2, coreExposed: 1.8, groundSlam: false, speed: 1 },
  2: { chargeCooldown: 3.6, chargeSpeed: 5.6, coreExposed: 1.6, groundSlam: true, speed: 1.12 },
  3: { chargeCooldown: 2.7, chargeSpeed: 6.2, coreExposed: 1.3, groundSlam: true, speed: 1.3 },
}

/** Nucleo esposto quando il boss cambia fase: una finestra per fare molto danno. */
export const PHASE_CHANGE_EXPOSED = 3

export function getBossPhase(health: number, maxHealth: number): BossPhase {
  const share = maxHealth > 0 ? health / maxHealth : 0
  return share > 2 / 3 ? 1 : share > 1 / 3 ? 2 : 3
}

// --- Colpo a terra: anello che si allarga e colpisce chi è a terra dentro la sua fascia ---
export const GROUND_SLAM = {
  /** Caricamento visibile (braccia alzate) prima del colpo. */
  windup: 0.75,
  /** Distanza dal giocatore entro cui il Bruto preferisce il colpo a terra alla carica. */
  triggerRange: 7,
  cooldown: 6,
  maxRadius: 9,
  duration: 0.9,
  /** Spessore della fascia dell'anello che fa danno. */
  band: 0.9,
  /** Danno in quota del danno del Bruto. */
  damageShare: 0.8,
} as const

/** Raggio dell'anello dopo `elapsed` secondi (stessa curva dell'effetto grafico). */
export function getShockwaveRadius(elapsed: number, duration: number = GROUND_SLAM.duration, maxRadius: number = GROUND_SLAM.maxRadius): number {
  const progress = Math.min(1, Math.max(0, elapsed / duration))
  return maxRadius * (1 - (1 - progress) ** 2)
}

/** Vero se l'anello colpisce: bisogna essere a terra, nella fascia e quasi alla stessa quota. Saltando lo si evita. */
export function isHitByShockwave(distance: number, radius: number, grounded: boolean, heightDifference: number): boolean {
  return grounded && Math.abs(heightDifference) < 1 && Math.abs(distance - radius) < GROUND_SLAM.band / 2 + 0.3
}

// --- Il Tiranno: boss di Distretto Zero -----------------------------------------------------
/** Mappe in cui il Tiranno sostituisce il Bruto nelle ondate boss dalla 10. */
export const TYRANT_MAPS: readonly string[] = ['district-zero']
export const TYRANT_FIRST_WAVE = 10

export const TYRANT = {
  /** Lancio di un macigno acido in parabola verso il giocatore. */
  boulderCooldown: 3.2,
  boulderSpeed: 16,
  boulderRadius: 3,
  boulderDamageShare: 0.9,
  /** Richiamo di Striscianti dalla fase 2. */
  summonCooldown: 11,
  summonCount: 3,
  /** Il nucleo si scopre per qualche secondo dopo ogni lancio. */
  coreExposed: 1.4,
} as const

export function shouldSpawnTyrant(mapId: string, wave: number): boolean {
  return TYRANT_MAPS.includes(mapId) && wave >= TYRANT_FIRST_WAVE && wave % 5 === 0
}

/** Striscianti richiamati: nessuno in fase 1, poi di più quando il boss è in difficoltà. */
export function getTyrantSummons(phase: BossPhase): number {
  return phase === 1 ? 0 : phase === 2 ? TYRANT.summonCount : TYRANT.summonCount + 2
}

/**
 * Velocità iniziale di un lancio in parabola che arriva sul bersaglio con la velocità
 * orizzontale data (gravità positiva verso il basso).
 */
export function getLobVelocity(dx: number, dy: number, dz: number, horizontalSpeed: number, gravity: number): { x: number; y: number; z: number; time: number } {
  const distance = Math.hypot(dx, dz)
  const time = Math.max(0.35, distance / horizontalSpeed)
  const vy = (dy + 0.5 * gravity * time * time) / time
  return { x: dx / time, y: vy, z: dz / time, time }
}

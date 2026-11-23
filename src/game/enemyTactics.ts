/**
 * Varietà di nemici e situazioni (piano gameplay G3): coperture basse che gli zombie
 * abbattono, nemici che si combinano (lo Scudiero scorta lo Sputatore, l'Urlatore rianima i
 * caduti) ed eventi rari, uno ogni cinque run circa. Regole pure.
 */
import type { EnemyKind } from './types'

// --- Coperture distruttibili ---------------------------------------------------------------
export const COVER = {
  /** Solo le coperture basse (si scavalcano saltando): muri e container restano. */
  maxHeight: 1.6,
  /** Secondi di blocco contro la copertura prima di attaccarla. */
  stuckTime: 0.8,
} as const

export function getCoverHealth(wave: number): number {
  return Math.round(140 * (1 + Math.max(0, wave - 1) * 0.1))
}

// --- Scudiero di scorta --------------------------------------------------------------------
export const ESCORT = { searchRadius: 12, standOff: 1.6, minPlayerDistance: 4 } as const

/** Punto fra lo Sputatore e il bersaglio dove lo Scudiero si piazza a fargli da scudo. */
export function getEscortPoint(spitterX: number, spitterZ: number, targetX: number, targetZ: number): { x: number; z: number } {
  const dx = targetX - spitterX
  const dz = targetZ - spitterZ
  const distance = Math.hypot(dx, dz) || 1
  return { x: spitterX + (dx / distance) * ESCORT.standOff, z: spitterZ + (dz / distance) * ESCORT.standOff }
}

// --- Urlatore che rianima ------------------------------------------------------------------
export const REVIVE = { radius: 10, window: 5, perScream: 2 } as const

export interface Corpse {
  kind: EnemyKind
  x: number
  y: number
  z: number
  time: number
}

/** Solo zombie comuni appena caduti; boss, élite speciali e Gonfi (esplodono) no. */
export function canBeRevived(kind: EnemyKind): boolean {
  return kind !== 'brute' && kind !== 'tyrant' && kind !== 'bloater'
}

export function pickRevivals(corpses: readonly Corpse[], x: number, z: number, now: number): Corpse[] {
  return corpses
    .filter((corpse) => now - corpse.time <= REVIVE.window && Math.hypot(corpse.x - x, corpse.z - z) <= REVIVE.radius)
    .slice(-REVIVE.perScream)
}

// --- Eventi rari ---------------------------------------------------------------------------
export type RareEventId = 'horde' | 'rogue-tyrant' | 'pitch-black'

export const RARE_EVENTS: Record<RareEventId, { name: string; description: string; color: number }> = {
  horde: { name: 'L’ORDA', description: 'Sessanta Corridori in arrivo tutti insieme. Resisti!', color: 0xff6b6b },
  'rogue-tyrant': { name: 'TIRANNO FUORI PROGRAMMA', description: 'Un Tiranno vaga per la mappa: non era previsto.', color: 0x9dff4a },
  'pitch-black': { name: 'BUIO TOTALE', description: 'Si spegne tutto: segui i suoni e i bagliori. Crediti ×2.', color: 0x8f9bb3 },
}

export const RARE_EVENT = { chance: 0.2, hordeSize: 60, hordeInterval: 0.5 } as const

/** Deciso a inizio run: evento e ondata (fra la 6 e la 12, mai quella del boss). */
export function rollRareEvent(random: () => number = Math.random): { id: RareEventId; wave: number } | null {
  if (random() >= RARE_EVENT.chance) return null
  const ids = Object.keys(RARE_EVENTS) as RareEventId[]
  const id = ids[Math.floor(random() * ids.length)] ?? 'horde'
  let wave = 6 + Math.floor(random() * 7)
  if (wave % 5 === 0) wave += 1
  return { id, wave }
}

export function isRareEventId(value: unknown): value is RareEventId {
  return typeof value === 'string' && value in RARE_EVENTS
}

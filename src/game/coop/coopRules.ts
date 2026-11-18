/** Giocatori massimi in una partita Zombie cooperativa. */
export const MAX_COOP_PLAYERS = 4

/** Moltiplicatori di difficoltà per numero di giocatori (1 = partita da solo, nessuna modifica). */
export interface CoopScaling {
  /** Vita degli zombie. */
  health: number
  /** Zombie totali per ondata. */
  spawnCount: number
  /** Zombie vivi contemporaneamente. */
  maxActive: number
  /** Danno inflitto dagli zombie. */
  damage: number
  /** Probabilità aggiuntiva di élite (somma, non moltiplicatore). */
  eliteBonus: number
  /** Cadenza degli spawn (intervallo più breve). */
  spawnInterval: number
}

/** Tetto assoluto di zombie vivi anche in quattro, per non far crollare i frame. */
export const COOP_MAX_ACTIVE_CAP = 40

/**
 * In due o più la partita diventa nettamente più difficile: ogni giocatore in più aggiunge
 * il 60% di vita agli zombie, il 50% di zombie per ondata, più élite e attacchi più forti.
 */
export function getCoopScaling(players: number): CoopScaling {
  const extra = Math.min(MAX_COOP_PLAYERS, Math.max(1, Math.floor(players))) - 1
  return {
    health: 1 + 0.6 * extra,
    spawnCount: 1 + 0.5 * extra,
    maxActive: 1 + 0.3 * extra,
    damage: 1 + 0.12 * extra,
    eliteBonus: 0.05 * extra,
    spawnInterval: 1 / (1 + 0.35 * extra),
  }
}

export function scaleMaxActive(baseMaxActive: number, players: number): number {
  return Math.min(COOP_MAX_ACTIVE_CAP, Math.round(baseMaxActive * getCoopScaling(players).maxActive))
}

/** Secondi tenendo premuto E vicino al compagno per rianimarlo. */
export const REVIVE_SECONDS = 3
/** Distanza massima per rianimare. */
export const REVIVE_RANGE = 2.2
/** Secondi a terra prima di essere eliminati se nessuno rianima. */
export const BLEED_OUT_SECONDS = 30
/** Vita con cui si torna in piedi dopo la rianimazione (quota della vita massima). */
export const REVIVE_HEALTH_SHARE = 0.4

export type CoopPlayerStatus = 'alive' | 'down' | 'dead'

/** La partita è persa quando nessun giocatore è in piedi. */
export function isTeamWiped(statuses: readonly CoopPlayerStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status !== 'alive')
}

/** All'inizio di ogni ondata chi era eliminato rientra in partita (con vita piena). */
export function respawnAtWave(status: CoopPlayerStatus): CoopPlayerStatus {
  return status === 'dead' ? 'alive' : status
}

/**
 * Danno massimo accettato dall'host per un singolo colpo dichiarato da un client: arma più
 * forte con grado MK IV, livello 5, potenziamenti e critico, con margine. Il co-op non è
 * competitivo: il limite serve solo a scartare valori assurdi.
 */
export const MAX_COOP_HIT_DAMAGE = 2500

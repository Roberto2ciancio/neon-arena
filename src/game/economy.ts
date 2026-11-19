import type { EnemyKind } from './types'

/**
 * Due valute separate:
 * - CREDITI (⬢) si guadagnano in partita e comprano armi, munizioni, porte e la cassa;
 * - FRAMMENTI (◆) si guadagnano a fine partita e servono per armeria e officina.
 * I crediti non avanzati non si convertono in frammenti.
 */
export const CREDIT_SYMBOL = '⬢'
export const SHARD_SYMBOL = '◆'

const KILL_CREDITS: Record<EnemyKind, number> = {
  walker: 1, runner: 1, crawler: 1, leaper: 2, spitter: 2, bloater: 2, stalker: 2, screamer: 3, armored: 3, shielder: 3, brute: 12,
}

/** Crediti per uccisione: i nemici più duri valgono di più, le élite il doppio. */
export function getKillCredits(kind: EnemyKind, elite: boolean): number {
  return KILL_CREDITS[kind] * (elite ? 2 : 1)
}

/** Frammenti di fine run: dipendono da quanto si è resistito, non dai crediti spesi in partita. */
export function getRunShards(wave: number, kills: number, won: boolean): number {
  return Math.max(0, Math.floor(Math.max(0, wave - 1) * 1.2 + kills / 15)) + (won ? 8 : 0)
}

/** Esperienza dell'arma per un'uccisione in Zombie: più alta per élite e Bruto. */
export function getWeaponKillXp(kind: EnemyKind, elite: boolean, base: number): number {
  return Math.round(base * (kind === 'brute' ? 5 : elite ? 2 : 1))
}

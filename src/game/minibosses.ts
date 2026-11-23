/**
 * Miniboss (piano gameplay G1): alle ondate 3, 7 e 12 arriva un'élite con un nome e
 * un'abilità propria, fra un boss e l'altro. Regole pure; il comportamento sta in `Game.ts`.
 */
import type { EnemyKind } from './types'

export type MinibossId = 'regenerator' | 'blinker' | 'corroder'

export interface MinibossDefinition {
  id: MinibossId
  name: string
  /** Tipo di zombie su cui si basa (modello e attacchi). */
  kind: EnemyKind
  intel: string
  color: number
}

export const MINIBOSSES: Record<MinibossId, MinibossDefinition> = {
  regenerator: { id: 'regenerator', name: 'IL RIGENERANTE', kind: 'armored', color: 0x6bff9a, intel: 'Si rigenera se smetti di colpirlo: tieni la pressione e mira al generatore.' },
  blinker: { id: 'blinker', name: 'LO SPETTRO', kind: 'runner', color: 0xb48cff, intel: 'Si teletrasporta alle tue spalle: muoviti e guardati intorno.' },
  corroder: { id: 'corroder', name: 'IL CORROSIVO', kind: 'walker', color: 0x9dff4a, intel: 'Lascia una scia d’acido: non inseguirlo sul suo percorso.' },
}

export const MINIBOSS_IDS = Object.keys(MINIBOSSES) as MinibossId[]
export const MINIBOSS_WAVES: readonly number[] = [3, 7, 12]

export const MINIBOSS = {
  health: 7,
  damage: 1.4,
  scale: 1.35,
  credits: 40,
  /** Rigenerante: secondi senza danni prima di rigenerare e quota della vita al secondo. */
  regenDelay: 2,
  regenShare: 0.05,
  /** Spettro: ogni quanti secondi si teletrasporta e a che distanza dal bersaglio. */
  blinkCooldown: 6,
  blinkDistance: 3.5,
  /** Corrosivo: ogni quanti secondi lascia una pozza. */
  trailInterval: 1.1,
} as const

/** Il miniboss di quest'ondata (diverso a ogni ondata della run), o null. */
export function getMinibossForWave(wave: number, runSeed: number): MinibossId | null {
  const index = MINIBOSS_WAVES.indexOf(wave)
  if (index < 0) return null
  return MINIBOSS_IDS[(Math.abs(Math.floor(runSeed)) + index) % MINIBOSS_IDS.length]!
}

/** Vita recuperata in questo frame dal Rigenerante. */
export function getRegeneration(sinceHit: number, maxHealth: number, delta: number): number {
  return sinceHit >= MINIBOSS.regenDelay ? maxHealth * MINIBOSS.regenShare * delta : 0
}

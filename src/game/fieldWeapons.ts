import { isPremiumRarity, WEAPON_RARITY } from './mysteryBox'
import type { WeaponId } from './weapons'

/** Armi che possono comparire nelle postazioni Zombie, con l'ondata da cui diventano disponibili. */
export const FIELD_WEAPON_POOL: readonly { weapon: Exclude<WeaponId, 'ar-07' | 'p-12'>; firstWave: number }[] = [
  { weapon: 'smg-9', firstWave: 1 },
  { weapon: 'sg-6', firstWave: 1 },
  { weapon: 'r-44', firstWave: 1 },
  { weapon: 'ap-18', firstWave: 1 },
  { weapon: 'vx-45', firstWave: 1 },
  { weapon: 'dmr-3', firstWave: 1 },
  { weapon: 'ak-74r', firstWave: 3 },
  { weapon: 'br-3', firstWave: 3 },
  { weapon: 'as-12', firstWave: 5 },
  { weapon: 'lmg-75', firstWave: 5 },
  { weapon: 'sr-50', firstWave: 6 },
  { weapon: 'kr-90', firstWave: 3 },
  { weapon: 'hc-50', firstWave: 4 },
  { weapon: 'vk-12', firstWave: 4 },
  { weapon: 'ks-8', firstWave: 5 },
  { weapon: 'mg-3x', firstWave: 7 },
  { weapon: 'xr-1', firstWave: 9 },
]

export type FieldTier = 1 | 2 | 3

export const FIELD_TIERS: Record<FieldTier, { name: string; damage: number; magazine: number; cost: number; firstWave: number }> = {
  1: { name: 'MK II', damage: 1.2, magazine: 1.2, cost: 1, firstWave: 1 },
  2: { name: 'MK III', damage: 1.38, magazine: 1.35, cost: 1.45, firstWave: 5 },
  3: { name: 'MK IV', damage: 1.55, magazine: 1.5, cost: 1.9, firstWave: 10 },
}

/** Grado delle armi delle postazioni: sale con le ondate. */
export function getFieldTier(wave: number): FieldTier {
  if (wave >= FIELD_TIERS[3].firstWave) return 3
  if (wave >= FIELD_TIERS[2].firstWave) return 2
  return 1
}

export function getFieldWeaponCost(baseCost: number, tier: FieldTier): number {
  return Math.round(baseCost * FIELD_TIERS[tier].cost)
}

/** Numero pseudo-casuale riproducibile: stessa mappa e stessa ondata danno le stesse armi a tutti i giocatori. */
function seededRandom(seed: string): () => number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Armi delle postazioni per un'ondata: diverse fra loro finché il catalogo lo permette e
 * diverse da quelle dell'ondata precedente nella stessa postazione, quando possibile.
 */
export function rollStationWeapons(mapId: string, stationIds: readonly string[], wave: number, premium: ReadonlySet<string> = new Set()): Record<string, WeaponId> {
  const available = FIELD_WEAPON_POOL.filter((entry) => wave >= entry.firstWave).map((entry) => entry.weapon)
  const previous = wave > 1 ? rollStationWeapons(mapId, stationIds, wave - 1, premium) : {}
  // Dietro le porte chiuse solo armi epiche e leggendarie, disponibili con 4 ondate di anticipo:
  // pagare la porta conviene già dall'inizio. Se non ce ne sono ancora, le rare.
  const early = FIELD_WEAPON_POOL.filter((entry) => wave + PREMIUM_HEAD_START >= entry.firstWave).map((entry) => entry.weapon)
  const premiumPool = early.filter((weapon) => isPremiumRarity(WEAPON_RARITY[weapon]))
  const fallback = early.filter((weapon) => WEAPON_RARITY[weapon] === 'rare')
  const premiumDeck = premiumPool.length > 0 ? premiumPool : fallback.length > 0 ? fallback : available
  const random = seededRandom(`${mapId}:${wave}`)
  const deck = [...new Set([...available, ...premiumPool])]
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[deck[index], deck[swap]] = [deck[swap]!, deck[index]!]
  }
  const result: Record<string, WeaponId> = {}
  const uses = new Map<WeaponId, number>()
  for (const id of stationIds) {
    // L'arma meno presente finora in questa ondata (doppioni distribuiti in modo uniforme),
    // diversa da quella che la postazione vendeva nell'ondata precedente.
    // Le postazioni normali non vendono epiche e leggendarie: si trovano dietro le porte o nella cassa.
    const source = premium.has(id) ? deck.filter((weapon) => premiumDeck.includes(weapon)) : deck.filter((weapon) => !isPremiumRarity(WEAPON_RARITY[weapon]))
    const options = source.length > 0 ? source : deck
    const least = Math.min(...options.map((weapon) => uses.get(weapon) ?? 0))
    const pick = options.find((weapon) => (uses.get(weapon) ?? 0) === least && weapon !== previous[id])
      ?? options.find((weapon) => weapon !== previous[id])
      ?? options[0]!
    result[id] = pick
    uses.set(pick, (uses.get(pick) ?? 0) + 1)
  }
  return result
}

/** Ondate di anticipo con cui le postazioni dietro le porte ricevono le armi più forti. */
export const PREMIUM_HEAD_START = 4

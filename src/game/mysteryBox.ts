import type { WeaponId } from './weapons'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const RARITIES: Record<Rarity, { name: string; color: number; weight: number; tierBonus: number }> = {
  common: { name: 'COMUNE', color: 0xb8c2d6, weight: 50, tierBonus: 0 },
  uncommon: { name: 'NON COMUNE', color: 0x6dff8a, weight: 28, tierBonus: 0 },
  rare: { name: 'RARA', color: 0x4fa8ff, weight: 14, tierBonus: 1 },
  epic: { name: 'EPICA', color: 0xb66bff, weight: 6, tierBonus: 1 },
  legendary: { name: 'LEGGENDARIA', color: 0xffc23d, weight: 2, tierBonus: 2 },
}

/** Rarità di ogni arma acquistabile in partita: le più forti sono rare. */
export const WEAPON_RARITY: Partial<Record<WeaponId, Rarity>> = {
  'smg-9': 'common',
  'sg-6': 'common',
  'ap-18': 'common',
  'r-44': 'uncommon',
  'vx-45': 'uncommon',
  'dmr-3': 'uncommon',
  'ak-74r': 'rare',
  'br-3': 'rare',
  'as-12': 'epic',
  'lmg-75': 'epic',
  'sr-50': 'legendary',
  'kr-90': 'rare',
  'hc-50': 'rare',
  'vk-12': 'epic',
  'ks-8': 'epic',
  'mg-3x': 'epic',
  'xr-1': 'legendary',
}

/** Prezzo fisso della cassa misteriosa (in crediti). */
export const MYSTERY_BOX_COST = 14

/**
 * Pesca un'arma dalla cassa: prima la rarità (le comuni escono spesso, le leggendarie di rado),
 * poi un'arma a caso di quella rarità. Se una rarità non ha armi disponibili si scende di livello.
 */
export function rollMysteryBox(random: () => number = Math.random, exclude: readonly WeaponId[] = []): { weapon: WeaponId; rarity: Rarity } {
  const order: Rarity[] = ['legendary', 'epic', 'rare', 'uncommon', 'common']
  const total = order.reduce((sum, rarity) => sum + RARITIES[rarity].weight, 0)
  let roll = Math.min(0.999999, Math.max(0, random())) * total
  let picked: Rarity = 'common'
  for (const rarity of order) {
    roll -= RARITIES[rarity].weight
    if (roll < 0) {
      picked = rarity
      break
    }
  }
  for (let index = order.indexOf(picked); index < order.length; index += 1) {
    const rarity = order[index]!
    const candidates = (Object.entries(WEAPON_RARITY) as [WeaponId, Rarity][]).filter(([weapon, value]) => value === rarity && !exclude.includes(weapon)).map(([weapon]) => weapon)
    if (candidates.length > 0) return { weapon: candidates[Math.floor(random() * candidates.length) % candidates.length]!, rarity }
  }
  return { weapon: 'smg-9', rarity: 'common' }
}

/** Armi delle postazioni dietro porte chiuse: solo epiche e leggendarie. */
export function isPremiumRarity(rarity: Rarity | undefined): boolean {
  return rarity === 'epic' || rarity === 'legendary'
}

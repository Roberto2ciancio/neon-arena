import { describe, expect, it } from 'vitest'
import { RARITIES, rollMysteryBox, WEAPON_RARITY } from './mysteryBox'
import type { Rarity } from './mysteryBox'

describe('cassa misteriosa', () => {
  it('le armi comuni escono spesso, le leggendarie di rado', () => {
    const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
    let seed = 1
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let index = 0; index < 20000; index += 1) counts[rollMysteryBox(random).rarity] += 1
    expect(counts.common).toBeGreaterThan(counts.uncommon)
    expect(counts.uncommon).toBeGreaterThan(counts.rare)
    expect(counts.rare).toBeGreaterThan(counts.epic)
    expect(counts.epic).toBeGreaterThan(counts.legendary)
    expect(counts.legendary / 20000).toBeGreaterThan(0.01)
    expect(counts.legendary / 20000).toBeLessThan(0.035)
  })

  it('restituisce un’arma della rarità pescata e rispetta le esclusioni', () => {
    expect(rollMysteryBox(() => 0)).toEqual({ weapon: 'sr-50', rarity: 'legendary' })
    const result = rollMysteryBox(() => 0, ['sr-50', 'xr-1'])
    expect(result.rarity).toBe('epic')
    expect(WEAPON_RARITY[result.weapon]).toBe('epic')
  })

  it('i pesi delle rarità sommano a 100', () => {
    expect(Object.values(RARITIES).reduce((sum, rarity) => sum + rarity.weight, 0)).toBe(100)
  })
})

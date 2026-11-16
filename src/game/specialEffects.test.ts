import { describe, expect, it } from 'vitest'
import {
  BURN_DURATION,
  getBurnDamagePerSecond,
  getChainLightningDamage,
  getChainTargetCount,
  getHeadshotExplosionDamage,
} from './specialEffects'

describe('effetti speciali', () => {
  it('scala il danno incendiario e mantiene la durata prevista', () => {
    expect(getBurnDamagePerSecond(0, 30)).toBe(0)
    expect(getBurnDamagePerSecond(2, 30)).toBeCloseTo(12)
    expect(BURN_DURATION).toBe(3)
  })

  it('aumenta il danno delle esplosioni sulle headshot', () => {
    expect(getHeadshotExplosionDamage(0, 30)).toBe(0)
    expect(getHeadshotExplosionDamage(1, 30)).toBe(60)
    expect(getHeadshotExplosionDamage(3, 30)).toBe(120)
  })

  it('aumenta danno e numero di bersagli della catena elettrica', () => {
    expect(getChainLightningDamage(0, 30)).toBe(0)
    expect(getChainLightningDamage(2, 30)).toBeCloseTo(24)
    expect(getChainTargetCount(0)).toBe(0)
    expect(getChainTargetCount(1)).toBe(2)
    expect(getChainTargetCount(3)).toBe(4)
  })
})

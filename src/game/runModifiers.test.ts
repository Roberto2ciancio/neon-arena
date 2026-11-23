import { describe, expect, it } from 'vitest'
import { getRewardMultiplier, getRunModifierEffects, MAX_REWARD_MULTIPLIER, normalizeRunModifiers, RUN_MODIFIER_IDS, toggleRunModifier } from './runModifiers'

describe('carte della run', () => {
  it('al massimo tre carte, senza doppioni né id sconosciuti', () => {
    expect(normalizeRunModifiers(['fast', 'fast', 'boh', 'giants', 'night', 'swarm'])).toEqual(['fast', 'giants', 'night'])
    expect(normalizeRunModifiers('x')).toEqual([])
    let chosen = toggleRunModifier([], 'fast')
    chosen = toggleRunModifier(chosen, 'giants')
    chosen = toggleRunModifier(chosen, 'night')
    expect(toggleRunModifier(chosen, 'swarm')).toEqual(chosen)
    expect(toggleRunModifier(chosen, 'fast')).toEqual(['giants', 'night'])
  })

  it('i moltiplicatori si combinano con un tetto', () => {
    expect(getRewardMultiplier([])).toBe(1)
    expect(getRewardMultiplier(['one-hit'])).toBe(2)
    expect(getRewardMultiplier(['one-hit', 'no-shop', 'fast'])).toBe(MAX_REWARD_MULTIPLIER)
    for (const id of RUN_MODIFIER_IDS) expect(getRewardMultiplier([id])).toBeGreaterThan(1)
  })

  it('gli effetti corrispondono alle carte', () => {
    const effects = getRunModifierEffects(['giants', 'fast', 'fragile'])
    expect(effects.zombieHealth).toBe(1.5)
    expect(effects.zombieSpeed).toBeCloseTo(0.9 * 1.3)
    expect(effects.maxHealth).toBe(0.5)
    expect(getRunModifierEffects([]).oneHit).toBe(false)
  })
})

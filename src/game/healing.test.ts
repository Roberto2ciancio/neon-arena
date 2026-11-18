import { describe, expect, it } from 'vitest'
import { getLowHealthWarning, getMedkitDropChance, getPassiveRegen, REGEN_DELAY } from './healing'

describe('cure e vita bassa', () => {
  it('i kit medici cadono più spesso quando si sta male, sempre dal Bruto', () => {
    expect(getMedkitDropChance('walker', 0.2)).toBeGreaterThan(getMedkitDropChance('walker', 0.9) * 2)
    expect(getMedkitDropChance('brute', 1)).toBe(1)
  })

  it('la rigenerazione parte dopo qualche secondo senza danni e si ferma a metà vita', () => {
    expect(getPassiveRegen(20, 100, REGEN_DELAY - 0.1, 1)).toBe(0)
    expect(getPassiveRegen(20, 100, REGEN_DELAY, 1)).toBeGreaterThan(0)
    expect(getPassiveRegen(49, 100, 10, 1)).toBeCloseTo(1)
    expect(getPassiveRegen(60, 100, 10, 1)).toBe(0)
    expect(getPassiveRegen(0, 100, 10, 1)).toBe(0)
  })

  it('l’avviso compare sotto il 35% e si intensifica, con battito più rapido', () => {
    expect(getLowHealthWarning(50, 100).intensity).toBe(0)
    const low = getLowHealthWarning(30, 100)
    const critical = getLowHealthWarning(5, 100)
    expect(low.intensity).toBeGreaterThan(0)
    expect(critical.intensity).toBeGreaterThan(low.intensity)
    expect(critical.heartbeatInterval).toBeLessThan(low.heartbeatInterval)
    expect(getLowHealthWarning(0, 100).intensity).toBe(0)
  })
})

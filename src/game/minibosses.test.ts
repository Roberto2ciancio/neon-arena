import { describe, expect, it } from 'vitest'
import { getMinibossForWave, getRegeneration, MINIBOSS, MINIBOSS_IDS, MINIBOSS_WAVES } from './minibosses'

describe('miniboss', () => {
  it('arrivano solo nelle ondate dedicate e sono diversi nella stessa run', () => {
    expect(getMinibossForWave(4, 1)).toBeNull()
    for (let seed = 0; seed < 6; seed += 1) {
      const ids = MINIBOSS_WAVES.map((wave) => getMinibossForWave(wave, seed))
      expect(new Set(ids).size).toBe(MINIBOSS_IDS.length)
    }
  })

  it('il Rigenerante si cura solo se non viene colpito per un po’', () => {
    expect(getRegeneration(MINIBOSS.regenDelay - 0.1, 1000, 1)).toBe(0)
    expect(getRegeneration(MINIBOSS.regenDelay, 1000, 1)).toBeCloseTo(1000 * MINIBOSS.regenShare)
  })
})

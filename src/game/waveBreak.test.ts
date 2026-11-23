import { describe, expect, it } from 'vitest'
import { chooseSupplyReward, getSupplyCredits, shouldDropSupplyCrate } from './waveBreak'

describe('cassa della pausa fra le ondate', () => {
  it('dà ciò che serve: cura se feriti, munizioni se a corto', () => {
    expect(chooseSupplyReward(0.3, 1)).toBe('heal')
    expect(chooseSupplyReward(1, 0.2)).toBe('ammo')
    expect(chooseSupplyReward(1, 1, () => 0.1)).toBe('credits')
  })

  it('crediti che crescono con l’ondata; niente cassa all’inizio e alla fine', () => {
    expect(getSupplyCredits(10)).toBeGreaterThan(getSupplyCredits(2))
    expect(shouldDropSupplyCrate(1, 15)).toBe(false)
    expect(shouldDropSupplyCrate(5, 15)).toBe(true)
    expect(shouldDropSupplyCrate(15, 15)).toBe(false)
  })
})

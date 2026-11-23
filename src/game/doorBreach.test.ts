import { describe, expect, it } from 'vitest'
import { distanceToDoor, getDoorHealth, getDoorHitDamage } from './doorBreach'

describe('porte sfondate', () => {
  it('le porte resistono di più nelle ondate avanzate e i boss le abbattono prima', () => {
    expect(getDoorHealth(10)).toBeGreaterThan(getDoorHealth(1))
    expect(getDoorHitDamage(20, true)).toBe(getDoorHitDamage(20, false) * 4)
    // Uno zombie da 12 danni impiega più di 20 colpi alla prima ondata: c'è tempo per reagire.
    expect(getDoorHealth(1) / getDoorHitDamage(12, false)).toBeGreaterThan(20)
  })

  it('misura la distanza dal rettangolo della porta', () => {
    const door = { minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1 }
    expect(distanceToDoor(0, 0, door)).toBe(0)
    expect(distanceToDoor(0, 1.1, door)).toBeCloseTo(1)
    expect(distanceToDoor(4, 0, door)).toBeCloseTo(3)
  })
})

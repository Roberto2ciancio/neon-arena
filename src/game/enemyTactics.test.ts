import { describe, expect, it } from 'vitest'
import { canBeRevived, getCoverHealth, getEscortPoint, pickRevivals, REVIVE, rollRareEvent } from './enemyTactics'

describe('tattiche dei nemici', () => {
  it('le coperture resistono di più nelle ondate avanzate', () => {
    expect(getCoverHealth(10)).toBeGreaterThan(getCoverHealth(1))
  })

  it('lo Scudiero si piazza fra lo Sputatore e il giocatore', () => {
    const point = getEscortPoint(0, 0, 10, 0)
    expect(point.x).toBeGreaterThan(0)
    expect(point.x).toBeLessThan(10)
    expect(point.z).toBe(0)
  })

  it('l’Urlatore rianima solo zombie comuni caduti da poco e vicini', () => {
    const corpses = [
      { kind: 'walker' as const, x: 2, y: 0, z: 0, time: 10 },
      { kind: 'runner' as const, x: 30, y: 0, z: 0, time: 10 },
      { kind: 'walker' as const, x: 1, y: 0, z: 1, time: 1 },
    ]
    expect(pickRevivals(corpses, 0, 0, 12).map((corpse) => corpse.x)).toEqual([2])
    expect(pickRevivals(corpses, 0, 0, 10 + REVIVE.window + 1)).toEqual([])
    expect(canBeRevived('brute')).toBe(false)
    expect(canBeRevived('bloater')).toBe(false)
    expect(canBeRevived('walker')).toBe(true)
  })

  it('evento raro circa una run su cinque, fra l’ondata 6 e la 12 e mai nei boss', () => {
    let count = 0
    let seed = 1
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (let run = 0; run < 2000; run += 1) {
      const event = rollRareEvent(random)
      if (!event) continue
      count += 1
      expect(event.wave).toBeGreaterThanOrEqual(6)
      expect(event.wave).toBeLessThanOrEqual(13)
      expect(event.wave % 5).not.toBe(0)
    }
    expect(count / 2000).toBeGreaterThan(0.15)
    expect(count / 2000).toBeLessThan(0.25)
  })
})

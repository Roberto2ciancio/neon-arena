import { describe, expect, it } from 'vitest'
import { COOP_MAX_ACTIVE_CAP, getCoopScaling, isTeamWiped, respawnAtWave, scaleMaxActive } from './coopRules'

describe('regole del co-op Zombie', () => {
  it('da solo non cambia nulla', () => {
    expect(getCoopScaling(1)).toEqual({ health: 1, spawnCount: 1, maxActive: 1, damage: 1, eliteBonus: 0, spawnInterval: 1 })
  })

  it('in due o più è nettamente più difficile, e cresce con ogni giocatore', () => {
    const two = getCoopScaling(2)
    const four = getCoopScaling(4)
    expect(two.health).toBeGreaterThanOrEqual(1.5)
    expect(two.spawnCount).toBeGreaterThanOrEqual(1.5)
    expect(four.health).toBeGreaterThan(two.health)
    expect(four.spawnCount).toBeGreaterThan(two.spawnCount)
    expect(four.spawnInterval).toBeLessThan(two.spawnInterval)
    expect(getCoopScaling(9)).toEqual(four)
  })

  it('limita gli zombie vivi anche in quattro', () => {
    expect(scaleMaxActive(24, 1)).toBe(24)
    expect(scaleMaxActive(24, 2)).toBeGreaterThan(24)
    expect(scaleMaxActive(30, 4)).toBe(COOP_MAX_ACTIVE_CAP)
  })

  it('la partita finisce solo quando nessuno è in piedi', () => {
    expect(isTeamWiped(['down', 'alive'])).toBe(false)
    expect(isTeamWiped(['down', 'dead'])).toBe(true)
    expect(isTeamWiped([])).toBe(false)
    expect(respawnAtWave('dead')).toBe('alive')
    expect(respawnAtWave('down')).toBe('down')
  })
})

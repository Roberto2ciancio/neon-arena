import { describe, expect, it } from 'vitest'
import { BRUTE_PHASES, getBossPhase, getLobVelocity, getShockwaveRadius, getTyrantSummons, GROUND_SLAM, isHitByShockwave, shouldSpawnTyrant } from './bosses'

describe('boss', () => {
  it('il Bruto cambia fase a due terzi e a un terzo della vita, diventando più aggressivo', () => {
    expect(getBossPhase(100, 100)).toBe(1)
    expect(getBossPhase(66, 100)).toBe(2)
    expect(getBossPhase(30, 100)).toBe(3)
    expect(BRUTE_PHASES[1].groundSlam).toBe(false)
    expect(BRUTE_PHASES[2].groundSlam).toBe(true)
    expect(BRUTE_PHASES[3].chargeCooldown).toBeLessThan(BRUTE_PHASES[1].chargeCooldown)
    expect(BRUTE_PHASES[3].coreExposed).toBeLessThan(BRUTE_PHASES[1].coreExposed)
  })

  it('l’onda d’urto si allarga fino al raggio massimo e si evita saltando', () => {
    expect(getShockwaveRadius(0)).toBe(0)
    expect(getShockwaveRadius(GROUND_SLAM.duration)).toBeCloseTo(GROUND_SLAM.maxRadius)
    expect(getShockwaveRadius(GROUND_SLAM.duration / 2)).toBeGreaterThan(GROUND_SLAM.maxRadius / 2)
    expect(isHitByShockwave(4, 4.2, true, 0)).toBe(true)
    expect(isHitByShockwave(4, 4.2, false, 0)).toBe(false)
    expect(isHitByShockwave(4, 6, true, 0)).toBe(false)
    expect(isHitByShockwave(4, 4, true, 2.5)).toBe(false)
  })

  it('il Tiranno compare solo a Distretto Zero nelle ondate boss dalla 10 e richiama più Striscianti quando è ferito', () => {
    expect(shouldSpawnTyrant('district-zero', 5)).toBe(false)
    expect(shouldSpawnTyrant('district-zero', 10)).toBe(true)
    expect(shouldSpawnTyrant('district-zero', 15)).toBe(true)
    expect(shouldSpawnTyrant('district-zero', 12)).toBe(false)
    expect(shouldSpawnTyrant('station-13', 10)).toBe(false)
    expect(getTyrantSummons(1)).toBe(0)
    expect(getTyrantSummons(3)).toBeGreaterThan(getTyrantSummons(2))
  })

  it('il lancio in parabola arriva sul bersaglio', () => {
    const gravity = 18
    const lob = getLobVelocity(12, -1, 5, 16, gravity)
    const x = lob.x * lob.time
    const z = lob.z * lob.time
    const y = lob.y * lob.time - 0.5 * gravity * lob.time ** 2
    expect(x).toBeCloseTo(12)
    expect(z).toBeCloseTo(5)
    expect(y).toBeCloseTo(-1)
  })
})

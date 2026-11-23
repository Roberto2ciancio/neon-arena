import { describe, expect, it } from 'vitest'
import { DOOR_LOCK, hasToxicCloud, isBoxCursed, isInsideToxicCloud, shouldLockDoor, stepToxicCloud, TOXIC_CLOUD } from './mapHazards'
import { getActiveSynergies, getNewSynergies, SYNERGIES } from './synergies'
import { applyUpgrade, createBaseStats, UPGRADE_BY_ID } from './upgrades'

describe('mappe che cambiano', () => {
  it('la nube tossica compare in alcune ondate e avanza piano senza superare il bersaglio', () => {
    expect(hasToxicCloud(6)).toBe(true)
    expect(hasToxicCloud(5)).toBe(false)
    const step = stepToxicCloud(0, 0, 10, 0, 1)
    expect(step.x).toBeCloseTo(TOXIC_CLOUD.speed)
    expect(stepToxicCloud(9.9, 0, 10, 0, 1).x).toBe(10)
    expect(isInsideToxicCloud(3, 0, 0, 0)).toBe(true)
    expect(isInsideToxicCloud(TOXIC_CLOUD.radius + 1, 0, 0, 0)).toBe(false)
  })

  it('porte bloccate solo dall’ottava ondata, mai nei boss; cassa maledetta dalla quarta', () => {
    expect(shouldLockDoor(DOOR_LOCK.firstWave - 1, 15, () => 0)).toBe(false)
    expect(shouldLockDoor(10, 15, () => 0)).toBe(false)
    expect(shouldLockDoor(9, 15, () => 0)).toBe(true)
    expect(shouldLockDoor(9, 15, () => 0.99)).toBe(false)
    expect(isBoxCursed(3, () => 0)).toBe(false)
    expect(isBoxCursed(6, () => 0)).toBe(true)
  })
})

describe('sinergie', () => {
  it('si attivano con entrambi i potenziamenti e si annunciano una volta', () => {
    expect(getActiveSynergies(['incendiary'])).toEqual([])
    expect(getActiveSynergies(['incendiary', 'demolition'])).toEqual(['wildfire'])
    expect(getNewSynergies(['incendiary'], 'demolition')).toEqual(['wildfire'])
    expect(getNewSynergies(['incendiary', 'demolition'], 'demolition')).toEqual([])
    // Le chiavi di una Map sono un iteratore: devono funzionare lo stesso.
    expect(getNewSynergies(new Map([['incendiary', 1]]).keys(), 'demolition')).toEqual(['wildfire'])
    for (const synergy of Object.values(SYNERGIES)) for (const upgrade of synergy.requires) expect(UPGRADE_BY_ID.has(upgrade)).toBe(true)
  })
})

describe('potenziamenti con un costo', () => {
  it('ogni compromesso ha un vantaggio e uno svantaggio misurabili', () => {
    const base = createBaseStats()
    const glass = applyUpgrade(base, 'glass-cannon')
    expect(glass.damage).toBeGreaterThan(base.damage)
    expect(glass.maxHealth).toBeLessThan(base.maxHealth)
    expect(glass.regenBlocked).toBe(true)
    const greed = applyUpgrade(base, 'greed')
    expect(greed.creditMultiplier).toBe(2)
    expect(greed.zombieSpeed).toBeGreaterThan(1)
    const overclock = applyUpgrade(base, 'overclock')
    expect(overclock.fireRate).toBeGreaterThan(base.fireRate)
    expect(overclock.reloadTime).toBeGreaterThan(base.reloadTime)
    const plating = applyUpgrade(base, 'heavy-plating')
    expect(plating.armor).toBeGreaterThan(base.armor)
    expect(plating.speed).toBeLessThan(base.speed)
    for (const id of ['glass-cannon', 'greed', 'overclock', 'heavy-plating']) expect(UPGRADE_BY_ID.get(id)!.isAvailable(applyUpgrade(base, id))).toBe(false)
  })
})

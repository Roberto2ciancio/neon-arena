import { describe, expect, it } from 'vitest'
import { getWeaponUpgradeCost, normalizeArmory, upgradeWeapon } from './armory'
import { POWER_UP_DROP_CHANCE, POWER_UPS, rollPowerUp } from './powerups'

describe('bonus lasciati dagli zombie', () => {
  it('cadono di rado dagli zombie comuni e sempre dal Bruto', () => {
    expect(rollPowerUp('walker', () => POWER_UP_DROP_CHANCE + 0.01)).toBeNull()
    expect(rollPowerUp('walker', () => 0)).not.toBeNull()
    expect(rollPowerUp('brute', () => 0.99)).not.toBeNull()
  })

  it('non duplica un bonus già attivo o a terra', () => {
    const active = new Set(Object.keys(POWER_UPS).filter((id) => id !== 'barrier') as (keyof typeof POWER_UPS)[])
    expect(rollPowerUp('brute', () => 0.5, active)).toBe('barrier')
    expect(rollPowerUp('brute', () => 0.5, new Set(Object.keys(POWER_UPS) as (keyof typeof POWER_UPS)[]))).toBeNull()
  })
})

describe('potenziamento delle armi nell’armeria', () => {
  it('spende frammenti crescenti fino al livello massimo', () => {
    let state = normalizeArmory({ level: 10 })
    expect(getWeaponUpgradeCost(state, 'ar-07')).toBe(6)
    expect(upgradeWeapon(state, 'ar-07', 5)).toBeNull()
    let spent = 0
    for (let level = 0; level < 5; level += 1) {
      const result = upgradeWeapon(state, 'ar-07', 1000)!
      state = result.state
      spent += result.cost
    }
    expect(state.weaponLevels['ar-07']).toBe(5)
    expect(spent).toBe(6 + 12 + 20 + 32 + 48)
    expect(upgradeWeapon(state, 'ar-07', 1000)).toBeNull()
    expect(normalizeArmory({ weaponLevels: { 'ar-07': 9, laser: 2, 'p-12': -1 } }).weaponLevels).toEqual({ 'ar-07': 5 })
  })
})

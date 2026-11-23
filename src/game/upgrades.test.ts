import { describe, expect, it } from 'vitest'
import { applyUpgrade, createBaseStats, FIRST_LEVEL_XP, getNextLevelXp, getUpgradeChoices, UPGRADE_BY_ID } from './upgrades'

describe('upgrade della run', () => {
  it('offre tre scelte diverse senza superare i limiti', () => {
    const stats = { ...createBaseStats(), projectileCount: 5, pierce: 4 }
    const choices = getUpgradeChoices(stats, () => 0)

    expect(choices).toHaveLength(3)
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(3)
    expect(choices.some((choice) => choice.id === 'multishot' || choice.id === 'pierce')).toBe(false)
  })

  it('applica il potenziamento senza mutare le statistiche precedenti', () => {
    const stats = createBaseStats()
    const upgraded = applyUpgrade(stats, 'damage')

    expect(upgraded.damage).toBeCloseTo(stats.damage * 1.12)
    expect(stats.damage).toBe(20)
  })

  it('applica i bonus permanenti alle statistiche iniziali', () => {
    const stats = createBaseStats({ vitality: 2, power: 2, mobility: 2 })

    expect(stats.maxHealth).toBe(112)
    expect(stats.damage).toBeCloseTo(21.2)
    expect(stats.speed).toBeCloseTo(7.4 * 1.04)
  })

  it('sblocca gli effetti speciali solo dopo i prerequisiti', () => {
    const stats = createBaseStats()
    expect(UPGRADE_BY_ID.get('headshot-explosion')?.isAvailable(stats)).toBe(false)
    expect(UPGRADE_BY_ID.get('chain-lightning')?.isAvailable(stats)).toBe(false)

    const incendiary = applyUpgrade(stats, 'incendiary')
    const critical = applyUpgrade(stats, 'critical')
    expect(UPGRADE_BY_ID.get('headshot-explosion')?.isAvailable(incendiary)).toBe(true)
    expect(UPGRADE_BY_ID.get('chain-lightning')?.isAvailable(critical)).toBe(true)
  })

  it('limita gli effetti speciali a tre livelli', () => {
    const stats = {
      ...createBaseStats(),
      incendiary: 3,
      headshotExplosion: 3,
      chainLightning: 3,
      critChance: 0.65,
    }
    expect(UPGRADE_BY_ID.get('incendiary')?.isAvailable(stats)).toBe(false)
    expect(UPGRADE_BY_ID.get('headshot-explosion')?.isAvailable(stats)).toBe(false)
    expect(UPGRADE_BY_ID.get('chain-lightning')?.isAvailable(stats)).toBe(false)
  })

  it('mantiene disponibili le scelte anche a build avanzata', () => {
    const stats = {
      ...createBaseStats(),
      projectileCount: 5,
      pierce: 4,
      critChance: 0.65,
      armor: 12,
    }
    const choices = getUpgradeChoices(stats)

    expect(choices).toHaveLength(3)
    expect(choices.every((choice) => choice.isAvailable(stats))).toBe(true)
  })
})

describe('curva di livello', () => {
  it('richiede piu esperienza a ogni livello', () => {
    expect(FIRST_LEVEL_XP).toBe(90)
    const second = getNextLevelXp(FIRST_LEVEL_XP)
    expect(second).toBe(130)
    expect(getNextLevelXp(second)).toBeGreaterThan(second * 1.4)
  })
})

describe('potenziamenti aggiuntivi', () => {
  it('sono nel catalogo con effetti e limiti', () => {
    let stats = createBaseStats()
    for (const id of ['quick-reload', 'lifesteal', 'adrenaline', 'demolition', 'executioner', 'luck', 'second-wind', 'energy-shield']) {
      expect(UPGRADE_BY_ID.get(id)?.isAvailable(stats), id).toBe(true)
    }
    stats = applyUpgrade(stats, 'quick-reload')
    expect(stats.reloadTime).toBeCloseTo(0.88)
    stats = applyUpgrade(applyUpgrade(stats, 'quick-reload'), 'quick-reload')
    expect(UPGRADE_BY_ID.get('quick-reload')?.isAvailable(stats)).toBe(false)
    stats = applyUpgrade(stats, 'second-wind')
    expect(UPGRADE_BY_ID.get('second-wind')?.isAvailable(stats)).toBe(false)
    stats = applyUpgrade(applyUpgrade(stats, 'energy-shield'), 'energy-shield')
    expect(stats.energyShield).toBe(50)
    expect(UPGRADE_BY_ID.get('energy-shield')?.isAvailable(stats)).toBe(false)
  })

  it('Fortuna aumenta la probabilità dei bonus', async () => {
    const { rollPowerUp, POWER_UP_DROP_CHANCE } = await import('./powerups')
    const justAbove = () => POWER_UP_DROP_CHANCE * 1.2
    expect(rollPowerUp('walker', justAbove)).toBeNull()
    expect(rollPowerUp('walker', justAbove, new Set(), 1.5)).not.toBeNull()
  })
})

describe('potenziamenti della mobilità', () => {
  const offered = (module: string) => {
    const stats = { ...createBaseStats(), mobilityModule: module }
    const ids = new Set<string>()
    for (let seed = 0; seed < 400; seed += 1) {
      let value = seed / 400
      for (const choice of getUpgradeChoices(stats, () => { value = (value * 9301 + 0.4927) % 1; return value }, 3)) ids.add(choice.id)
    }
    return ids
  }

  it('escono solo con un modulo adatto', () => {
    const none = offered('')
    for (const id of ['double-charge', 'kinetic-recharge', 'explosive-landing', 'wall-frenzy']) expect(none.has(id)).toBe(false)
    const dash = offered('dash')
    expect(dash.has('double-charge')).toBe(true)
    expect(dash.has('kinetic-recharge')).toBe(true)
    expect(dash.has('wall-frenzy')).toBe(false)
    const wall = offered('wall-run')
    expect(wall.has('wall-frenzy')).toBe(true)
    expect(wall.has('double-charge')).toBe(false)
  })

  it('applicano cariche, ricarica e atterraggio esplosivo una sola volta', () => {
    let stats = { ...createBaseStats(), mobilityModule: 'slam' }
    stats = applyUpgrade(stats, 'double-charge')
    stats = applyUpgrade(stats, 'kinetic-recharge')
    stats = applyUpgrade(stats, 'explosive-landing')
    expect(stats.mobilityCharges).toBe(1)
    expect(stats.mobilityKillRecharge).toBeGreaterThan(0)
    expect(stats.explosiveLanding).toBe(1)
    for (const id of ['double-charge', 'kinetic-recharge', 'explosive-landing']) expect(UPGRADE_BY_ID.get(id)!.isAvailable(stats)).toBe(false)
  })
})

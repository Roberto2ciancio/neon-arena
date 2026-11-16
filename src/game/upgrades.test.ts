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

    expect(upgraded.damage).toBeCloseTo(stats.damage * 1.2)
    expect(stats.damage).toBe(20)
  })

  it('applica i bonus permanenti alle statistiche iniziali', () => {
    const stats = createBaseStats({ vitality: 2, power: 2, mobility: 2 })

    expect(stats.maxHealth).toBe(120)
    expect(stats.damage).toBeCloseTo(22)
    expect(stats.speed).toBeCloseTo(7.4 * 1.06)
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

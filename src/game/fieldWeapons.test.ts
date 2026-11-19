import { describe, expect, it } from 'vitest'
import { FIELD_WEAPON_POOL, getFieldTier, getFieldWeaponCost, rollStationWeapons } from './fieldWeapons'
import { resolveWeapon } from './attachments'
import { MAPS } from './maps'
import { WEAPONS } from './weapons'

const stationIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

describe('armi delle postazioni a rotazione', () => {
  it('è riproducibile: stessa mappa e ondata danno le stesse armi', () => {
    expect(rollStationWeapons('station-13', stationIds, 4)).toEqual(rollStationWeapons('station-13', stationIds, 4))
  })

  it('cambia arma in ogni postazione da un’ondata all’altra', () => {
    for (let wave = 2; wave <= 15; wave += 1) {
      const before = rollStationWeapons('depot-06', stationIds, wave - 1)
      const after = rollStationWeapons('depot-06', stationIds, wave)
      for (const id of stationIds) expect(after[id], `ondata ${wave} postazione ${id}`).not.toBe(before[id])
    }
  })

  it('non ripete armi finché il catalogo lo permette e rispetta l’ondata di sblocco', () => {
    const early = rollStationWeapons('district-zero', stationIds.slice(0, 4), 1)
    expect(new Set(Object.values(early)).size).toBe(4)
    for (const weapon of Object.values(early)) expect(FIELD_WEAPON_POOL.find((entry) => entry.weapon === weapon)!.firstWave).toBe(1)
    const late = rollStationWeapons('district-zero', stationIds, 12)
    expect(new Set(Object.values(late)).size).toBe(stationIds.length)
  })

  it('con più postazioni che armi distribuisce i doppioni in modo uniforme', () => {
    for (const map of ['station-13', 'port-09', 'lab-21']) {
      const counts = new Map<string, number>()
      for (const weapon of Object.values(rollStationWeapons(map, stationIds, 1))) counts.set(weapon, (counts.get(weapon) ?? 0) + 1)
      expect(Math.max(...counts.values()), map).toBeLessThanOrEqual(2)
      expect(counts.size, map).toBeGreaterThanOrEqual(5)
    }
  })

  it('alza grado e prezzo con le ondate', () => {
    expect([1, 4, 5, 9, 10, 15].map(getFieldTier)).toEqual([1, 1, 2, 2, 3, 3])
    expect(getFieldWeaponCost(10, 1)).toBe(10)
    expect(getFieldWeaponCost(10, 3)).toBeGreaterThan(getFieldWeaponCost(10, 2))
    const mk2 = resolveWeapon(WEAPONS['ak-74r'], {}, { fieldTier: 1 })
    const mk4 = resolveWeapon(WEAPONS['ak-74r'], {}, { fieldTier: 3 })
    expect(mk4.damage).toBeGreaterThan(mk2.damage)
    expect(mk4.magazineSize).toBeGreaterThan(mk2.magazineSize)
    expect(mk4.shortName).toBe('AK-74R MK IV')
  })

  it('ogni mappa ha almeno 8 postazioni d’arma', () => {
    for (const map of MAPS) expect(map.stations.filter((station) => station.kind === 'weapon').length, map.name).toBeGreaterThanOrEqual(8)
  })

  it('le armi più forti si trovano solo dietro le porte chiuse', async () => {
    const { WEAPON_RARITY, isPremiumRarity } = await import('./mysteryBox')
    const premium = new Set(['h'])
    for (let wave = 1; wave <= 15; wave += 1) {
      const rolled = rollStationWeapons('station-13', stationIds, wave, premium)
      for (const id of stationIds.slice(0, 7)) expect(isPremiumRarity(WEAPON_RARITY[rolled[id]!]), `ondata ${wave}`).toBe(false)
      expect(isPremiumRarity(WEAPON_RARITY[rolled.h!]), `ondata ${wave}`).toBe(true)
    }
  })
})

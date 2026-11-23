import { describe, expect, it } from 'vitest'
import { findLorePoint, getLoreForMap, LORE, loadFoundLore, saveFoundLore } from './lore'
import { createNavigation, createStaticSolids } from './mapGeometry'
import { MAPS } from './maps'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('storia a frammenti', () => {
  it('tre registrazioni per ogni mappa, con id unici e testi completi', () => {
    for (const map of MAPS) expect(getLoreForMap(map.id)).toHaveLength(3)
    expect(new Set(LORE.map((entry) => entry.id)).size).toBe(LORE.length)
    for (const entry of LORE) {
      expect(entry.title).toBe(entry.title.toUpperCase())
      expect(entry.text.length).toBeGreaterThan(60)
    }
  })

  it('ogni registrazione ha un punto libero e raggiungibile, sempre lo stesso', () => {
    for (const map of MAPS) {
      const solids = createStaticSolids(map)
      const navigation = createNavigation(map)
      const isFree = (x: number, z: number) => navigation.areaHeightOf({ x, y: 0, z }) === 0
        && solids.every(({ box }) => box.min.y > 2 || x + 0.8 < box.min.x || x - 0.8 > box.max.x || z + 0.8 < box.min.z || z - 0.8 > box.max.z)
      for (const entry of getLoreForMap(map.id)) {
        const point = findLorePoint(entry.id, map.arenaLimit, isFree)
        expect(point, entry.id).not.toBeNull()
        expect(findLorePoint(entry.id, map.arenaLimit, isFree)).toEqual(point)
      }
    }
  })

  it('l’archivio salva solo id conosciuti', () => {
    const storage = memory()
    saveFoundLore(storage, ['lab-21-1', 'lab-21-1'])
    storage.setItem('neon-arena:lore:v1', JSON.stringify(['lab-21-1', 'falso']))
    expect(loadFoundLore(storage)).toEqual(['lab-21-1'])
  })
})

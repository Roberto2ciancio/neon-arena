import { describe, expect, it } from 'vitest'
import { createNavigation, createStaticSolids, getMapStructures } from './mapGeometry'
import { EVACUATION } from './objectives'
import { MAPS } from './maps'

/**
 * Criterio della Fase C: con i moduli di mobilità il giocatore arriva ovunque, quindi ogni
 * piano calpestabile delle strutture deve essere raggiungibile dagli zombie a piedi
 * (scale e porte). I punti fuori da questi piani sono coperti dalla regola "fuori portata".
 */
describe('mappe senza rifugi irraggiungibili', () => {
  for (const map of MAPS) {
    it(`${map.name}: ogni piano è collegato al terreno`, () => {
      const navigation = createNavigation(map)
      const { areas } = getMapStructures(map)
      const start = { x: map.playerSpawn.x, y: 0, z: map.playerSpawn.z }
      expect(navigation.areaHeightOf(start)).toBe(0)
      for (const area of areas) {
        // Un punto del piano fuori dai vani scala, appena dentro il bordo.
        const candidates = [0.25, 0.5, 0.75].flatMap((u) => [0.25, 0.5, 0.75].map((v) => ({
          x: area.minX + (area.maxX - area.minX) * u,
          y: area.y,
          z: area.minZ + (area.maxZ - area.minZ) * v,
        })))
        const point = candidates.find((candidate) => navigation.areaOf(candidate) === area.id)
        expect(point, `${area.id} senza punti calpestabili`).toBeDefined()
        expect(navigation.findPath(start, point!).length, `${area.id} irraggiungibile`).toBeGreaterThan(0)
      }
    })
  }
})

describe('obiettivi delle mappe in spazio libero', () => {
  for (const map of MAPS) {
    it(`${map.name}: zona di estrazione${map.generator ? ' e generatore' : ''} sul terreno e senza ostacoli`, () => {
      const solids = createStaticSolids(map)
      const navigation = createNavigation(map)
      const free = (x: number, z: number, radius: number) => solids.every(({ box }) => box.min.y > 3 || x + radius < box.min.x || x - radius > box.max.x || z + radius < box.min.z || z - radius > box.max.z)
      expect(free(map.extraction.x, map.extraction.z, EVACUATION.radius)).toBe(true)
      expect(navigation.areaHeightOf({ x: map.extraction.x, y: 0, z: map.extraction.z })).toBe(0)
      expect(Math.max(Math.abs(map.extraction.x), Math.abs(map.extraction.z)) + EVACUATION.radius).toBeLessThan(map.arenaLimit)
      if (map.generator) expect(free(map.generator.x, map.generator.z, 1.6)).toBe(true)
    })
  }
})

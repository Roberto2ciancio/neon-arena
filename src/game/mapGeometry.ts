import * as THREE from 'three'
import type { CollisionObstacle } from './collision'
import { setTerrainPits } from './world'
import type { MapDefinition } from './maps'
import { NavigationGraph } from './navigation'
import { expandStructures } from './structures'
import type { ExpandedStructures } from './structures'
import { expandUnderground } from './underground'
import type { ExpandedUnderground } from './underground'

const structureCache = new Map<string, ExpandedStructures>()
const undergroundCache = new Map<string, ExpandedUnderground>()

/** Sottosuolo espanso della mappa (vuoto se non ne ha). */
export function getMapUnderground(map: MapDefinition): ExpandedUnderground {
  const cached = undergroundCache.get(map.id)
  if (cached) return cached
  const underground = expandUnderground(map.underground ?? [])
  undergroundCache.set(map.id, underground)
  return underground
}

/**
 * Strutture espanse della mappa (edifici e sottosuolo), con i collegamenti delle porte
 * acquistabili marcati.
 */
export function getMapStructures(map: MapDefinition): ExpandedStructures {
  const cached = structureCache.get(map.id)
  if (cached) return cached
  const structures = expandStructures(map.buildings)
  const underground = getMapUnderground(map)
  structures.boxes.push(...underground.boxes)
  structures.areas.push(...underground.areas)
  structures.links.push(...underground.links)
  structures.lights.push(...underground.lights)
  for (const door of map.doors) {
    const linkId = door.building
      ? `${door.building.id}-door-${door.building.side}`
      : door.underground ? `${door.underground.id}-entrance-${door.underground.entrance}` : null
    const link = linkId ? structures.links.find((candidate) => candidate.id === linkId) : undefined
    if (link) link.doorId = door.id
  }
  structureCache.set(map.id, structures)
  return structures
}

function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ))
}

/** Solidi statici: ostacoli della mappa e parti degli edifici (porte escluse). */
export function createStaticSolids(map: MapDefinition): CollisionObstacle[] {
  const solids: CollisionObstacle[] = map.obstacles.map((definition) => ({
    id: definition.id,
    box: box(
      definition.x - definition.width / 2, 0, definition.z - definition.depth / 2,
      definition.x + definition.width / 2, definition.height, definition.z + definition.depth / 2,
    ),
  }))
  for (const part of getMapStructures(map).boxes) {
    solids.push({ id: part.id, box: box(part.min[0], part.min[1], part.min[2], part.max[0], part.max[1], part.max[2]) })
  }
  // Il pavimento implicito scende nelle fosse del sottosuolo (solo per questa lista di solidi).
  setTerrainPits(solids, getMapUnderground(map).pits)
  return solids
}

export function createDoorSolid(door: MapDefinition['doors'][number]): CollisionObstacle {
  return {
    id: door.id,
    box: box(door.x - door.width / 2, 0, door.z - door.depth / 2, door.x + door.width / 2, door.height, door.z + door.depth / 2),
  }
}

export function createNavigation(map: MapDefinition): NavigationGraph {
  const structures = getMapStructures(map)
  return new NavigationGraph(structures.areas, structures.links)
}

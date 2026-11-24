import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { CollisionObstacle } from './collision'
import { MAPS } from './maps'
import { createDoorSolid, createNavigation, createStaticSolids, getMapStructures, getMapUnderground } from './mapGeometry'
import { advanceWaypoints, NavigationGraph } from './navigation'
import { expandStructures, FLOOR_HEIGHT, GROUND_AREA } from './structures'
import type { BuildingDefinition, NavPoint } from './structures'
import { getTeamSpawn } from './tctRules'
import { getGroundHeight, moveBody, resolveBodyCollisions, setTerrainPits, STAND_HEIGHT, steerBody } from './world'
import type { Body } from './world'

const HOUSE: BuildingDefinition = { id: 'house', kind: 'building', x: 0, z: 0, width: 10, depth: 9, floors: 2, doors: ['south', 'east'], style: 'brick' }
const TOWER: BuildingDefinition = { id: 'tower', kind: 'tower', x: 20, z: 0, width: 6, depth: 8, floors: 2, doors: [], style: 'industrial' }

function toSolids(definitions: readonly BuildingDefinition[]): CollisionObstacle[] {
  return expandStructures(definitions).boxes.map((part) => ({
    id: part.id,
    box: new THREE.Box3(new THREE.Vector3(...part.min), new THREE.Vector3(...part.max)),
  }))
}

/** Cammina da un punto all'altro seguendo il percorso di navigazione, come farebbe uno zombie. */
function followPath(start: NavPoint | { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }, graph: NavigationGraph, solids: CollisionObstacle[], arenaLimit = 60): Body {
  const body: Body = { position: new THREE.Vector3(start.x, start.y, start.z), velocityY: 0, grounded: true }
  const delta = 1 / 30
  let waypoints = graph.findPath(body.position, goal)
  let replan = 0
  for (let frame = 0; frame < 30 * 60; frame += 1) {
    replan -= delta
    if (replan <= 0 && !(graph.isOnStairs(body.position) && waypoints.length > 0)) {
      waypoints = graph.findPath(body.position, goal)
      replan = 0.5
    }
    advanceWaypoints(body.position, waypoints)
    const target = waypoints[0] ?? goal
    const direction = new THREE.Vector3(target.x - body.position.x, 0, target.z - body.position.z)
    if (direction.length() < 0.3 && waypoints.length === 0) break
    const steering = steerBody(body.position, direction, 0.42, STAND_HEIGHT, solids)
    moveBody(body, steering.multiplyScalar(4 * delta), delta, 0.42, STAND_HEIGHT, solids, arenaLimit)
  }
  return body
}

describe('edifici procedurali', () => {
  it('genera piani, scale, aree e collegamenti per ogni livello', () => {
    const structures = expandStructures([HOUSE])
    expect(structures.areas.map((area) => area.id)).toEqual(['house-0', 'house-1', 'house-2'])
    expect(structures.links.filter((link) => link.id.includes('stair'))).toHaveLength(2)
    expect(structures.links.filter((link) => link.id.includes('door'))).toHaveLength(2)
    expect(structures.boxes.filter((part) => part.kind === 'stair')).toHaveLength(20)
    expect(structures.windows.length).toBeGreaterThan(4)
  })

  it('dal terreno si raggiunge il tetto camminando lungo porte e scale', () => {
    const solids = toSolids([HOUSE])
    const structures = expandStructures([HOUSE])
    const graph = new NavigationGraph(structures.areas, structures.links)
    const roof = { x: 2, y: 2 * FLOOR_HEIGHT, z: 1 }
    const body = followPath({ x: 0, y: 0, z: 12 }, roof, graph, solids)
    expect(body.position.y).toBeCloseTo(roof.y, 3)
    expect(Math.hypot(body.position.x - roof.x, body.position.z - roof.z)).toBeLessThan(1)
  })

  it('dal tetto si torna in strada', () => {
    const solids = toSolids([HOUSE])
    const structures = expandStructures([HOUSE])
    const graph = new NavigationGraph(structures.areas, structures.links)
    const body = followPath({ x: 2, y: 2 * FLOOR_HEIGHT, z: 1 }, { x: 0, y: 0, z: 12 }, graph, solids)
    expect(body.position.y).toBe(0)
    expect(body.position.z).toBeGreaterThan(10)
  })

  it('le torri aperte hanno pianerottoli raggiungibili dal terreno', () => {
    const solids = toSolids([TOWER])
    const structures = expandStructures([TOWER])
    const graph = new NavigationGraph(structures.areas, structures.links)
    const top = { x: 19, y: 2 * FLOOR_HEIGHT, z: -2 }
    const body = followPath({ x: 14, y: 0, z: 6 }, top, graph, solids)
    expect(body.position.y).toBeCloseTo(top.y, 3)
  })

  it('una porta chiusa esclude il collegamento dal percorso', () => {
    const structures = expandStructures([{ ...HOUSE, doors: ['south'] }])
    structures.links.find((link) => link.id === 'house-door-south')!.doorId = 'locked'
    const graph = new NavigationGraph(structures.areas, structures.links)
    expect(graph.findPath({ x: 0, y: 0, z: 12 }, { x: 0, y: 0, z: 0 }, () => false)).toEqual([])
    expect(graph.findPath({ x: 0, y: 0, z: 12 }, { x: 0, y: 0, z: 0 }, () => true).length).toBeGreaterThan(0)
  })
})

describe('mappe', () => {
  for (const map of MAPS) {
    describe(map.name, () => {
      const solids = createStaticSolids(map)
      const doors = map.doors.map(createDoorSolid)
      const all = [...solids, ...doors]
      setTerrainPits(all, getMapUnderground(map).pits)

      it('ha identificatori unici e geometria dentro i confini', () => {
        const ids = [...map.obstacles.map((obstacle) => obstacle.id), ...map.buildings.map((building) => building.id), ...map.doors.map((door) => door.id), ...map.stations.map((station) => station.id)]
        expect(new Set(ids).size).toBe(ids.length)
        for (const { box } of all) {
          expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x))).toBeLessThanOrEqual(map.arenaLimit + 0.01)
          expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThanOrEqual(map.arenaLimit + 0.01)
        }
      })

      it('ha spawn liberi per la modalità zombie e per entrambe le squadre TCT', () => {
        const points = [
          new THREE.Vector3(map.playerSpawn.x, 0, map.playerSpawn.z),
          ...[0, 1, 2, 3].flatMap((slot) => (['alpha', 'bravo'] as const).map((team) => {
            const spawn = getTeamSpawn(team, slot, map.arenaLimit)
            return new THREE.Vector3(spawn.x, 0, spawn.z)
          })),
        ]
        for (const point of points) {
          expect(resolveBodyCollisions(point.clone(), 0.42, STAND_HEIGHT, all).distanceTo(point)).toBe(0)
        }
      })

      it('posiziona le postazioni su pavimenti raggiungibili e liberi', () => {
        const graph = createNavigation(map)
        for (const station of map.stations) {
          const ground = getGroundHeight(station.x, station.z, station.y + 0.1, 0.42, all)
          expect(ground, station.id).toBeCloseTo(station.y, 3)
          const free = new THREE.Vector3(station.x, station.y, station.z)
          expect(resolveBodyCollisions(free.clone(), 0.42, STAND_HEIGHT, all).distanceTo(free), station.id).toBeLessThan(0.05)
          const area = graph.areaOf(free)
          if (station.y > 0) expect(area, station.id).not.toBe(GROUND_AREA)
        }
      })

      it('le scale non attraversano ringhiere, parapetti o colonne', () => {
        const parts = expandStructures(map.buildings).boxes
        const stairs = parts.filter((part) => part.kind === 'stair')
        const blockers = parts.filter((part) => part.kind === 'railing' || part.kind === 'parapet' || part.kind === 'column')
        const overlaps = (a: typeof parts[number], b: typeof parts[number]) => [0, 1, 2].every((axis) => a.min[axis]! < b.max[axis]! - 0.001 && b.min[axis]! < a.max[axis]! - 0.001)
        for (const stair of stairs) {
          const hit = blockers.find((blocker) => blocker.buildingId === stair.buildingId && overlaps(stair, blocker))
          expect(hit?.id, stair.id).toBeUndefined()
        }
      })

      it('ogni piano e tetto è raggiungibile a piedi dallo spawn', () => {
        const graph = createNavigation(map)
        const structures = getMapStructures(map)
        const spawn = { x: map.playerSpawn.x, y: 0, z: map.playerSpawn.z }
        for (const area of structures.areas) {
          const goal = { x: (area.minX + area.maxX) / 2, y: area.y, z: (area.minZ + area.maxZ) / 2 }
          const free = resolveBodyCollisions(new THREE.Vector3(goal.x, goal.y, goal.z), 0.42, STAND_HEIGHT, solids)
          const body = followPath(spawn, { x: free.x, y: free.y, z: free.z }, graph, solids, map.arenaLimit)
          expect(body.position.y, area.id).toBeCloseTo(area.y, 2)
        }
      })
    })
  }
})

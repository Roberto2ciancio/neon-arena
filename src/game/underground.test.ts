import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { CollisionObstacle } from './collision'
import { advanceWaypoints, NavigationGraph } from './navigation'
import { GROUND_AREA } from './structures'
import { expandUnderground, getUndergroundStairSteps, subtractRects, UNDERGROUND_SLAB_TOP } from './underground'
import type { UndergroundDefinition } from './underground'
import { getGroundHeight, getTerrainHeight, isStreetLevel, moveBody, setTerrainPits, STAND_HEIGHT, steerBody, STEP_HEIGHT } from './world'
import type { Body } from './world'

const METRO: UndergroundDefinition = {
  id: 'metro', name: 'METRO', minX: -10, maxX: 10, minZ: -5, maxZ: 5, depth: 4.2,
  entrances: [{ x: -6, z: -4.4, direction: 'south' }, { x: 9.4, z: 1, direction: 'west' }],
}

function build(definition = METRO): { solids: CollisionObstacle[]; graph: NavigationGraph } {
  const expanded = expandUnderground([definition])
  const solids = expanded.boxes.map((part) => ({ id: part.id, box: new THREE.Box3(new THREE.Vector3(...part.min), new THREE.Vector3(...part.max)) }))
  setTerrainPits(solids, expanded.pits)
  return { solids, graph: new NavigationGraph(expanded.areas, expanded.links) }
}

function followPath(start: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }, graph: NavigationGraph, solids: CollisionObstacle[]): Body {
  const body: Body = { position: new THREE.Vector3(start.x, start.y, start.z), velocityY: 0, grounded: true }
  const delta = 1 / 30
  let waypoints = graph.findPath(body.position, goal)
  let replan = 0
  for (let frame = 0; frame < 30 * 60; frame += 1) {
    replan -= delta
    if (replan <= 0) {
      waypoints = graph.findPath(body.position, goal)
      replan = 0.5
    }
    advanceWaypoints(body.position, waypoints)
    const target = waypoints[0] ?? goal
    const direction = new THREE.Vector3(target.x - body.position.x, 0, target.z - body.position.z)
    if (direction.length() < 0.3 && waypoints.length === 0) break
    const steering = steerBody(body.position, direction, 0.42, STAND_HEIGHT, solids)
    moveBody(body, steering.multiplyScalar(4 * delta), delta, 0.42, STAND_HEIGHT, solids, 60)
  }
  return body
}

describe('livello sotterraneo', () => {
  it('sottrae più fori da un rettangolo senza sovrapposizioni', () => {
    const parts = subtractRects({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, [{ minX: 2, maxX: 4, minZ: 2, maxZ: 4 }, { minX: 6, maxX: 8, minZ: 0, maxZ: 3 }])
    const area = parts.reduce((sum, part) => sum + (part.maxX - part.minX) * (part.maxZ - part.minZ), 0)
    expect(area).toBeCloseTo(100 - 4 - 6)
  })

  it('la strada sopra resta a quota 0, sotto il pavimento scende', () => {
    const { solids } = build()
    expect(getTerrainHeight(0, 0, solids)).toBe(-4.2)
    expect(getTerrainHeight(30, 0, solids)).toBe(0)
    // Sulla soletta si cammina come in strada; sotto, il pavimento è il fondo della fossa.
    expect(getGroundHeight(0, 0, 0, 0.42, solids)).toBeCloseTo(UNDERGROUND_SLAB_TOP)
    expect(getGroundHeight(0, 0, -4.2, 0.42, solids)).toBe(-4.2)
    expect(isStreetLevel(0, 0, 0.42, solids)).toBe(true)
    // Nel vano scala non si fa comparire nulla.
    expect(isStreetLevel(-6, -2, 0.42, solids)).toBe(false)
    // Altre liste di solidi (un'altra partita) non vedono la fossa.
    expect(getTerrainHeight(0, 0, [])).toBe(0)
  })

  it('i gradini salgono di meno di un passo', () => {
    const steps = getUndergroundStairSteps(4.2)
    expect((4.2 + UNDERGROUND_SLAB_TOP) / steps).toBeLessThan(STEP_HEIGHT)
  })

  it('uno zombie scende dalla strada al sottosuolo e risale', () => {
    const { solids, graph } = build()
    expect(graph.areaOf({ x: 0, y: UNDERGROUND_SLAB_TOP, z: 0 })).toBe(GROUND_AREA)
    expect(graph.areaOf({ x: 0, y: -4.2, z: 0 })).toBe('metro-0')
    const down = followPath({ x: -6, y: 0, z: -12 }, { x: 4, y: -4.2, z: 0 }, graph, solids)
    expect(down.position.y).toBeCloseTo(-4.2, 2)
    expect(Math.hypot(down.position.x - 4, down.position.z)).toBeLessThan(1)
    const up = followPath({ x: 4, y: -4.2, z: 0 }, { x: 20, y: 0, z: 0 }, graph, solids)
    expect(up.position.y).toBe(0)
    expect(up.position.x).toBeGreaterThan(18)
  })

  it('le ringhiere impediscono di cadere nel vano dai lati', () => {
    const { solids } = build()
    // Si cammina verso il vano scala da est, di traverso: la ringhiera ferma il corpo in strada.
    const body: Body = { position: new THREE.Vector3(-2, UNDERGROUND_SLAB_TOP, -2), velocityY: 0, grounded: true }
    for (let frame = 0; frame < 90; frame += 1) moveBody(body, new THREE.Vector3(-4 / 30, 0, 0), 1 / 30, 0.42, STAND_HEIGHT, solids, 60)
    expect(body.position.y).toBeCloseTo(UNDERGROUND_SLAB_TOP)
    expect(body.position.x).toBeGreaterThan(-4.9)
  })
})

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { resolveCircleCollisions } from './collision'
import type { CollisionObstacle } from './collision'
import { DEPOT_06, DISTRICT_ZERO, STATION_13 } from './maps'

describe('Stazione 13', () => {
  it('ha identificatori unici e ostacoli dentro i confini', () => {
    const ids = STATION_13.obstacles.map((obstacle) => obstacle.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const obstacle of STATION_13.obstacles) {
      expect(Math.abs(obstacle.x) + obstacle.width / 2).toBeLessThan(STATION_13.arenaLimit)
      expect(Math.abs(obstacle.z) + obstacle.depth / 2).toBeLessThan(STATION_13.arenaLimit)
      expect(obstacle.height).toBeGreaterThan(0)
    }
  })

  it('definisce una porta valida nella sala centrale', () => {
    expect(STATION_13.doors).toHaveLength(1)
    const door = STATION_13.doors[0]
    expect(door?.id).toBe('supply-gate')
    expect(door?.cost).toBeGreaterThan(0)
    expect(Math.abs((door?.x ?? 0) + (door?.width ?? 0) / 2)).toBeLessThan(STATION_13.arenaLimit)
    expect(Math.abs((door?.z ?? 0) + (door?.depth ?? 0) / 2)).toBeLessThan(STATION_13.arenaLimit)
  })

  it('Deposito 06 ha tre corsie, identificatori unici e spawn libero', () => {
    const ids = DEPOT_06.obstacles.map((obstacle) => obstacle.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(DEPOT_06.obstacles.some((obstacle) => obstacle.id.startsWith('west-container'))).toBe(true)
    expect(DEPOT_06.obstacles.some((obstacle) => obstacle.id.startsWith('center-cover'))).toBe(true)
    expect(DEPOT_06.obstacles.some((obstacle) => obstacle.id.startsWith('east-container'))).toBe(true)

    const obstacles = DEPOT_06.obstacles.map((obstacle) => ({
      id: obstacle.id,
      box: new THREE.Box3(
        new THREE.Vector3(obstacle.x - obstacle.width / 2, 0, obstacle.z - obstacle.depth / 2),
        new THREE.Vector3(obstacle.x + obstacle.width / 2, obstacle.height, obstacle.z + obstacle.depth / 2),
      ),
    }))
    const spawn = new THREE.Vector3(DEPOT_06.playerSpawn.x, 0, DEPOT_06.playerSpawn.z)
    expect(resolveCircleCollisions(spawn.clone(), 0.42, obstacles).distanceTo(spawn)).toBe(0)
  })

  it('Distretto Zero ha edifici attraversabili, spawn libero e identificatori unici', () => {
    const ids = DISTRICT_ZERO.obstacles.map((obstacle) => obstacle.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(DISTRICT_ZERO.obstacles.filter((obstacle) => obstacle.id.includes('building')).length).toBeGreaterThanOrEqual(16)
    const obstacles = DISTRICT_ZERO.obstacles.map((obstacle) => ({
      id: obstacle.id,
      box: new THREE.Box3(
        new THREE.Vector3(obstacle.x - obstacle.width / 2, 0, obstacle.z - obstacle.depth / 2),
        new THREE.Vector3(obstacle.x + obstacle.width / 2, obstacle.height, obstacle.z + obstacle.depth / 2),
      ),
    }))
    const spawn = new THREE.Vector3(DISTRICT_ZERO.playerSpawn.x, 0, DISTRICT_ZERO.playerSpawn.z)
    expect(resolveCircleCollisions(spawn.clone(), 0.42, obstacles).distanceTo(spawn)).toBe(0)
    const entrance = new THREE.Vector3(-13, 0, -5)
    expect(resolveCircleCollisions(entrance.clone(), 0.42, obstacles).distanceTo(entrance)).toBe(0)
  })

  it('ha uno spawn iniziale libero', () => {
    const obstacles: CollisionObstacle[] = STATION_13.obstacles.map((obstacle) => ({
      id: obstacle.id,
      box: new THREE.Box3(
        new THREE.Vector3(obstacle.x - obstacle.width / 2, 0, obstacle.z - obstacle.depth / 2),
        new THREE.Vector3(obstacle.x + obstacle.width / 2, obstacle.height, obstacle.z + obstacle.depth / 2),
      ),
    }))
    const spawn = new THREE.Vector3(STATION_13.playerSpawn.x, 0, STATION_13.playerSpawn.z)
    const resolved = resolveCircleCollisions(spawn.clone(), 0.42, obstacles)

    expect(resolved.distanceTo(spawn)).toBe(0)
  })
})

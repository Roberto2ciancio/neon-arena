import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { CollisionObstacle } from './collision'
import { getGroundHeight, hasHeadroom, moveBody, STAND_HEIGHT, STEP_HEIGHT } from './world'
import type { Body } from './world'

const solid = (id: string, min: [number, number, number], max: [number, number, number]): CollisionObstacle => ({
  id,
  box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
})

function createBody(x = 0, y = 0, z = 0): Body {
  return { position: new THREE.Vector3(x, y, z), velocityY: 0, grounded: true }
}

function walk(body: Body, direction: THREE.Vector3, seconds: number, solids: CollisionObstacle[], speed = 5): void {
  const delta = 1 / 60
  for (let time = 0; time < seconds; time += delta) {
    moveBody(body, direction.clone().multiplyScalar(speed * delta), delta, 0.42, STAND_HEIGHT, solids, 50)
  }
}

describe('fisica verticale', () => {
  it('sale i gradini bassi ma viene fermato dai muri', () => {
    const step = solid('step', [1, 0, -2], [3, STEP_HEIGHT - 0.05, 2])
    const wall = solid('wall', [5, 0, -2], [6, 2.5, 2])
    const body = createBody()
    walk(body, new THREE.Vector3(1, 0, 0), 2, [step, wall])
    expect(body.position.x).toBeLessThan(5 - 0.4)
    expect(body.position.x).toBeGreaterThan(4)
    // Scesa dal gradino il corpo torna a terra.
    expect(body.position.y).toBe(0)
  })

  it('sale una scala fino al piano superiore e ci resta sopra', () => {
    const solids: CollisionObstacle[] = []
    for (let index = 1; index <= 10; index += 1) {
      solids.push(solid(`step-${index}`, [index * 0.42, 0, -0.7], [(index + 1) * 0.42, index * 0.32, 0.7]))
    }
    solids.push(solid('floor', [4.62, 2.95, -3], [30, 3.2, 3]))
    const body = createBody()
    walk(body, new THREE.Vector3(1, 0, 0), 3, solids)
    expect(body.position.y).toBeCloseTo(3.2, 5)
    expect(body.position.x).toBeGreaterThan(6)
  })

  it('cade dai bordi e segnala la velocità di atterraggio', () => {
    const roof = solid('roof', [-2, 2.9, -2], [2, 3.2, 2])
    const body = createBody(0, 3.2, 0)
    const delta = 1 / 60
    let landing = 0
    for (let frame = 0; frame < 120; frame += 1) {
      const result = moveBody(body, new THREE.Vector3(5 * delta, 0, 0), delta, 0.42, STAND_HEIGHT, [roof], 50)
      landing = Math.max(landing, result.landingSpeed)
    }
    expect(body.position.y).toBe(0)
    expect(body.grounded).toBe(true)
    expect(landing).toBeGreaterThan(5)
  })

  it('il soffitto ferma il salto e limita il rialzarsi', () => {
    const ceiling = solid('ceiling', [-3, 2.2, -3], [3, 2.5, 3])
    const body = createBody()
    body.velocityY = 8
    body.grounded = false
    for (let frame = 0; frame < 30; frame += 1) moveBody(body, new THREE.Vector3(), 1 / 60, 0.42, STAND_HEIGHT, [ceiling], 50)
    expect(body.position.y + STAND_HEIGHT).toBeLessThanOrEqual(2.2 + 1e-6)
    expect(hasHeadroom(new THREE.Vector3(0, 0, 0), 0.42, 2.4, [ceiling])).toBe(false)
    expect(hasHeadroom(new THREE.Vector3(0, 0, 0), 0.42, STAND_HEIGHT, [ceiling])).toBe(true)
  })

  it('ignora le piattaforme troppo alte per il gradino', () => {
    const crate = solid('crate', [-1, 0, -1], [1, 1.2, 1])
    expect(getGroundHeight(0, 0, 0, 0.42, [crate])).toBe(0)
    expect(getGroundHeight(0, 0, 1.2, 0.42, [crate])).toBe(1.2)
  })
})

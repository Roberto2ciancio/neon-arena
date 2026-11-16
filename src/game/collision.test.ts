import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { raycastObstacles, resolveCircleCollisions, steerAroundObstacles } from './collision'
import type { CollisionObstacle } from './collision'

const wall: CollisionObstacle = {
  id: 'test-wall',
  box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1)),
}
const obstacles = [wall]

describe('collisioni con gli ostacoli', () => {
  it('spinge un cerchio fuori dal lato della copertura', () => {
    const position = new THREE.Vector3(1.2, 0, 0)
    resolveCircleCollisions(position, 0.5, obstacles)

    expect(position.x).toBeCloseTo(1.5)
    expect(position.z).toBeCloseTo(0)
  })

  it('estrae un personaggio il cui centro è dentro un ostacolo', () => {
    const position = new THREE.Vector3(0.8, 0, 0)
    resolveCircleCollisions(position, 0.4, obstacles)

    expect(position.x).toBeCloseTo(1.4)
  })

  it('non modifica una posizione libera', () => {
    const position = new THREE.Vector3(4, 0, 4)
    resolveCircleCollisions(position, 0.4, obstacles)

    expect(position.toArray()).toEqual([4, 0, 4])
  })

  it('trova la distanza di un muro colpito da un raggio', () => {
    const distance = raycastObstacles(
      new THREE.Vector3(-4, 1, 0),
      new THREE.Vector3(1, 0, 0),
      10,
      obstacles,
    )

    expect(distance).toBeCloseTo(3)
  })

  it('non colpisce un ostacolo quando il raggio passa sopra', () => {
    const distance = raycastObstacles(
      new THREE.Vector3(-4, 3, 0),
      new THREE.Vector3(1, 0, 0),
      10,
      obstacles,
    )

    expect(distance).toBeNull()
  })

  it('sceglie una deviazione quando il percorso diretto è bloccato', () => {
    const direction = steerAroundObstacles(
      new THREE.Vector3(-2.5, 0, 0),
      new THREE.Vector3(1, 0, 0),
      0.5,
      obstacles,
    )

    expect(direction.x).toBeLessThan(1)
    expect(Math.abs(direction.z)).toBeGreaterThan(0)
  })
})

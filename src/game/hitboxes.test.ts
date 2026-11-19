import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getSoldierHitboxes, intersectRayCapsule } from './hitboxes'

const shoot = (height: number, lateral = 0) => new THREE.Ray(new THREE.Vector3(lateral, height, 10), new THREE.Vector3(0, 0, -1))

function firstZone(ray: THREE.Ray, crouched = false): string | null {
  const feet = new THREE.Vector3(0, 0, 0)
  const head = new THREE.Vector3(0, crouched ? 1.2 : 1.65, 0)
  let best: { zone: string; distance: number } | null = null
  for (const box of getSoldierHitboxes(feet, head, crouched)) {
    const distance = intersectRayCapsule(ray, box.a, box.b, box.radius)
    if (distance !== null && (!best || distance < best.distance)) best = { zone: box.zone, distance }
  }
  return best?.zone ?? null
}

describe('hitbox dei giocatori TCT', () => {
  it('copre il corpo dai piedi alla testa senza buchi sotto il busto', () => {
    for (let height = 0.12; height <= 1.85; height += 0.08) expect(firstZone(shoot(height)), `quota ${height.toFixed(2)}`).not.toBeNull()
  })

  it('distingue gambe, busto e testa', () => {
    expect(firstZone(shoot(0.4))).toBe('legs')
    expect(firstZone(shoot(1.2))).toBe('body')
    expect(firstZone(shoot(1.68))).toBe('head')
  })

  it('manca chi spara accanto o sopra la testa', () => {
    expect(firstZone(shoot(1, 0.8))).toBeNull()
    expect(firstZone(shoot(2.2))).toBeNull()
  })

  it('in accovacciata le zone si abbassano', () => {
    expect(firstZone(shoot(1.55), true)).toBeNull()
    expect(firstZone(shoot(0.3), true)).toBe('legs')
  })
})

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createSurfaceLookup, getGroundSolidId, getMapGroundSurface, STRIDE, StepTracker } from './footsteps'
import type { StepInput } from './footsteps'
import { MAPS } from './maps'
import type { MapDefinition } from './maps'

const walk = (distance: number, overrides: Partial<StepInput> = {}): StepInput => ({
  distance, grounded: true, sprinting: false, crouched: false, sliding: false, landingSpeed: 0, ...overrides,
})

describe('passi per superficie', () => {
  it('il suolo dipende dal meteo della mappa', () => {
    const byId = new Map(MAPS.map((map) => [map.id, getMapGroundSurface(map)]))
    expect(byId.get('district-zero')).toBe('wet')
    expect(byId.get('depot-06')).toBe('gravel')
    expect(byId.get('station-13')).toBe('concrete')
    expect(byId.get('lab-21')).toBe('dirt')
  })

  it('riconosce ostacoli e strutture dall’id', () => {
    const map = {
      theme: undefined,
      obstacles: [{ id: 'box-1', x: 0, z: 0, width: 1, height: 1, depth: 1, style: 'crate' }, { id: 'c-1', x: 0, z: 0, width: 1, height: 1, depth: 1, style: 'container' }],
      buildings: [
        { id: 'tower-a', kind: 'tower', x: 0, z: 0, width: 8, depth: 8, floors: 2, doors: [], style: 'concrete' },
        { id: 'office', kind: 'building', x: 0, z: 0, width: 8, depth: 8, floors: 2, doors: [], style: 'brick' },
      ],
    } as unknown as MapDefinition
    const surfaceAt = createSurfaceLookup(map)
    expect(surfaceAt(null)).toBe('concrete')
    expect(surfaceAt('box-1')).toBe('wood')
    expect(surfaceAt('c-1')).toBe('metal')
    expect(surfaceAt('tower-a-floor-3')).toBe('metal')
    expect(surfaceAt('office-floor-2')).toBe('tile')
    expect(surfaceAt('office-stair-1')).toBe('concrete')
    expect(surfaceAt('sconosciuto')).toBe('concrete')
  })

  it('trova il solido sotto i piedi solo quando ci si è sopra', () => {
    const solids = [
      { id: 'basso', box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1)) },
      { id: 'alto', box: new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.5, 1)) },
    ]
    expect(getGroundSolidId(0, 0, 0, 0.45, solids)).toBeNull()
    expect(getGroundSolidId(0, 0, 1, 0.45, solids)).toBe('basso')
    expect(getGroundSolidId(0, 0, 2.5, 0.45, solids)).toBe('alto')
    expect(getGroundSolidId(5, 5, 1, 0.45, solids)).toBeNull()
  })

  it('un passo ogni falcata, più lungo e forte in corsa, nessuno in aria o in scivolata', () => {
    const tracker = new StepTracker()
    expect(tracker.update(walk(1))).toBeNull()
    expect(tracker.update(walk(STRIDE.walk - 1))?.volume).toBeCloseTo(0.62)
    expect(tracker.update(walk(STRIDE.walk, { sprinting: true }))).toBeNull()
    expect(tracker.update(walk(STRIDE.sprint - STRIDE.walk + 0.01, { sprinting: true }))?.volume).toBeCloseTo(0.9)
    expect(tracker.update(walk(5, { grounded: false }))).toBeNull()
    expect(tracker.update(walk(5, { sliding: true }))).toBeNull()
    expect(tracker.update(walk(STRIDE.crouch, { crouched: true }))?.volume).toBeCloseTo(0.3)
  })

  it('l’atterraggio fa un passo pesante proporzionato alla caduta', () => {
    const tracker = new StepTracker()
    expect(tracker.update(walk(0, { landingSpeed: 2 }))).toBeNull()
    const soft = tracker.update(walk(0, { landingSpeed: 5 }))!
    const hard = tracker.update(walk(0, { landingSpeed: 12 }))!
    expect(soft.landing).toBe(true)
    expect(hard.volume).toBeGreaterThan(soft.volume)
    expect(hard.volume).toBeLessThanOrEqual(1)
  })
})

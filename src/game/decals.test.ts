import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DecalEffects } from './decals'

describe('decal dei proiettili', () => {
  it('limita i decal attivi a 24', () => {
    const scene = new THREE.Scene()
    const effects = new DecalEffects(scene)
    for (let index = 0; index < 30; index += 1) effects.spawn(new THREE.Vector3(index, 1, 0), new THREE.Vector3(index, 1, 2))
    expect(scene.children).toHaveLength(24)
    effects.dispose()
    expect(scene.children).toHaveLength(0)
  })

  it('rimuove i decal scaduti', () => {
    const scene = new THREE.Scene()
    const effects = new DecalEffects(scene)
    effects.spawn(new THREE.Vector3(), new THREE.Vector3(0, 0, 2))
    effects.update(12.1)
    expect(scene.children).toHaveLength(0)
    effects.dispose()
  })
})

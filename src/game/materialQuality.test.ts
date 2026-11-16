import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { setLambertMaterials } from './materialQuality'

describe('materiali del preset basso', () => {
  it('usa Lambert conservando aspetto di base e ripristina il materiale PBR', () => {
    const original = new THREE.MeshStandardMaterial({ color: 0x345678, emissive: 0x123456, emissiveIntensity: 1.4, roughness: 0.3 })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original)
    const root = new THREE.Group().add(mesh)

    setLambertMaterials(root, true)
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial)
    expect(mesh.material.color.getHex()).toBe(0x345678)
    expect(mesh.material.emissive.getHex()).toBe(0x123456)
    expect(mesh.material.emissiveIntensity).toBe(1.4)

    const lambert = mesh.material
    setLambertMaterials(root, true)
    expect(mesh.material).toBe(lambert)
    setLambertMaterials(root, false)
    expect(mesh.material).toBe(original)

    mesh.geometry.dispose()
    original.dispose()
    lambert.dispose()
  })
})

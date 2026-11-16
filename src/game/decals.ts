import * as THREE from 'three'

interface Decal {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  life: number
}

export class DecalEffects {
  private readonly geometry = new THREE.CircleGeometry(0.075, 10)
  private readonly decals: Decal[] = []

  constructor(private readonly scene: THREE.Scene) {}

  spawn(position: THREE.Vector3, viewer: THREE.Vector3): void {
    if (this.decals.length >= 24) this.remove(0)
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({
      color: 0x080b0f,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }))
    mesh.position.copy(position)
    mesh.position.addScaledVector(viewer.clone().sub(position).normalize(), 0.012)
    mesh.lookAt(viewer)
    this.scene.add(mesh)
    this.decals.push({ mesh, life: 12 })
  }

  update(delta: number): void {
    for (let index = this.decals.length - 1; index >= 0; index -= 1) {
      const decal = this.decals[index]
      if (!decal) continue
      decal.life -= delta
      decal.mesh.material.opacity = Math.min(0.88, decal.life * 0.44)
      if (decal.life <= 0) this.remove(index)
    }
  }

  clear(): void {
    for (let index = this.decals.length - 1; index >= 0; index -= 1) this.remove(index)
  }

  dispose(): void {
    this.clear()
    this.geometry.dispose()
  }

  private remove(index: number): void {
    const decal = this.decals[index]
    if (!decal) return
    this.scene.remove(decal.mesh)
    decal.mesh.material.dispose()
    this.decals.splice(index, 1)
  }
}

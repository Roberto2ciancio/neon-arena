import * as THREE from 'three'
import type { GraphicsQuality } from './graphics'
import { BLOOD_POOL_LIMIT, DEBRIS_LIMIT } from './killFeel'

interface Debris {
  object: THREE.Object3D
  velocity: THREE.Vector3
  spin: THREE.Vector3
  groundY: number
  life: number
  baseScale: THREE.Vector3
  resting: boolean
}

interface BloodPool {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  life: number
  size: number
  growth: number
}

const DEBRIS_LIFE = 3
const POOL_LIFE = 14
const POOL_OPACITY = 0.82
/** Il pool massimo serve al preset alto; i preset più leggeri ne usano una parte. */
const MAX_POOLS = BLOOD_POOL_LIMIT.high

/**
 * Arti staccati e macchie di sangue a terra. Gli arti sono copie delle parti del modello
 * (stesse geometrie e materiali, già compilati), le macchie vengono da un pool fisso creato
 * all'avvio: durante la partita non nasce nessun materiale nuovo e nessuno shader.
 */
export class GoreSystem {
  private readonly debris: Debris[] = []
  private readonly pools: BloodPool[] = []
  private readonly idlePools: BloodPool[] = []
  private readonly poolGeometry = new THREE.CircleGeometry(1, 18)
  private quality: GraphicsQuality = 'medium'
  private readonly scratchPosition = new THREE.Vector3()
  private readonly scratchQuaternion = new THREE.Quaternion()
  private readonly scratchScale = new THREE.Vector3()

  constructor(private readonly scene: THREE.Scene) {
    for (let index = 0; index < MAX_POOLS; index += 1) {
      const mesh = new THREE.Mesh(this.poolGeometry, new THREE.MeshBasicMaterial({
        color: 0x5a0b12,
        transparent: true,
        opacity: POOL_OPACITY,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }))
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 1
      this.scene.add(mesh)
      this.idlePools.push({ mesh, life: 0, size: 1, growth: 0 })
    }
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality
    while (this.debris.length > DEBRIS_LIMIT[quality]) this.removeDebris(0)
    while (this.pools.length > BLOOD_POOL_LIMIT[quality]) this.releasePool(0)
  }

  /** Stacca una parte: la nasconde nel modello e lancia una copia nel mondo. */
  detach(part: THREE.Object3D, impulse: THREE.Vector3, groundY: number): void {
    if (!part.visible) return
    if (this.debris.length >= DEBRIS_LIMIT[this.quality]) this.removeDebris(0)
    part.updateWorldMatrix(true, false)
    part.matrixWorld.decompose(this.scratchPosition, this.scratchQuaternion, this.scratchScale)
    const copy = part.clone()
    copy.position.copy(this.scratchPosition)
    copy.quaternion.copy(this.scratchQuaternion)
    copy.scale.copy(this.scratchScale)
    copy.visible = true
    part.visible = false
    this.scene.add(copy)
    this.debris.push({
      object: copy,
      velocity: impulse.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5)),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14),
      groundY,
      life: DEBRIS_LIFE,
      baseScale: this.scratchScale.clone(),
      resting: false,
    })
  }

  /** Macchia a terra che si allarga per un attimo e sfuma dopo qualche secondo. */
  splat(position: THREE.Vector3, groundY: number, size: number, color: number): void {
    const limit = BLOOD_POOL_LIMIT[this.quality]
    if (this.pools.length >= limit) this.releasePool(0)
    const pool = this.idlePools.pop()
    if (!pool) return
    pool.mesh.position.set(position.x, groundY + 0.025 + Math.random() * 0.01, position.z)
    pool.mesh.rotation.z = Math.random() * Math.PI * 2
    pool.mesh.material.color.setHex(color)
    pool.mesh.material.opacity = POOL_OPACITY
    pool.mesh.scale.setScalar(size * 0.2)
    pool.mesh.visible = true
    pool.size = size * (0.8 + Math.random() * 0.4)
    pool.growth = 0
    pool.life = POOL_LIFE
    this.pools.push(pool)
  }

  update(delta: number): void {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const piece = this.debris[index]!
      piece.life -= delta
      if (!piece.resting) {
        piece.velocity.y -= 18 * delta
        piece.object.position.addScaledVector(piece.velocity, delta)
        piece.object.rotation.x += piece.spin.x * delta
        piece.object.rotation.y += piece.spin.y * delta
        piece.object.rotation.z += piece.spin.z * delta
        if (piece.object.position.y <= piece.groundY + 0.08) {
          piece.object.position.y = piece.groundY + 0.08
          // Rimbalzo smorzato, poi resta a terra.
          if (Math.abs(piece.velocity.y) < 2.2) {
            piece.resting = true
          } else {
            piece.velocity.y = -piece.velocity.y * 0.3
            piece.velocity.x *= 0.55
            piece.velocity.z *= 0.55
            piece.spin.multiplyScalar(0.5)
          }
        }
      }
      // Negli ultimi istanti si rimpicciolisce: i materiali sono condivisi, niente dissolvenza.
      if (piece.life < 0.5) piece.object.scale.copy(piece.baseScale).multiplyScalar(Math.max(0.01, piece.life / 0.5))
      if (piece.life <= 0) this.removeDebris(index)
    }
    for (let index = this.pools.length - 1; index >= 0; index -= 1) {
      const pool = this.pools[index]!
      pool.life -= delta
      if (pool.growth < 1) {
        pool.growth = Math.min(1, pool.growth + delta * 2.5)
        const eased = 1 - (1 - pool.growth) ** 3
        pool.mesh.scale.setScalar(pool.size * (0.2 + eased * 0.8))
      }
      if (pool.life < 3) pool.mesh.material.opacity = POOL_OPACITY * Math.max(0, pool.life / 3)
      if (pool.life <= 0) this.releasePool(index)
    }
  }

  /** Rende visibili le macchie davanti alla telecamera per un frame di preriscaldamento. */
  prewarm(origin: THREE.Vector3, forward: THREE.Vector3): () => void {
    const sample = this.idlePools.slice(-2)
    for (const [index, pool] of sample.entries()) {
      pool.mesh.position.copy(origin).addScaledVector(forward, 4 + index)
      pool.mesh.position.y = 0.03
      pool.mesh.scale.setScalar(0.5)
      pool.mesh.visible = true
    }
    return () => {
      for (const pool of sample) pool.mesh.visible = false
    }
  }

  clear(): void {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) this.removeDebris(index)
    for (let index = this.pools.length - 1; index >= 0; index -= 1) this.releasePool(index)
  }

  dispose(): void {
    this.clear()
    for (const pool of this.idlePools) {
      this.scene.remove(pool.mesh)
      pool.mesh.material.dispose()
    }
    this.idlePools.length = 0
    this.poolGeometry.dispose()
  }

  get debrisCount(): number {
    return this.debris.length
  }

  get poolCount(): number {
    return this.pools.length
  }

  private removeDebris(index: number): void {
    const piece = this.debris[index]
    if (!piece) return
    // Geometrie e materiali sono del modello originale: si toglie solo l'oggetto dalla scena.
    this.scene.remove(piece.object)
    this.debris.splice(index, 1)
  }

  private releasePool(index: number): void {
    const pool = this.pools[index]
    if (!pool) return
    pool.mesh.visible = false
    this.pools.splice(index, 1)
    this.idlePools.push(pool)
  }
}

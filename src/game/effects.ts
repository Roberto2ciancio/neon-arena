import * as THREE from 'three'

interface TimedMesh {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  life: number
  maxLife: number
  velocity: THREE.Vector3
  growth: number
  baseScale: number
  gravity: number
  fade: 'linear' | 'late'
  spin: number
}

interface TimedLight {
  light: THREE.PointLight
  life: number
  maxLife: number
  intensity: number
}

const MAX_LIGHTS = 4

/**
 * Effetti speciali condivisi: esplosioni con palla di fuoco, onda d'urto, fumo, schegge e
 * bruciatura a terra; lampi di luce e scintille d'impatto. Geometrie condivise e luci
 * riciclate per non pesare sulle prestazioni.
 */
export class CombatEffects {
  private readonly items: TimedMesh[] = []
  private readonly lights: TimedLight[] = []
  private readonly sphere = new THREE.IcosahedronGeometry(1, 2)
  private readonly smokeGeometry = new THREE.IcosahedronGeometry(1, 1)
  private readonly shard = new THREE.TetrahedronGeometry(0.06)
  private readonly ring = new THREE.RingGeometry(0.82, 1, 48)
  private readonly disc = new THREE.CircleGeometry(1, 32)
  private readonly spark = new THREE.BoxGeometry(0.03, 0.03, 0.22)
  private lightsEnabled = true

  constructor(private readonly scene: THREE.Scene) {
    for (let index = 0; index < MAX_LIGHTS; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 14, 1.6)
      this.scene.add(light)
      this.lights.push({ light, life: 0, maxLife: 1, intensity: 0 })
    }
  }

  setLightsEnabled(enabled: boolean): void {
    this.lightsEnabled = enabled
    // Visibilità cambiata solo con il preset: durante la partita il numero di luci resta fisso.
    for (const entry of this.lights) {
      entry.light.visible = enabled
      if (!enabled) entry.light.intensity = 0
    }
  }

  private add(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, options: Partial<Omit<TimedMesh, 'mesh'>> & { life: number }): void {
    this.scene.add(mesh)
    this.items.push({
      mesh,
      life: options.life,
      maxLife: options.life,
      velocity: options.velocity ?? new THREE.Vector3(),
      growth: options.growth ?? 0,
      baseScale: options.baseScale ?? mesh.scale.x,
      gravity: options.gravity ?? 0,
      fade: options.fade ?? 'linear',
      spin: options.spin ?? 0,
    })
  }

  flash(position: THREE.Vector3, color: number, intensity: number, life: number, distance = 14): void {
    if (!this.lightsEnabled) return
    const entry = this.lights.find((candidate) => candidate.life <= 0)
      ?? this.lights.reduce((oldest, candidate) => (candidate.life < oldest.life ? candidate : oldest))
    entry.light.color.setHex(color)
    entry.light.distance = distance
    entry.light.position.copy(position)
    entry.life = life
    entry.maxLife = life
    entry.intensity = intensity
  }

  /** Esplosione completa: palla di fuoco, onda d'urto, fumo, schegge, scintille e bruciatura. */
  explosion(position: THREE.Vector3, radius: number, color = 0xffa04a, groundY = 0): void {
    const center = position.clone()
    const core = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
    core.position.copy(center)
    core.scale.setScalar(radius * 0.08)
    this.add(core, { life: 0.16, growth: radius * 0.32, fade: 'linear' })
    const fireball = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
    fireball.position.copy(center)
    fireball.scale.setScalar(radius * 0.12)
    this.add(fireball, { life: 0.42, growth: radius * 0.42, velocity: new THREE.Vector3(0, 1.4, 0), fade: 'late' })
    for (let index = 0; index < 5; index += 1) {
      // Lingue di fuoco irregolari attorno al nucleo.
      const flame = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0xff7a2a : 0xffb347, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }))
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).normalize()
      flame.position.copy(center)
      flame.scale.setScalar(radius * 0.07)
      this.add(flame, { life: 0.35 + Math.random() * 0.2, growth: radius * 0.18, velocity: direction.multiplyScalar(radius * 0.9), fade: 'late' })
    }

    const shockwave = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color: 0xffd9a1, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    shockwave.rotation.x = -Math.PI / 2
    shockwave.position.set(center.x, groundY + 0.06, center.z)
    shockwave.scale.setScalar(0.3)
    this.add(shockwave, { life: 0.45, growth: radius * 1.1, fade: 'linear' })

    const scorch = new THREE.Mesh(this.disc, new THREE.MeshBasicMaterial({ color: 0x0b0a09, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
    scorch.rotation.x = -Math.PI / 2
    scorch.rotation.z = Math.random() * Math.PI
    scorch.position.set(center.x, groundY + 0.03, center.z)
    scorch.scale.setScalar(radius * 0.42)
    this.add(scorch, { life: 9, fade: 'late' })

    for (let index = 0; index < 10; index += 1) {
      const shade = 0x3a3c42 + Math.floor(Math.random() * 3) * 0x080808
      const smoke = new THREE.Mesh(this.smokeGeometry, new THREE.MeshBasicMaterial({ color: shade, transparent: true, opacity: 0.32, depthWrite: false }))
      const angle = (index / 10) * Math.PI * 2
      smoke.position.copy(center).add(new THREE.Vector3(Math.cos(angle) * radius * 0.2, 0.2 + Math.random() * 0.5, Math.sin(angle) * radius * 0.2))
      smoke.scale.setScalar(radius * 0.1)
      this.add(smoke, {
        life: 1.4 + Math.random() * 0.9,
        growth: radius * (0.18 + Math.random() * 0.12),
        velocity: new THREE.Vector3(Math.cos(angle) * 1.4, 1.1 + Math.random() * 0.9, Math.sin(angle) * 1.4),
        fade: 'late',
        spin: (Math.random() - 0.5) * 2,
      })
    }

    for (let index = 0; index < 22; index += 1) {
      const debris = new THREE.Mesh(this.shard, new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? 0xfff0c0 : color, transparent: true }))
      debris.position.copy(center)
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize()
      this.add(debris, { life: 0.7 + Math.random() * 0.5, velocity: direction.multiplyScalar(6 + Math.random() * 7), gravity: 14, spin: 12 })
    }
    this.flash(center.clone().setY(center.y + 0.8), 0xffa65a, 60, 0.3, radius * 3.5)
  }

  /** Scintille d'impatto orientate lungo la normale (o verso chi spara). */
  sparks(position: THREE.Vector3, normal: THREE.Vector3, color = 0xffd27a, count = 6): void {
    for (let index = 0; index < count; index += 1) {
      const spark = new THREE.Mesh(this.spark, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      spark.position.copy(position)
      const direction = normal.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.8, (Math.random() - 0.5) * 1.4)).normalize()
      spark.lookAt(position.clone().add(direction))
      this.add(spark, { life: 0.18 + Math.random() * 0.15, velocity: direction.multiplyScalar(4 + Math.random() * 4), gravity: 9 })
    }
  }

  /** Lampo alla bocca di fuoco per armi non del giocatore (torrette, avversari). */
  muzzle(position: THREE.Vector3, color = 0xffc070): void {
    const burst = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    burst.position.copy(position)
    burst.scale.setScalar(0.09)
    this.add(burst, { life: 0.06, growth: 1.2 })
    this.flash(position, color, 6, 0.06, 5)
  }

  /** Scia luminosa per granate e proiettili. */
  trail(position: THREE.Vector3, color: number): void {
    const puff = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }))
    puff.position.copy(position)
    puff.scale.setScalar(0.05)
    this.add(puff, { life: 0.28, growth: -0.12 })
  }

  /** Anello che si espande a terra: schieramento della torretta, raccolta, acquisto. */
  /** Anello a terra che si allarga fino a `radius` in `duration` secondi (onda d'urto del Bruto). */
  shockwave(position: THREE.Vector3, color: number, radius: number, duration: number): void {
    const ring = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(position).setY(position.y + 0.08)
    ring.scale.setScalar(0.001)
    this.add(ring, { life: duration, growth: radius, baseScale: 0, fade: 'late' })
  }

  pulse(position: THREE.Vector3, color: number, radius = 1.6): void {
    const ring = new THREE.Mesh(this.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(position).setY(position.y + 0.05)
    ring.scale.setScalar(0.2)
    this.add(ring, { life: 0.55, growth: radius * 2 })
  }

  update(delta: number): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!
      item.life -= delta
      if (item.life <= 0) {
        this.scene.remove(item.mesh)
        item.mesh.material.dispose()
        this.items.splice(index, 1)
        continue
      }
      const progress = 1 - item.life / item.maxLife
      item.velocity.y -= item.gravity * delta
      item.mesh.position.addScaledVector(item.velocity, delta)
      if (item.gravity === 0) item.velocity.multiplyScalar(Math.exp(-delta * 2.2))
      if (item.growth !== 0) item.mesh.scale.setScalar(Math.max(0.001, item.baseScale + item.growth * (1 - (1 - progress) ** 2)))
      if (item.spin !== 0) {
        item.mesh.rotation.x += item.spin * delta
        item.mesh.rotation.y += item.spin * delta * 0.7
      }
      const opacity = item.fade === 'late' ? Math.min(1, (1 - progress) * 2.2) : 1 - progress
      item.mesh.material.opacity = opacity * (item.mesh.material.userData.baseOpacity ??= item.mesh.material.opacity || 1)
    }
    for (const entry of this.lights) {
      if (entry.life <= 0) {
        entry.light.intensity = 0
        continue
      }
      entry.life -= delta
      entry.light.intensity = entry.intensity * Math.max(0, entry.life / entry.maxLife) ** 1.5
    }
  }

  clear(): void {
    for (const item of this.items) {
      this.scene.remove(item.mesh)
      item.mesh.material.dispose()
    }
    this.items.length = 0
    for (const entry of this.lights) {
      entry.life = 0
      entry.light.intensity = 0
    }
  }

  dispose(): void {
    this.clear()
    for (const entry of this.lights) this.scene.remove(entry.light)
    this.lights.length = 0
    for (const geometry of [this.sphere, this.smokeGeometry, this.shard, this.ring, this.disc, this.spark]) geometry.dispose()
  }
}

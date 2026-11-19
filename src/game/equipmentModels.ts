import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export interface TurretModel {
  group: THREE.Group
  /** Rotazione orizzontale della testa. */
  yaw: THREE.Group
  /** Inclinazione delle canne. */
  pitch: THREE.Group
  barrels: THREE.Mesh[]
  muzzles: THREE.Object3D[]
  eye: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  legs: THREE.Group[]
}

/** Torretta automatica: treppiede pieghevole, testa rotante, doppia canna e sensore. */
export function createTurretModel(color: number): TurretModel {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x2f3b42, metalness: 0.8, roughness: 0.32 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x12171c, metalness: 0.5, roughness: 0.5 })
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 })
  const legs: THREE.Group[] = []
  for (let index = 0; index < 3; index += 1) {
    const pivot = new THREE.Group()
    pivot.position.y = 0.5
    pivot.rotation.y = (index / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 8), metal)
    leg.position.set(0, -0.26, 0.17)
    leg.rotation.x = 0.55
    pivot.add(leg)
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 8), dark)
    foot.position.set(0, -0.52, 0.33)
    pivot.add(foot)
    group.add(pivot)
    legs.push(pivot)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 12), metal)
  hub.position.y = 0.55
  group.add(hub)
  const yaw = new THREE.Group()
  yaw.position.y = 0.68
  group.add(yaw)
  const pitch = new THREE.Group()
  pitch.position.y = 0.12
  yaw.add(pitch)
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.3, 0.52, 3, 0.06), metal)
  pitch.add(body)
  const ammo = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, 0.26, 2, 0.03), dark)
  ammo.position.set(0.28, -0.04, 0.05)
  pitch.add(ammo)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glow)
  eye.position.set(0, 0.1, -0.27)
  pitch.add(eye)
  const barrels: THREE.Mesh[] = []
  const muzzles: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.5, 10), dark)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(side * 0.09, -0.03, -0.45)
    pitch.add(barrel)
    barrels.push(barrel)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10), glow)
    tip.rotation.x = Math.PI / 2
    tip.position.set(side * 0.09, -0.03, -0.71)
    pitch.add(tip)
    const muzzle = new THREE.Object3D()
    muzzle.position.set(side * 0.09, -0.03, -0.76)
    pitch.add(muzzle)
    muzzles.push(muzzle)
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.62, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  group.add(ring)
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object !== ring) object.castShadow = true
  })
  return { group, yaw, pitch, barrels, muzzles, eye, ring, legs }
}

/** Animazione della torretta: apertura del treppiede, rinculo delle canne, scansione. */
export class TurretAnimator {
  private age = 0
  private recoil = [0, 0]
  private nextBarrel = 0
  private scan = Math.random() * Math.PI * 2

  constructor(readonly model: TurretModel) {
    model.group.scale.setScalar(0.25)
    for (const leg of model.legs) leg.rotation.x = -0.5
  }

  /** Registra un colpo e restituisce la bocca di fuoco usata. */
  fire(): THREE.Object3D {
    const index = this.nextBarrel
    this.nextBarrel = 1 - this.nextBarrel
    this.recoil[index] = 1
    return this.model.muzzles[index]!
  }

  /** `target` in coordinate mondo oppure null per la scansione a vuoto. */
  update(delta: number, target: THREE.Vector3 | null, lifeRatio: number): void {
    this.age += delta
    const deploy = Math.min(1, this.age / 0.55)
    const eased = 1 - (1 - deploy) ** 3
    this.model.group.scale.setScalar(0.25 + eased * 0.75)
    for (const leg of this.model.legs) leg.rotation.x = -0.5 + eased * 0.5
    if (deploy < 1) return
    if (target) {
      const local = this.model.group.worldToLocal(target.clone())
      const desiredYaw = Math.atan2(-local.x, -local.z)
      const yawDelta = Math.atan2(Math.sin(desiredYaw - this.model.yaw.rotation.y), Math.cos(desiredYaw - this.model.yaw.rotation.y))
      this.model.yaw.rotation.y += yawDelta * Math.min(1, delta * 14)
      const horizontal = Math.hypot(local.x, local.z)
      const desiredPitch = Math.atan2(local.y - 0.8, Math.max(0.1, horizontal))
      this.model.pitch.rotation.x = THREE.MathUtils.lerp(this.model.pitch.rotation.x, desiredPitch, Math.min(1, delta * 10))
    } else {
      this.scan += delta * 0.9
      this.model.yaw.rotation.y += (Math.sin(this.scan) * 1.2 - this.model.yaw.rotation.y) * Math.min(1, delta * 2)
      this.model.pitch.rotation.x = THREE.MathUtils.lerp(this.model.pitch.rotation.x, 0, Math.min(1, delta * 3))
    }
    this.model.barrels.forEach((barrel, index) => {
      this.recoil[index] = Math.max(0, this.recoil[index]! - delta * 9)
      barrel.position.z = -0.45 + this.recoil[index]! * 0.1
    })
    // Negli ultimi secondi la torretta lampeggia prima di spegnersi.
    const blinking = lifeRatio < 0.2 && Math.sin(this.age * 18) > 0
    this.model.eye.material.emissiveIntensity = blinking ? 0.2 : target ? 2.6 : 1.4
    this.model.ring.material.opacity = 0.2 + lifeRatio * 0.45
    this.model.ring.scale.setScalar(1 + Math.sin(this.age * 3) * 0.04)
  }
}

export interface GrenadeModel {
  group: THREE.Group
  light: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

export function createGrenadeModel(color = 0x6affea): GrenadeModel {
  const group = new THREE.Group()
  const shell = new THREE.MeshStandardMaterial({ color: 0x3a463f, metalness: 0.55, roughness: 0.5 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), shell)
  body.scale.set(1, 1.18, 1)
  group.add(body)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 20), new THREE.MeshStandardMaterial({ color: 0x1b2024, metalness: 0.7, roughness: 0.4 }))
  band.rotation.x = Math.PI / 2
  group.add(band)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x5b6266, metalness: 0.8, roughness: 0.3 }))
  cap.position.y = 0.16
  group.add(cap)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 }))
  light.position.set(0, 0.2, 0)
  group.add(light)
  return { group, light }
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line) && !(child instanceof THREE.Points)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose()
      material.dispose()
    }
  })
}

export interface StationModel {
  group: THREE.Group
  hologram: THREE.Group
  screen: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  accent: THREE.MeshStandardMaterial
}

function createLabelTexture(title: string, subtitle: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = 'rgba(6, 10, 18, 0.88)'
    context.fillRect(0, 0, 512, 256)
    context.strokeStyle = color
    context.lineWidth = 6
    context.strokeRect(8, 8, 496, 240)
    context.fillStyle = '#e8f6f5'
    // Il titolo si rimpicciolisce finché non entra nella cornice (es. "CASSA MISTERIOSA").
    let size = 60
    context.font = `bold ${size}px sans-serif`
    while (size > 28 && context.measureText(title).width > 460) {
      size -= 2
      context.font = `bold ${size}px sans-serif`
    }
    context.textAlign = 'center'
    context.fillText(title, 256, 110)
    context.fillStyle = color
    context.font = 'bold 54px sans-serif'
    context.fillText(subtitle, 256, 194)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export const STATION_COLORS = { weapon: 0xffb657, ammo: 0x58f5e5, medkit: 0x72ff8b, box: 0xb66bff } as const

/** Terminale d'acquisto con ologramma rotante e cartellino del prezzo. */
/** Aggiorna titolo e prezzo sullo schermo della postazione (le armi cambiano a ogni ondata). */
export function setStationLabel(model: StationModel, kind: keyof typeof STATION_COLORS, title: string, subtitle: string): void {
  const css = `#${STATION_COLORS[kind].toString(16).padStart(6, '0')}`
  const previous = model.screen.material.map
  model.screen.material.map = createLabelTexture(title, subtitle, css)
  model.screen.material.needsUpdate = true
  previous?.dispose()
}

export function createStationModel(kind: keyof typeof STATION_COLORS, title: string, cost: number): StationModel {
  const color = STATION_COLORS[kind]
  const css = `#${color.toString(16).padStart(6, '0')}`
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x252e35, metalness: 0.8, roughness: 0.35 })
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 })
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.55, 3, 0.05), metal)
  base.position.y = 0.45
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.06, 0.6, 2, 0.02), accent)
  top.position.y = 0.92
  group.add(top)
  for (const z of [0.28, -0.28]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.02), accent)
    stripe.position.set(0, 0.25, z)
    group.add(stripe)
  }
  const hologram = new THREE.Group()
  hologram.position.y = 1.35
  group.add(hologram)
  const holoMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })
  if (kind === 'weapon') {
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), holoMaterial)
    hologram.add(gunBody)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), holoMaterial)
    barrel.rotation.x = Math.PI / 2
    barrel.position.z = -0.48
    hologram.add(barrel)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), holoMaterial)
    grip.position.set(0, -0.15, 0.1)
    grip.rotation.x = -0.3
    hologram.add(grip)
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), holoMaterial)
    magazine.position.set(0, -0.15, -0.15)
    hologram.add(magazine)
  } else if (kind === 'box') {
    // Cassa misteriosa: un cubo con un punto interrogativo che ruota.
    hologram.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), holoMaterial))
    const mark = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 16, Math.PI * 1.4), holoMaterial)
    mark.position.y = 0.38
    hologram.add(mark)
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), holoMaterial)
    dot.position.y = 0.22
    hologram.add(dot)
  } else if (kind === 'ammo') {
    for (const x of [-0.12, 0, 0.12]) {
      const bullet = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), holoMaterial)
      bullet.position.x = x
      hologram.add(bullet)
    }
  } else {
    hologram.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), holoMaterial))
    hologram.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), holoMaterial))
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.36, 0.5, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  beam.position.y = 1.2
  group.add(beam)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.475),
    new THREE.MeshBasicMaterial({ map: createLabelTexture(title, `⬢ ${cost}`, css), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  )
  screen.position.y = 2
  group.add(screen)
  return { group, hologram, screen, accent }
}

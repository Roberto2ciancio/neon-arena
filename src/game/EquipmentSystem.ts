import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { raycastObstacles } from './collision'
import type { CollisionObstacle } from './collision'
import type { CombatEffects } from './effects'
import { EQUIPMENT_STATS, getFlashIntensity } from './equipment'
import type { GadgetId, LethalId, TacticalId } from './equipment'
import { createGrenadeModel, createTurretModel, disposeObject, TurretAnimator } from './equipmentModels'
import type { GrenadeModel } from './equipmentModels'
import { getGroundHeight, stepBouncingProjectile } from './world'

export type ThrowableKind = Exclude<LethalId, 'claymore'> | TacticalId
export type DeployableKind = Exclude<GadgetId, never> | 'claymore'
export type EquipmentDamageSource = 'grenade' | 'molotov' | 'claymore' | 'turret'

export interface EquipmentTarget {
  id: string
  feet: THREE.Vector3
  height: number
  radius: number
}

export interface LocalPlayerView {
  feet: THREE.Vector3
  eye: THREE.Vector3
  forward: THREE.Vector3
  alive: boolean
}

export interface EquipmentContext {
  scene: THREE.Scene
  effects: CombatEffects
  solids(): CollisionObstacle[]
  /** Bersagli di un oggetto: `hostile` indica se l'oggetto appartiene agli avversari del giocatore locale. */
  targets(hostile: boolean): EquipmentTarget[]
  /** Danno inflitto da un oggetto del giocatore locale. */
  damage(target: EquipmentTarget, amount: number, source: EquipmentDamageSource): void
  stunTarget?(target: EquipmentTarget, seconds: number): void
  slowTarget?(target: EquipmentTarget, seconds: number): void
  localPlayer(): LocalPlayerView
  onLocalFlash(intensity: number): void
  onLocalStun(seconds: number): void
  onLocalBurn(damage: number): void
  onRefill(): void
  onReveal(seconds: number, hostile: boolean): void
  onDecoy(position: THREE.Vector3, seconds: number, hostile: boolean): void
  addSolid(solid: CollisionObstacle): void
  removeSolid(solid: CollisionObstacle): void
  playAt(sound: 'damage' | 'shoot' | 'enemyShoot' | 'kill' | 'upgrade' | 'pickup', position: THREE.Vector3): void
  shake(amount: number): void
}

export interface EquipmentOptions {
  owned: boolean
  hostile: boolean
  /** Identificativo condiviso in rete per oggetti posizionati. */
  id?: string
}

const THROWABLE_COLORS: Record<ThrowableKind, number> = {
  frag: 0x6affea,
  semtex: 0xff8a2a,
  molotov: 0xffb347,
  flashbang: 0xf2f6ff,
  smoke: 0x9aa3ad,
  stun: 0x5aa8ff,
  decoy: 0xffe066,
}

const FUSES: Record<ThrowableKind, number> = {
  frag: EQUIPMENT_STATS.fragFuse,
  semtex: EQUIPMENT_STATS.semtexFuse,
  molotov: 6,
  flashbang: 1.3,
  smoke: 1.1,
  stun: 1.3,
  decoy: 1,
}

interface Throwable {
  kind: ThrowableKind
  model: GrenadeModel
  velocity: THREE.Vector3
  timer: number
  trail: number
  options: EquipmentOptions
  stuckTarget: EquipmentTarget | null
  stuckOffset: THREE.Vector3
  stuck: boolean
}

interface FireZone {
  position: THREE.Vector3
  life: number
  tick: number
  options: EquipmentOptions
  glow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  flameTimer: number
}

interface SmokeZone {
  position: THREE.Vector3
  life: number
  puffs: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>[]
}

interface Deployable {
  kind: DeployableKind
  group: THREE.Object3D
  position: THREE.Vector3
  forward: THREE.Vector3
  life: number
  timer: number
  options: EquipmentOptions
  turret?: TurretAnimator
  solid?: CollisionObstacle
  light?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

/**
 * Granate, zone d'effetto e gadget posizionati, condivisi fra modalità zombie e TCT.
 * Gli oggetti del giocatore locale (`owned`) infliggono danni tramite il contesto; quelli
 * remoti sono solo visivi, ma accecano/stordiscono il giocatore locale quando ostili.
 */
export class EquipmentSystem {
  private readonly throwables: Throwable[] = []
  private readonly fires: FireZone[] = []
  private readonly smokes: SmokeZone[] = []
  private readonly deployables: Deployable[] = []
  private readonly puffGeometry = new THREE.IcosahedronGeometry(1, 1)
  private readonly fireGeometry = new THREE.CircleGeometry(EQUIPMENT_STATS.molotovRadius, 28)

  constructor(private readonly context: EquipmentContext) {}

  throw(kind: ThrowableKind, position: THREE.Vector3, velocity: THREE.Vector3, options: EquipmentOptions): void {
    const model = createGrenadeModel(THROWABLE_COLORS[kind])
    if (kind === 'molotov') model.group.scale.set(0.8, 1.6, 0.8)
    if (kind === 'smoke' || kind === 'flashbang' || kind === 'stun') model.group.scale.set(0.85, 1.35, 0.85)
    model.group.position.copy(position)
    this.context.scene.add(model.group)
    this.throwables.push({ kind, model, velocity: velocity.clone(), timer: FUSES[kind], trail: 0, options, stuckTarget: null, stuckOffset: new THREE.Vector3(), stuck: false })
  }

  deploy(kind: DeployableKind, position: THREE.Vector3, yaw: number, options: EquipmentOptions): void {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const color = options.hostile ? 0xff6f9a : 0x6affea
    let group: THREE.Object3D
    const deployable: Deployable = { kind, group: new THREE.Group(), position: position.clone(), forward, life: 0, timer: 0, options }
    if (kind === 'turret') {
      const model = createTurretModel(color)
      model.group.position.copy(position)
      model.group.rotation.y = yaw
      deployable.turret = new TurretAnimator(model)
      deployable.life = EQUIPMENT_STATS.turretLife
      deployable.timer = 0.6
      group = model.group
    } else if (kind === 'claymore') {
      const mine = new THREE.Group()
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.2, 0.08, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x4a5636, roughness: 0.7 }))
      body.position.y = 0.2
      body.rotation.x = -0.15
      mine.add(body)
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }))
        leg.position.set(side * 0.12, 0.08, 0.02)
        leg.rotation.z = side * 0.3
        mine.add(leg)
      }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }))
      light.position.set(0.1, 0.3, -0.05)
      mine.add(light)
      // Laser di innesco visibile solo per il proprietario e gli alleati.
      if (!options.hostile) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, EQUIPMENT_STATS.claymoreTrigger), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.45 }))
        beam.position.set(0, 0.2, -EQUIPMENT_STATS.claymoreTrigger / 2)
        mine.add(beam)
      }
      mine.position.copy(position)
      mine.rotation.y = yaw
      deployable.light = light
      deployable.life = 120
      deployable.timer = 1
      group = mine
    } else if (kind === 'shield') {
      const shield = new THREE.Group()
      const { shieldWidth: width, shieldHeight: height } = EQUIPMENT_STATS
      const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.08), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.35, depthWrite: false }))
      panel.position.y = height / 2
      shield.add(panel)
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x2a343b, metalness: 0.8, roughness: 0.35 })
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, height + 0.1, 0.14), frameMaterial)
        post.position.set(side * width / 2, height / 2, 0)
        shield.add(post)
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.12, 0.3), frameMaterial)
      base.position.y = 0.06
      shield.add(base)
      shield.position.copy(position)
      shield.rotation.y = yaw
      // Solido allineato agli assi che copre il pannello ruotato.
      const halfX = Math.abs(Math.cos(yaw)) * width / 2 + Math.abs(Math.sin(yaw)) * 0.12
      const halfZ = Math.abs(Math.sin(yaw)) * width / 2 + Math.abs(Math.cos(yaw)) * 0.12
      deployable.solid = {
        id: `shield-${Math.random().toString(36).slice(2, 8)}`,
        box: new THREE.Box3(new THREE.Vector3(position.x - halfX, position.y, position.z - halfZ), new THREE.Vector3(position.x + halfX, position.y + height, position.z + halfZ)),
      }
      this.context.addSolid(deployable.solid)
      deployable.life = EQUIPMENT_STATS.shieldDuration
      group = shield
    } else if (kind === 'ammo-crate') {
      const crate = new THREE.Group()
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.45, 0.5, 3, 0.04), new THREE.MeshStandardMaterial({ color: 0x3e4a32, roughness: 0.7 }))
      box.position.y = 0.225
      crate.add(box)
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.52), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }))
      stripe.position.y = 0.3
      crate.add(stripe)
      crate.position.copy(position)
      crate.rotation.y = yaw
      deployable.life = EQUIPMENT_STATS.crateDuration
      group = crate
    } else {
      const drone = new THREE.Group()
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.34, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x252d33, metalness: 0.7, roughness: 0.35 }))
      drone.add(body)
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] as const) {
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }))
        rotor.position.set(x, 0.05, z)
        drone.add(rotor)
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }))
      eye.position.y = -0.07
      drone.add(eye)
      drone.position.copy(position).setY(position.y + 6)
      deployable.life = EQUIPMENT_STATS.radarDuration
      group = drone
      this.context.onReveal(EQUIPMENT_STATS.radarDuration, options.hostile)
    }
    deployable.group = group
    this.context.scene.add(group)
    this.context.effects.pulse(position, color, 1.8)
    this.deployables.push(deployable)
  }

  /** Esplosione di una claymore remota annunciata dalla rete. */
  detonate(id: string): void {
    const index = this.deployables.findIndex((deployable) => deployable.options.id === id)
    if (index >= 0) this.explodeClaymore(index)
  }

  /** Vero se il punto è dentro una nube di fumo. */
  isInSmoke(point: THREE.Vector3): boolean {
    return this.smokes.some((smoke) => smoke.position.distanceTo(point) < EQUIPMENT_STATS.smokeRadius && smoke.life > 0.5)
  }

  update(delta: number, onDetonate?: (id: string) => void): void {
    this.updateThrowables(delta)
    this.updateFires(delta)
    this.updateSmokes(delta)
    this.updateDeployables(delta, onDetonate)
  }

  clear(): void {
    for (const throwable of this.throwables) this.removeObject(throwable.model.group)
    for (const fire of this.fires) this.removeObject(fire.glow)
    for (const smoke of this.smokes) for (const puff of smoke.puffs) this.removeObject(puff)
    for (const deployable of this.deployables) {
      if (deployable.solid) this.context.removeSolid(deployable.solid)
      this.removeObject(deployable.group)
    }
    this.throwables.length = 0
    this.fires.length = 0
    this.smokes.length = 0
    this.deployables.length = 0
  }

  dispose(): void {
    this.clear()
    this.puffGeometry.dispose()
    this.fireGeometry.dispose()
  }

  private removeObject(object: THREE.Object3D): void {
    this.context.scene.remove(object)
    if (object instanceof THREE.Mesh && (object.geometry === this.puffGeometry || object.geometry === this.fireGeometry)) {
      ;(object.material as THREE.Material).dispose()
      return
    }
    disposeObject(object)
  }

  private updateThrowables(delta: number): void {
    const solids = this.context.solids()
    for (let index = this.throwables.length - 1; index >= 0; index -= 1) {
      const item = this.throwables[index]!
      const position = item.model.group.position
      item.timer -= delta
      if (item.stuckTarget) {
        position.copy(item.stuckTarget.feet).add(item.stuckOffset)
      } else if (!item.stuck) {
        const before = position.clone()
        const speedBefore = item.velocity.length()
        stepBouncingProjectile(position, item.velocity, delta, solids)
        const impacted = item.velocity.length() < speedBefore * 0.8 || position.distanceTo(before) < speedBefore * delta * 0.5
        if (item.kind === 'semtex' || item.kind === 'molotov') {
          const hit = item.options.owned || item.options.hostile ? this.findContact(position, item.options.hostile) : null
          if (hit && item.kind === 'semtex') {
            item.stuckTarget = hit
            item.stuckOffset.copy(position).sub(hit.feet)
          } else if (impacted && speedBefore > 1) {
            if (item.kind === 'molotov') item.timer = 0
            else item.stuck = true
          } else if (hit) {
            item.timer = 0
          }
        }
        item.model.group.rotation.x += item.velocity.length() * delta * 2
      }
      const elapsed = FUSES[item.kind] - item.timer
      item.model.light.material.emissiveIntensity = Math.sin(elapsed * (8 + elapsed * 20)) > 0 ? 3.5 : 0.3
      item.trail -= delta
      if (item.trail <= 0 && item.velocity.lengthSq() > 4 && !item.stuck && !item.stuckTarget) {
        this.context.effects.trail(position, THROWABLE_COLORS[item.kind])
        item.trail = 0.03
      }
      if (item.timer <= 0) {
        this.detonateThrowable(item)
        this.removeObject(item.model.group)
        this.throwables.splice(index, 1)
      }
    }
  }

  private findContact(position: THREE.Vector3, hostile: boolean): EquipmentTarget | null {
    for (const target of this.context.targets(hostile)) {
      const center = target.feet.clone().setY(target.feet.y + target.height * 0.5)
      if (Math.hypot(center.x - position.x, center.z - position.z) < target.radius + 0.25 && Math.abs(center.y - position.y) < target.height * 0.6) return target
    }
    return null
  }

  private lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = to.clone().sub(from)
    const distance = direction.length()
    if (distance < 0.01) return true
    return raycastObstacles(from, direction.divideScalar(distance), distance, this.context.solids()) === null
  }

  private detonateThrowable(item: Throwable): void {
    const position = item.model.group.position.clone()
    const ground = getGroundHeight(position.x, position.z, position.y + 0.2, 0.2, this.context.solids())
    const local = this.context.localPlayer()
    const { effects } = this.context
    switch (item.kind) {
      case 'frag':
      case 'semtex': {
        const radius = item.kind === 'frag' ? EQUIPMENT_STATS.fragRadius : EQUIPMENT_STATS.semtexRadius
        effects.explosion(position, radius, item.kind === 'frag' ? 0xff9a4a : 0xff7a2a, ground)
        this.context.playAt('damage', position)
        this.context.shake(Math.max(0.12, 0.6 - local.feet.distanceTo(position) * 0.04))
        if (item.options.owned) this.damageArea(position, radius, item.kind === 'frag' ? 140 : 150, 'grenade', item.options.hostile, item.stuckTarget)
        break
      }
      case 'molotov': {
        effects.explosion(position, 1.6, 0xff8a2a, ground)
        const glow = new THREE.Mesh(this.fireGeometry, new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
        glow.rotation.x = -Math.PI / 2
        glow.position.set(position.x, ground + 0.05, position.z)
        this.context.scene.add(glow)
        this.fires.push({ position: new THREE.Vector3(position.x, ground, position.z), life: EQUIPMENT_STATS.molotovDuration, tick: 0, options: item.options, glow, flameTimer: 0 })
        this.context.playAt('damage', position)
        break
      }
      case 'flashbang': {
        effects.flash(position, 0xffffff, 140, 0.25, 22)
        effects.pulse(position.clone().setY(ground), 0xffffff, 3)
        this.context.playAt('damage', position)
        if (local.alive) {
          const toFlash = position.clone().sub(local.eye)
          const distance = toFlash.length()
          const facing = distance > 0 ? local.forward.dot(toFlash.normalize()) : 1
          const intensity = getFlashIntensity(distance, facing, !this.lineOfSight(local.eye, position))
          if (intensity > 0) this.context.onLocalFlash(intensity)
        }
        if (item.options.owned && this.context.stunTarget) {
          for (const target of this.context.targets(item.options.hostile)) {
            const center = target.feet.clone().setY(target.feet.y + target.height * 0.7)
            if (center.distanceTo(position) < EQUIPMENT_STATS.flashRadius * 0.75 && this.lineOfSight(position, center)) this.context.stunTarget(target, EQUIPMENT_STATS.flashDuration)
          }
        }
        break
      }
      case 'stun': {
        effects.flash(position, 0x5aa8ff, 50, 0.3, 14)
        effects.pulse(position.clone().setY(ground), 0x5aa8ff, EQUIPMENT_STATS.stunRadius)
        effects.sparks(position, new THREE.Vector3(0, 1, 0), 0x8fd0ff, 14)
        this.context.playAt('damage', position)
        if (item.options.hostile && local.alive && local.feet.distanceTo(position) < EQUIPMENT_STATS.stunRadius && this.lineOfSight(position, local.eye)) {
          this.context.onLocalStun(EQUIPMENT_STATS.stunDuration)
        }
        if (item.options.owned && this.context.slowTarget) {
          for (const target of this.context.targets(item.options.hostile)) {
            if (target.feet.distanceTo(position) < EQUIPMENT_STATS.stunRadius) this.context.slowTarget(target, EQUIPMENT_STATS.stunDuration)
          }
        }
        break
      }
      case 'smoke': {
        const puffs: SmokeZone['puffs'] = []
        for (let index = 0; index < 16; index += 1) {
          const shade = 0x8c9299 + Math.floor(Math.random() * 3) * 0x0a0a0a
          const puff = new THREE.Mesh(this.puffGeometry, new THREE.MeshBasicMaterial({ color: shade, transparent: true, opacity: 0, depthWrite: false }))
          const angle = Math.random() * Math.PI * 2
          const radius = Math.random() * EQUIPMENT_STATS.smokeRadius * 0.7
          puff.position.set(position.x + Math.cos(angle) * radius, ground + 0.6 + Math.random() * 2.2, position.z + Math.sin(angle) * radius)
          puff.scale.setScalar(0.4)
          puff.userData.target = 1.4 + Math.random() * 1.2
          this.context.scene.add(puff)
          puffs.push(puff)
        }
        this.smokes.push({ position: new THREE.Vector3(position.x, ground + 1, position.z), life: EQUIPMENT_STATS.smokeDuration, puffs })
        break
      }
      case 'decoy': {
        effects.pulse(position.clone().setY(ground), 0xffe066, 2)
        this.context.onDecoy(new THREE.Vector3(position.x, ground, position.z), EQUIPMENT_STATS.decoyDuration, item.options.hostile)
        break
      }
    }
  }

  private damageArea(position: THREE.Vector3, radius: number, damage: number, source: EquipmentDamageSource, hostile: boolean, direct: EquipmentTarget | null = null): void {
    for (const target of this.context.targets(hostile)) {
      const center = target.feet.clone().setY(target.feet.y + target.height * 0.5)
      const distance = target === direct ? 0 : center.distanceTo(position)
      if (distance > radius) continue
      if (target !== direct && !this.lineOfSight(position, center)) continue
      this.context.damage(target, damage * Math.max(0.25, 1 - distance / radius), source)
    }
  }

  private updateFires(delta: number): void {
    const local = this.context.localPlayer()
    for (let index = this.fires.length - 1; index >= 0; index -= 1) {
      const fire = this.fires[index]!
      fire.life -= delta
      fire.tick -= delta
      fire.flameTimer -= delta
      fire.glow.material.opacity = Math.min(0.45, fire.life * 0.3) * (0.8 + Math.sin(fire.life * 20) * 0.2)
      if (fire.flameTimer <= 0) {
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * EQUIPMENT_STATS.molotovRadius
        this.context.effects.trail(fire.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0.2 + Math.random() * 0.6, Math.sin(angle) * radius)), Math.random() > 0.5 ? 0xff7a2a : 0xffc04a)
        fire.flameTimer = 0.025
      }
      if (fire.tick <= 0) {
        fire.tick = 0.5
        const inFire = (feet: THREE.Vector3) => Math.hypot(feet.x - fire.position.x, feet.z - fire.position.z) < EQUIPMENT_STATS.molotovRadius && Math.abs(feet.y - fire.position.y) < 1
        if (fire.options.owned) {
          for (const target of this.context.targets(fire.options.hostile)) {
            if (inFire(target.feet)) this.context.damage(target, EQUIPMENT_STATS.molotovDps * 0.5, 'molotov')
          }
        }
        if (local.alive && inFire(local.feet) && (fire.options.owned || fire.options.hostile)) this.context.onLocalBurn(fire.options.owned ? 4 : 0)
      }
      if (fire.life <= 0) {
        this.removeObject(fire.glow)
        this.fires.splice(index, 1)
      }
    }
  }

  private updateSmokes(delta: number): void {
    for (let index = this.smokes.length - 1; index >= 0; index -= 1) {
      const smoke = this.smokes[index]!
      smoke.life -= delta
      const fadeIn = Math.min(1, (EQUIPMENT_STATS.smokeDuration - smoke.life) / 0.8)
      const fadeOut = Math.min(1, smoke.life / 1.5)
      for (const puff of smoke.puffs) {
        const target = puff.userData.target as number
        puff.scale.setScalar(THREE.MathUtils.lerp(puff.scale.x, target, 1 - Math.exp(-delta * 1.5)))
        puff.position.y += delta * 0.08
        puff.rotation.y += delta * 0.2
        puff.material.opacity = 0.82 * fadeIn * fadeOut
      }
      if (smoke.life <= 0) {
        for (const puff of smoke.puffs) this.removeObject(puff)
        this.smokes.splice(index, 1)
      }
    }
  }

  private updateDeployables(delta: number, onDetonate?: (id: string) => void): void {
    const local = this.context.localPlayer()
    for (let index = this.deployables.length - 1; index >= 0; index -= 1) {
      const deployable = this.deployables[index]!
      deployable.life -= delta
      deployable.timer -= delta
      if (deployable.kind === 'turret' && deployable.turret) {
        this.updateTurret(deployable, delta)
      } else if (deployable.kind === 'claymore') {
        if (deployable.light) deployable.light.material.emissiveIntensity = Math.sin(deployable.life * 6) > 0 ? 2.5 : 0.3
        if (deployable.options.owned && deployable.timer <= 0) {
          const origin = deployable.position.clone().setY(deployable.position.y + 0.3)
          const triggered = this.context.targets(deployable.options.hostile).some((target) => {
            const offset = target.feet.clone().setY(deployable.position.y).sub(deployable.position)
            const distance = offset.length()
            if (distance > EQUIPMENT_STATS.claymoreTrigger || distance < 0.01) return false
            return offset.divideScalar(distance).dot(deployable.forward) > EQUIPMENT_STATS.claymoreCone && Math.abs(target.feet.y - deployable.position.y) < 1.5 && this.lineOfSight(origin, target.feet.clone().setY(target.feet.y + 0.8))
          })
          if (triggered) {
            if (deployable.options.id) onDetonate?.(deployable.options.id)
            this.explodeClaymore(index)
            continue
          }
        }
      } else if (deployable.kind === 'ammo-crate') {
        if (!deployable.options.hostile && local.alive && local.feet.distanceTo(deployable.position) < EQUIPMENT_STATS.crateRadius && deployable.timer <= 0) {
          deployable.timer = 1
          this.context.onRefill()
        }
      } else if (deployable.kind === 'radar') {
        deployable.group.position.set(local.feet.x, local.feet.y + 6 + Math.sin(deployable.life * 2) * 0.2, local.feet.z)
        if (deployable.options.hostile) deployable.group.position.copy(deployable.position).setY(deployable.position.y + 6)
        deployable.group.rotation.y += delta * 1.5
      } else if (deployable.kind === 'shield') {
        const fade = deployable.life < 2 && Math.sin(deployable.life * 16) > 0
        deployable.group.visible = !fade
      }
      if (deployable.life <= 0) {
        if (deployable.kind === 'turret') {
          const center = deployable.position.clone().setY(deployable.position.y + 0.8)
          this.context.effects.explosion(center, 1.6, deployable.options.hostile ? 0xff6f9a : 0x6affea, deployable.position.y)
        }
        if (deployable.solid) this.context.removeSolid(deployable.solid)
        this.removeObject(deployable.group)
        this.deployables.splice(index, 1)
      }
    }
  }

  private explodeClaymore(index: number): void {
    const deployable = this.deployables[index]
    if (!deployable) return
    const center = deployable.position.clone().setY(deployable.position.y + 0.3)
    this.context.effects.explosion(center, EQUIPMENT_STATS.claymoreRadius, 0xff9a4a, deployable.position.y)
    this.context.playAt('damage', center)
    if (deployable.options.owned) this.damageArea(center.clone().addScaledVector(deployable.forward, 1), EQUIPMENT_STATS.claymoreRadius, EQUIPMENT_STATS.claymoreDamage, 'claymore', deployable.options.hostile)
    this.removeObject(deployable.group)
    this.deployables.splice(index, 1)
  }

  private updateTurret(deployable: Deployable, delta: number): void {
    const animator = deployable.turret!
    const group = animator.model.group
    const origin = group.position.clone().setY(group.position.y + 0.85)
    let target: EquipmentTarget | null = null
    let best = 15
    for (const candidate of this.context.targets(deployable.options.hostile)) {
      const aim = candidate.feet.clone().setY(candidate.feet.y + candidate.height * 0.55)
      const distance = aim.distanceTo(origin)
      if (distance >= best || !this.lineOfSight(origin, aim)) continue
      target = candidate
      best = distance
    }
    const aimPoint = target ? target.feet.clone().setY(target.feet.y + target.height * 0.55) : null
    animator.update(delta, aimPoint, deployable.life / EQUIPMENT_STATS.turretLife)
    if (!target || !aimPoint || deployable.timer > 0 || !deployable.options.owned) return
    deployable.timer = 0.22
    const muzzle = animator.fire().getWorldPosition(new THREE.Vector3())
    this.context.damage(target, 12, 'turret')
    this.context.effects.muzzle(muzzle, 0x8effd9)
    this.context.effects.sparks(aimPoint, muzzle.clone().sub(aimPoint).normalize(), 0xffd59a, 3)
    this.context.playAt('shoot', group.position)
    this.onTurretShot?.(muzzle, aimPoint)
  }

  /** Notifica i colpi delle torrette locali (tracciante e sincronizzazione di rete). */
  onTurretShot?: (from: THREE.Vector3, to: THREE.Vector3) => void
}

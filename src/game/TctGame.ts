import * as THREE from 'three'
import { GameAudio } from './audio'
import { RenderPipeline } from './RenderPipeline'
import { DecalEffects } from './decals'
import { getGraphicsSettings } from './graphics'
import type { GraphicsQuality } from './graphics'
import { raycastObstacles, resolveCircleCollisions, steerAroundObstacles } from './collision'
import { buildMap } from './mapBuilder'
import { DEPOT_06 } from './maps'
import type { MapDefinition } from './maps'
import { createEnemyModel, createWeaponModel } from './models'
import type { EnemyModel } from './models'
import { BOT_ROLES, getMatchWinner, getTeamSpawn, TCT_CONFIG } from './tctRules'
import type { BotRole, TctTeam } from './tctRules'
import type { AccessibilitySettings } from './accessibility'
import type { GameState, HudData } from './types'
import { createMagazine, reloadMagazine, WEAPON_ORDER, WEAPONS } from './weapons'
import type { MagazineState, WeaponId } from './weapons'

interface Bot {
  model: EnemyModel
  team: TctTeam
  role: BotRole
  health: number
  maxHealth: number
  hitFlash: number
  healTimer: number
  fireTimer: number
  respawnTimer: number
  phase: number
  spawnIndex: number
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  life: number
}

interface Grenade {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  velocity: THREE.Vector3
  timer: number
}

interface Turret {
  group: THREE.Group
  life: number
  fireTimer: number
}

export interface TctResult {
  alphaScore: number
  enemyScore: number
  kills: number
  deaths: number
  winner: TctTeam | 'draw'
}

interface TctEvents {
  onStateChange: (state: GameState) => void
  onHud: (hud: HudData) => void
  onMatchEnd: (result: TctResult) => void
  onDamage: () => void
  onHit: (headshot: boolean) => void
}

export class TctGame {
  private readonly scene = new THREE.Scene()
  private readonly decals = new DecalEffects(this.scene)
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100)
  private readonly renderer: THREE.WebGLRenderer
  private readonly pipeline: RenderPipeline
  private readonly audio = new GameAudio()
  private readonly keys = new Set<string>()
  private readonly player = new THREE.Vector3()
  private readonly bots: Bot[] = []
  private readonly tracers: Tracer[] = []
  private readonly grenades: Grenade[] = []
  private readonly turrets: Turret[] = []
  private readonly weapon = createWeaponModel()
  private map: MapDefinition = DEPOT_06
  private mapContent = buildMap(this.map)
  private obstacles = this.mapContent.obstacles
  private state: GameState = 'menu'
  private graphicsQuality: GraphicsQuality = 'medium'
  private active = true
  private reducedMotion = false
  private mouseSensitivity = 0.002
  private health = 100
  private primaryId: WeaponId = 'ar-07'
  private weaponDefinition = WEAPONS['ar-07']
  private magazines = Object.fromEntries(WEAPON_ORDER.map((id) => [id, createMagazine(WEAPONS[id])])) as Record<WeaponId, MagazineState>
  private ammo = this.weaponDefinition.magazineSize
  private reserveAmmo: number | null = this.weaponDefinition.reserveAmmo
  private alphaScore = 0
  private enemyScore = 0
  private kills = 0
  private deaths = 0
  private timeRemaining: number = TCT_CONFIG.matchDuration
  private playerRespawn = 0
  private invulnerability = 0
  private fireTimer = 0
  private reloadTimer = 0
  private firing = false
  private aiming = false
  private yaw = 0
  private pitch = 0
  private jumpHeight = 0
  private verticalVelocity = 0
  private grounded = true
  private muzzleTimer = 0
  private grenadeCooldown = 0
  private turretCooldown = 0
  private hudTimer = 0
  private animationId = 0
  private lastTime = performance.now()
  private fps = 60
  private fpsTimer = 0
  private fpsFrames = 0

  constructor(container: HTMLElement, private readonly events: TctEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.domElement.setAttribute('aria-label', 'Neon Arena: scontro tattico 4 contro 4')
    this.renderer.domElement.setAttribute('role', 'img')
    container.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color(0x070810)
    this.scene.fog = new THREE.FogExp2(0x070810, 0.018)
    this.camera.rotation.order = 'YXZ'
    this.camera.add(this.weapon.group)
    const light = new THREE.PointLight(0xd8e6ff, 3, 4)
    light.position.set(0.2, 0.35, 0.25)
    this.camera.add(light)
    this.scene.add(this.camera, this.mapContent.group)
    this.bindEvents()
    this.resize()
    this.animationId = requestAnimationFrame(this.animate)
  }

  setAccessibility(settings: AccessibilitySettings): void {
    this.reducedMotion = settings.reducedMotion
    this.mouseSensitivity = 0.002 * settings.sensitivity
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality
    const settings = getGraphicsSettings(quality)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap))
    this.pipeline.setQuality(quality)
    this.resize()
    this.renderer.shadowMap.enabled = settings.shadows
    this.renderer.shadowMap.needsUpdate = true
    this.mapContent.group.traverse((object) => {
      if (object instanceof THREE.PointLight) object.visible = quality !== 'low'
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue
        if (quality === 'low') {
          if (material.normalMap) material.userData.normalMap = material.normalMap
          material.normalMap = null
        } else if (material.userData.normalMap instanceof THREE.Texture) {
          material.normalMap = material.userData.normalMap
        }
        material.needsUpdate = true
      }
    })
  }

  get isAudioMuted(): boolean {
    return this.audio.isMuted
  }

  setAudioMuted(muted: boolean): void {
    this.audio.setMuted(muted)
  }

  setActive(active: boolean): void {
    this.active = active
    this.renderer.domElement.classList.toggle('hidden', !active)
    this.firing = false
    this.keys.clear()
    this.lastTime = performance.now()
  }

  start(map: MapDefinition = DEPOT_06, primary: WeaponId = 'ar-07'): void {
    this.clearBots()
    this.clearEquipment()
    this.setMap(map)
    this.health = 100
    this.primaryId = primary
    this.weaponDefinition = WEAPONS[primary]
    for (const id of WEAPON_ORDER) this.magazines[id] = createMagazine(WEAPONS[id])
    this.ammo = this.magazines[primary].ammo
    this.reserveAmmo = this.magazines[primary].reserveAmmo
    this.alphaScore = 0
    this.enemyScore = 0
    this.kills = 0
    this.deaths = 0
    this.timeRemaining = TCT_CONFIG.matchDuration
    this.playerRespawn = 0
    this.invulnerability = 1
    this.fireTimer = 0
    this.reloadTimer = 0
    this.grenadeCooldown = 0
    this.turretCooldown = 0
    this.firing = false
    this.aiming = false
    this.yaw = 0
    this.pitch = 0
    this.jumpHeight = 0
    this.verticalVelocity = 0
    this.player.set(this.map.playerSpawn.x, 0, this.map.playerSpawn.z)
    this.spawnBots()
    this.updateCamera()
    this.audio.resume()
    this.setState('playing')
    this.emitHud()
    this.requestMouse()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.firing = false
    this.aiming = false
    this.keys.clear()
    this.setState('paused')
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.audio.resume()
    this.setState('playing')
    this.requestMouse()
  }

  abandon(): void {
    if (this.state !== 'playing' && this.state !== 'paused') return
    this.events.onMatchEnd(this.createResult(this.alphaScore >= this.enemyScore ? 'alpha' : 'enemy'))
    this.returnToMenu()
  }

  returnToMenu(): void {
    this.clearBots()
    this.clearEquipment()
    this.firing = false
    this.keys.clear()
    this.setState('menu')
  }

  destroy(): void {
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointerup', this.onPointerUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.clearBots()
    this.clearEquipment()
    this.decals.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private setMap(map: MapDefinition): void {
    if (this.map.id === map.id) return
    this.scene.remove(this.mapContent.group)
    this.mapContent.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line) && !(object instanceof THREE.Points)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.map = map
    this.mapContent = buildMap(map)
    this.obstacles = this.mapContent.obstacles
    this.scene.add(this.mapContent.group)
    this.setGraphicsQuality(this.graphicsQuality)
  }

  private setState(state: GameState): void {
    this.state = state
    this.weapon.group.visible = state !== 'menu' && this.playerRespawn <= 0
    if (state !== 'playing' && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.events.onStateChange(state)
  }

  private requestMouse(): void {
    if (document.pointerLockElement === this.renderer.domElement) return
    try {
      const request = this.renderer.domElement.requestPointerLock() as Promise<void> | undefined
      void request?.catch(() => undefined)
    } catch {}
  }

  private spawnBots(): void {
    const teams: { team: TctTeam; count: number; firstIndex: number }[] = [
      { team: 'alpha', count: TCT_CONFIG.allyBots, firstIndex: 1 },
      { team: 'enemy', count: TCT_CONFIG.enemyBots, firstIndex: 0 },
    ]
    for (const entry of teams) {
      for (let offset = 0; offset < entry.count; offset += 1) {
        const spawnIndex = entry.firstIndex + offset
        const role: BotRole = entry.team === 'alpha'
          ? (['assault', 'support', 'cover'] as const)[offset] ?? 'assault'
          : (['assault', 'cover', 'support', 'sniper'] as const)[offset] ?? 'assault'
        const roleStats = BOT_ROLES[role]
        const model = createEnemyModel('walker', entry.team === 'alpha' ? 0x58f5e5 : 0xff4f87, 'soldier')
        const gun = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.14, 0.75),
          new THREE.MeshStandardMaterial({ color: 0x293542, metalness: 0.8, roughness: 0.3 }),
        )
        gun.position.set(0.4, 1.15, -0.42)
        model.group.add(gun)
        model.details.push(gun)
        const spawn = getTeamSpawn(entry.team, spawnIndex, this.map.arenaLimit)
        model.group.position.set(spawn.x, 0, spawn.z)
        this.scene.add(model.group)
        this.bots.push({
          model,
          team: entry.team,
          role,
          health: roleStats.health,
          maxHealth: roleStats.health,
          hitFlash: 0,
          healTimer: 2,
          fireTimer: 0.5 + Math.random(),
          respawnTimer: 0,
          phase: Math.random() * Math.PI * 2,
          spawnIndex,
        })
      }
    }
  }

  private clearBots(): void {
    this.decals.clear()
    for (const bot of this.bots) {
      this.scene.remove(bot.model.group)
      bot.model.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
    }
    this.bots.length = 0
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line)
      tracer.line.geometry.dispose()
      tracer.line.material.dispose()
    }
    this.tracers.length = 0
  }

  private respawnBot(bot: Bot): void {
    const spawn = getTeamSpawn(bot.team, bot.spawnIndex, this.map.arenaLimit)
    bot.model.group.position.set(spawn.x, 0, spawn.z)
    bot.model.group.rotation.z = 0
    bot.health = bot.maxHealth
    bot.fireTimer = 0.7
    bot.hitFlash = 0
    bot.healTimer = 2
    bot.model.group.visible = true
  }

  private updatePlayer(delta: number): void {
    this.invulnerability = Math.max(0, this.invulnerability - delta)
    this.fireTimer -= delta
    this.muzzleTimer = Math.max(0, this.muzzleTimer - delta)
    this.weapon.flash.visible = this.muzzleTimer > 0
    if (this.playerRespawn > 0) {
      this.playerRespawn -= delta
      if (this.playerRespawn <= 0) {
        this.playerRespawn = 0
        this.health = 100
        for (const id of WEAPON_ORDER) this.magazines[id] = createMagazine(WEAPONS[id])
        this.ammo = this.magazines[this.weaponDefinition.id].ammo
        this.reserveAmmo = this.magazines[this.weaponDefinition.id].reserveAmmo
        this.reloadTimer = 0
        this.invulnerability = 1
        this.player.set(this.map.playerSpawn.x, 0, this.map.playerSpawn.z)
        this.weapon.group.visible = true
      }
      this.updateCamera()
      return
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= delta
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0
        const magazine = reloadMagazine({ ammo: this.ammo, reserveAmmo: this.reserveAmmo }, this.weaponDefinition)
        this.ammo = magazine.ammo
        this.reserveAmmo = magazine.reserveAmmo
      }
    }
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    const right = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'))
    const movement = new THREE.Vector3(
      right * Math.cos(this.yaw) - forward * Math.sin(this.yaw),
      0,
      -right * Math.sin(this.yaw) - forward * Math.cos(this.yaw),
    )
    if (movement.lengthSq() > 0) movement.normalize()
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.aiming
    this.player.addScaledVector(movement, 7 * this.weaponDefinition.moveMultiplier * (sprinting ? 1.4 : 1) * delta)
    resolveCircleCollisions(this.player, 0.42, this.obstacles)
    this.player.x = THREE.MathUtils.clamp(this.player.x, -this.map.arenaLimit, this.map.arenaLimit)
    this.player.z = THREE.MathUtils.clamp(this.player.z, -this.map.arenaLimit, this.map.arenaLimit)
    this.verticalVelocity -= 18 * delta
    this.jumpHeight += this.verticalVelocity * delta
    if (this.jumpHeight <= 0) {
      this.jumpHeight = 0
      this.verticalVelocity = 0
      this.grounded = true
    }
    this.updateCamera()
    if (this.firing && this.fireTimer <= 0 && this.reloadTimer <= 0) {
      if (this.ammo > 0) this.fireWeapon()
      else this.startReload()
    }
  }

  private updateCamera(): void {
    this.camera.position.set(this.player.x, 1.65 + this.jumpHeight, this.player.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.aiming ? 55 : 75, 0.2)
    this.camera.updateProjectionMatrix()
    this.weapon.group.position.lerp(this.aiming ? new THREE.Vector3(0, -0.17, -0.85) : new THREE.Vector3(0.32, -0.29, -0.8), 0.2)
    this.weapon.group.rotation.x = !this.reducedMotion && this.reloadTimer > 0 ? Math.sin((1 - this.reloadTimer / this.weaponDefinition.reloadDuration) * Math.PI) * 0.65 : 0
  }

  private switchWeapon(id: WeaponId): void {
    if (this.state !== 'playing' || this.weaponDefinition.id === id) return
    this.magazines[this.weaponDefinition.id] = { ammo: this.ammo, reserveAmmo: this.reserveAmmo }
    this.weaponDefinition = WEAPONS[id]
    this.ammo = this.magazines[id].ammo
    this.reserveAmmo = this.magazines[id].reserveAmmo
    this.reloadTimer = 0
    this.fireTimer = 0.2
    this.firing = false
    this.aiming = false
    this.audio.play('pickup')
    this.emitHud()
  }

  private startReload(): void {
    if (this.reloadTimer > 0 || this.ammo === this.weaponDefinition.magazineSize || this.playerRespawn > 0) return
    this.reloadTimer = this.weaponDefinition.reloadDuration
    this.firing = false
  }

  private fireWeapon(): void {
    const definition = this.weaponDefinition
    this.ammo -= 1
    this.fireTimer = 1 / definition.fireRate
    this.muzzleTimer = 0.045
    this.audio.play('shoot')
    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const direction = this.camera.getWorldDirection(new THREE.Vector3())
    const spread = this.aiming ? definition.adsSpread : definition.hipSpread
    direction.x += (Math.random() - 0.5) * spread
    direction.y += (Math.random() - 0.5) * spread
    direction.normalize()
    const wallDistance = raycastObstacles(origin, direction, definition.range, this.obstacles)
    const ray = new THREE.Ray(origin, direction)
    let target: Bot | null = null
    let hitPoint: THREE.Vector3 | null = null
    let hitDistance = wallDistance ?? definition.range
    let headshot = false
    for (const bot of this.bots) {
      if (bot.team !== 'enemy' || bot.health <= 0) continue
      for (const zone of [true, false]) {
        const object = zone ? bot.model.head : bot.model.body
        const point = ray.intersectSphere(new THREE.Sphere(object.getWorldPosition(new THREE.Vector3()), zone ? 0.3 : 0.55), new THREE.Vector3())
        if (!point) continue
        const distance = origin.distanceTo(point)
        if (distance < hitDistance) {
          target = bot
          hitPoint = point
          hitDistance = distance
          headshot = zone
        }
      }
    }
    if (target && hitPoint) {
      this.damageBot(target, definition.damage * (headshot ? definition.headshotMultiplier : 1), 'alpha', true)
      this.events.onHit(headshot)
      this.audio.play('hit')
    }
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3())
    const end = hitPoint ?? origin.clone().addScaledVector(direction, hitDistance)
    if (!target && wallDistance !== null) this.decals.spawn(end, origin)
    this.spawnTracer(muzzle, end, 0x8effd9)
    if (!definition.automatic) this.firing = false
  }

  private throwGrenade(): void {
    if (this.state !== 'playing' || this.playerRespawn > 0 || this.grenadeCooldown > 0) return
    const direction = this.camera.getWorldDirection(new THREE.Vector3())
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x36423d, emissive: 0x6affea, emissiveIntensity: 0.7 }),
    )
    mesh.position.copy(this.camera.position).addScaledVector(direction, 0.6)
    const velocity = direction.multiplyScalar(10)
    velocity.y += 4
    this.scene.add(mesh)
    this.grenades.push({ mesh, velocity, timer: 1.5 })
    this.grenadeCooldown = 7
  }

  private explodeGrenade(grenade: Grenade): void {
    const position = grenade.mesh.position.clone()
    for (const bot of this.bots) {
      if (bot.team !== 'enemy' || bot.health <= 0) continue
      const distance = bot.model.group.position.distanceTo(position)
      if (distance <= 4.5) this.damageBot(bot, 90 * Math.max(0.25, 1 - distance / 4.5), 'alpha', true)
    }
    this.audio.playAt('damage', position, this.player, this.yaw)
  }

  private deployTurret(): void {
    if (this.state !== 'playing' || this.playerRespawn > 0 || this.turretCooldown > 0) return
    const direction = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
    const position = this.player.clone().addScaledVector(direction, 2)
    resolveCircleCollisions(position, 0.5, this.obstacles)
    const group = new THREE.Group()
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x283a42, metalness: 0.7, roughness: 0.35 })
    const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x6affea, emissive: 0x25bbaa, emissiveIntensity: 1.2 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 8), baseMaterial)
    base.position.y = 0.18
    group.add(base)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 0.7), baseMaterial)
    head.position.y = 0.65
    group.add(head)
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.75), glowMaterial)
    barrel.position.set(0, 0.65, -0.6)
    group.add(barrel)
    group.position.copy(position)
    this.scene.add(group)
    this.turrets.push({ group, life: 14, fireTimer: 0.2 })
    this.turretCooldown = 18
    this.audio.play('upgrade')
  }

  private updateEquipment(delta: number): void {
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - delta)
    this.turretCooldown = Math.max(0, this.turretCooldown - delta)
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      const grenade = this.grenades[index]
      if (!grenade) continue
      grenade.timer -= delta
      grenade.velocity.y -= 12 * delta
      const direction = grenade.velocity.clone().normalize()
      const wallDistance = raycastObstacles(grenade.mesh.position, direction, grenade.velocity.length() * delta, this.obstacles)
      grenade.mesh.position.addScaledVector(grenade.velocity, delta)
      if (wallDistance !== null || grenade.mesh.position.y <= 0.16 || grenade.timer <= 0) {
        this.explodeGrenade(grenade)
        this.scene.remove(grenade.mesh)
        grenade.mesh.geometry.dispose()
        grenade.mesh.material.dispose()
        this.grenades.splice(index, 1)
      }
    }
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index]
      if (!turret) continue
      turret.life -= delta
      turret.fireTimer -= delta
      let target: Bot | null = null
      let targetDistance = 14
      const origin = turret.group.position.clone().setY(0.7)
      for (const bot of this.bots) {
        if (bot.team !== 'enemy' || bot.health <= 0) continue
        const targetPosition = bot.model.body.getWorldPosition(new THREE.Vector3())
        const distance = targetPosition.distanceTo(origin)
        if (distance >= targetDistance) continue
        const blocked = raycastObstacles(origin, targetPosition.clone().sub(origin).normalize(), distance, this.obstacles) !== null
        if (!blocked) {
          target = bot
          targetDistance = distance
        }
      }
      if (target) {
        const targetPosition = target.model.body.getWorldPosition(new THREE.Vector3())
        turret.group.lookAt(targetPosition.x, 0.65, targetPosition.z)
        turret.group.rotation.y += Math.PI
        if (turret.fireTimer <= 0) {
          this.damageBot(target, 14, 'alpha', true)
          this.spawnTracer(origin, targetPosition, 0x8effd9)
          turret.fireTimer = 0.24
          this.audio.play('shoot')
        }
      }
      if (turret.life <= 0) this.removeTurret(index)
    }
  }

  private removeTurret(index: number): void {
    const turret = this.turrets[index]
    if (!turret) return
    this.scene.remove(turret.group)
    turret.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.turrets.splice(index, 1)
  }

  private clearEquipment(): void {
    for (const grenade of this.grenades) {
      this.scene.remove(grenade.mesh)
      grenade.mesh.geometry.dispose()
      grenade.mesh.material.dispose()
    }
    this.grenades.length = 0
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) this.removeTurret(index)
  }

  private updateBots(delta: number): void {
    for (const bot of this.bots) {
      if (bot.health <= 0) {
        bot.respawnTimer -= delta
        const deathElapsed = TCT_CONFIG.respawnDelay - bot.respawnTimer
        bot.model.group.visible = deathElapsed <= 0.65
        if (bot.model.group.visible) {
          const progress = Math.min(1, deathElapsed / 0.65)
          bot.model.group.rotation.z = (Math.sin(bot.phase) > 0 ? 1 : -1) * progress * 1.45
          bot.model.group.position.y = -progress * 0.22
        }
        if (bot.respawnTimer <= 0) this.respawnBot(bot)
        continue
      }
      const roleStats = BOT_ROLES[bot.role]
      bot.fireTimer -= delta
      bot.hitFlash = Math.max(0, bot.hitFlash - delta)
      bot.model.body.material.emissiveIntensity = bot.hitFlash > 0 ? 0.8 : 0.08
      if (bot.role === 'support') {
        bot.healTimer -= delta
        if (bot.healTimer <= 0) {
          const ally = this.bots.find((candidate) => candidate.team === bot.team && candidate.health > 0 && candidate.health < candidate.maxHealth && candidate.model.group.position.distanceTo(bot.model.group.position) < 8)
          if (ally) {
            ally.health = Math.min(ally.maxHealth, ally.health + 20)
            this.spawnTracer(bot.model.group.position.clone().setY(1.3), ally.model.group.position.clone().setY(1.3), 0x72ff8b)
          }
          bot.healTimer = 4
        }
      }
      const target = this.findTarget(bot.team, bot.model.group.position)
      if (!target) continue
      const targetPosition = this.getTargetPosition(target)
      const direction = targetPosition.clone().sub(bot.model.group.position).setY(0)
      const distance = Math.max(0.01, direction.length())
      direction.divideScalar(distance)
      const detailed = distance < 16
      bot.model.leftLeg.visible = detailed
      bot.model.rightLeg.visible = detailed
      bot.model.leftArm.visible = detailed
      bot.model.rightArm.visible = detailed
      bot.model.weakPoint.visible = detailed
      for (const detail of bot.model.details) detail.visible = detailed
      const origin = bot.model.group.position.clone().setY(1.2)
      const aimPoint = this.getTargetAimPoint(target)
      const aimDirection = aimPoint.clone().sub(origin)
      const blocked = raycastObstacles(origin, aimDirection.clone().normalize(), origin.distanceTo(aimPoint), this.obstacles) !== null
      const movement = direction.clone()
      if (!blocked && distance < roleStats.preferredDistance - 3) movement.multiplyScalar(-1)
      else if (!blocked && distance < roleStats.preferredDistance + 3) movement.set(-direction.z, 0, direction.x).multiplyScalar(Math.sin(bot.phase + this.timeRemaining * 0.7))
      const steering = steerAroundObstacles(bot.model.group.position, movement, 0.48, this.obstacles)
      bot.model.group.position.addScaledVector(steering, roleStats.speed * delta)
      resolveCircleCollisions(bot.model.group.position, 0.48, this.obstacles)
      bot.model.group.position.x = THREE.MathUtils.clamp(bot.model.group.position.x, -this.map.arenaLimit, this.map.arenaLimit)
      bot.model.group.position.z = THREE.MathUtils.clamp(bot.model.group.position.z, -this.map.arenaLimit, this.map.arenaLimit)
      bot.model.group.rotation.y = Math.atan2(-direction.x, -direction.z)
      const walk = Math.sin(this.timeRemaining * 7 + bot.phase) * 0.45
      bot.model.leftLeg.rotation.x = walk
      bot.model.rightLeg.rotation.x = -walk
      bot.model.leftArm.rotation.x = -1.05
      bot.model.rightArm.rotation.x = -1.05
      if (!blocked && distance < roleStats.range && bot.fireTimer <= 0) {
        bot.fireTimer = roleStats.fireInterval * (0.85 + Math.random() * 0.3)
        const hit = Math.random() < roleStats.accuracy
        const end = hit ? aimPoint : aimPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2))
        this.spawnTracer(origin, end, bot.team === 'alpha' ? 0x58f5e5 : 0xff668e)
        this.audio.playAt('enemyShoot', bot.model.group.position, this.player, this.yaw)
        if (hit) this.damageTarget(target, roleStats.damage, bot.team)
      }
    }
  }

  private findTarget(team: TctTeam, position: THREE.Vector3): Bot | 'player' | null {
    const targets: (Bot | 'player')[] = this.bots.filter((bot) => bot.team !== team && bot.health > 0)
    if (team === 'enemy' && this.playerRespawn <= 0) targets.push('player')
    let nearest: Bot | 'player' | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const target of targets) {
      const distance = position.distanceToSquared(this.getTargetPosition(target))
      if (distance < nearestDistance) {
        nearest = target
        nearestDistance = distance
      }
    }
    return nearest
  }

  private getTargetPosition(target: Bot | 'player'): THREE.Vector3 {
    return target === 'player' ? this.player : target.model.group.position
  }

  private getTargetAimPoint(target: Bot | 'player'): THREE.Vector3 {
    return this.getTargetPosition(target).clone().setY(target === 'player' ? 1.4 + this.jumpHeight : 1.2)
  }

  private damageTarget(target: Bot | 'player', damage: number, attacker: TctTeam): void {
    if (target === 'player') this.damagePlayer(damage, attacker)
    else this.damageBot(target, damage, attacker, false)
  }

  private damageBot(bot: Bot, damage: number, attacker: TctTeam, byPlayer: boolean): void {
    if (bot.health <= 0 || bot.team === attacker) return
    bot.health -= damage
    bot.hitFlash = 0.09
    bot.model.body.material.emissive.setHex(0xffffff)
    bot.model.body.material.emissiveIntensity = 0.8
    if (bot.health > 0) return
    bot.health = 0
    bot.respawnTimer = TCT_CONFIG.respawnDelay
    bot.model.group.visible = true
    if (bot.team === 'alpha') this.enemyScore += 1
    else this.alphaScore += 1
    if (byPlayer) this.kills += 1
    this.audio.playAt('kill', bot.model.group.position, this.player, this.yaw)
  }

  private damagePlayer(damage: number, attacker: TctTeam): void {
    if (this.playerRespawn > 0 || this.invulnerability > 0 || attacker === 'alpha') return
    this.health = Math.max(0, this.health - damage)
    this.invulnerability = 0.25
    this.events.onDamage()
    this.audio.play('damage')
    if (this.health > 0) return
    this.enemyScore += 1
    this.deaths += 1
    this.playerRespawn = TCT_CONFIG.respawnDelay
    this.firing = false
    this.weapon.group.visible = false
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    )
    this.scene.add(line)
    this.tracers.push({ line, life: 0.08 })
  }

  private updateTracers(delta: number): void {
    this.decals.update(delta)
    for (let index = this.tracers.length - 1; index >= 0; index -= 1) {
      const tracer = this.tracers[index]
      if (!tracer) continue
      tracer.life -= delta
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.08)
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line)
        tracer.line.geometry.dispose()
        tracer.line.material.dispose()
        this.tracers.splice(index, 1)
      }
    }
  }

  private createResult(winner: TctTeam | 'draw'): TctResult {
    return { alphaScore: this.alphaScore, enemyScore: this.enemyScore, kills: this.kills, deaths: this.deaths, winner }
  }

  private finish(winner: TctTeam | 'draw'): void {
    if (this.state !== 'playing') return
    this.firing = false
    this.keys.clear()
    this.events.onMatchEnd(this.createResult(winner))
    this.setState(winner === 'alpha' ? 'victory' : 'gameover')
  }

  private emitHud(): void {
    this.camera.updateMatrixWorld()
    const allies = this.bots.flatMap((bot, index) => {
      if (bot.team !== 'alpha' || bot.health <= 0) return []
      const projected = bot.model.group.position.clone().setY(2.15).project(this.camera)
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return []
      return [{ id: index, x: (projected.x + 1) * 50, y: (1 - projected.y) * 50, health: bot.health / bot.maxHealth * 100, role: bot.role }]
    })
    this.events.onHud({
      health: this.health,
      maxHealth: 100,
      mapName: this.map.name,
      score: this.kills,
      wave: 0,
      level: 1,
      xp: 0,
      xpNext: 1,
      shards: 0,
      kills: this.kills,
      ammo: this.ammo,
      magazineSize: this.weaponDefinition.magazineSize,
      reserveAmmo: this.reserveAmmo,
      weaponName: this.weaponDefinition.name,
      reloading: this.reloadTimer > 0,
      aiming: this.aiming,
      waveBreak: 0,
      enemiesRemaining: this.bots.filter((bot) => bot.team === 'enemy' && bot.health > 0).length,
      grenadeCooldown: this.grenadeCooldown,
      turretCooldown: this.turretCooldown,
      door: null,
      performance: { fps: this.fps, drawCalls: this.renderer.info.render.calls },
      tct: {
        alphaScore: this.alphaScore,
        enemyScore: this.enemyScore,
        timeRemaining: this.timeRemaining,
        playerRespawn: this.playerRespawn,
        minimap: {
          playerX: this.player.x,
          playerZ: this.player.z,
          yaw: this.yaw,
          arenaLimit: this.map.arenaLimit,
          obstacles: this.map.obstacles.map((obstacle) => ({ x: obstacle.x, z: obstacle.z, width: obstacle.width, depth: obstacle.depth })),
          bots: this.bots.map((bot) => ({ x: bot.model.group.position.x, z: bot.model.group.position.z, team: bot.team, alive: bot.health > 0 })),
        },
        allies,
      },
    })
  }

  private update(delta: number): void {
    this.mapContent.ambient.rotation.y += delta * 0.015
    this.timeRemaining = Math.max(0, this.timeRemaining - delta)
    const winner = getMatchWinner(this.alphaScore, this.enemyScore, this.timeRemaining)
    if (winner) {
      this.finish(winner)
      return
    }
    this.updatePlayer(delta)
    this.updateBots(delta)
    this.updateEquipment(delta)
    this.updateTracers(delta)
    this.hudTimer -= delta
    if (this.hudTimer <= 0) {
      this.emitHud()
      this.hudTimer = 0.05
    }
  }

  private readonly animate = (time: number): void => {
    const frameDuration = Math.max(0, (time - this.lastTime) / 1000)
    const delta = Math.min(frameDuration, 0.05)
    this.lastTime = time
    if (this.active) {
      this.fpsTimer += frameDuration
      this.fpsFrames += 1
      if (this.fpsTimer >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsTimer)
        this.fpsTimer = 0
        this.fpsFrames = 0
      }
      if (this.state === 'playing') this.update(delta)
      else if (this.state === 'menu') {
        this.mapContent.ambient.rotation.y = time * 0.000015
        this.camera.position.set(Math.sin(time * 0.0001) * 8, 4.5, 14 + Math.cos(time * 0.0001) * 3)
        this.camera.lookAt(0, 1.2, 0)
      }
      this.pipeline.render()
    }
    this.animationId = requestAnimationFrame(this.animate)
  }

  private readonly resize = (): void => {
    const parent = this.renderer.domElement.parentElement
    if (!parent) return
    const width = parent.clientWidth
    const height = parent.clientHeight
    this.renderer.setSize(width, height)
    this.pipeline.setSize(width, height)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) return
    if (event.code === 'Escape') {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused') this.resume()
      return
    }
    if (this.state !== 'playing' || this.playerRespawn > 0) return
    if (event.code === 'Space') event.preventDefault()
    this.keys.add(event.code)
    if (event.code === 'Digit1') this.switchWeapon(this.primaryId)
    if (event.code === 'Digit2') this.switchWeapon('p-12')
    if (event.code === 'KeyR') this.startReload()
    if (event.code === 'KeyG') this.throwGrenade()
    if (event.code === 'KeyT') this.deployTurret()
    if (event.code === 'Space' && !event.repeat && this.grounded) {
      this.verticalVelocity = 6.5
      this.grounded = false
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.state !== 'playing' || this.playerRespawn > 0 || document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= event.movementX * this.mouseSensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * this.mouseSensitivity, -1.45, 1.45)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state !== 'playing' || this.playerRespawn > 0) return
    this.audio.resume()
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.requestMouse()
      return
    }
    if (event.button === 0) this.firing = true
    if (event.button === 2) this.aiming = true
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) this.firing = false
    if (event.button === 2) this.aiming = false
  }

  private readonly onPointerLockChange = (): void => {
    if (this.active && this.state === 'playing' && document.pointerLockElement !== this.renderer.domElement) this.pause()
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault()

  private readonly onBlur = (): void => {
    this.firing = false
    this.aiming = false
    this.keys.clear()
    if (this.active && this.state === 'playing') this.pause()
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('pointerup', this.onPointerUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
  }
}

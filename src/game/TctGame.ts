import * as THREE from 'three'
import { GameAudio } from './audio'
import { RenderPipeline } from './RenderPipeline'
import { DecalEffects } from './decals'
import { getGraphicsSettings } from './graphics'
import type { GraphicsQuality } from './graphics'
import { raycastObstacles } from './collision'
import type { CollisionObstacle } from './collision'
import { getGroundHeight, resolveBodyCollisions, stepBouncingProjectile } from './world'
import { PlayerController, readMovementInput } from './PlayerController'
import { WeaponAnimator } from './WeaponAnimator'
import { CombatEffects } from './effects'
import { createGrenadeModel, createTurretModel, disposeObject, TurretAnimator } from './equipmentModels'
import type { GrenadeModel } from './equipmentModels'
import { buildMap } from './mapBuilder'
import { DEPOT_06, MAPS } from './maps'
import type { MapDefinition } from './maps'
import { createEnemyModel, createWeaponModel } from './models'
import type { EnemyModel } from './models'
import { getTeamSpawn, TCT_CONFIG } from './tctRules'
import type { TctTeam } from './tctRules'
import type { AccessibilitySettings } from './accessibility'
import type { GameState, HudData } from './types'
import { createMagazine, reloadMagazine, WEAPON_ORDER, WEAPONS } from './weapons'
import type { MagazineState, WeaponId } from './weapons'
import type { NetSession } from './net/NetSession'
import type { HostMessage, LobbyPlayer, PlayerSnapshot, TeamScores, Vec3 } from './net/protocol'

const ALLY_COLOR = 0x58f5e5
const ENEMY_COLOR = 0xff4f87
const STATE_SEND_INTERVAL = 1 / 20
const DEATH_ANIMATION = 0.65
const GRENADE_RADIUS = 4.5
const GRENADE_DAMAGE = 90
const TURRET_DAMAGE = 14
const TURRET_LIFE = 14
const GRENADE_FUSE = 1.6

interface RemotePlayer {
  id: string
  name: string
  team: TctTeam
  crouch: boolean
  model: EnemyModel
  target: THREE.Vector3
  targetYaw: number
  health: number
  alive: boolean
  deathTimer: number
  hitFlash: number
  phase: number
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  life: number
}

interface Grenade {
  model: GrenadeModel
  velocity: THREE.Vector3
  timer: number
  trailTimer: number
  owned: boolean
}

interface Turret {
  animator: TurretAnimator
  life: number
  fireTimer: number
  owned: boolean
  /** Squadra del proprietario: le torrette remote mirano solo visivamente. */
  team: TctTeam
}

export interface TctResult {
  teamScore: number
  enemyScore: number
  kills: number
  deaths: number
  outcome: 'win' | 'loss' | 'draw'
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
  private readonly effects = new CombatEffects(this.scene)
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 240)
  private readonly renderer: THREE.WebGLRenderer
  private readonly pipeline: RenderPipeline
  private readonly audio = new GameAudio()
  private readonly keys = new Set<string>()
  private readonly controller = new PlayerController()
  private readonly player = this.controller.body.position
  private readonly weaponAnimator = new WeaponAnimator()
  private readonly remotes = new Map<string, RemotePlayer>()
  private readonly tracers: Tracer[] = []
  private readonly grenades: Grenade[] = []
  private readonly turrets: Turret[] = []
  private readonly weapon = createWeaponModel()
  private map: MapDefinition = DEPOT_06
  private mapContent = buildMap(this.map)
  private obstacles = this.openDoors()
  private state: GameState = 'menu'
  private graphicsQuality: GraphicsQuality = 'medium'
  private active = true
  private reducedMotion = false
  private mouseSensitivity = 0.002
  private session: NetSession | null = null
  private unsubscribe: (() => void) | null = null
  private localId = ''
  private team: TctTeam = 'alpha'
  private slot = 0
  private health = 100
  private alive = true
  private primaryId: WeaponId = 'ar-07'
  private weaponDefinition = WEAPONS['ar-07']
  private magazines = Object.fromEntries(WEAPON_ORDER.map((id) => [id, createMagazine(WEAPONS[id])])) as Record<WeaponId, MagazineState>
  private ammo = this.weaponDefinition.magazineSize
  private reserveAmmo: number | null = this.weaponDefinition.reserveAmmo
  private scores: TeamScores = { alpha: 0, bravo: 0 }
  private kills = 0
  private deaths = 0
  private timeRemaining: number = TCT_CONFIG.matchDuration
  private playerRespawn = 0
  private fireTimer = 0
  private reloadTimer = 0
  private firing = false
  private aiming = false
  private yaw = 0
  private pitch = 0
  private recoil = 0
  private muzzleTimer = 0
  private grenadeCooldown = 0
  private turretCooldown = 0
  private stateTimer = 0
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
    this.renderer.domElement.setAttribute('aria-label', 'Neon Arena: scontro tattico a squadre online')
    this.renderer.domElement.setAttribute('role', 'img')
    container.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color(0x070810)
    this.scene.fog = new THREE.FogExp2(0x0b0d1a, 0.0115)
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
    this.effects.setLightsEnabled(quality !== 'low')
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

  /** Mostra la mappa scelta nella lobby come sfondo del menu. */
  previewMap(mapId: string): void {
    const map = MAPS.find((candidate) => candidate.id === mapId)
    if (map && this.state === 'menu') this.setMap(map)
  }

  start(session: NetSession, mapId: string, players: readonly LobbyPlayer[], primary: WeaponId): void {
    const me = players.find((player) => player.id === session.localId)
    if (!me) return
    this.stop()
    this.session = session
    this.localId = session.localId
    this.team = me.team
    this.slot = me.slot
    this.setMap(MAPS.find((map) => map.id === mapId) ?? DEPOT_06)
    for (const player of players) {
      if (player.id !== this.localId) this.addRemote(player)
    }
    this.health = 100
    this.alive = true
    this.primaryId = primary
    this.weaponDefinition = WEAPONS[primary]
    this.refillMagazines()
    this.scores = { alpha: 0, bravo: 0 }
    this.kills = 0
    this.deaths = 0
    this.timeRemaining = TCT_CONFIG.matchDuration
    this.playerRespawn = 0
    this.fireTimer = 0
    this.reloadTimer = 0
    this.grenadeCooldown = 0
    this.turretCooldown = 0
    this.firing = false
    this.aiming = false
    this.moveToSpawn()
    this.unsubscribe = session.subscribe(this.onNetMessage)
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

  /** Abbandona la partita in corso; la chiusura della sessione è gestita dal menu. */
  abandon(): void {
    this.returnToMenu()
  }

  returnToMenu(): void {
    this.stop()
    this.setState('menu')
  }

  destroy(): void {
    cancelAnimationFrame(this.animationId)
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mouseup', this.onMouseButtonUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseButtonDown)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.stop()
    this.decals.dispose()
    this.effects.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
    this.clearRemotes()
    this.clearEquipment()
    this.effects.clear()
    this.firing = false
    this.aiming = false
    this.keys.clear()
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
    this.obstacles = this.openDoors()
    this.scene.add(this.mapContent.group)
    this.setGraphicsQuality(this.graphicsQuality)
  }

  /** Nel TCT le porte acquistabili della modalità zombie sono sempre aperte. */
  private openDoors(): CollisionObstacle[] {
    for (const door of this.mapContent.doors) door.group.visible = false
    const doorSolids = new Set(this.mapContent.doors.map((door) => door.obstacle))
    return this.mapContent.obstacles.filter((obstacle) => !doorSolids.has(obstacle))
  }

  private setState(state: GameState): void {
    this.state = state
    this.weapon.group.visible = state !== 'menu' && this.alive
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

  private get inMatch(): boolean {
    return this.state === 'playing' || this.state === 'paused'
  }

  // -------------------------------------------------------------------------
  // Rete
  // -------------------------------------------------------------------------

  private readonly onNetMessage = (message: HostMessage): void => {
    if (!this.inMatch) return
    switch (message.t) {
      case 'snapshot':
        this.applySnapshot(message.time, message.scores, message.players)
        break
      case 'shot':
        if (message.by !== this.localId) {
          const shooter = this.remotes.get(message.by)
          this.spawnTracer(toVector(message.from), toVector(message.to), shooter?.team === this.team ? ALLY_COLOR : 0xff668e)
          this.effects.muzzle(toVector(message.from), shooter?.team === this.team ? 0x8effd9 : 0xff9ab6)
          this.audio.playAt('enemyShoot', toVector(message.from), this.player, this.yaw)
        }
        break
      case 'grenade':
        if (message.by !== this.localId) this.spawnGrenade(toVector(message.pos), toVector(message.vel), false)
        break
      case 'turret':
        if (message.by !== this.localId) this.spawnTurret(toVector(message.pos), false, this.remotes.get(message.by)?.team ?? (this.team === 'alpha' ? 'bravo' : 'alpha'))
        break
      case 'damage':
        if (message.target === this.localId) {
          this.events.onDamage()
          this.audio.play('damage')
        } else {
          const remote = this.remotes.get(message.target)
          if (remote) remote.hitFlash = 0.09
        }
        break
      case 'kill':
        if (message.killer === this.localId) this.kills += 1
        if (message.victim === this.localId) this.deaths += 1
        else {
          const victim = this.remotes.get(message.victim)
          if (victim) this.audio.playAt('kill', victim.model.group.position, this.player, this.yaw)
        }
        break
      case 'end':
        this.scores = message.scores
        this.finish(message.winner === 'draw' ? 'draw' : message.winner === this.team ? 'win' : 'loss')
        break
      default:
        break
    }
  }

  private applySnapshot(time: number, scores: TeamScores, players: readonly PlayerSnapshot[]): void {
    this.timeRemaining = time
    this.scores = scores
    const seen = new Set<string>()
    for (const snapshot of players) {
      seen.add(snapshot.id)
      if (snapshot.id === this.localId) {
        this.applyLocalSnapshot(snapshot)
        continue
      }
      const remote = this.remotes.get(snapshot.id) ?? this.addRemote(snapshot)
      const respawned = !remote.alive && snapshot.alive
      remote.health = snapshot.health
      remote.crouch = snapshot.crouch
      remote.target.set(snapshot.x, snapshot.y, snapshot.z)
      remote.targetYaw = snapshot.yaw
      if (respawned || remote.model.group.position.distanceTo(remote.target) > 6) {
        remote.model.group.position.copy(remote.target)
        remote.model.group.rotation.set(0, snapshot.yaw, 0)
        remote.model.group.visible = true
      }
      if (remote.alive && !snapshot.alive) remote.deathTimer = 0
      remote.alive = snapshot.alive
    }
    for (const id of [...this.remotes.keys()]) {
      if (!seen.has(id)) this.removeRemote(id)
    }
  }

  private applyLocalSnapshot(snapshot: PlayerSnapshot): void {
    this.health = snapshot.health
    this.playerRespawn = snapshot.alive ? 0 : snapshot.respawn
    if (this.alive && !snapshot.alive) {
      this.alive = false
      this.firing = false
      this.aiming = false
      this.weapon.group.visible = false
    } else if (!this.alive && snapshot.alive) {
      this.alive = true
      this.refillMagazines()
      this.moveToSpawn()
      this.weapon.group.visible = true
    }
  }

  private sendState(): void {
    this.session?.send({
      t: 'state',
      x: round(this.player.x),
      y: round(this.player.y),
      z: round(this.player.z),
      yaw: round(this.yaw, 3),
      pitch: round(this.pitch, 3),
      crouch: this.controller.crouched,
    })
  }

  // -------------------------------------------------------------------------
  // Giocatori remoti
  // -------------------------------------------------------------------------

  private addRemote(player: LobbyPlayer): RemotePlayer {
    const model = createEnemyModel('walker', player.team === this.team ? ALLY_COLOR : ENEMY_COLOR, 'soldier')
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x293542, metalness: 0.8, roughness: 0.3 }),
    )
    gun.position.set(0.4, 1.15, -0.42)
    model.group.add(gun)
    model.details.push(gun)
    model.leftArm.rotation.x = -1.05
    model.rightArm.rotation.x = -1.05
    const spawn = getTeamSpawn(player.team, player.slot, this.map.arenaLimit)
    model.group.position.set(spawn.x, 0, spawn.z)
    this.scene.add(model.group)
    const remote: RemotePlayer = {
      id: player.id,
      name: player.name,
      team: player.team,
      crouch: false,
      model,
      target: model.group.position.clone(),
      targetYaw: player.team === 'alpha' ? 0 : Math.PI,
      health: 100,
      alive: true,
      deathTimer: 0,
      hitFlash: 0,
      phase: Math.random() * Math.PI * 2,
    }
    this.remotes.set(player.id, remote)
    return remote
  }

  private removeRemote(id: string): void {
    const remote = this.remotes.get(id)
    if (!remote) return
    this.scene.remove(remote.model.group)
    remote.model.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.remotes.delete(id)
  }

  private clearRemotes(): void {
    this.decals.clear()
    for (const id of [...this.remotes.keys()]) this.removeRemote(id)
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line)
      tracer.line.geometry.dispose()
      tracer.line.material.dispose()
    }
    this.tracers.length = 0
  }

  private updateRemotes(delta: number): void {
    const blend = 1 - Math.exp(-14 * delta)
    for (const remote of this.remotes.values()) {
      const { model } = remote
      if (!remote.alive) {
        remote.deathTimer += delta
        model.group.visible = remote.deathTimer <= DEATH_ANIMATION
        if (model.group.visible) {
          const progress = Math.min(1, remote.deathTimer / DEATH_ANIMATION)
          model.group.rotation.z = (Math.sin(remote.phase) > 0 ? 1 : -1) * progress * 1.45
          model.group.position.y = -progress * 0.22
        }
        continue
      }
      model.group.rotation.z = 0
      model.group.scale.y = THREE.MathUtils.lerp(model.group.scale.y, remote.crouch ? 0.68 : 1, 1 - Math.exp(-delta * 12))
      const previous = model.group.position.clone()
      model.group.position.lerp(remote.target, blend)
      const yawDelta = Math.atan2(Math.sin(remote.targetYaw - model.group.rotation.y), Math.cos(remote.targetYaw - model.group.rotation.y))
      model.group.rotation.y += yawDelta * blend
      const speed = previous.setY(0).distanceTo(model.group.position.clone().setY(0)) / Math.max(delta, 0.001)
      remote.phase += delta * Math.min(10, speed * 1.4)
      const walk = speed > 0.3 ? Math.sin(remote.phase) * 0.45 : 0
      model.leftLeg.rotation.x = walk
      model.rightLeg.rotation.x = -walk
      remote.hitFlash = Math.max(0, remote.hitFlash - delta)
      model.body.material.emissive.setHex(remote.hitFlash > 0 ? 0xffffff : 0x000000)
      model.body.material.emissiveIntensity = remote.hitFlash > 0 ? 0.8 : 0.08
      const detailed = model.group.position.distanceTo(this.player) < 16
      model.leftLeg.visible = detailed
      model.rightLeg.visible = detailed
      model.leftArm.visible = detailed
      model.rightArm.visible = detailed
      model.weakPoint.visible = detailed
      for (const detail of model.details) detail.visible = detailed
    }
  }

  private livingEnemies(): RemotePlayer[] {
    return [...this.remotes.values()].filter((remote) => remote.team !== this.team && remote.alive)
  }

  // -------------------------------------------------------------------------
  // Giocatore locale
  // -------------------------------------------------------------------------

  private moveToSpawn(): void {
    const spawn = getTeamSpawn(this.team, this.slot, this.map.arenaLimit)
    this.controller.reset(spawn.x, 0, spawn.z)
    this.weaponAnimator.reset()
    this.yaw = this.team === 'alpha' ? 0 : Math.PI
    this.pitch = 0
    this.reloadTimer = 0
  }

  private refillMagazines(): void {
    for (const id of WEAPON_ORDER) this.magazines[id] = createMagazine(WEAPONS[id])
    this.ammo = this.magazines[this.weaponDefinition.id].ammo
    this.reserveAmmo = this.magazines[this.weaponDefinition.id].reserveAmmo
  }

  private updatePlayer(delta: number): void {
    this.fireTimer -= delta
    this.muzzleTimer = Math.max(0, this.muzzleTimer - delta)
    this.weapon.flash.visible = this.muzzleTimer > 0
    if (!this.alive) {
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
    const controllable = this.state === 'playing'
    const input = readMovementInput(controllable ? this.keys : new Set<string>(), this.aiming || this.firing || this.reloadTimer > 0)
    this.controller.update(delta, input, this.yaw, {
      speed: 7 * this.weaponDefinition.moveMultiplier,
      solids: this.obstacles,
      arenaLimit: this.map.arenaLimit,
    })
    this.recoil = Math.max(0, this.recoil - delta * 4)
    this.updateCamera(delta)
    if (controllable && this.firing && this.fireTimer <= 0 && this.reloadTimer <= 0 && !this.weaponAnimator.switching && !this.controller.sprinting) {
      if (this.ammo > 0) this.fireWeapon()
      else this.startReload()
    }
  }

  private updateCamera(delta = 0): void {
    this.controller.getEyePosition(this.camera.position, this.reducedMotion)
    this.camera.rotation.set(this.pitch, this.yaw, this.reducedMotion ? 0 : this.controller.roll)
    const targetFov = this.aiming ? 55 : this.controller.sliding ? 84 : this.controller.sprinting ? 80 : 75
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-delta * 12))
    this.camera.updateProjectionMatrix()
    this.weaponAnimator.apply(this.weapon.group, delta, {
      aiming: this.aiming,
      sprinting: this.controller.sprinting,
      sliding: this.controller.sliding,
      crouchAmount: this.controller.crouchAmount,
      bob: this.controller.getBob(this.reducedMotion),
      strafe: this.controller.strafeAmount,
      reloadProgress: this.reloadTimer > 0 ? 1 - this.reloadTimer / this.weaponDefinition.reloadDuration : -1,
      recoil: this.recoil,
      landingKick: this.controller.landingKick,
      airborne: !this.controller.body.grounded,
      reducedMotion: this.reducedMotion,
    })
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
    this.weaponAnimator.startSwitch()
    this.audio.play('pickup')
    this.emitHud()
  }

  private startReload(): void {
    if (this.reloadTimer > 0 || this.ammo === this.weaponDefinition.magazineSize || !this.alive) return
    this.reloadTimer = this.weaponDefinition.reloadDuration
    this.firing = false
  }

  private fireWeapon(): void {
    const definition = this.weaponDefinition
    this.ammo -= 1
    this.fireTimer = 1 / definition.fireRate
    this.muzzleTimer = 0.045
    this.recoil = Math.min(0.16, this.recoil + 0.045)
    this.pitch = THREE.MathUtils.clamp(this.pitch + definition.recoil * (this.aiming ? 0.55 : 1), -1.45, 1.45)
    this.audio.play('shoot')
    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const forward = this.camera.getWorldDirection(new THREE.Vector3())
    const spread = (this.aiming ? definition.adsSpread : definition.hipSpread) * (this.controller.crouched ? 0.7 : 1)
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3())
    const damageByTarget = new Map<string, { damage: number; headshot: boolean }>()
    let anyHeadshot = false
    for (let pellet = 0; pellet < definition.pellets; pellet += 1) {
      const direction = forward.clone()
      direction.x += (Math.random() - 0.5) * spread
      direction.y += (Math.random() - 0.5) * spread
      direction.normalize()
      const wallDistance = raycastObstacles(origin, direction, definition.range, this.obstacles)
      const ray = new THREE.Ray(origin, direction)
      let target: RemotePlayer | null = null
      let hitPoint: THREE.Vector3 | null = null
      let hitDistance = wallDistance ?? definition.range
      let headshot = false
      for (const remote of this.livingEnemies()) {
        for (const zone of [true, false]) {
          const object = zone ? remote.model.head : remote.model.body
          const point = ray.intersectSphere(new THREE.Sphere(object.getWorldPosition(new THREE.Vector3()), zone ? 0.3 : 0.55), new THREE.Vector3())
          if (!point) continue
          const distance = origin.distanceTo(point)
          if (distance < hitDistance) {
            target = remote
            hitPoint = point
            hitDistance = distance
            headshot = zone
          }
        }
      }
      if (target) {
        const entry = damageByTarget.get(target.id) ?? { damage: 0, headshot: false }
        entry.damage += definition.damage * (headshot ? definition.headshotMultiplier : 1)
        entry.headshot ||= headshot
        anyHeadshot ||= headshot
        damageByTarget.set(target.id, entry)
      }
      const end = hitPoint ?? origin.clone().addScaledVector(direction, hitDistance)
      if (!target && wallDistance !== null) {
        this.decals.spawn(end, origin)
        if (pellet === 0) this.effects.sparks(end, origin.clone().sub(end).normalize(), 0xffd59a, 4)
      }
      this.spawnTracer(muzzle, end, 0x8effd9)
      if (pellet === 0) this.session?.send({ t: 'shot', from: toTuple(muzzle), to: toTuple(end) })
    }
    for (const [target, entry] of damageByTarget) {
      this.session?.send({ t: 'hit', target, damage: round(entry.damage), headshot: entry.headshot, source: 'gun', weapon: definition.id })
    }
    if (damageByTarget.size > 0) {
      this.events.onHit(anyHeadshot)
      this.audio.play('hit')
    }
    if (!definition.automatic) this.firing = false
  }

  // -------------------------------------------------------------------------
  // Equipaggiamenti
  // -------------------------------------------------------------------------

  private throwGrenade(): void {
    if (this.state !== 'playing' || !this.alive || this.grenadeCooldown > 0) return
    const direction = this.camera.getWorldDirection(new THREE.Vector3())
    const position = this.camera.position.clone().addScaledVector(direction, 0.6)
    const velocity = direction.multiplyScalar(13)
    velocity.y += 3.5
    velocity.add(this.controller.velocity.clone().multiplyScalar(0.5))
    this.spawnGrenade(position, velocity, true)
    this.session?.send({ t: 'grenade', pos: toTuple(position), vel: toTuple(velocity) })
    this.grenadeCooldown = 7
    this.weaponAnimator.startSwitch()
  }

  private spawnGrenade(position: THREE.Vector3, velocity: THREE.Vector3, owned: boolean): void {
    const model = createGrenadeModel(owned ? 0x6affea : 0xff6f9a)
    model.group.position.copy(position)
    this.scene.add(model.group)
    this.grenades.push({ model, velocity: velocity.clone(), timer: GRENADE_FUSE, trailTimer: 0, owned })
  }

  private explodeGrenade(grenade: Grenade): void {
    const position = grenade.model.group.position.clone()
    const ground = getGroundHeight(position.x, position.z, position.y + 0.2, 0.2, this.obstacles)
    this.effects.explosion(position, GRENADE_RADIUS, grenade.owned ? 0xff9a4a : 0xff6f9a, ground)
    if (grenade.owned) {
      for (const remote of this.livingEnemies()) {
        const center = remote.model.group.position.clone().setY(remote.model.group.position.y + 0.9)
        const distance = center.distanceTo(position)
        if (distance > GRENADE_RADIUS) continue
        if (raycastObstacles(position, center.clone().sub(position).normalize(), distance, this.obstacles) !== null) continue
        const damage = GRENADE_DAMAGE * Math.max(0.25, 1 - distance / GRENADE_RADIUS)
        this.session?.send({ t: 'hit', target: remote.id, damage: round(damage), headshot: false, source: 'grenade', weapon: this.weaponDefinition.id })
      }
    }
    this.audio.playAt('damage', position, this.player, this.yaw)
  }

  private deployTurret(): void {
    if (this.state !== 'playing' || !this.alive || this.turretCooldown > 0) return
    const direction = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
    const position = this.player.clone().addScaledVector(direction, 1.8)
    resolveBodyCollisions(position, 0.5, 1, this.obstacles)
    position.y = getGroundHeight(position.x, position.z, this.player.y + 0.3, 0.5, this.obstacles)
    this.spawnTurret(position, true, this.team)
    this.session?.send({ t: 'turret', pos: toTuple(position) })
    this.turretCooldown = 18
    this.audio.play('upgrade')
  }

  private spawnTurret(position: THREE.Vector3, owned: boolean, team: TctTeam): void {
    const model = createTurretModel(owned || team === this.team ? 0x6affea : 0xff6f9a)
    model.group.position.copy(position)
    this.scene.add(model.group)
    this.turrets.push({ animator: new TurretAnimator(model), life: TURRET_LIFE, fireTimer: 0.6, owned, team })
    this.effects.pulse(position, owned ? 0x6affea : 0xff6f9a, 1.8)
  }

  private updateEquipment(delta: number): void {
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - delta)
    this.turretCooldown = Math.max(0, this.turretCooldown - delta)
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      const grenade = this.grenades[index]
      if (!grenade) continue
      grenade.timer -= delta
      const position = grenade.model.group.position
      stepBouncingProjectile(position, grenade.velocity, delta, this.obstacles)
      grenade.model.group.rotation.x += grenade.velocity.length() * delta * 2
      const elapsed = GRENADE_FUSE - grenade.timer
      grenade.model.light.material.emissiveIntensity = Math.sin(elapsed * (8 + elapsed * 22)) > 0 ? 3.5 : 0.3
      grenade.trailTimer -= delta
      if (grenade.trailTimer <= 0 && grenade.velocity.lengthSq() > 4) {
        this.effects.trail(position, grenade.owned ? 0x6affea : 0xff6f9a)
        grenade.trailTimer = 0.03
      }
      if (grenade.timer <= 0) {
        this.explodeGrenade(grenade)
        this.scene.remove(grenade.model.group)
        disposeObject(grenade.model.group)
        this.grenades.splice(index, 1)
      }
    }
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index]
      if (!turret) continue
      turret.life -= delta
      turret.fireTimer -= delta
      this.updateTurret(turret, delta)
      if (turret.life <= 0) {
        const group = turret.animator.model.group
        this.effects.explosion(group.position.clone().setY(group.position.y + 0.8), 1.6, turret.owned ? 0x6affea : 0xff6f9a, group.position.y)
        this.removeTurret(index)
      }
    }
  }

  /** Torrette remote: solo animazione verso il bersaglio più vicino; i colpi arrivano dalla rete. */
  private updateTurret(turret: Turret, delta: number): void {
    if (turret.owned) {
      this.updateOwnedTurret(turret, delta)
      return
    }
    const origin = turret.animator.model.group.position.clone().setY(turret.animator.model.group.position.y + 0.85)
    let target: THREE.Vector3 | null = null
    let best = 14
    const candidates: THREE.Vector3[] = []
    if (turret.team !== this.team && this.alive) candidates.push(this.camera.position.clone().setY(this.player.y + 1.1))
    for (const remote of this.remotes.values()) if (remote.alive && remote.team !== turret.team) candidates.push(remote.model.body.getWorldPosition(new THREE.Vector3()))
    for (const candidate of candidates) {
      const distance = candidate.distanceTo(origin)
      if (distance < best) {
        best = distance
        target = candidate
      }
    }
    turret.animator.update(delta, target, turret.life / TURRET_LIFE)
  }

  private updateOwnedTurret(turret: Turret, delta: number): void {
    let target: RemotePlayer | null = null
    let targetDistance = 14
    const group = turret.animator.model.group
    const origin = group.position.clone().setY(group.position.y + 0.85)
    for (const remote of this.livingEnemies()) {
      const targetPosition = remote.model.body.getWorldPosition(new THREE.Vector3())
      const distance = targetPosition.distanceTo(origin)
      if (distance >= targetDistance) continue
      const blocked = raycastObstacles(origin, targetPosition.clone().sub(origin).normalize(), distance, this.obstacles) !== null
      if (!blocked) {
        target = remote
        targetDistance = distance
      }
    }
    const targetPosition = target ? target.model.body.getWorldPosition(new THREE.Vector3()) : null
    turret.animator.update(delta, targetPosition, turret.life / TURRET_LIFE)
    if (!target || !targetPosition || turret.fireTimer > 0) return
    turret.fireTimer = 0.24
    const muzzle = turret.animator.fire().getWorldPosition(new THREE.Vector3())
    this.session?.send({ t: 'hit', target: target.id, damage: TURRET_DAMAGE, headshot: false, source: 'turret', weapon: this.weaponDefinition.id })
    this.session?.send({ t: 'shot', from: toTuple(muzzle), to: toTuple(targetPosition) })
    this.spawnTracer(muzzle, targetPosition, 0x8effd9)
    this.effects.muzzle(muzzle, 0x8effd9)
    this.audio.play('shoot')
  }

  private removeTurret(index: number): void {
    const turret = this.turrets[index]
    if (!turret) return
    this.scene.remove(turret.animator.model.group)
    disposeObject(turret.animator.model.group)
    this.turrets.splice(index, 1)
  }

  private clearEquipment(): void {
    for (const grenade of this.grenades) {
      this.scene.remove(grenade.model.group)
      disposeObject(grenade.model.group)
    }
    this.grenades.length = 0
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) this.removeTurret(index)
  }

  // -------------------------------------------------------------------------
  // Effetti, HUD e ciclo
  // -------------------------------------------------------------------------

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
    this.effects.update(delta)
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

  private get teamScore(): number {
    return this.scores[this.team]
  }

  private get enemyScore(): number {
    return this.scores[this.team === 'alpha' ? 'bravo' : 'alpha']
  }

  private finish(outcome: TctResult['outcome']): void {
    if (!this.inMatch) return
    const result: TctResult = { teamScore: this.teamScore, enemyScore: this.enemyScore, kills: this.kills, deaths: this.deaths, outcome }
    this.stop()
    this.events.onMatchEnd(result)
    this.setState(outcome === 'win' ? 'victory' : 'gameover')
  }

  private emitHud(): void {
    this.camera.updateMatrixWorld()
    const allies = [...this.remotes.values()].flatMap((remote) => {
      if (remote.team !== this.team || !remote.alive) return []
      const projected = remote.model.group.position.clone().setY(2.15).project(this.camera)
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return []
      return [{ id: remote.id, x: (projected.x + 1) * 50, y: (1 - projected.y) * 50, health: remote.health, name: remote.name }]
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
      enemiesRemaining: this.livingEnemies().length,
      grenadeCooldown: this.grenadeCooldown,
      turretCooldown: this.turretCooldown,
      interaction: null,
      weaponSlots: [],
      stance: this.controller.sliding ? 'slide' : this.controller.crouched ? 'crouch' : 'stand',
      performance: { fps: this.fps, drawCalls: this.renderer.info.render.calls },
      tct: {
        teamScore: this.teamScore,
        enemyScore: this.enemyScore,
        team: this.team,
        timeRemaining: this.timeRemaining,
        playerRespawn: this.playerRespawn,
        minimap: {
          playerX: this.player.x,
          playerZ: this.player.z,
          yaw: this.yaw,
          arenaLimit: this.map.arenaLimit,
          obstacles: this.map.obstacles.map((obstacle) => ({ x: obstacle.x, z: obstacle.z, width: obstacle.width, depth: obstacle.depth })),
          players: [...this.remotes.values()].map((remote) => ({
            x: remote.model.group.position.x,
            z: remote.model.group.position.z,
            ally: remote.team === this.team,
            alive: remote.alive,
          })),
        },
        allies,
      },
    })
  }

  private update(delta: number): void {
    this.mapContent.ambient.rotation.y += delta * 0.015
    this.updatePlayer(delta)
    this.updateRemotes(delta)
    this.updateEquipment(delta)
    this.updateTracers(delta)
    this.stateTimer -= delta
    if (this.stateTimer <= 0 && this.alive) {
      this.stateTimer = STATE_SEND_INTERVAL
      this.sendState()
    }
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
      // La partita online non si ferma: in pausa il mondo continua ad aggiornarsi senza input.
      if (this.inMatch) this.update(delta)
      else if (this.state === 'menu') {
        this.mapContent.ambient.rotation.y = time * 0.000015
        const radius = this.map.arenaLimit * 0.75
        this.camera.position.set(Math.sin(time * 0.00008) * radius, 7 + Math.sin(time * 0.00005) * 1.5, Math.cos(time * 0.00008) * radius)
        this.camera.rotation.z = 0
        this.camera.lookAt(0, 2, 0)
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
    if (this.state !== 'playing' || !this.alive) return
    if (event.code === 'Space') event.preventDefault()
    this.keys.add(event.code)
    if (event.code === 'Digit1') this.switchWeapon(this.primaryId)
    if (event.code === 'Digit2') this.switchWeapon('p-12')
    if (event.code === 'KeyR') this.startReload()
    if (event.code === 'KeyG') this.throwGrenade()
    if (event.code === 'KeyT') this.deployTurret()
    if (event.code === 'Space' && !event.repeat) this.controller.jump(this.obstacles)
    if (event.code === 'KeyC' && !event.repeat) this.controller.pressCrouch()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.state !== 'playing' || !this.alive || document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= event.movementX * this.mouseSensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * this.mouseSensitivity, -1.45, 1.45)
    this.weaponAnimator.addLook(event.movementX, event.movementY)
  }

  private readonly onMouseButtonDown = (event: MouseEvent): void => {
    if (this.state !== 'playing' || !this.alive) return
    this.audio.resume()
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.requestMouse()
      return
    }
    if (event.button === 0) this.firing = true
    if (event.button === 2) this.aiming = true
  }

  private readonly onMouseButtonUp = (event: MouseEvent): void => {
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
    window.addEventListener('mouseup', this.onMouseButtonUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.renderer.domElement.addEventListener('mousedown', this.onMouseButtonDown)
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
  }
}

function toVector(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2])
}

function toTuple(vector: THREE.Vector3): Vec3 {
  return [round(vector.x), round(vector.y), round(vector.z)]
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

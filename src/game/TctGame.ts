import { WEAPON_XP } from './armory'
import { DEFAULT_THEME } from './maps'
import { animateWeather } from './weather'
import { getAimSensitivityScale } from './accessibility'
import { getSoldierHitboxes, intersectRayCapsule, LEG_DAMAGE_MULTIPLIER } from './hitboxes'
import { getRangeMultiplier } from './weapons'
import { getGunSoundProfile } from './gunSounds'
import { getSpatialSound } from './spatialAudio'
import * as THREE from 'three'
import { GameAudio } from './audio'
import { RenderPipeline } from './RenderPipeline'
import { DecalEffects } from './decals'
import { getGraphicsSettings } from './graphics'
import type { GraphicsQuality } from './graphics'
import { raycastObstacles } from './collision'
import type { CollisionObstacle } from './collision'
import { getGroundHeight, resolveBodyCollisions } from './world'
import { PlayerController, readMovementInput } from './PlayerController'
import { CombatEffects } from './effects'
import { disposeObject } from './equipmentModels'
import { buildMap } from './mapBuilder'
import { disposeMaterialVariants, setLambertMaterials } from './materialQuality'
import { DEPOT_06, MAPS } from './maps'
import type { MapDefinition } from './maps'
import type { EnemyModel } from './models'
import { createSoldierModel } from './characterModels'
import { getTeamSpawn, TCT_CONFIG } from './tctRules'
import type { TctTeam } from './tctRules'
import type { AccessibilitySettings } from './accessibility'
import type { GameState, HudData } from './types'
import { DEFAULT_LOADOUT, resolveLoadout } from './armory'
import type { ResolvedLoadout } from './armory'
import { DEFAULT_COSMETICS } from './cosmetics'
import { EQUIPMENT } from './equipment'
import type { EquipmentSlot } from './equipment'
import { EquipmentSystem } from './EquipmentSystem'
import type { DeployableKind, EquipmentTarget, ThrowableKind } from './EquipmentSystem'
import { WeaponHandler } from './WeaponHandler'
import type { ActiveSlot } from './WeaponHandler'
import type { NetSession } from './net/NetSession'
import type { HostMessage, LobbyPlayer, PlayerSnapshot, TeamScores, Vec3 } from './net/protocol'

const ALLY_COLOR = 0x58f5e5
const ENEMY_COLOR = 0xff4f87
const STATE_SEND_INTERVAL = 1 / 20
const DEATH_ANIMATION = 0.65
/** Secondi in cui un nemico che spara resta visibile sulla minimappa. */
const SHOT_REVEAL = 1.6

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
  revealed: number
  equipmentTarget: EquipmentTarget
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  life: number
}

export interface TctResult {
  teamScore: number
  enemyScore: number
  kills: number
  deaths: number
  outcome: 'win' | 'loss' | 'draw'
  /** Esperienza guadagnata da ogni arma (eliminazioni fatte con quell'arma). */
  weaponXp?: Partial<Record<string, number>>
}

interface TctEvents {
  onStateChange: (state: GameState) => void
  onHud: (hud: HudData) => void
  onMatchEnd: (result: TctResult) => void
  onDamage: () => void
  onHit: (headshot: boolean) => void
  onFlash?: (intensity: number) => void
}

export class TctGame {
  /** Esperienza delle armi accumulata nella partita. */
  private readonly weaponXp = new Map<string, number>()
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
  private readonly weapons = new WeaponHandler(this.camera)
  private readonly equipment: EquipmentSystem
  private readonly remotes = new Map<string, RemotePlayer>()
  private readonly tracers: Tracer[] = []
  private readonly localTarget: EquipmentTarget = { id: '', feet: this.player, height: 1.8, radius: 0.42 }
  private map: MapDefinition = DEPOT_06
  private mapContent = buildMap(this.map)
  private obstacles = this.openDoors()
  private loadout: ResolvedLoadout = resolveLoadout(DEFAULT_LOADOUT, DEFAULT_COSMETICS)
  private readonly cooldowns: Record<EquipmentSlot, number> = { lethal: 0, tactical: 0, gadget: 0 }
  private decoyPings: { x: number; z: number; life: number }[] = []
  private revealTimer = 0
  private stunTimer = 0
  private cameraShake = 0
  private deployCounter = 0
  private lastWheel = 0
  private state: GameState = 'menu'
  private graphicsQuality: GraphicsQuality = 'medium'
  private active = true
  private reducedMotion = false
  private adsSensitivity = 1
  private mouseSensitivity = 0.002
  private session: NetSession | null = null
  private unsubscribe: (() => void) | null = null
  private localId = ''
  private team: TctTeam = 'alpha'
  private slot = 0
  private health = 100
  private alive = true
  private scores: TeamScores = { alpha: 0, bravo: 0 }
  private kills = 0
  private deaths = 0
  private timeRemaining: number = TCT_CONFIG.matchDuration
  private playerRespawn = 0
  private firing = false
  private aiming = false
  private yaw = 0
  private pitch = 0
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
    const initialTheme = this.map.theme ?? DEFAULT_THEME
    this.scene.background = new THREE.Color(initialTheme.background)
    this.scene.fog = new THREE.FogExp2(initialTheme.fog, initialTheme.fogDensity)
    this.camera.rotation.order = 'YXZ'
    this.weapons.configure(this.loadout)
    this.equipment = this.createEquipmentSystem()
    this.equipment.onTurretShot = (from, to) => {
      this.spawnTracer(from, to, 0x8effd9)
      this.session?.send({ t: 'shot', from: toTuple(from), to: toTuple(to) })
    }
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
    this.adsSensitivity = settings.adsSensitivity
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
    let staticLightIndex = 0
    this.mapContent.group.traverse((object) => {
      if (object instanceof THREE.PointLight) object.visible = staticLightIndex++ < settings.staticLights
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
    setLambertMaterials(this.mapContent.group, quality === 'low')
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
    this.weapons.setTrigger(false)
    this.keys.clear()
    this.lastTime = performance.now()
  }

  /** Mostra la mappa scelta nella lobby come sfondo del menu. */
  previewMap(mapId: string): void {
    const map = MAPS.find((candidate) => candidate.id === mapId)
    if (map && this.state === 'menu') this.setMap(map)
  }

  start(session: NetSession, mapId: string, players: readonly LobbyPlayer[], loadout: ResolvedLoadout): void {
    const me = players.find((player) => player.id === session.localId)
    if (!me) return
    this.stop()
    this.session = session
    this.localId = session.localId
    this.localTarget.id = this.localId
    this.team = me.team
    this.slot = me.slot
    this.loadout = loadout
    this.setMap(MAPS.find((map) => map.id === mapId) ?? DEPOT_06)
    for (const player of players) {
      if (player.id !== this.localId) this.addRemote(player)
    }
    this.health = 100
    this.alive = true
    this.weapons.configure(loadout)
    this.scores = { alpha: 0, bravo: 0 }
    this.kills = 0
    this.weaponXp.clear()
    this.deaths = 0
    this.timeRemaining = TCT_CONFIG.matchDuration
    this.playerRespawn = 0
    this.cooldowns.lethal = 0
    this.cooldowns.tactical = 0
    this.cooldowns.gadget = 0
    this.revealTimer = 0
    this.stunTimer = 0
    this.decoyPings = []
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
    this.weapons.setTrigger(false)
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
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mouseup', this.onMouseButtonUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseButtonDown)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.stop()
    this.equipment.dispose()
    this.weapons.dispose()
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
    this.equipment.clear()
    this.effects.clear()
    this.firing = false
    this.aiming = false
    this.weapons.setTrigger(false)
    this.keys.clear()
  }

  private setMap(map: MapDefinition): void {
    if (this.map.id === map.id) return
    this.scene.remove(this.mapContent.group)
    this.mapContent.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line) && !(object instanceof THREE.Points)) return
      object.geometry.dispose()
      if (object instanceof THREE.Mesh) disposeMaterialVariants(object)
      else {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.map = map
    const theme = map.theme ?? DEFAULT_THEME
    this.scene.background = new THREE.Color(theme.background)
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity)
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
    this.weapons.setVisible(state !== 'menu' && this.alive)
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

  private createEquipmentSystem(): EquipmentSystem {
    return new EquipmentSystem({
      scene: this.scene,
      effects: this.effects,
      solids: () => this.obstacles,
      targets: (hostile) => {
        if (hostile) {
          const allies = [...this.remotes.values()].filter((remote) => remote.team === this.team && remote.alive).map((remote) => remote.equipmentTarget)
          return this.alive ? [this.localTarget, ...allies] : allies
        }
        return this.livingEnemies().map((remote) => remote.equipmentTarget)
      },
      damage: (target, amount, source) => {
        this.session?.send({ t: 'hit', target: target.id, damage: round(amount), headshot: false, source, weapon: this.loadout.primary.id })
      },
      localPlayer: () => ({ feet: this.player, eye: this.camera.position, forward: this.camera.getWorldDirection(new THREE.Vector3()), alive: this.alive && this.inMatch }),
      onLocalFlash: (intensity) => this.events.onFlash?.(intensity),
      onLocalStun: (seconds) => {
        this.stunTimer = Math.max(this.stunTimer, seconds)
      },
      onLocalBurn: () => undefined,
      onRefill: () => this.weapons.topUp(),
      onReveal: (seconds, hostile) => {
        if (!hostile) this.revealTimer = Math.max(this.revealTimer, seconds)
      },
      onDecoy: (position, seconds, hostile) => {
        if (hostile) this.decoyPings.push({ x: position.x, z: position.z, life: seconds })
      },
      addSolid: (solid) => {
        this.obstacles.push(solid)
      },
      removeSolid: (solid) => {
        const index = this.obstacles.indexOf(solid)
        if (index >= 0) this.obstacles.splice(index, 1)
      },
      playAt: (sound, position) => this.audio.playAt(sound, position, this.player, this.yaw),
      shake: (amount) => {
        this.cameraShake = Math.max(this.cameraShake, amount)
      },
    })
  }

  // -------------------------------------------------------------------------
  // Rete
  // -------------------------------------------------------------------------

  private teamOf(playerId: string): TctTeam {
    if (playerId === this.localId) return this.team
    return this.remotes.get(playerId)?.team ?? (this.team === 'alpha' ? 'bravo' : 'alpha')
  }

  private readonly onNetMessage = (message: HostMessage): void => {
    if (!this.inMatch) return
    switch (message.t) {
      case 'snapshot':
        this.applySnapshot(message.time, message.scores, message.players)
        break
      case 'shot':
        if (message.by !== this.localId) {
          const shooter = this.remotes.get(message.by)
          if (shooter) shooter.revealed = SHOT_REVEAL
          this.spawnTracer(toVector(message.from), toVector(message.to), shooter?.team === this.team ? ALLY_COLOR : 0xff668e)
          this.effects.muzzle(toVector(message.from), shooter?.team === this.team ? 0x8effd9 : 0xff9ab6)
          // Sparo di un altro giocatore: stesso suono di un fucile, attenuato e filtrato dalla distanza.
          this.audio.gunshot(getGunSoundProfile('assault', 'auto', false), getSpatialSound(toVector(message.from), this.player, this.yaw))
        }
        break
      case 'throw':
        if (message.by !== this.localId) {
          this.equipment.throw(message.kind, toVector(message.pos), toVector(message.vel), { owned: false, hostile: this.teamOf(message.by) !== this.team })
        }
        break
      case 'deploy':
        if (message.by !== this.localId) {
          this.equipment.deploy(message.kind, toVector(message.pos), message.yaw, { owned: false, hostile: this.teamOf(message.by) !== this.team, id: message.id })
        }
        break
      case 'detonate':
        if (message.by !== this.localId) this.equipment.detonate(message.id)
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
        if (message.killer === this.localId) {
          this.kills += 1
          const weaponId = this.weapons.current?.id
          if (weaponId) this.weaponXp.set(weaponId, (this.weaponXp.get(weaponId) ?? 0) + WEAPON_XP.tctKill)
        }
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
      this.weapons.setTrigger(false)
      this.weapons.setVisible(false)
    } else if (!this.alive && snapshot.alive) {
      this.alive = true
      this.weapons.refill()
      this.moveToSpawn()
      this.weapons.setVisible(true)
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
    const model = createSoldierModel(player.team === this.team ? ALLY_COLOR : ENEMY_COLOR, player.cosmetics ?? DEFAULT_COSMETICS)
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
      revealed: 0,
      equipmentTarget: { id: player.id, feet: model.group.position, height: 1.8, radius: 0.48 },
    }
    this.remotes.set(player.id, remote)
    return remote
  }

  private removeRemote(id: string): void {
    const remote = this.remotes.get(id)
    if (!remote) return
    this.scene.remove(remote.model.group)
    disposeObject(remote.model.group)
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
      remote.revealed = Math.max(0, remote.revealed - delta)
      if (!remote.alive) {
        remote.deathTimer += delta
        model.group.visible = remote.deathTimer <= DEATH_ANIMATION
        if (model.group.visible) {
          const progress = Math.min(1, remote.deathTimer / DEATH_ANIMATION)
          model.group.rotation.z = (Math.sin(remote.phase) > 0 ? 1 : -1) * progress * 1.45
          model.group.position.y = remote.target.y - progress * 0.22
        }
        continue
      }
      model.group.rotation.z = 0
      model.group.scale.y = THREE.MathUtils.lerp(model.group.scale.y, remote.crouch ? 0.68 : 1, 1 - Math.exp(-delta * 12))
      remote.equipmentTarget.height = remote.crouch ? 1.2 : 1.8
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
      const detailed = model.group.position.distanceTo(this.player) < 18
      model.leftLeg.visible = detailed
      model.rightLeg.visible = detailed
      model.leftArm.visible = detailed
      model.rightArm.visible = detailed
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
    this.weapons.reset()
    this.yaw = this.team === 'alpha' ? 0 : Math.PI
    this.pitch = 0
    this.stunTimer = 0
  }

  private updatePlayer(delta: number): void {
    this.stunTimer = Math.max(0, this.stunTimer - delta)
    if (!this.alive) {
      this.updateCamera(delta)
      return
    }
    const controllable = this.state === 'playing'
    const input = readMovementInput(controllable ? this.keys : new Set<string>(), this.aiming || this.firing || this.weapons.reloading)
    const weapon = this.weapons.current
    this.controller.update(delta, input, this.yaw, {
      speed: 7 * (weapon?.moveMultiplier ?? 1.1) * (this.stunTimer > 0 ? 0.45 : 1),
      solids: this.obstacles,
      arenaLimit: this.map.arenaLimit,
    })
    this.localTarget.height = this.controller.height
    const frameInput = { aiming: this.aiming, crouched: this.controller.crouched, blocked: !controllable || this.controller.sprinting }
    const frame = this.weapons.update(delta, frameInput)
    for (const sound of frame.sounds) this.audio.play(sound)
    this.pitch = THREE.MathUtils.clamp(this.pitch - frame.recovery.pitch, -1.45, 1.45)
    this.yaw -= frame.recovery.yaw
    for (let shot = 0; shot < frame.shots; shot += 1) {
      const kick = this.weapons.kick(frameInput)
      this.pitch = THREE.MathUtils.clamp(this.pitch + kick.pitch, -1.45, 1.45)
      this.yaw += kick.yaw
      this.fireWeapon()
    }
    this.updateCamera(delta)
  }

  private updateCamera(delta = 0): void {
    this.controller.getEyePosition(this.camera.position, this.reducedMotion)
    if (!this.reducedMotion && this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - delta)
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.25
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.2
    }
    this.camera.rotation.set(this.pitch, this.yaw, this.reducedMotion ? 0 : this.controller.roll)
    const weapon = this.weapons.current
    const aiming = this.aiming && weapon !== null
    const adsFov = weapon?.adsFov ?? 55
    const targetFov = aiming ? adsFov : this.controller.sliding ? 84 : this.controller.sprinting ? 80 : 75
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-delta * 12))
    this.camera.updateProjectionMatrix()
    this.weapons.setScoped(aiming && adsFov <= 30 && this.camera.fov < adsFov + 8)
    this.weapons.applyPose(delta, {
      aiming,
      sprinting: this.controller.sprinting,
      sliding: this.controller.sliding,
      crouchAmount: this.controller.crouchAmount,
      bob: this.controller.getBob(this.reducedMotion),
      strafe: this.controller.strafeAmount,
      landingKick: this.controller.landingKick,
      airborne: !this.controller.body.grounded,
      reducedMotion: this.reducedMotion,
    })
  }

  private switchSlot(slot: ActiveSlot): void {
    if (this.state !== 'playing' || !this.alive) return
    if (this.weapons.switchTo(slot)) {
      this.aiming = false
      this.audio.play('switch')
      this.emitHud()
    }
  }

  private fireWeapon(): void {
    const definition = this.weapons.current
    if (!definition) return
    const profile = this.weapons.soundProfile()
    if (profile) this.audio.gunshot(profile)
    this.audio.play('shell')
    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const forward = this.camera.getWorldDirection(new THREE.Vector3())
    const spread = (this.aiming ? definition.adsSpread : definition.hipSpread) * (this.controller.crouched ? 0.7 : 1)
    const muzzle = this.weapons.muzzlePosition()
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
      let legs = false
      for (const remote of this.livingEnemies()) {
        // Testa, busto e gambe contigui: prima i colpi sotto il busto attraversavano il bersaglio.
        const head = remote.model.head.getWorldPosition(new THREE.Vector3())
        for (const box of getSoldierHitboxes(remote.model.group.position, head, remote.crouch)) {
          const distance = intersectRayCapsule(ray, box.a, box.b, box.radius)
          if (distance === null || distance >= hitDistance) continue
          target = remote
          hitPoint = origin.clone().addScaledVector(direction, distance)
          hitDistance = distance
          headshot = box.zone === 'head'
          legs = box.zone === 'legs'
        }
      }
      if (target) {
        const entry = damageByTarget.get(target.id) ?? { damage: 0, headshot: false }
        const zoneMultiplier = headshot ? definition.headshotMultiplier : legs ? LEG_DAMAGE_MULTIPLIER : 1
        entry.damage += definition.damage * zoneMultiplier * getRangeMultiplier(definition, hitDistance)
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
  }

  private performMelee(quick: boolean): void {
    if (this.state !== 'playing' || !this.alive) return
    const melee = this.weapons.startMelee(quick)
    if (!melee) return
    this.audio.play('melee')
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
    const minimumDot = Math.cos(melee.arc / 2)
    let hit = false
    for (const remote of this.livingEnemies()) {
      const offset = remote.model.group.position.clone().sub(this.player)
      if (Math.abs(offset.y) > 1.4) continue
      offset.setY(0)
      const distance = offset.length()
      if (distance > melee.range + 0.48) continue
      if (distance > 0.3 && offset.divideScalar(distance).dot(forward) < minimumDot) continue
      this.session?.send({ t: 'hit', target: remote.id, damage: melee.damage, headshot: false, source: 'melee', weapon: this.loadout.primary.id })
      hit = true
    }
    if (hit) {
      this.events.onHit(false)
      this.audio.play('hit')
    }
  }

  private useEquipment(slot: EquipmentSlot): void {
    if (this.state !== 'playing' || !this.alive || this.cooldowns[slot] > 0) return
    const id = this.loadout[slot]
    const definition = EQUIPMENT[id]
    if (definition.thrown) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      const position = this.camera.position.clone().addScaledVector(direction, 0.6)
      const velocity = direction.multiplyScalar(13)
      velocity.y += 3.5
      velocity.add(this.controller.velocity.clone().multiplyScalar(0.5))
      this.equipment.throw(id as ThrowableKind, position, velocity, { owned: true, hostile: false })
      this.session?.send({ t: 'throw', kind: id as ThrowableKind, pos: toTuple(position), vel: toTuple(velocity) })
      this.weapons.animator.startSwitch()
    } else {
      const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
      const position = this.player.clone().addScaledVector(forward, id === 'shield' ? 1.4 : 1.6)
      resolveBodyCollisions(position, 0.5, 1, this.obstacles)
      position.y = getGroundHeight(position.x, position.z, this.player.y + 0.3, 0.5, this.obstacles)
      this.deployCounter += 1
      const deployId = `${this.localId}-${this.deployCounter}`
      this.equipment.deploy(id as DeployableKind, position, this.yaw, { owned: true, hostile: false, id: deployId })
      this.session?.send({ t: 'deploy', kind: id as DeployableKind, id: deployId, pos: toTuple(position), yaw: round(this.yaw, 3) })
      this.audio.play('upgrade')
    }
    this.cooldowns[slot] = definition.cooldown
    this.emitHud()
  }

  private updateEquipment(delta: number): void {
    for (const slot of ['lethal', 'tactical', 'gadget'] as const) this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - delta)
    this.revealTimer = Math.max(0, this.revealTimer - delta)
    for (const ping of this.decoyPings) ping.life -= delta
    this.decoyPings = this.decoyPings.filter((ping) => ping.life > 0)
    this.equipment.update(delta, (id) => this.session?.send({ t: 'detonate', id }))
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
    const result: TctResult = { teamScore: this.teamScore, enemyScore: this.enemyScore, kills: this.kills, deaths: this.deaths, outcome, weaponXp: Object.fromEntries(this.weaponXp) }
    this.stop()
    this.events.onMatchEnd(result)
    this.setState(outcome === 'win' ? 'victory' : 'gameover')
  }

  private emitHud(): void {
    this.camera.updateMatrixWorld()
    const allies = [...this.remotes.values()].flatMap((remote) => {
      if (remote.team !== this.team || !remote.alive) return []
      const projected = remote.model.group.position.clone().setY(remote.model.group.position.y + 2.15).project(this.camera)
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return []
      return [{ id: remote.id, x: (projected.x + 1) * 50, y: (1 - projected.y) * 50, health: remote.health, name: remote.name }]
    })
    // Nemici visibili in minimappa solo se individuati (spari o drone radar); le esche creano falsi segnali.
    const players = [...this.remotes.values()]
      .filter((remote) => remote.team === this.team || this.revealTimer > 0 || remote.revealed > 0)
      .map((remote) => ({ x: remote.model.group.position.x, z: remote.model.group.position.z, ally: remote.team === this.team, alive: remote.alive }))
    for (const ping of this.decoyPings) {
      if (Math.sin(ping.life * 7) > -0.2) players.push({ x: ping.x, z: ping.z, ally: false, alive: true })
    }
    const weapon = this.weapons.current
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
      ammo: this.weapons.ammo,
      magazineSize: weapon?.magazineSize ?? 0,
      reserveAmmo: this.weapons.reserve,
      weaponName: this.weapons.weaponName,
      reloading: this.weapons.reloading,
      melee: this.weapons.slot === 'melee',
      scoped: weapon !== null && this.aiming && weapon.adsFov <= 30,
      aiming: this.aiming,
      waveBreak: 0,
      enemiesRemaining: this.livingEnemies().length,
      equipment: (['lethal', 'tactical', 'gadget'] as const).map((slot) => ({
        key: slot === 'lethal' ? 'G' : slot === 'tactical' ? 'Q' : 'T',
        name: EQUIPMENT[this.loadout[slot]].name,
        cooldown: this.cooldowns[slot],
      })),
      interaction: null,
      weaponSlots: this.weapons.hudSlots,
      stance: this.controller.sliding ? 'slide' : this.controller.crouched ? 'crouch' : 'stand',
      powerUps: [],
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
          obstacles: [
            ...this.map.obstacles.map((obstacle) => ({ x: obstacle.x, z: obstacle.z, width: obstacle.width, depth: obstacle.depth })),
            ...this.map.buildings.map((building) => ({ x: building.x, z: building.z, width: building.width, depth: building.depth })),
          ],
          players,
        },
        allies,
      },
    })
  }

  private update(delta: number): void {
    this.mapContent.ambient.rotation.y += delta * 0.015
    animateWeather(this.mapContent.weather, delta)
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
    if (event.code === 'Digit1') this.switchSlot('primary')
    if (event.code === 'Digit2') this.switchSlot('secondary')
    if (event.code === 'Digit3') this.switchSlot('melee')
    if (event.code === 'KeyF' && !event.repeat) this.performMelee(true)
    if (event.code === 'KeyR') this.weapons.startReload()
    if (event.code === 'KeyG') this.useEquipment('lethal')
    if (event.code === 'KeyQ') this.useEquipment('tactical')
    if (event.code === 'KeyT') this.useEquipment('gadget')
    if (event.code === 'Space' && !event.repeat) this.controller.jump(this.obstacles)
    if (event.code === 'KeyC' && !event.repeat) this.controller.pressCrouch()
  }

  /** Rotella del mouse: scorre primaria, secondaria e arma bianca. */
  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active || !this.alive || !this.wheelReady(event)) return
    this.switchSlot(this.weapons.nextSlot(event.deltaY > 0 ? 1 : -1))
  }

  private wheelReady(event: WheelEvent): boolean {
    if (event.deltaY === 0 || this.state !== 'playing') return false
    const now = performance.now()
    // Una tacca della rotella produce spesso più eventi ravvicinati: uno solo per cambio.
    if (now - this.lastWheel < 140) return false
    this.lastWheel = now
    return true
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.active || this.state !== 'playing' || !this.alive || document.pointerLockElement !== this.renderer.domElement) return
    const sensitivity = this.mouseSensitivity * (this.stunTimer > 0 ? 0.45 : 1) * (this.aiming ? getAimSensitivityScale(this.camera.fov, 75, this.adsSensitivity) : 1)
    this.yaw -= event.movementX * sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * sensitivity, -1.45, 1.45)
    this.weapons.animator.addLook(event.movementX, event.movementY)
  }

  private readonly onMouseButtonDown = (event: MouseEvent): void => {
    if (this.state !== 'playing' || !this.alive) return
    this.audio.resume()
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.requestMouse()
      return
    }
    if (event.button === 0) {
      this.firing = true
      if (this.weapons.slot === 'melee') this.performMelee(false)
      else this.weapons.setTrigger(true)
    }
    if (event.button === 2) this.aiming = true
  }

  private readonly onMouseButtonUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.firing = false
      this.weapons.setTrigger(false)
    }
    if (event.button === 2) this.aiming = false
  }

  private readonly onPointerLockChange = (): void => {
    if (this.active && this.state === 'playing' && document.pointerLockElement !== this.renderer.domElement) this.pause()
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault()

  private readonly onBlur = (): void => {
    this.firing = false
    this.aiming = false
    this.weapons.setTrigger(false)
    this.keys.clear()
    if (this.active && this.state === 'playing') this.pause()
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('wheel', this.onWheel, { passive: true })
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

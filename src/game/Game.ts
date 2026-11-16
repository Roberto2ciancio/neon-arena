import * as THREE from 'three'
import { GameAudio } from './audio'
import { RenderPipeline } from './RenderPipeline'
import { DecalEffects } from './decals'
import { getGraphicsSettings } from './graphics'
import type { GraphicsQuality } from './graphics'
import { raycastObstacles } from './collision'
import { createNavigation } from './mapGeometry'
import { advanceWaypoints } from './navigation'
import type { NavigationGraph } from './navigation'
import type { NavPoint } from './structures'
import { getGroundHeight, moveBody, resolveBodyCollisions, steerBody } from './world'
import type { Body } from './world'
import { PlayerController, readMovementInput } from './PlayerController'
import { WeaponHandler } from './WeaponHandler'
import type { ActiveSlot } from './WeaponHandler'
import { DEFAULT_LOADOUT, resolveLoadout } from './armory'
import type { ResolvedLoadout } from './armory'
import { resolveWeapon } from './attachments'
import type { ResolvedWeapon } from './attachments'
import { DEFAULT_COSMETICS } from './cosmetics'
import { EQUIPMENT } from './equipment'
import type { EquipmentSlot } from './equipment'
import { EquipmentSystem } from './EquipmentSystem'
import type { DeployableKind, EquipmentTarget, ThrowableKind } from './EquipmentSystem'
import { CombatEffects } from './effects'
import { createStationModel, disposeObject, STATION_COLORS } from './equipmentModels'
import type { StationModel } from './equipmentModels'
import { buildMap } from './mapBuilder'
import { disposeMaterialVariants, setLambertMaterials } from './materialQuality'
import type { BuiltDoor } from './mapBuilder'
import type { AccessibilitySettings } from './accessibility'
import { STATION_13 } from './maps'
import type { MapDefinition, StationDefinition } from './maps'
import { createEnemyModel } from './models'
import type { EnemyModel } from './models'
import { applyUpgrade, createBaseStats, FIRST_LEVEL_XP, getNextLevelXp, getUpgradeChoices, UPGRADE_KEYS } from './upgrades'
import { WEAPONS } from './weapons'
import { BURN_DURATION, CHAIN_LIGHTNING_RADIUS, getBurnDamagePerSecond, getChainLightningDamage, getChainTargetCount, getHeadshotExplosionDamage, HEADSHOT_EXPLOSION_RADIUS } from './specialEffects'
import { FINAL_WAVE, getWaveSpawnCount, getZombieColor, getZombieStats, WAVE_BREAK_SECONDS } from './zombies'
import type { EnemyKind, GameEvents, GameState, HitZone, MetaBonuses, RunResult } from './types'

interface Enemy {
  model: EnemyModel
  /** Il corpo condivide la posizione del modello: `y` è la quota dei piedi. */
  body: Body
  path: NavPoint[]
  pathTimer: number
  spawnTimer: number
  flinch: number
  attackAnim: number
  stunTimer: number
  knockback: THREE.Vector3
  /** Bersaglio per granate, torrette e gadget. */
  target: EquipmentTarget
  marker: THREE.Object3D
  kind: EnemyKind
  health: number
  speed: number
  damage: number
  radius: number
  attackCooldown: number
  attackInterval: number
  specialCooldown: number
  hitFlash: number
  slowTimer: number
  buffTimer: number
  armorHealth: number
  chargeTimer: number
  coreExposedTimer: number
  burnTimer: number
  burnDamagePerSecond: number
  burnTick: number
  chargeDirection: THREE.Vector3
  score: number
  xp: number
  phase: number
}

interface DyingEnemy {
  model: EnemyModel
  kind: EnemyKind
  life: number
  direction: number
  baseY: number
}

interface Projectile {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  velocity: THREE.Vector3
  damage: number
  life: number
  radius: number
}

interface Pickup {
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>
  value: number
  phase: number
  baseY: number
}

interface Particle {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  velocity: THREE.Vector3
  life: number
  maxLife: number
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  life: number
  maxLife: number
}

interface Hazard {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  life: number
}

interface Station {
  definition: StationDefinition
  model: StationModel
}

type Interaction =
  | { kind: 'door'; door: Door }
  | { kind: 'station'; station: Station }

interface Door extends BuiltDoor {
  open: boolean
  progress: number
}

interface HitscanHit {
  enemy: Enemy
  point: THREE.Vector3
  distance: number
  zone: HitZone
}

const SPAWN_RISE = 0.7

function getWeakPointZone(kind: EnemyKind): HitZone {
  switch (kind) {
    case 'armored': return 'generator'
    case 'crawler': return 'spine'
    case 'spitter':
    case 'screamer': return 'throat'
    case 'brute': return 'core'
    default: return 'head'
  }
}

export class Game {
  private readonly scene = new THREE.Scene()
  private readonly decals = new DecalEffects(this.scene)
  private readonly effects = new CombatEffects(this.scene)
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 240)
  private readonly renderer: THREE.WebGLRenderer
  private readonly pipeline: RenderPipeline
  private readonly keys = new Set<string>()
  private readonly controller = new PlayerController()
  /** Piedi del giocatore: stesso vettore del corpo fisico del controller. */
  private readonly player = this.controller.body.position
  private readonly weapons = new WeaponHandler(this.camera)
  private readonly equipment: EquipmentSystem
  private readonly targetOwners = new WeakMap<EquipmentTarget, Enemy>()
  private loadout: ResolvedLoadout = resolveLoadout(DEFAULT_LOADOUT, DEFAULT_COSMETICS)
  private readonly cooldowns: Record<EquipmentSlot, number> = { lethal: 0, tactical: 0, gadget: 0 }
  private decoy: { position: THREE.Vector3; life: number } | null = null
  private radarTimer = 0
  private readonly audio = new GameAudio()
  private readonly enemies: Enemy[] = []
  private readonly enemyPool = new Map<EnemyKind, EnemyModel[]>()
  private readonly dyingEnemies: DyingEnemy[] = []
  private readonly projectiles: Projectile[] = []
  private readonly pickups: Pickup[] = []
  private readonly particles: Particle[] = []
  private readonly particlePool: Particle[] = []
  private readonly tracers: Tracer[] = []
  private readonly hazards: Hazard[] = []
  private map: MapDefinition = STATION_13
  private mapContent = buildMap(this.map)
  private obstacles = this.mapContent.obstacles
  private doors: Door[] = this.mapContent.doors.map((door) => ({ ...door, open: false, progress: 0 }))
  private navigation: NavigationGraph = createNavigation(this.map)
  private stations: Station[] = []
  private shardsCollected = 0
  private readonly particleGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07)
  private readonly acidGeometry = new THREE.SphereGeometry(0.16, 7, 7)
  private readonly acidMaterial = new THREE.MeshBasicMaterial({ color: 0x8cff62 })
  private readonly pickupGeometry = new THREE.OctahedronGeometry(0.25)
  private readonly pickupMaterial = new THREE.MeshStandardMaterial({ color: 0x6affea, emissive: 0x24c9b7, emissiveIntensity: 1.4 })

  private state: GameState = 'menu'
  private graphicsQuality: GraphicsQuality = 'medium'
  private stats = createBaseStats()
  private health = 100
  private score = 0
  private wave = 0
  private level = 1
  private xp = 0
  private xpNext = FIRST_LEVEL_XP
  private pendingUpgrades = 0
  private shards = 0
  private kills = 0
  private invulnerability = 0
  private spawnQueue = 0
  private spawnTimer = 0
  private waveActive = false
  private waveBreak = 0
  private cameraShake = 0
  private reducedMotion = false
  private mouseSensitivity = 0.002
  private hudTimer = 0
  private elapsed = 0
  private firing = false
  private aiming = false
  private yaw = 0
  private pitch = 0
  private doorDeniedTimer = 0
  private lastWheel = 0
  private currentUpgradeIds: string[] = []
  private animationId = 0
  private lastTime = performance.now()
  private fps = 60
  private fpsTimer = 0
  private fpsFrames = 0

  constructor(
    private readonly container: HTMLElement,
    private readonly events: GameEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.domElement.setAttribute('aria-label', 'Neon Arena: sparatutto in prima persona')
    this.renderer.domElement.setAttribute('role', 'img')
    this.container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x070810)
    this.scene.fog = new THREE.FogExp2(0x0b0d1a, 0.0115)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(0, 5, 16)
    this.weapons.configure(this.loadout)
    this.equipment = this.createEquipmentSystem()
    this.equipment.onTurretShot = (from, to) => this.spawnTracer(from, to)
    const weaponLight = new THREE.PointLight(0xd8e6ff, 3, 4)
    weaponLight.position.set(0.2, 0.35, 0.25)
    this.camera.add(weaponLight)
    this.scene.add(this.camera)
    this.scene.add(this.mapContent.group)
    this.buildStations()
    this.bindEvents()
    this.resize()
    this.animationId = requestAnimationFrame(this.animate)
  }

  setActive(active: boolean): void {
    this.renderer.domElement.classList.toggle('hidden', !active)
    this.firing = false
    this.keys.clear()
    this.lastTime = performance.now()
  }

  setAccessibility(settings: AccessibilitySettings): void {
    this.reducedMotion = settings.reducedMotion
    this.mouseSensitivity = 0.002 * settings.sensitivity
    if (settings.reducedMotion) this.cameraShake = 0
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

  /** Arma da fuoco attiva (la primaria quando si impugna l'arma bianca). */
  private get weaponDefinition(): ResolvedWeapon {
    return this.weapons.current ?? this.loadout.primary
  }

  private createEquipmentSystem(): EquipmentSystem {
    return new EquipmentSystem({
      scene: this.scene,
      effects: this.effects,
      solids: () => this.obstacles,
      targets: () => this.enemies.filter((enemy) => enemy.health > 0 && enemy.spawnTimer <= 0).map((enemy) => enemy.target),
      damage: (target, amount, source) => {
        const enemy = this.targetOwners.get(target)
        if (!enemy || enemy.health <= 0) return
        enemy.health -= amount * (this.stats.damage / 20)
        enemy.hitFlash = 0.1
        enemy.flinch = Math.min(1, enemy.flinch + (source === 'molotov' ? 0.15 : 0.6))
        if (source === 'molotov') enemy.burnTimer = Math.max(enemy.burnTimer, 0.6)
      },
      stunTarget: (target, seconds) => {
        const enemy = this.targetOwners.get(target)
        if (enemy) enemy.stunTimer = Math.max(enemy.stunTimer, enemy.kind === 'brute' ? seconds * 0.4 : seconds)
      },
      slowTarget: (target, seconds) => {
        const enemy = this.targetOwners.get(target)
        if (enemy) enemy.slowTimer = Math.max(enemy.slowTimer, seconds)
      },
      localPlayer: () => ({ feet: this.player, eye: this.camera.position, forward: this.camera.getWorldDirection(new THREE.Vector3()), alive: this.state === 'playing' }),
      onLocalFlash: (intensity) => this.events.onFlash?.(intensity),
      onLocalStun: () => undefined,
      onLocalBurn: (damage) => {
        if (damage > 0) this.damagePlayer(damage)
      },
      onRefill: () => {
        this.weapons.topUp()
        for (const slot of ['lethal', 'tactical', 'gadget'] as const) {
          if (slot !== 'gadget') this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - 2)
        }
      },
      onReveal: (seconds) => {
        this.radarTimer = seconds
      },
      onDecoy: (position, seconds) => {
        this.decoy = { position, life: seconds }
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

  /** Solo per test e sviluppo: posiziona il giocatore e la visuale. */
  debugPlace(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.controller.reset(x, y, z)
    this.yaw = yaw
    this.pitch = pitch
  }

  setAudioMuted(muted: boolean): void {
    this.audio.setMuted(muted)
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
    this.mapContent = buildMap(map)
    this.obstacles = this.mapContent.obstacles
    this.doors = this.mapContent.doors.map((door) => ({ ...door, open: false, progress: 0 }))
    this.navigation = createNavigation(map)
    this.scene.add(this.mapContent.group)
    this.buildStations()
    this.setGraphicsQuality(this.graphicsQuality)
  }

  private buildStations(): void {
    for (const station of this.stations) {
      this.scene.remove(station.model.group)
      disposeObject(station.model.group)
    }
    this.stations = this.map.stations.map((definition) => {
      const title = definition.kind === 'weapon' && definition.weapon
        ? WEAPONS[definition.weapon].name.split(' //')[0]!
        : definition.kind === 'ammo' ? 'MUNIZIONI' : 'KIT MEDICO'
      const model = createStationModel(definition.kind, title, definition.cost)
      model.group.position.set(definition.x, definition.y, definition.z)
      model.group.rotation.y = Math.atan2(this.map.playerSpawn.x - definition.x, this.map.playerSpawn.z - definition.z)
      this.scene.add(model.group)
      return { definition, model }
    })
  }

  start(bonuses: MetaBonuses, map: MapDefinition = STATION_13, loadout?: ResolvedLoadout): void {
    if (loadout) this.loadout = loadout
    this.clearEntities()
    this.setMap(map)
    this.stats = createBaseStats(bonuses)
    this.health = this.stats.maxHealth
    this.score = 0
    this.wave = 0
    this.level = 1
    this.xp = 0
    this.xpNext = FIRST_LEVEL_XP
    this.pendingUpgrades = 0
    this.shards = 0
    this.shardsCollected = 0
    this.kills = 0
    this.elapsed = 0
    this.weapons.configure(this.loadout)
    this.equipment.clear()
    this.decoy = null
    this.radarTimer = 0
    this.invulnerability = 0
    this.currentUpgradeIds = []
    this.events.onUpgrade([], 0)
    this.firing = false
    this.aiming = false
    this.yaw = 0
    this.pitch = 0
    this.cooldowns.lethal = 0
    this.cooldowns.tactical = 0
    this.cooldowns.gadget = 0
    this.doorDeniedTimer = 0
    for (const door of this.doors) {
      door.open = false
      door.progress = 0
      door.group.position.y = 0
      if (!this.obstacles.includes(door.obstacle)) this.obstacles.push(door.obstacle)
    }
    this.keys.clear()
    this.controller.reset(this.map.playerSpawn.x, 0, this.map.playerSpawn.z)
    this.camera.fov = 75
    this.camera.updateProjectionMatrix()
    this.updateFirstPersonCamera(0)
    this.audio.resume()
    this.setState('playing')
    this.nextWave()
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
    if (!this.isRunActive()) return
    this.events.onRunEnd(this.createRunResult())
    this.returnToMenu()
  }

  returnToMenu(): void {
    this.clearEntities()
    this.firing = false
    this.aiming = false
    this.keys.clear()
    this.controller.reset(0, 0, 0)
    this.setState('menu')
  }

  chooseUpgrade(upgradeId: string): void {
    if (!this.isRunActive() || !this.currentUpgradeIds.includes(upgradeId)) return
    const previousMaxHealth = this.stats.maxHealth
    this.stats = applyUpgrade(this.stats, upgradeId)
    this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth - previousMaxHealth)
    this.currentUpgradeIds = []
    this.pendingUpgrades = Math.max(0, this.pendingUpgrades - 1)
    this.audio.play('upgrade')
    this.spawnBurst(this.player, 0x9a7bff, 18)
    this.offerNextUpgrade()
    this.emitHud()
  }

  private offerNextUpgrade(): void {
    if (this.currentUpgradeIds.length === 0 && this.pendingUpgrades > 0) {
      this.currentUpgradeIds = getUpgradeChoices(this.stats).map((upgrade) => upgrade.id)
    }
    this.events.onUpgrade(this.currentUpgradeIds, this.pendingUpgrades)
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
    this.clearEntities()
    for (const pool of this.enemyPool.values()) {
      for (const model of pool) this.disposeEnemy({ model })
    }
    this.enemyPool.clear()
    this.decals.dispose()
    this.equipment.dispose()
    this.weapons.dispose()
    this.effects.dispose()
    for (const station of this.stations) disposeObject(station.model.group)
    this.pipeline.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private setState(state: GameState): void {
    this.state = state
    this.weapons.setVisible(state !== 'menu')
    if (state !== 'playing' && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock()
    this.events.onStateChange(state)
  }

  private requestMouse(): void {
    if (document.pointerLockElement === this.renderer.domElement) return
    try {
      const request = this.renderer.domElement.requestPointerLock() as Promise<void> | undefined
      void request?.catch(() => undefined)
    } catch {
      // Un click successivo sul canvas consente di riprovare.
    }
  }

  private isRunActive(): boolean {
    return this.state === 'playing' || this.state === 'paused'
  }

  private createRunResult(won = false): RunResult {
    // I frammenti spesi durante la run non riducono il premio permanente.
    return {
      score: Math.floor(this.score),
      wave: this.wave,
      kills: this.kills,
      shards: this.shardsCollected + Math.floor(this.score / 500) + (won ? 10 : 0),
      time: Math.floor(this.elapsed),
      won,
    }
  }

  private finishRun(won: boolean): void {
    if (!this.isRunActive()) return
    this.firing = false
    this.aiming = false
    this.keys.clear()
    this.events.onRunEnd(this.createRunResult(won))
    this.setState(won ? 'victory' : 'gameover')
  }

  private nextWave(): void {
    this.wave += 1
    this.spawnQueue = getWaveSpawnCount(this.wave)
    this.spawnTimer = 0.65
    this.waveBreak = 0
    this.waveActive = true
    this.events.onWave(this.wave)
  }

  private updateSpawning(delta: number): void {
    if (this.spawnQueue > 0) {
      this.spawnTimer -= delta
      if (this.spawnTimer <= 0) {
        const bossWave = this.wave % 5 === 0
        const extraBoss = this.wave >= 10 && this.spawnQueue === Math.floor(getWaveSpawnCount(this.wave) / 2)
        const kind = bossWave && (this.spawnQueue === 1 || extraBoss) ? 'brute' : this.randomEnemyKind()
        this.spawnEnemy(kind)
        this.spawnQueue -= 1
        this.spawnTimer = Math.max(0.2, 0.75 - this.wave * 0.035)
      }
      return
    }
    if (this.enemies.length > 0) return
    if (this.waveActive) {
      this.waveActive = false
      if (this.wave >= FINAL_WAVE) {
        this.finishRun(true)
        return
      }
      this.waveBreak = WAVE_BREAK_SECONDS
      this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth * 0.08)
      this.startReload()
      return
    }
    this.waveBreak = Math.max(0, this.waveBreak - delta)
    if (this.waveBreak <= 0) this.nextWave()
  }

  private randomEnemyKind(): EnemyKind {
    const pool: EnemyKind[] = ['walker', 'walker', 'walker']
    if (this.wave >= 2) pool.push('runner', 'runner')
    if (this.wave >= 3) pool.push('armored', 'crawler')
    if (this.wave >= 4) pool.push('crawler', 'spitter')
    if (this.wave >= 6) pool.push('screamer', 'runner', 'armored')
    if (this.wave >= 9) pool.push('armored', 'spitter', 'screamer')
    return pool[Math.floor(Math.random() * pool.length)] ?? 'walker'
  }

  private pickSpawnPoint(radius: number): THREE.Vector3 {
    // Ingressi lungo il perimetro: preferisce quelli né troppo vicini né troppo lontani dal giocatore.
    const candidates: THREE.Vector3[] = []
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * Math.PI * 2 + Math.random() * 0.2
      const point = new THREE.Vector3(Math.cos(angle) * this.map.enemySpawnRadius, 0, Math.sin(angle) * this.map.enemySpawnRadius)
      point.x = THREE.MathUtils.clamp(point.x, -this.map.arenaLimit + 1, this.map.arenaLimit - 1)
      point.z = THREE.MathUtils.clamp(point.z, -this.map.arenaLimit + 1, this.map.arenaLimit - 1)
      resolveBodyCollisions(point, radius, 1.8, this.obstacles)
      if (getGroundHeight(point.x, point.z, 0, radius, this.obstacles) > 0) continue
      candidates.push(point)
    }
    const preferred = candidates.filter((point) => {
      const distance = Math.hypot(point.x - this.player.x, point.z - this.player.z)
      return distance > 12 && distance < 30
    })
    const pool = preferred.length > 0 ? preferred : candidates.filter((point) => Math.hypot(point.x - this.player.x, point.z - this.player.z) > 8)
    return (pool[Math.floor(Math.random() * pool.length)] ?? candidates[0] ?? new THREE.Vector3(0, 0, -this.map.enemySpawnRadius)).clone()
  }

  private spawnEnemy(kind: EnemyKind): void {
    const stats = getZombieStats(kind, this.wave)
    const pooled = this.enemyPool.get(kind)?.pop()
    const model = pooled ?? createEnemyModel(kind, getZombieColor(kind))
    model.group.visible = true
    model.group.rotation.set(0, 0, 0)
    model.body.material.emissive.setHex(0x000000)
    model.body.material.emissiveIntensity = 0
    model.leftLeg.rotation.x = 0
    model.rightLeg.rotation.x = 0
    model.leftArm.rotation.x = 0
    model.rightArm.rotation.x = 0
    model.group.position.copy(this.pickSpawnPoint(stats.radius))
    this.scene.add(model.group)
    this.effects.pulse(model.group.position, getZombieColor(kind), 1.4)
    this.spawnBurst(model.group.position.clone().setY(0.3), 0x3a3128, 6)
    let marker = model.group.userData.marker as THREE.Object3D | undefined
    if (!marker) {
      // Indicatore del drone radar, visibile attraverso i muri.
      marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xff4f6e, depthTest: false, transparent: true, opacity: 0.9 }))
      marker.position.y = model.height + 0.45
      marker.renderOrder = 999
      model.group.add(marker)
      model.group.userData.marker = marker
    }
    marker.visible = false
    const target: EquipmentTarget = { id: `z${Math.random().toString(36).slice(2, 9)}`, feet: model.group.position, height: model.height, radius: stats.radius }
    const enemy: Enemy = {
      model,
      body: { position: model.group.position, velocityY: 0, grounded: true },
      path: [],
      pathTimer: 0,
      spawnTimer: SPAWN_RISE,
      flinch: 0,
      attackAnim: 0,
      stunTimer: 0,
      knockback: new THREE.Vector3(),
      target,
      marker,
      kind,
      health: stats.health,
      speed: stats.speed,
      damage: stats.damage,
      radius: stats.radius,
      attackCooldown: 0,
      attackInterval: stats.attackInterval,
      specialCooldown: 1.5,
      hitFlash: 0,
      slowTimer: 0,
      buffTimer: 0,
      armorHealth: kind === 'armored' ? 85 * (1 + (this.wave - 1) * 0.05) : 0,
      chargeTimer: 0,
      coreExposedTimer: 0,
      burnTimer: 0,
      burnDamagePerSecond: 0,
      burnTick: 0,
      chargeDirection: new THREE.Vector3(),
      score: stats.score,
      xp: stats.xp,
      phase: Math.random() * Math.PI * 2,
    }
    this.targetOwners.set(target, enemy)
    this.enemies.push(enemy)
  }

  private updatePlayer(delta: number): void {
    this.invulnerability = Math.max(0, this.invulnerability - delta)
    this.doorDeniedTimer = Math.max(0, this.doorDeniedTimer - delta)
    this.health = Math.min(this.stats.maxHealth, this.health + this.stats.regen * delta)

    const input = readMovementInput(this.keys, this.aiming || this.firing || this.weapons.reloading)
    const result = this.controller.update(delta, input, this.yaw, {
      speed: this.stats.speed * this.weaponDefinition.moveMultiplier,
      solids: this.obstacles,
      arenaLimit: this.map.arenaLimit,
    })
    if (result.landingSpeed > 7) this.cameraShake = Math.max(this.cameraShake, Math.min(0.3, (result.landingSpeed - 7) * 0.05))

    const frameInput = { aiming: this.aiming, crouched: this.controller.crouched, blocked: this.controller.sprinting, fireRateMultiplier: this.stats.fireRate / 8.5 }
    const frame = this.weapons.update(delta, frameInput)
    this.pitch = THREE.MathUtils.clamp(this.pitch - frame.recovery.pitch, -1.45, 1.45)
    this.yaw -= frame.recovery.yaw
    for (let shot = 0; shot < frame.shots; shot += 1) {
      const kick = this.weapons.kick(frameInput)
      this.pitch = THREE.MathUtils.clamp(this.pitch + kick.pitch, -1.45, 1.45)
      this.yaw += kick.yaw
      this.firePlayerWeapon()
    }
    this.updateFirstPersonCamera(delta)
  }

  private updateFirstPersonCamera(delta: number): void {
    this.controller.getEyePosition(this.camera.position, this.reducedMotion)
    if (!this.reducedMotion && this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - delta)
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.25
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.2
    }
    this.camera.rotation.set(this.pitch, this.yaw, this.reducedMotion ? 0 : this.controller.roll)

    const weapon = this.weapons.current
    const aiming = this.aiming && weapon !== null
    const adsFov = weapon?.adsFov ?? 52
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
    if (this.state !== 'playing') return
    if (this.weapons.switchTo(slot)) {
      this.aiming = false
      this.audio.play('pickup')
      this.emitHud()
    }
  }

  private startReload(): void {
    if (this.state !== 'playing') return
    this.weapons.startReload()
  }

  /** Fendente con l'arma bianca: colpisce gli zombie nel cono frontale. */
  private performMelee(quick: boolean): void {
    if (this.state !== 'playing') return
    const melee = this.weapons.startMelee(quick)
    if (!melee) return
    this.audio.play('dash')
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
    const minimumDot = Math.cos(melee.arc / 2)
    let hit = false
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.spawnTimer > 0) continue
      const offset = enemy.body.position.clone().sub(this.player)
      if (Math.abs(offset.y) > 1.4) continue
      offset.setY(0)
      const distance = offset.length()
      if (distance > melee.range + enemy.radius) continue
      if (distance > 0.3 && offset.divideScalar(distance).dot(forward) < minimumDot) continue
      enemy.health -= melee.damage * (this.stats.damage / 20)
      enemy.hitFlash = 0.12
      enemy.flinch = 1
      enemy.knockback.addScaledVector(forward, enemy.kind === 'brute' ? 1 : 4)
      this.spawnBurst(enemy.model.body.getWorldPosition(new THREE.Vector3()), 0x9b3147, 8)
      hit = true
    }
    if (hit) {
      this.events.onHit(false)
      this.audio.play('hit')
      this.cameraShake = Math.max(this.cameraShake, 0.12)
    }
    this.killDestroyedEnemies()
  }

  private firePlayerWeapon(): void {
    this.audio.play('shoot')

    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const baseDirection = this.camera.getWorldDirection(new THREE.Vector3())
    const muzzlePosition = this.weapons.muzzlePosition()
    const critical = Math.random() < this.stats.critChance
    let hitAny = false

    const shotCount = this.weaponDefinition.pellets + this.stats.projectileCount - 1
    for (let shot = 0; shot < shotCount; shot += 1) {
      const direction = baseDirection.clone()
      const stance = this.controller.crouched ? 0.7 : 1
      const spread = ((this.aiming ? this.weaponDefinition.adsSpread : this.weaponDefinition.hipSpread) + shot * 0.004) * stance
      direction.x += (Math.random() - 0.5) * spread
      direction.y += (Math.random() - 0.5) * spread
      direction.z += (Math.random() - 0.5) * spread
      direction.normalize()
      const ray = new THREE.Ray(origin, direction)
      const wallDistance = raycastObstacles(origin, direction, this.weaponDefinition.range, this.obstacles)
      const hits: HitscanHit[] = []

      for (const enemy of this.enemies) {
        if (enemy.health <= 0) continue
        const zones: { point: THREE.Vector3 | null; zone: HitZone }[] = [
          {
            point: ray.intersectSphere(new THREE.Sphere(
              enemy.model.head.getWorldPosition(new THREE.Vector3()),
              enemy.model.height * 0.14,
            ), new THREE.Vector3()),
            zone: 'head',
          },
          {
            point: ray.intersectSphere(new THREE.Sphere(
              enemy.model.body.getWorldPosition(new THREE.Vector3()),
              enemy.radius * 0.9,
            ), new THREE.Vector3()),
            zone: 'body',
          },
        ]
        if (enemy.kind === 'runner') {
          zones.push({
            point: ray.intersectSphere(new THREE.Sphere(
              enemy.model.group.position.clone().add(new THREE.Vector3(0, 0.45, 0)),
              0.48,
            ), new THREE.Vector3()),
            zone: 'legs',
          })
        }
        const hasWeakPoint = enemy.kind === 'armored' || enemy.kind === 'crawler'
          || enemy.kind === 'spitter' || enemy.kind === 'screamer'
          || (enemy.kind === 'brute' && enemy.coreExposedTimer > 0)
        if (hasWeakPoint) {
          zones.push({
            point: ray.intersectSphere(new THREE.Sphere(
              enemy.model.weakPoint.getWorldPosition(new THREE.Vector3()),
              enemy.kind === 'brute' ? 0.36 : 0.3,
            ), new THREE.Vector3()),
            zone: getWeakPointZone(enemy.kind),
          })
        }

        for (const zone of zones) {
          if (!zone.point) continue
          const distance = origin.distanceTo(zone.point)
          if (distance > this.weaponDefinition.range || (wallDistance !== null && distance > wallDistance)) continue
          hits.push({ enemy, point: zone.point, distance, zone: zone.zone })
        }
      }

      hits.sort((a, b) => a.distance - b.distance)
      const targets: HitscanHit[] = []
      const hitEnemies = new Set<Enemy>()
      for (const hit of hits) {
        if (hitEnemies.has(hit.enemy)) continue
        hitEnemies.add(hit.enemy)
        targets.push(hit)
        if (targets.length >= this.stats.pierce + 1) break
      }
      for (const hit of targets) {
        hitAny = true
        this.applyZombieHit(hit, critical)
      }
      const wallPoint = wallDistance === null ? null : origin.clone().addScaledVector(direction, wallDistance)
      const endPoint = targets.at(-1)?.point ?? wallPoint ?? origin.clone().addScaledVector(direction, this.weaponDefinition.range)
      this.spawnTracer(muzzlePosition, endPoint)
      if (targets.length === 0 && wallPoint) {
        this.effects.sparks(wallPoint, origin.clone().sub(wallPoint).normalize(), 0xffd59a, 4)
        this.decals.spawn(wallPoint, origin)
      }
    }
    if (hitAny) this.audio.play('hit')
    this.killDestroyedEnemies()
  }

  private applyZombieHit(hit: HitscanHit, critical: boolean): void {
    const enemy = hit.enemy
    const baseDamage = this.weaponDefinition.damage * (this.stats.damage / 20)
    let multiplier = hit.zone === 'head' ? this.weaponDefinition.headshotMultiplier : 1

    if (enemy.kind === 'runner' && hit.zone === 'legs') {
      enemy.slowTimer = 2.2
      multiplier = 1.35
    }
    if (enemy.kind === 'armored') {
      if (hit.zone === 'generator') multiplier = 2.4
      else if (enemy.armorHealth > 0) {
        enemy.armorHealth = Math.max(0, enemy.armorHealth - baseDamage)
        multiplier = hit.zone === 'head' ? 0.35 : 0.12
        if (enemy.armorHealth === 0) this.spawnBurst(hit.point, 0xffc36b, 14)
      } else if (hit.zone === 'head') multiplier = 1.4
    }
    if (enemy.kind === 'brute') {
      if (hit.zone === 'core' && enemy.coreExposedTimer > 0) multiplier = 3
      else multiplier = hit.zone === 'head' ? 0.65 : 0.3
    }
    if (enemy.kind === 'crawler' && hit.zone === 'spine') multiplier = 2.2
    if (enemy.kind === 'spitter' && hit.zone === 'throat') multiplier = 2.5
    if (enemy.kind === 'screamer' && hit.zone === 'throat') {
      multiplier = 2.3
      enemy.specialCooldown = Math.max(enemy.specialCooldown, 3)
    }

    const damage = baseDamage * multiplier * (critical ? this.stats.critMultiplier : 1)
    enemy.health -= damage
    enemy.hitFlash = 0.08
    // Reazione al colpo: sobbalzo e piccola spinta all'indietro.
    enemy.flinch = Math.min(1, enemy.flinch + (enemy.kind === 'brute' ? 0.25 : 0.7))
    const push = hit.point.clone().sub(this.camera.position).setY(0)
    if (push.lengthSq() > 0) enemy.knockback.addScaledVector(push.normalize(), enemy.kind === 'brute' ? 0.4 : 1.6)
    if (this.stats.incendiary > 0) {
      enemy.burnTimer = BURN_DURATION
      enemy.burnDamagePerSecond = getBurnDamagePerSecond(this.stats.incendiary, this.stats.damage)
      enemy.burnTick = Math.min(enemy.burnTick, 0.5)
    }
    this.triggerSpecialEffects(hit, critical)
    const precisionHit = hit.zone === 'head' || hit.zone === 'generator' || hit.zone === 'core'
      || hit.zone === 'spine' || hit.zone === 'throat'
    if (precisionHit) this.score += hit.zone === 'head' ? 25 : 50
    this.events.onHit(precisionHit)
    this.spawnBurst(hit.point, precisionHit ? 0xffd166 : 0x9b3147, precisionHit ? 7 : 4)
  }

  private triggerSpecialEffects(hit: HitscanHit, critical: boolean): void {
    if (hit.zone === 'head' && this.stats.headshotExplosion > 0) {
      const damage = getHeadshotExplosionDamage(this.stats.headshotExplosion, this.stats.damage)
      this.spawnBurst(hit.point, 0xff7b38, 16)
      for (const enemy of this.enemies) {
        if (enemy === hit.enemy || enemy.health <= 0) continue
        const distance = enemy.model.group.position.distanceTo(hit.point)
        if (distance > HEADSHOT_EXPLOSION_RADIUS) continue
        enemy.health -= damage * Math.max(0.35, 1 - distance / HEADSHOT_EXPLOSION_RADIUS)
        enemy.hitFlash = 0.1
      }
    }

    if (!critical || this.stats.chainLightning <= 0) return
    const origin = hit.enemy.model.body.getWorldPosition(new THREE.Vector3())
    const candidates = this.enemies
      .filter((enemy) => enemy !== hit.enemy && enemy.health > 0)
      .map((enemy) => ({ enemy, distance: enemy.model.group.position.distanceTo(hit.enemy.model.group.position) }))
      .filter((candidate) => candidate.distance <= CHAIN_LIGHTNING_RADIUS)
      .sort((a, b) => a.distance - b.distance)
    let linked = 0
    for (const candidate of candidates) {
      if (linked >= getChainTargetCount(this.stats.chainLightning)) break
      const target = candidate.enemy.model.body.getWorldPosition(new THREE.Vector3())
      const direction = target.clone().sub(origin)
      const blocked = raycastObstacles(origin, direction.normalize(), candidate.distance, this.obstacles) !== null
      if (blocked) continue
      candidate.enemy.health -= getChainLightningDamage(this.stats.chainLightning, this.stats.damage)
      candidate.enemy.hitFlash = 0.08
      this.spawnTracer(origin, target)
      linked += 1
    }
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
    const material = new THREE.LineBasicMaterial({ color: 0xaafff3, transparent: true, opacity: 0.85 })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)
    this.tracers.push({ line, life: 0.065, maxLife: 0.065 })
  }

  private fireAcid(enemy: Enemy): void {
    const mesh = new THREE.Mesh(this.acidGeometry, this.acidMaterial)
    mesh.position.copy(enemy.model.group.position)
    mesh.position.y += enemy.model.height * 0.72
    const direction = this.camera.position.clone().sub(mesh.position).normalize()
    this.scene.add(mesh)
    this.projectiles.push({ mesh, velocity: direction.multiplyScalar(7.5), damage: enemy.damage, life: 4, radius: 0.25 })
    this.audio.playAt('enemyShoot', enemy.model.group.position, this.player, this.yaw)
  }

  private spawnHazard(position: THREE.Vector3): void {
    const ground = getGroundHeight(position.x, position.z, position.y + 0.3, 0.3, this.obstacles)
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x72e454, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(position.x, ground + 0.035, position.z)
    this.scene.add(mesh)
    this.hazards.push({ mesh, life: 5 })
  }

  private getNearbyDoor(): Door | null {
    let nearest: Door | null = null
    let nearestDistance = 2.6
    for (const door of this.doors) {
      if (door.open) continue
      const distance = this.player.distanceTo(door.group.position)
      if (distance < nearestDistance) {
        nearest = door
        nearestDistance = distance
      }
    }
    return nearest
  }

  private getNearbyInteraction(): Interaction | null {
    let best: Interaction | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    const door = this.getNearbyDoor()
    if (door) {
      best = { kind: 'door', door }
      bestDistance = this.player.distanceTo(door.group.position)
    }
    for (const station of this.stations) {
      const horizontal = Math.hypot(station.definition.x - this.player.x, station.definition.z - this.player.z)
      if (horizontal > 1.9 || Math.abs(station.definition.y - this.player.y) > 1.2 || horizontal >= bestDistance) continue
      best = { kind: 'station', station }
      bestDistance = horizontal
    }
    return best
  }

  private describeInteraction(interaction: Interaction): { label: string; cost: number } {
    if (interaction.kind === 'door') return { label: 'APRI PORTA', cost: interaction.door.definition.cost }
    const { definition } = interaction.station
    if (definition.kind === 'medkit') return { label: 'KIT MEDICO', cost: definition.cost }
    if (definition.kind === 'ammo') return { label: 'RIFORNIMENTO MUNIZIONI', cost: definition.cost }
    const weaponId = definition.weapon!
    const name = WEAPONS[weaponId].name.split(' //')[0]
    // Un'arma già posseduta si ricarica a metà prezzo.
    return this.weapons.has(weaponId)
      ? { label: `MUNIZIONI ${name}`, cost: Math.ceil(definition.cost / 2) }
      : { label: `ACQUISTA ${name}`, cost: definition.cost }
  }

  private interact(): void {
    if (this.state !== 'playing') return
    const interaction = this.getNearbyInteraction()
    if (!interaction) return
    const { cost } = this.describeInteraction(interaction)
    if (this.shards < cost) {
      this.doorDeniedTimer = 1.4
      this.audio.play('damage')
      this.emitHud()
      return
    }
    if (interaction.kind === 'door') {
      this.shards -= cost
      const door = interaction.door
      door.open = true
      const obstacleIndex = this.obstacles.indexOf(door.obstacle)
      if (obstacleIndex >= 0) this.obstacles.splice(obstacleIndex, 1)
      this.spawnBurst(door.group.position.clone().setY(1), 0xffb657, 16)
      this.effects.pulse(door.group.position, 0xffb657, 2.4)
    } else {
      const { definition, model } = interaction.station
      if (definition.kind === 'medkit' && this.health >= this.stats.maxHealth) return
      this.shards -= cost
      if (definition.kind === 'medkit') {
        this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth * 0.5)
      } else if (definition.kind === 'ammo') {
        this.weapons.refill()
        this.cooldowns.lethal = 0
        this.cooldowns.tactical = 0
      } else if (definition.weapon) {
        const weaponId = definition.weapon
        // Un'arma nuova sostituisce quella dello stesso slot; una posseduta si ricarica.
        if (this.weapons.has(weaponId)) this.weapons.refill(weaponId)
        else this.weapons.replace(resolveWeapon(WEAPONS[weaponId], this.loadout.attachments[weaponId]))
      }
      this.effects.pulse(model.group.position, STATION_COLORS[definition.kind], 1.8)
      this.spawnBurst(model.group.position.clone().setY(model.group.position.y + 1.3), STATION_COLORS[definition.kind], 14)
    }
    this.audio.play('upgrade')
    this.emitHud()
  }

  private updateStations(delta: number): void {
    for (const station of this.stations) {
      station.model.hologram.rotation.y += delta * 1.4
      station.model.hologram.position.y = 1.35 + Math.sin(this.elapsed * 2 + station.definition.x) * 0.06
      station.model.screen.lookAt(this.camera.position.x, station.model.group.position.y + 2, this.camera.position.z)
    }
  }

  private updateDoors(delta: number): void {
    for (const door of this.doors) {
      if (!door.open || door.progress >= 1) continue
      door.progress = Math.min(1, door.progress + delta * 1.4)
      door.group.position.y = door.definition.height * door.progress
    }
  }

  private useEquipment(slot: EquipmentSlot): void {
    if (this.state !== 'playing' || this.cooldowns[slot] > 0) return
    const id = this.loadout[slot]
    const definition = EQUIPMENT[id]
    if (definition.thrown) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3())
      const position = this.camera.position.clone().addScaledVector(direction, 0.6)
      const velocity = direction.multiplyScalar(13)
      velocity.y += 3.5
      velocity.add(this.controller.velocity.clone().multiplyScalar(0.5))
      this.equipment.throw(id as ThrowableKind, position, velocity, { owned: true, hostile: false })
      this.weapons.animator.startSwitch()
    } else {
      const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
      const position = this.player.clone().addScaledVector(forward, id === 'shield' ? 1.4 : 1.6)
      resolveBodyCollisions(position, 0.5, 1, this.obstacles)
      position.y = getGroundHeight(position.x, position.z, this.player.y + 0.3, 0.5, this.obstacles)
      this.equipment.deploy(id as DeployableKind, position, this.yaw, { owned: true, hostile: false })
      this.audio.play('upgrade')
    }
    this.cooldowns[slot] = definition.cooldown
    this.emitHud()
  }

  private updateEquipment(delta: number): void {
    for (const slot of ['lethal', 'tactical', 'gadget'] as const) this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - delta)
    this.equipment.update(delta)
    this.radarTimer = Math.max(0, this.radarTimer - delta)
    if (this.decoy) {
      this.decoy.life -= delta
      if (Math.sin(this.decoy.life * 9) > 0.6) this.effects.muzzle(this.decoy.position.clone().setY(this.decoy.position.y + 0.3), 0xffe066)
      if (this.decoy.life <= 0) this.decoy = null
    }
    this.killDestroyedEnemies()
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      enemy.attackCooldown -= delta
      enemy.specialCooldown -= delta
      enemy.slowTimer = Math.max(0, enemy.slowTimer - delta)
      enemy.buffTimer = Math.max(0, enemy.buffTimer - delta)
      enemy.coreExposedTimer = Math.max(0, enemy.coreExposedTimer - delta)
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta)
      enemy.burnTimer = Math.max(0, enemy.burnTimer - delta)
      if (enemy.burnTimer > 0 && enemy.burnDamagePerSecond > 0) {
        enemy.burnTick -= delta
        if (enemy.burnTick <= 0) {
          enemy.health -= enemy.burnDamagePerSecond * 0.5
          enemy.burnTick += 0.5
          this.spawnBurst(enemy.model.body.getWorldPosition(new THREE.Vector3()), 0xff7b38, 2)
        }
      }
      if (enemy.health <= 0) continue
      enemy.model.body.material.emissive.setHex(enemy.hitFlash > 0 ? 0x882233 : enemy.burnTimer > 0 ? 0x8a2f09 : 0x000000)
      enemy.model.body.material.emissiveIntensity = enemy.hitFlash > 0 ? 1.8 : enemy.burnTimer > 0 ? 1.2 : 0
      if (enemy.kind === 'brute') {
        enemy.model.weakPoint.material.emissiveIntensity = enemy.coreExposedTimer > 0 ? 3 : 0.12
      }

      enemy.flinch = Math.max(0, enemy.flinch - delta * 4)
      enemy.attackAnim = Math.max(0, enemy.attackAnim - delta * 3)
      if (enemy.spawnTimer > 0) {
        // Emersione dal terreno: il nemico non si muove né attacca.
        enemy.spawnTimer = Math.max(0, enemy.spawnTimer - delta)
        const rise = 1 - enemy.spawnTimer / SPAWN_RISE
        enemy.model.group.position.y = -enemy.model.height * (1 - rise) ** 2
        enemy.model.group.rotation.z = Math.sin(rise * 14 + enemy.phase) * 0.12 * (1 - rise)
        enemy.model.leftArm.rotation.x = -2.4 + rise
        enemy.model.rightArm.rotation.x = -2.2 + rise
        if (enemy.spawnTimer === 0) enemy.model.group.position.y = 0
        continue
      }

      enemy.marker.visible = this.radarTimer > 0
      enemy.stunTimer = Math.max(0, enemy.stunTimer - delta)
      if (enemy.stunTimer > 0) {
        // Stordito dal flashbang: barcolla sul posto.
        enemy.model.group.rotation.z = Math.sin(this.elapsed * 11 + enemy.phase) * 0.16
        enemy.model.leftArm.rotation.x = -0.3
        enemy.model.rightArm.rotation.x = -0.5
        moveBody(enemy.body, enemy.knockback.clone().multiplyScalar(delta), delta, enemy.radius, Math.min(enemy.model.height, 1.9), this.obstacles, this.map.arenaLimit)
        enemy.knockback.multiplyScalar(Math.exp(-delta * 8))
        continue
      }
      // Bersaglio: l'esca se è vicina, una posizione falsata se il giocatore è nel fumo.
      let targetPoint: THREE.Vector3 = this.player
      if (this.decoy && enemy.body.position.distanceTo(this.decoy.position) < 22) targetPoint = this.decoy.position
      else if (this.equipment.isInSmoke(this.camera.position) && enemy.body.position.distanceTo(this.player) > 3) {
        targetPoint = this.player.clone().add(new THREE.Vector3(Math.sin(enemy.phase) * 6, 0, Math.cos(enemy.phase) * 6))
      }
      const verticalGap = this.player.y - enemy.body.position.y
      const sameLevel = Math.abs(verticalGap) < 1.3
      const playerDistance = Math.hypot(this.player.x - enemy.body.position.x, this.player.z - enemy.body.position.z)
      const detailDistance = this.graphicsQuality === 'low' ? 14 : this.graphicsQuality === 'high' ? 24 : 18
      const detailed = playerDistance < detailDistance
      for (const detail of enemy.model.details) detail.visible = detailed
      const toPlayer = targetPoint.clone().sub(enemy.model.group.position).setY(0)
      const distance = Math.max(toPlayer.length(), 0.001)
      const direction = toPlayer.clone().divideScalar(distance)
      // Percorso fra piani e porte; inseguimento diretto quando si è nella stessa area.
      enemy.pathTimer -= delta
      if (enemy.pathTimer <= 0 && !(this.navigation.isOnStairs(enemy.body.position) && enemy.path.length > 0)) {
        enemy.path = this.navigation.findPath(enemy.body.position, targetPoint, (doorId) => this.doors.some((door) => door.definition.id === doorId && door.open))
        enemy.pathTimer = 0.45 + Math.random() * 0.2
      }
      advanceWaypoints(enemy.body.position, enemy.path)
      const waypoint = enemy.path[0]
      const followingPath = waypoint !== undefined
      const travelDirection = followingPath
        ? new THREE.Vector3(waypoint.x - enemy.body.position.x, 0, waypoint.z - enemy.body.position.z).normalize()
        : direction.clone()
      const movement = travelDirection.clone()
      let charging = enemy.chargeTimer > 0

      if (enemy.kind === 'runner' && !followingPath) {
        movement.add(new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(Math.sin(this.elapsed * 4 + enemy.phase) * 0.7)).normalize()
      }
      if (enemy.kind === 'crawler') {
        if (charging) {
          enemy.chargeTimer -= delta
          movement.copy(enemy.chargeDirection)
        } else if (enemy.specialCooldown <= 0 && distance < 4.5 && sameLevel) {
          enemy.chargeTimer = 0.38
          enemy.chargeDirection.copy(direction)
          enemy.specialCooldown = 2.4
          charging = true
        }
      }
      if (enemy.kind === 'spitter') {
        if (!followingPath && distance < 7) movement.multiplyScalar(-1)
        else if (!followingPath && distance < 11) movement.set(-direction.z, 0, direction.x)
        const eye = enemy.model.group.position.clone().setY(enemy.body.position.y + enemy.model.height * 0.72)
        const clearShot = raycastObstacles(eye, this.camera.position.clone().sub(eye).normalize(), eye.distanceTo(this.camera.position), this.obstacles) === null
        if (distance < 17 && enemy.specialCooldown <= 0 && clearShot) {
          this.fireAcid(enemy)
          enemy.specialCooldown = 2.4
        }
      }
      if (enemy.kind === 'screamer') {
        if (!followingPath && distance < 8) movement.multiplyScalar(-1)
        else if (!followingPath && distance < 12) movement.set(0, 0, 0)
        if (distance < 16 && enemy.specialCooldown <= 0) {
          for (const ally of this.enemies) {
            if (ally !== enemy && ally.model.group.position.distanceTo(enemy.model.group.position) < 9) ally.buffTimer = 4
          }
          enemy.specialCooldown = 7
          this.spawnBurst(enemy.model.group.position.clone().setY(enemy.model.height * 0.7), 0xc486ff, 20)
          this.audio.playAt('enemyShoot', enemy.model.group.position, this.player, this.yaw)
        }
      }
      if (enemy.kind === 'brute') {
        if (charging) {
          enemy.chargeTimer -= delta
          movement.copy(enemy.chargeDirection)
          if (enemy.chargeTimer <= 0) {
            enemy.coreExposedTimer = 1.8
            charging = false
          }
        } else if (enemy.coreExposedTimer <= 0 && enemy.specialCooldown <= 0 && distance < 10 && distance > 2.4 && sameLevel && !followingPath) {
          enemy.chargeTimer = 0.8
          enemy.chargeDirection.copy(direction)
          enemy.specialCooldown = 4.5
          charging = true
          movement.copy(direction)
        }
        if (enemy.coreExposedTimer > 0) movement.set(0, 0, 0)
      }

      const speed = enemy.speed * (enemy.slowTimer > 0 ? 0.45 : 1) * (enemy.buffTimer > 0 ? 1.3 : 1)
        * (charging ? (enemy.kind === 'brute' ? 5.2 : 3.2) : 1)
      const bodyHeight = Math.min(enemy.model.height, 1.9)
      const steering = movement.lengthSq() > 0 ? steerBody(enemy.body.position, movement, enemy.radius, bodyHeight, this.obstacles) : movement
      const flinchSlow = 1 - enemy.flinch * 0.6
      const displacement = steering.multiplyScalar(speed * flinchSlow * delta).addScaledVector(enemy.knockback, delta)
      enemy.knockback.multiplyScalar(Math.exp(-delta * 8))
      moveBody(enemy.body, displacement, delta, enemy.radius, bodyHeight, this.obstacles, this.map.arenaLimit)
      const facing = followingPath && !sameLevel ? travelDirection : direction
      const targetYaw = Math.atan2(-facing.x, -facing.z)
      const yawDelta = Math.atan2(Math.sin(targetYaw - enemy.model.group.rotation.y), Math.cos(targetYaw - enemy.model.group.rotation.y))
      enemy.model.group.rotation.y += yawDelta * Math.min(1, delta * 10)
      // Sobbalzo all'indietro quando viene colpito.
      enemy.model.group.rotation.x = -enemy.flinch * 0.28

      const strideSpeed = enemy.kind === 'runner' ? 12 : enemy.kind === 'crawler' ? 10 : enemy.kind === 'walker' ? 5 : 4
      const strideAmount = enemy.kind === 'runner' ? 0.85 : enemy.kind === 'walker' ? 0.5 : 0.32
      const walk = Math.sin(this.elapsed * strideSpeed + enemy.phase) * strideAmount
      enemy.model.leftLeg.rotation.x = walk
      enemy.model.rightLeg.rotation.x = -walk
      if (enemy.kind === 'walker') {
        enemy.model.leftArm.rotation.x = -1.05 + walk * 0.18
        enemy.model.rightArm.rotation.x = -1.05 - walk * 0.18
        enemy.model.group.rotation.z = Math.sin(this.elapsed * 2.5 + enemy.phase) * 0.06
      } else if (enemy.kind === 'brute' && charging) {
        enemy.model.leftArm.rotation.x = -1.3
        enemy.model.rightArm.rotation.x = -1.3
      } else if (enemy.kind === 'crawler') {
        enemy.model.leftArm.rotation.x = -1.25 + walk
        enemy.model.rightArm.rotation.x = -1.25 - walk
      } else if (enemy.kind === 'screamer' && enemy.specialCooldown > 6.4) {
        enemy.model.leftArm.rotation.x = -2.1
        enemy.model.rightArm.rotation.x = -2.1
      } else {
        enemy.model.leftArm.rotation.x = -walk * 0.75
        enemy.model.rightArm.rotation.x = walk * 0.75
      }

      if (enemy.attackAnim > 0) {
        // Fendente: le braccia si alzano e calano verso il giocatore.
        const swing = Math.sin(enemy.attackAnim * Math.PI)
        enemy.model.leftArm.rotation.x = -1.2 - swing * 1.4
        enemy.model.rightArm.rotation.x = -1.1 - swing * 1.6
      }
      if (playerDistance < enemy.radius + 0.65 && sameLevel && enemy.attackCooldown <= 0) {
        enemy.attackAnim = 1
        this.damagePlayer(enemy.damage)
        enemy.attackCooldown = enemy.attackInterval * (enemy.buffTimer > 0 ? 0.75 : 1)
        if (charging) {
          enemy.chargeTimer = 0
          enemy.coreExposedTimer = 1.8
          charging = false
        }
      }
    }

    for (let first = 0; first < this.enemies.length; first += 1) {
      for (let second = first + 1; second < this.enemies.length; second += 1) {
        const a = this.enemies[first]
        const b = this.enemies[second]
        if (!a || !b) continue
        if (Math.abs(a.body.position.y - b.body.position.y) > 1) continue
        const separation = b.model.group.position.clone().sub(a.model.group.position).setY(0)
        const distance = separation.length()
        const minimum = (a.radius + b.radius) * 0.8
        if (distance > 0 && distance < minimum) {
          separation.normalize().multiplyScalar((minimum - distance) * 0.25)
          a.model.group.position.addScaledVector(separation, -1)
          b.model.group.position.add(separation)
          resolveBodyCollisions(a.model.group.position, a.radius, Math.min(a.model.height, 1.9), this.obstacles)
          resolveBodyCollisions(b.model.group.position, b.radius, Math.min(b.model.height, 1.9), this.obstacles)
        }
      }
    }
    this.killDestroyedEnemies()
  }

  private updateProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]
      if (!projectile) continue
      projectile.life -= delta
      const previousPosition = projectile.mesh.position.clone()
      const travelDistance = projectile.velocity.length() * delta
      const travelDirection = projectile.velocity.clone().normalize()
      const wallDistance = raycastObstacles(previousPosition, travelDirection, travelDistance, this.obstacles)
      if (wallDistance !== null) {
        const impact = previousPosition.addScaledVector(travelDirection, wallDistance)
        this.spawnBurst(impact, 0x8cff62, 3)
        this.spawnHazard(impact)
        this.removeProjectile(index)
        continue
      }
      projectile.mesh.position.addScaledVector(projectile.velocity, delta)
      const limit = this.map.arenaLimit + 2
      const floor = getGroundHeight(projectile.mesh.position.x, projectile.mesh.position.z, projectile.mesh.position.y, 0.1, this.obstacles)
      if (projectile.life <= 0 || projectile.mesh.position.y <= floor || Math.abs(projectile.mesh.position.x) > limit || Math.abs(projectile.mesh.position.z) > limit) {
        this.spawnHazard(projectile.mesh.position)
        this.removeProjectile(index)
        continue
      }
      const dx = projectile.mesh.position.x - this.player.x
      const dz = projectile.mesh.position.z - this.player.z
      const withinHeight = projectile.mesh.position.y > this.player.y - 0.2 && projectile.mesh.position.y < this.player.y + this.controller.height + 0.2
      if (withinHeight && dx * dx + dz * dz < (projectile.radius + 0.45) ** 2) {
        this.damagePlayer(projectile.damage)
        this.spawnHazard(projectile.mesh.position)
        this.removeProjectile(index)
      }
    }
  }

  private updateHazards(delta: number): void {
    for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
      const hazard = this.hazards[index]
      if (!hazard) continue
      hazard.life -= delta
      hazard.mesh.material.opacity = Math.min(0.34, hazard.life * 0.12)
      const dx = this.player.x - hazard.mesh.position.x
      const dz = this.player.z - hazard.mesh.position.z
      if (dx * dx + dz * dz < 1.55 ** 2 && Math.abs(this.player.y - hazard.mesh.position.y) < 0.6) this.damagePlayer(5)
      if (hazard.life <= 0) {
        this.scene.remove(hazard.mesh)
        hazard.mesh.geometry.dispose()
        hazard.mesh.material.dispose()
        this.hazards.splice(index, 1)
      }
    }
  }

  private killDestroyedEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]
      if (enemy && enemy.health <= 0) this.killEnemy(index)
    }
  }

  private killEnemy(index: number): void {
    const enemy = this.enemies[index]
    if (!enemy) return
    const position = enemy.model.group.position.clone()
    const color = getZombieColor(enemy.kind)
    this.score += enemy.score * this.wave
    this.kills += 1
    this.spawnBurst(position.clone().setY(position.y + enemy.model.height * 0.5), color, enemy.kind === 'brute' ? 28 : 12)
    if (enemy.kind === 'brute') {
      for (let drop = 0; drop < 8; drop += 1) {
        const offset = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)
        this.spawnPickup(position.clone().add(offset), 1)
      }
    } else if (Math.random() < 0.26) {
      this.spawnPickup(position, 1)
    }
    this.enemies.splice(index, 1)
    enemy.model.group.rotation.x = 0
    this.dyingEnemies.push({ model: enemy.model, kind: enemy.kind, life: 0.65, direction: Math.random() < 0.5 ? -1 : 1, baseY: position.y })
    this.gainXp(enemy.xp)
    this.audio.playAt('kill', position, this.player, this.yaw)
  }

  private gainXp(amount: number): void {
    if (this.state !== 'playing') return
    this.xp += amount
    let leveled = false
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext
      this.level += 1
      this.pendingUpgrades += 1
      this.xpNext = getNextLevelXp(this.xpNext)
      leveled = true
    }
    if (leveled) this.offerNextUpgrade()
  }

  private spawnPickup(position: THREE.Vector3, value: number): void {
    const mesh = new THREE.Mesh(this.pickupGeometry, this.pickupMaterial)
    const baseY = getGroundHeight(position.x, position.z, position.y + 0.3, 0.2, this.obstacles)
    mesh.position.set(position.x, baseY + 0.35, position.z)
    this.scene.add(mesh)
    this.pickups.push({ mesh, value, phase: Math.random() * Math.PI * 2, baseY })
  }

  private updatePickups(delta: number): void {
    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index]
      if (!pickup) continue
      pickup.mesh.rotation.y += delta * 2.5
      pickup.mesh.position.y = pickup.baseY + 0.38 + Math.sin(this.elapsed * 4 + pickup.phase) * 0.12
      const direction = this.player.clone().sub(pickup.mesh.position).setY(0)
      const sameFloor = Math.abs(this.player.y - pickup.baseY) < 1.2
      const distance = sameFloor ? direction.length() : Number.POSITIVE_INFINITY
      if (distance < this.stats.magnetRadius && distance > 0.01) {
        pickup.mesh.position.addScaledVector(direction.normalize(), (5 + this.stats.magnetRadius - distance) * delta)
      }
      if (distance < 0.8) {
        this.shards += pickup.value
        this.shardsCollected += pickup.value
        this.score += 25 * pickup.value
        this.effects.pulse(pickup.mesh.position.clone().setY(pickup.baseY), 0x6affea, 0.8)
        this.audio.play('pickup')
        this.scene.remove(pickup.mesh)
        this.pickups.splice(index, 1)
      }
    }
  }

  private spawnBurst(position: THREE.Vector3, color: number, count: number): void {
    const available = Math.max(0, 130 - this.particles.length)
    for (let index = 0; index < Math.min(count, available); index += 1) {
      const particle = this.particlePool.pop() ?? {
        mesh: new THREE.Mesh(this.particleGeometry, new THREE.MeshBasicMaterial({ transparent: true })),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      }
      particle.mesh.material.color.setHex(color)
      particle.mesh.material.opacity = 1
      particle.mesh.position.copy(position)
      particle.mesh.scale.setScalar(1)
      particle.velocity.set((Math.random() - 0.5) * 6, Math.random() * 3.5, (Math.random() - 0.5) * 6)
      particle.life = 0.25 + Math.random() * 0.35
      particle.maxLife = particle.life
      this.scene.add(particle.mesh)
      this.particles.push(particle)
    }
  }

  private updateEffects(delta: number): void {
    this.decals.update(delta)
    this.effects.update(delta)
    for (let index = this.dyingEnemies.length - 1; index >= 0; index -= 1) {
      const dying = this.dyingEnemies[index]
      if (!dying) continue
      dying.life -= delta
      const progress = Math.min(1, 1 - dying.life / 0.65)
      dying.model.group.rotation.z = dying.direction * progress * 1.45
      dying.model.group.position.y = dying.baseY - progress * 0.22
      if (dying.life <= 0) {
        this.releaseEnemyModel(dying.kind, dying.model)
        this.dyingEnemies.splice(index, 1)
      }
    }
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]
      if (!particle) continue
      particle.life -= delta
      particle.mesh.position.addScaledVector(particle.velocity, delta)
      particle.velocity.y -= 7 * delta
      particle.mesh.material.opacity = Math.max(0, particle.life / particle.maxLife)
      particle.mesh.scale.setScalar(Math.max(0.1, particle.life / particle.maxLife))
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh)
        this.particles.splice(index, 1)
        this.particlePool.push(particle)
      }
    }
    for (let index = this.tracers.length - 1; index >= 0; index -= 1) {
      const tracer = this.tracers[index]
      if (!tracer) continue
      tracer.life -= delta
      tracer.line.material.opacity = Math.max(0, tracer.life / tracer.maxLife)
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line)
        tracer.line.geometry.dispose()
        tracer.line.material.dispose()
        this.tracers.splice(index, 1)
      }
    }
  }

  private damagePlayer(amount: number): void {
    if (this.state !== 'playing' || this.invulnerability > 0) return
    this.health = Math.max(0, this.health - Math.max(1, amount - this.stats.armor))
    this.invulnerability = 0.32
    this.cameraShake = 0.4
    this.events.onDamage()
    this.audio.play('damage')
    if (this.health <= 0) this.finishRun(false)
  }

  private removeProjectile(index: number): void {
    const projectile = this.projectiles[index]
    if (!projectile) return
    this.scene.remove(projectile.mesh)
    this.projectiles.splice(index, 1)
  }

  private clearEntities(): void {
    this.decals.clear()
    for (const enemy of this.enemies) this.releaseEnemyModel(enemy.kind, enemy.model)
    for (const dying of this.dyingEnemies) this.releaseEnemyModel(dying.kind, dying.model)
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh)
    for (const pickup of this.pickups) this.scene.remove(pickup.mesh)
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh)
      this.particlePool.push(particle)
    }
    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line)
      tracer.line.geometry.dispose()
      tracer.line.material.dispose()
    }
    for (const hazard of this.hazards) {
      this.scene.remove(hazard.mesh)
      hazard.mesh.geometry.dispose()
      hazard.mesh.material.dispose()
    }
    this.equipment.clear()
    this.effects.clear()
    this.enemies.length = 0
    this.dyingEnemies.length = 0
    this.projectiles.length = 0
    this.pickups.length = 0
    this.particles.length = 0
    this.tracers.length = 0
    this.hazards.length = 0
  }

  private releaseEnemyModel(kind: EnemyKind, model: EnemyModel): void {
    this.scene.remove(model.group)
    const pool = this.enemyPool.get(kind) ?? []
    pool.push(model)
    this.enemyPool.set(kind, pool)
  }

  private disposeEnemy(enemy: { model: EnemyModel }): void {
    enemy.model.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
  }

  private emitHud(): void {
    this.events.onHud({
      health: this.health,
      maxHealth: this.stats.maxHealth,
      mapName: this.map.name,
      score: Math.floor(this.score),
      wave: this.wave,
      level: this.level,
      xp: this.xp,
      xpNext: this.xpNext,
      shards: this.shards,
      kills: this.kills,
      ammo: this.weapons.ammo,
      magazineSize: this.weapons.current?.magazineSize ?? 0,
      reserveAmmo: this.weapons.reserve,
      weaponName: this.weapons.weaponName,
      reloading: this.weapons.reloading,
      melee: this.weapons.slot === 'melee',
      scoped: this.weapons.current !== null && this.aiming && this.weaponDefinition.adsFov <= 30,
      aiming: this.aiming,
      waveBreak: this.waveBreak,
      enemiesRemaining: this.enemies.length + this.spawnQueue,
      equipment: (['lethal', 'tactical', 'gadget'] as const).map((slot) => ({
        key: slot === 'lethal' ? 'G' : slot === 'tactical' ? 'Q' : 'T',
        name: EQUIPMENT[this.loadout[slot]].name,
        cooldown: this.cooldowns[slot],
      })),
      interaction: (() => {
        const interaction = this.getNearbyInteraction()
        if (!interaction) return null
        const { label, cost } = this.describeInteraction(interaction)
        return { label, cost, canAfford: this.shards >= cost, denied: this.doorDeniedTimer > 0 }
      })(),
      weaponSlots: this.weapons.hudSlots,
      stance: this.controller.sliding ? 'slide' : this.controller.crouched ? 'crouch' : 'stand',
      performance: { fps: this.fps, drawCalls: this.renderer.info.render.calls },
    })
  }

  private update(delta: number): void {
    this.elapsed += delta
    this.mapContent.ambient.rotation.y += delta * 0.015
    this.updatePlayer(delta)
    if (this.state !== 'playing') return
    this.updateSpawning(delta)
    if (this.state !== 'playing') return
    this.updateEnemies(delta)
    if (this.state !== 'playing') return
    this.updateDoors(delta)
    this.updateStations(delta)
    this.updateEquipment(delta)
    if (this.state !== 'playing') return
    this.updateProjectiles(delta)
    this.updateHazards(delta)
    if (this.state !== 'playing') return
    this.updatePickups(delta)
    this.updateEffects(delta)
    this.hudTimer -= delta
    if (this.hudTimer <= 0) {
      this.emitHud()
      this.hudTimer = 0.05
    }
  }

  private updateMenu(time: number): void {
    this.mapContent.ambient.rotation.y = time * 0.000015
    const radius = this.map.arenaLimit * 0.75
    this.camera.position.set(Math.sin(time * 0.00008) * radius, 7 + Math.sin(time * 0.00005) * 1.5, Math.cos(time * 0.00008) * radius)
    this.camera.rotation.z = 0
    this.camera.lookAt(0, 2, 0)
  }

  private readonly animate = (time: number): void => {
    const frameDuration = Math.max(0, (time - this.lastTime) / 1000)
    const delta = Math.min(frameDuration, 0.05)
    this.lastTime = time
    if (this.renderer.domElement.classList.contains('hidden')) {
      this.animationId = requestAnimationFrame(this.animate)
      return
    }
    this.fpsTimer += frameDuration
    this.fpsFrames += 1
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer)
      this.fpsTimer = 0
      this.fpsFrames = 0
    }
    if (this.state === 'playing') this.update(delta)
    else if (this.state === 'menu') this.updateMenu(time)
    this.pipeline.render()
    this.animationId = requestAnimationFrame(this.animate)
  }

  private readonly resize = (): void => {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.renderer.setSize(width, height)
    this.pipeline.setSize(width, height)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused') this.resume()
      return
    }
    if (this.state !== 'playing') return
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    this.keys.add(event.code)
    if (event.code === 'Digit1') this.switchSlot('primary')
    if (event.code === 'Digit2') this.switchSlot('secondary')
    if (event.code === 'Digit3') this.switchSlot('melee')
    if (event.code === 'KeyF' && !event.repeat) this.performMelee(true)
    const upgradeIndex = UPGRADE_KEYS.indexOf(event.code)
    if (upgradeIndex >= 0 && !event.repeat) {
      const upgradeId = this.currentUpgradeIds[upgradeIndex]
      if (upgradeId) this.chooseUpgrade(upgradeId)
    }
    if (event.code === 'KeyR') this.startReload()
    if (event.code === 'KeyE') this.interact()
    if (event.code === 'KeyC' && !event.repeat) this.controller.pressCrouch()
    if (event.code === 'KeyG') this.useEquipment('lethal')
    if (event.code === 'KeyQ') this.useEquipment('tactical')
    if (event.code === 'KeyT') this.useEquipment('gadget')
    if (event.code === 'Space' && !event.repeat) this.controller.jump(this.obstacles)
  }

  /** Rotella del mouse: scorre primaria, secondaria e arma bianca. */
  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.wheelReady(event)) return
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
    if (this.state !== 'playing' || document.pointerLockElement !== this.renderer.domElement) return
    this.yaw -= event.movementX * this.mouseSensitivity
    this.pitch -= event.movementY * this.mouseSensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45)
    this.weapons.animator.addLook(event.movementX, event.movementY)
  }

  private readonly onMouseButtonDown = (event: MouseEvent): void => {
    if (this.state !== 'playing') return
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
    if (this.state === 'playing' && document.pointerLockElement !== this.renderer.domElement) this.pause()
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault()

  private readonly onBlur = (): void => {
    this.firing = false
    this.aiming = false
    this.keys.clear()
    if (this.state === 'playing') this.pause()
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

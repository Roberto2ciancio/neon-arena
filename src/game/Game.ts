import { DEFAULT_THEME } from './maps'
import { animateWeather } from './weather'
import { RARITIES, rollMysteryBox } from './mysteryBox'
import type { FieldTier } from './fieldWeapons'
import { ATTACHMENTS } from './attachments'
import { UPGRADE_DEFINITIONS } from './upgrades'
import { CREDIT_SYMBOL, getKillCredits, getRunShards, getWeaponKillXp } from './economy'
import { WEAPON_XP } from './armory'
import { GRAVITY } from './world'
import { getAimSensitivityScale } from './accessibility'
import { EXTRA_PROJECTILE_DAMAGE } from './upgrades'
import { getRangeMultiplier } from './weapons'
import { getSpatialSound } from './spatialAudio'
import { CoopTeammates } from './coop/CoopTeammates'
import type { CoopSession } from './coop/CoopSession'
import { COOP_HOST_ID } from './coop/CoopSession'
import { BLEED_OUT_SECONDS, getCoopScaling, isTeamWiped, MAX_COOP_HIT_DAMAGE, respawnAtWave, REVIVE_HEALTH_SHARE, REVIVE_RANGE, REVIVE_SECONDS, scaleMaxActive } from './coop/coopRules'
import type { CoopPlayerStatus } from './coop/coopRules'
import { ENEMY_FLAG_ATTACK, ENEMY_FLAG_ELITE, ENEMY_FLAG_RISING, packEnemy, unpackEnemy } from './coop/coopProtocol'
import type { CoopClientMessage, CoopHostMessage, CoopLobbyPlayer, CoopPlayerState, Vec3 } from './coop/coopProtocol'
import { gunshotProfileForRemote } from './coop/coopAudio'
import { getLowHealthWarning, getMedkitDropChance, getPassiveRegen, MEDKIT_PICKUP_HEAL, MEDKIT_PICKUP_LIFETIME } from './healing'
import { FIELD_TIERS, getFieldTier, getFieldWeaponCost, rollStationWeapons } from './fieldWeapons'
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
import { createStationModel, disposeObject, setStationLabel, STATION_COLORS } from './equipmentModels'
import type { StationModel } from './equipmentModels'
import { buildMap } from './mapBuilder'
import { disposeMaterialVariants, setLambertMaterials } from './materialQuality'
import type { BuiltDoor } from './mapBuilder'
import type { AccessibilitySettings } from './accessibility'
import { FIELD_ATTACHMENTS, MAPS, STATION_13, STATION_COSTS } from './maps'
import type { MapDefinition, PurchasableWeapon, StationDefinition } from './maps'
import { createEnemyModel } from './models'
import type { EnemyModel } from './models'
import { applyUpgrade, createBaseStats, FIRST_LEVEL_XP, getNextLevelXp, getUpgradeChoices, UPGRADE_KEYS } from './upgrades'
import { WEAPONS } from './weapons'
import type { WeaponId } from './weapons'
import { BURN_DURATION, CHAIN_LIGHTNING_RADIUS, getBurnDamagePerSecond, getChainLightningDamage, getChainTargetCount, getHeadshotExplosionDamage, HEADSHOT_EXPLOSION_RADIUS } from './specialEffects'
import { BLOATER_BLAST, ENEMY_FIRST_WAVE, ENEMY_INTEL, FINAL_WAVE, getEliteChance, getMaxActiveZombies, getMeleeDamage, getPrewarmCount, getSpawnPool, PATH_BUDGET_PER_FRAME, getWaveSpawnCount, getZombieColor, getZombieStats, SHIELD_FRONT_REDUCTION, WAVE_BREAK_SECONDS } from './zombies'
import { INSTA_KILL_BOSS_MULTIPLIER, POWER_UP_LIFETIME, POWER_UPS, rollPowerUp, SHOCKWAVE_RADIUS } from './powerups'
import type { PowerUpId } from './powerups'
import type { EnemyKind, GameEvents, GameState, HitZone, MetaBonuses, RunResult } from './types'

interface PowerUpPickup {
  /** Identificativo condiviso in co-op. */
  netId: number
  id: PowerUpId
  group: THREE.Group
  life: number
  baseY: number
  phase: number
}

interface Enemy {
  model: EnemyModel
  elite: boolean
  /** Identificativo condiviso fra host e compagni in co-op. */
  netId: number
  /** Attesa prima di potersi arrampicare di nuovo. */
  climbCooldown: number
  /** Sputatore: caricamento visibile prima dello sputo. */
  windup: number
  /** Ultimo giocatore che l'ha colpito (null = giocatore locale): riceve la ricompensa. */
  lastHitBy: string | null
  /** Solo client co-op: posizione e rotazione ricevute dall'host. */
  netTarget: THREE.Vector3 | null
  netYaw: number
  maxHealth: number
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

/** Kit medico caduto da uno zombie: cura passandoci sopra. */
interface MedkitPickup {
  group: THREE.Group
  baseY: number
  life: number
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
  /** Arma e prezzo attuali (cambiano a ogni ondata). */
  weapon?: WeaponId
  cost: number
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
    case 'bloater': return 'belly'
    case 'shielder': return 'back'
    case 'leaper': return 'spine'
    default: return 'head'
  }
}

export class Game {
  /** Secondi al prossimo aggiornamento della mappa d'ombra. */
  private shadowTimer = 0
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
  private readonly powerPickups: PowerUpPickup[] = []
  private readonly activePowerUps = new Map<PowerUpId, number>()
  private readonly audio = new GameAudio()
  private readonly enemies: Enemy[] = []
  private readonly enemyPool = new Map<EnemyKind, EnemyModel[]>()
  private pathBudget = 0
  /** Tipi di zombie già presentati in questa run. */
  private readonly introducedKinds = new Set<EnemyKind>()
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
  private readonly acidGeometry = new THREE.SphereGeometry(0.22, 10, 8)
  private readonly acidMaterial = new THREE.MeshBasicMaterial({ color: 0xb6ff5c })
  private readonly acidRingGeometry = new THREE.RingGeometry(1.35, 1.55, 32)
  /** Il giocatore locale è dentro una pozza acida (bordo verde nell'HUD). */
  private inAcid = false
  private readonly pickupGeometry = new THREE.OctahedronGeometry(0.25)
  private readonly medkitBoxGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.36)
  private readonly medkitBoxMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, emissive: 0x2a3a30, emissiveIntensity: 0.6, roughness: 0.5 })
  private readonly medkitCrossMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b4f })
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
  /** Spinta della visuale dovuta allo sparo (0–1) e verso casuale dell'inclinazione. */
  private firePunch = 0
  private punchRoll = 1
  private precisionHitThisShot = false
  private adrenalineTimer = 0
  private shield = 0
  private shieldDelay = 0
  private secondWindUsed = false
  // --- Co-op -------------------------------------------------------------------------------
  private coop: CoopSession | null = null
  private coopUnsubscribe: (() => void)[] = []
  private readonly teammates = new CoopTeammates(this.scene)
  /** Giocatori della partita co-op (1 = da solo). */
  private coopPlayers = 1
  private coopStatus: CoopPlayerStatus = 'alive'
  private bleedOut = 0
  private reviveProgress = 0
  private coopNetTimer = 0
  private coopRemaining = 0
  private readonly teammateKills = new Map<string, number>()
  private nextEnemyId = 1
  private nextPowerId = 1
  private medkits: MedkitPickup[] = []
  /** Secondi dall'ultimo danno subito (rigenerazione naturale). */
  private sinceDamage = 0
  private heartbeatTimer = 0
  /** Colpi alla testa o ai punti deboli nella run (statistiche del profilo). */
  private precisionHits = 0
  /** Esperienza accumulata da ogni arma in questa run. */
  private readonly weaponXp = new Map<string, number>()
  /** Potenziamenti scelti in questa run, con il numero di volte. */
  private readonly chosenUpgrades = new Map<string, number>()
  private groanTimer = 2
  private reducedMotion = false
  private adsSensitivity = 1
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
  private readonly frameVectors = {
    effect: new THREE.Vector3(),
    stun: new THREE.Vector3(),
    target: new THREE.Vector3(),
    toPlayer: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    travel: new THREE.Vector3(),
    movement: new THREE.Vector3(),
    strafe: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    aim: new THREE.Vector3(),
    separation: new THREE.Vector3(),
    projectilePrevious: new THREE.Vector3(),
    projectileDirection: new THREE.Vector3(),
  }

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

    const initialTheme = this.map.theme ?? DEFAULT_THEME
    this.scene.background = new THREE.Color(initialTheme.background)
    this.scene.fog = new THREE.FogExp2(initialTheme.fog, initialTheme.fogDensity)
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
    this.adsSensitivity = settings.adsSensitivity
    if (settings.reducedMotion) this.cameraShake = 0
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality
    const settings = getGraphicsSettings(quality)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap))
    this.pipeline.setQuality(quality)
    this.resize()
    this.renderer.shadowMap.enabled = settings.shadows
    // La mappa d'ombra si ricalcola a intervalli: quasi tutto ciò che proietta ombre è statico.
    this.renderer.shadowMap.autoUpdate = false
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
        const explosive = source === 'grenade' || source === 'claymore' || source === 'molotov' ? 1 + (1 - this.stats.demolition) * 1.25 : 1
        this.dealDamage(enemy, this.scaleDamage(enemy, amount * (this.stats.damage / 20) * explosive * this.executionBonus(enemy)))
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
    const theme = map.theme ?? DEFAULT_THEME
    this.scene.background = new THREE.Color(theme.background)
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity)
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
        : definition.kind === 'ammo' ? 'MUNIZIONI' : definition.kind === 'box' ? 'CASSA MISTERIOSA' : 'KIT MEDICO'
      const model = createStationModel(definition.kind, title, definition.cost)
      model.group.position.set(definition.x, definition.y, definition.z)
      model.group.rotation.y = Math.atan2(this.map.playerSpawn.x - definition.x, this.map.playerSpawn.z - definition.z)
      this.scene.add(model.group)
      return { definition, model, weapon: definition.weapon, cost: definition.cost }
    })
  }

  /** Cambia le armi delle postazioni per l'ondata: stesse armi per tutti, grado e prezzo crescenti. */
  private rotateStations(wave: number): void {
    const weaponStations = this.stations.filter((station) => station.definition.kind === 'weapon')
    const premium = new Set(weaponStations.filter((station) => station.definition.premium).map((station) => station.definition.id))
    const rolled = rollStationWeapons(this.map.id, weaponStations.map((station) => station.definition.id), Math.max(1, wave), premium)
    const tier = getFieldTier(Math.max(1, wave))
    for (const station of weaponStations) {
      const weaponId = rolled[station.definition.id] as PurchasableWeapon | undefined
      if (!weaponId) continue
      station.weapon = weaponId
      station.cost = getFieldWeaponCost(STATION_COSTS[weaponId], tier)
      setStationLabel(station.model, 'weapon', `${WEAPONS[weaponId].shortName} ${FIELD_TIERS[tier].name}`, `${CREDIT_SYMBOL} ${station.cost}`)
    }
  }

  start(bonuses: MetaBonuses, map: MapDefinition = STATION_13, loadout?: ResolvedLoadout): void {
    if (loadout) this.loadout = loadout
    this.clearEntities()
    this.setMap(map)
    this.prewarmEnemies()
    this.introducedKinds.clear()
    this.introducedKinds.add('walker')
    this.coopStatus = 'alive'
    this.bleedOut = 0
    this.reviveProgress = 0
    this.coopRemaining = 0
    this.nextEnemyId = 1
    this.nextPowerId = 1
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
    this.adrenalineTimer = 0
    this.shield = 0
    this.shieldDelay = 0
    this.secondWindUsed = false
    this.precisionHits = 0
    this.weaponXp.clear()
    this.chosenUpgrades.clear()
    this.elapsed = 0
    this.weapons.configure(this.loadout)
    this.equipment.clear()
    this.decoy = null
    this.radarTimer = 0
    this.activePowerUps.clear()
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

  /**
   * Avvia una partita Zombie cooperativa. L'host simula zombie, ondate e bonus; i compagni
   * ricevono lo stato del mondo e inviano posizione e colpi.
   */
  startCoop(session: CoopSession, mapId: string, players: readonly CoopLobbyPlayer[], bonuses: MetaBonuses, loadout?: ResolvedLoadout): void {
    this.detachCoop()
    this.coop = session
    this.coopPlayers = Math.max(1, players.length)
    this.teammateKills.clear()
    const map = MAPS.find((candidate) => candidate.id === mapId) ?? STATION_13
    this.start(bonuses, map, loadout)
    this.teammates.sync(players, session.localId, map.playerSpawn)
    if (session.isHost) {
      this.coopUnsubscribe.push(session.onClient((peerId, message) => this.handleCoopClient(peerId, message)))
      this.coopUnsubscribe.push(session.onPeerLeft((peerId) => {
        this.teammates.remove(peerId)
        this.coopPlayers = Math.max(1, this.teammates.all.length + 1)
      }))
    } else {
      this.coopUnsubscribe.push(session.onHost((message) => this.handleCoopHost(message)))
    }
  }

  /** Riepilogo per la scheda della pausa: armi in uso con accessori e potenziamenti della run. */
  getRunSummary(): RunSummary {
    const describe = (weapon: ResolvedWeapon | null) => weapon ? {
      name: weapon.shortName,
      attachments: Object.values(weapon.attachments).map((id) => ATTACHMENTS[id!].name),
      level: weapon.weaponLevel,
    } : null
    const slots = this.weapons.hudSlots
    return {
      weapons: [describe(this.weapons.currentOf('primary')), describe(this.weapons.currentOf('secondary'))].filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      melee: this.loadout.melee.name,
      equipment: (['lethal', 'tactical', 'gadget'] as const).map((slot) => EQUIPMENT[this.loadout[slot]].name),
      upgrades: [...this.chosenUpgrades].map(([id, count]) => {
        const upgrade = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === id)
        return { name: upgrade?.name ?? id, description: upgrade?.description ?? '', icon: upgrade?.icon ?? '•', count }
      }),
      stats: { damage: Math.round((this.stats.damage / 20 - 1) * 100), fireRate: Math.round((this.stats.fireRate / 8.5 - 1) * 100), crit: Math.round(this.stats.critChance * 100), armor: this.stats.armor, regen: this.stats.regen, shield: this.stats.energyShield, reload: Math.round((1 - this.stats.reloadTime) * 100) },
      slots: slots.length,
    }
  }

  get isCoop(): boolean {
    return this.coop !== null
  }

  private get coopRole(): 'host' | 'client' | null {
    return this.coop ? (this.coop.isHost ? 'host' : 'client') : null
  }

  private detachCoop(): void {
    for (const unsubscribe of this.coopUnsubscribe) unsubscribe()
    this.coopUnsubscribe = []
    this.coop = null
    this.coopPlayers = 1
    this.coopStatus = 'alive'
    this.teammates.clear()
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
    this.detachCoop()
    if (!this.isRunActive()) return
    this.events.onRunEnd(this.createRunResult())
    this.returnToMenu()
  }

  returnToMenu(): void {
    this.detachCoop()
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
    this.weapons.reloadMultiplier = this.stats.reloadTime
    this.shield = this.stats.energyShield
    this.chosenUpgrades.set(upgradeId, (this.chosenUpgrades.get(upgradeId) ?? 0) + 1)
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
      shards: getRunShards(this.wave, this.kills, won),
      time: Math.floor(this.elapsed),
      won,
      map: this.map.name,
      precisionHits: this.precisionHits,
      weaponXp: Object.fromEntries(this.weaponXp),
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
    const previousTier = getFieldTier(Math.max(1, this.wave - 1))
    this.rotateStations(this.wave)
    const tier = getFieldTier(this.wave)
    if (this.wave > 1) {
      this.events.onNotice?.(tier > previousTier ? `ARMI ${FIELD_TIERS[tier].name} DISPONIBILI` : 'POSTAZIONI AGGIORNATE', tier > previousTier ? 'Le postazioni ora vendono armi più potenti, a un prezzo più alto.' : 'Le armi in vendita sulla mappa sono cambiate: controlla le postazioni.', 0x8f6bff)
    }
    this.spawnQueue = Math.round(getWaveSpawnCount(this.wave) * getCoopScaling(this.coopPlayers).spawnCount)
    this.spawnTimer = 0.65
    this.onCoopWave()
    if (this.coopRole === 'host') this.coop?.broadcast({ t: 'wave', wave: this.wave })
    this.waveBreak = 0
    this.waveActive = true
    this.events.onWave(this.wave)
  }

  /**
   * Crea in anticipo i modelli di ogni tipo di zombie e compila i loro shader, così la prima
   * apparizione di un tipo nuovo (es. l'Ombra all'ondata 7) non provoca un blocco del frame.
   */
  private prewarmEnemies(): void {
    const kinds: EnemyKind[] = [...(Object.keys(ENEMY_FIRST_WAVE) as EnemyKind[]), 'brute']
    const created: EnemyModel[] = []
    for (const kind of kinds) {
      const pool = this.enemyPool.get(kind) ?? []
      while (pool.length < getPrewarmCount(kind)) {
        const model = createEnemyModel(kind, getZombieColor(kind))
        model.group.position.set(0, -50, 0)
        pool.push(model)
        created.push(model)
      }
      this.enemyPool.set(kind, pool)
    }
    if (created.length === 0) return
    // Un frame vero con tutti i tipi davanti alla telecamera: prepara anche le varianti degli
    // shader usate da ombre e occlusione ambientale, che compile() da solo non copre.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize()
    created.forEach((model, index) => {
      const offset = (index % 6) - 2.5
      model.group.position.copy(this.camera.position).addScaledVector(forward, 6 + Math.floor(index / 6) * 1.5)
      model.group.position.x += offset * 1.2
      model.group.position.y = 0
      this.scene.add(model.group)
    })
    this.renderer.compile(this.scene, this.camera)
    this.renderer.shadowMap.needsUpdate = true
    this.pipeline.render()
    for (const model of created) {
      this.scene.remove(model.group)
      model.group.position.set(0, 0, 0)
    }
  }

  private updateSpawning(delta: number): void {
    if (this.spawnQueue > 0) {
      // Il resto dell'ondata aspetta finché ci sono troppi zombie vivi.
      if (this.enemies.length >= scaleMaxActive(getMaxActiveZombies(this.graphicsQuality), this.coopPlayers)) return
      this.spawnTimer -= delta
      if (this.spawnTimer <= 0) {
        const bossWave = this.wave % 5 === 0
        const extraBoss = this.wave >= 10 && this.spawnQueue === Math.floor(getWaveSpawnCount(this.wave) * getCoopScaling(this.coopPlayers).spawnCount / 2)
        const kind = bossWave && (this.spawnQueue === 1 || extraBoss) ? 'brute' : this.randomEnemyKind()
        this.spawnEnemy(kind)
        this.spawnQueue -= 1
        this.spawnTimer = Math.max(0.12, (0.75 - this.wave * 0.035) * getCoopScaling(this.coopPlayers).spawnInterval)
      }
      return
    }
    if (this.enemies.length > 0) return
    if (this.waveActive) {
      this.waveActive = false
      if (this.wave >= FINAL_WAVE) {
        if (this.coopRole === 'host') this.coop?.broadcast({ t: 'end', wave: this.wave, won: true })
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
    const pool = getSpawnPool(this.wave)
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

  private spawnEnemy(kind: EnemyKind, replica?: { id: number; elite: boolean; position: THREE.Vector3; rising: boolean }): void {
    const scaling = getCoopScaling(this.coopPlayers)
    const elite = replica ? replica.elite : kind !== 'brute' && Math.random() < getEliteChance(this.wave) + scaling.eliteBonus
    const baseStats = getZombieStats(kind, this.wave, elite)
    const stats = { ...baseStats, health: baseStats.health * scaling.health, damage: baseStats.damage * scaling.damage }
    if (!this.introducedKinds.has(kind)) {
      this.introducedKinds.add(kind)
      const color = getZombieColor(kind)
      this.events.onNotice?.(`NUOVO NEMICO // ${getZombieStats(kind, 1).name.toUpperCase()}`, ENEMY_INTEL[kind], kind === 'brute' ? 0xff6b6b : color)
    }
    const pooled = this.enemyPool.get(kind)?.pop()
    const model = pooled ?? createEnemyModel(kind, getZombieColor(kind))
    model.group.visible = true
    model.group.rotation.set(0, 0, 0)
    model.group.scale.setScalar(elite ? 1.12 : 1)
    model.body.material.emissive.setHex(0x000000)
    model.body.material.emissiveIntensity = 0
    model.leftLeg.rotation.x = 0
    model.rightLeg.rotation.x = 0
    model.leftArm.rotation.x = 0
    model.rightArm.rotation.x = 0
    model.group.position.copy(replica ? replica.position : this.pickSpawnPoint(stats.radius))
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
      elite,
      netId: replica ? replica.id : this.nextEnemyId++,
      lastHitBy: null,
      climbCooldown: 0,
      windup: 0,
      netTarget: replica ? replica.position.clone() : null,
      netYaw: 0,
      body: { position: model.group.position, velocityY: 0, grounded: true },
      path: [],
      pathTimer: 0,
      spawnTimer: replica && !replica.rising ? 0 : SPAWN_RISE,
      flinch: 0,
      attackAnim: 0,
      stunTimer: 0,
      knockback: new THREE.Vector3(),
      target,
      marker,
      kind,
      health: stats.health,
      maxHealth: stats.health,
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
    this.sinceDamage += delta
    this.adrenalineTimer = Math.max(0, this.adrenalineTimer - delta)
    this.shieldDelay = Math.max(0, this.shieldDelay - delta)
    if (this.shieldDelay <= 0 && this.shield < this.stats.energyShield) this.shield = Math.min(this.stats.energyShield, this.shield + 15 * delta)
    this.health += getPassiveRegen(this.health, this.stats.maxHealth, this.sinceDamage, delta)
    const warning = getLowHealthWarning(this.health, this.stats.maxHealth)
    if (warning.intensity > 0) {
      this.heartbeatTimer -= delta
      if (this.heartbeatTimer <= 0) {
        this.audio.play('heartbeat')
        this.heartbeatTimer = warning.heartbeatInterval
      }
    } else {
      this.heartbeatTimer = 0
    }

    const input = readMovementInput(this.keys, this.aiming || this.firing || this.weapons.reloading)
    const result = this.controller.update(delta, input, this.yaw, {
      speed: (this.stats.speed * (this.adrenalineTimer > 0 ? 1.25 : 1)) * this.weaponDefinition.moveMultiplier,
      solids: this.obstacles,
      arenaLimit: this.map.arenaLimit,
    })
    if (result.landingSpeed > 7) this.cameraShake = Math.max(this.cameraShake, Math.min(0.3, (result.landingSpeed - 7) * 0.05))

    const frameInput = { aiming: this.aiming, crouched: this.controller.crouched, blocked: this.controller.sprinting || this.coopStatus !== 'alive' || this.state !== 'playing', fireRateMultiplier: (this.stats.fireRate / 8.5) * (this.activePowerUps.has('rapid-fire') ? 1.6 : 1) }
    const frame = this.weapons.update(delta, frameInput)
    for (const sound of frame.sounds) this.audio.play(sound)
    this.pitch = THREE.MathUtils.clamp(this.pitch - frame.recovery.pitch, -1.45, 1.45)
    this.yaw -= frame.recovery.yaw
    for (let shot = 0; shot < frame.shots; shot += 1) {
      const kick = this.weapons.kick(frameInput)
      this.pitch = THREE.MathUtils.clamp(this.pitch + kick.pitch, -1.45, 1.45)
      this.yaw += kick.yaw
      this.firePunch = Math.min(1, this.firePunch + this.weaponPunch())
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
    // Spinta dello sparo: la visuale sobbalza appena e il campo visivo si allarga per un istante.
    this.firePunch = Math.max(0, this.firePunch - delta * 9)
    const punch = this.reducedMotion ? 0 : this.firePunch
    this.camera.rotation.set(this.pitch + punch * 0.012, this.yaw, (this.reducedMotion ? 0 : this.controller.roll) + punch * this.punchRoll * 0.01)
    if (this.coopStatus !== 'alive') {
      // A terra: visuale rasoterra e inclinata, come sdraiati.
      this.camera.position.y -= 1.15
      this.camera.rotation.z += 0.35
    }

    const weapon = this.weapons.current
    const aiming = this.aiming && weapon !== null
    const adsFov = weapon?.adsFov ?? 52
    const targetFov = aiming ? adsFov : this.controller.sliding ? 84 : this.controller.sprinting ? 80 : 75
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-delta * 12)) + punch * (aiming ? 0.4 : 1.4)
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
      this.audio.play('switch')
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
    this.audio.play('melee')
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
      // Dopo l'ondata 4 un fendente non basta più a uccidere: toglie al massimo il 60% della vita.
      const shieldFactor = enemy.kind === 'shielder' && this.isShieldFacing(enemy, this.player) ? 0.3 : 1
      this.dealDamage(enemy, this.scaleDamage(enemy, getMeleeDamage(melee.damage * (this.stats.damage / 20), this.wave, enemy.maxHealth) * shieldFactor))
      enemy.hitFlash = 0.12
      enemy.flinch = 1
      enemy.knockback.addScaledVector(forward, enemy.kind === 'brute' ? 1 : 4)
      this.spawnBurst(enemy.model.body.getWorldPosition(new THREE.Vector3()), 0x9b3147, 8)
      hit = true
    }
    if (hit) {
      this.events.onHit(false)
      this.audio.play('meleeHit')
      this.cameraShake = Math.max(this.cameraShake, 0.12)
    }
    this.killDestroyedEnemies()
  }

  private firePlayerWeapon(): void {
    const profile = this.weapons.soundProfile()
    if (profile) this.audio.gunshot(profile)
    if (this.weaponDefinition.pellets === 1 || Math.random() < 0.5) this.audio.play('shell')
    this.precisionHitThisShot = false

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
          || enemy.kind === 'bloater' || enemy.kind === 'shielder' || enemy.kind === 'leaper'
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
        this.applyZombieHit(hit, critical, shot >= this.weaponDefinition.pellets ? EXTRA_PROJECTILE_DAMAGE : 1)
      }
      const wallPoint = wallDistance === null ? null : origin.clone().addScaledVector(direction, wallDistance)
      const endPoint = targets.at(-1)?.point ?? wallPoint ?? origin.clone().addScaledVector(direction, this.weaponDefinition.range)
      this.spawnTracer(muzzlePosition, endPoint)
      if (this.coop && shot === 0) {
        const message = { t: 'shot' as const, from: toVec3(muzzlePosition), to: toVec3(endPoint) }
        if (this.coop.isHost) this.coop.broadcast({ ...message, by: COOP_HOST_ID })
        else this.coop.send(message)
      }
      if (targets.length === 0 && wallPoint) {
        this.effects.sparks(wallPoint, origin.clone().sub(wallPoint).normalize(), 0xffd59a, 4)
        this.decals.spawn(wallPoint, origin)
      }
    }
    if (hitAny) this.audio.play(this.precisionHitThisShot ? 'headshot' : 'hit')
    this.killDestroyedEnemies()
  }

  private applyZombieHit(hit: HitscanHit, critical: boolean, shotFactor = 1): void {
    const enemy = hit.enemy
    // Danno pieno entro la distanza efficace della categoria, poi cala; i colpi di Colpo multiplo valgono meno.
    const baseDamage = this.weaponDefinition.damage * (this.stats.damage / 20) * shotFactor * getRangeMultiplier(this.weaponDefinition, this.camera.position.distanceTo(hit.point))
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
    if (enemy.kind === 'leaper' && hit.zone === 'spine') multiplier = 2.2
    if (enemy.kind === 'bloater' && hit.zone === 'belly') multiplier = 2.4
    if (enemy.kind === 'shielder') {
      if (hit.zone === 'back') multiplier = 2.4
      else if (this.isShieldFacing(enemy, this.camera.position)) {
        // Lo scudo assorbe i colpi frontali: bisogna aggirarlo.
        multiplier *= 1 - SHIELD_FRONT_REDUCTION
        this.effects.sparks(hit.point, this.camera.position.clone().sub(hit.point).normalize(), 0xffe0a0, 5)
      }
    }
    if (enemy.kind === 'spitter' && hit.zone === 'throat') multiplier = 2.5
    if (enemy.kind === 'screamer' && hit.zone === 'throat') {
      multiplier = 2.3
      enemy.specialCooldown = Math.max(enemy.specialCooldown, 3)
    }

    const damage = this.scaleDamage(enemy, baseDamage * multiplier * (critical ? this.stats.critMultiplier : 1) * this.executionBonus(enemy))
    const precisionZone = hit.zone === 'head' || hit.zone === 'generator' || hit.zone === 'core' || hit.zone === 'spine' || hit.zone === 'throat' || hit.zone === 'back' || hit.zone === 'belly'
    this.dealDamage(enemy, damage, precisionZone)
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
    if (precisionHit) {
      this.precisionHitThisShot = true
      this.precisionHits += 1
    }
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
        this.dealDamage(enemy, damage * Math.max(0.35, 1 - distance / HEADSHOT_EXPLOSION_RADIUS))
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
      this.dealDamage(candidate.enemy, getChainLightningDamage(this.stats.chainLightning, this.stats.damage))
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

  private fireAcid(enemy: Enemy, target: THREE.Vector3 = this.camera.position): void {
    const mesh = new THREE.Mesh(this.acidGeometry, this.acidMaterial)
    mesh.position.copy(enemy.model.group.position)
    mesh.position.y += enemy.model.height * 0.72
    const direction = target.clone().sub(mesh.position).normalize()
    this.scene.add(mesh)
    this.projectiles.push({ mesh, velocity: direction.multiplyScalar(7.5), damage: enemy.damage, life: 4, radius: 0.25 })
    if (this.coopRole === 'host') this.coop?.broadcast({ t: 'acid', pos: toVec3(mesh.position), vel: toVec3(direction) })
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
    const ring = new THREE.Mesh(this.acidRingGeometry, new THREE.MeshBasicMaterial({ color: 0xc8ff6a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }))
    ring.position.z = 0.005
    mesh.add(ring)
    this.scene.add(mesh)
    this.effects.pulse(mesh.position, 0x8cff62, 1.6)
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
    if (definition.kind === 'medkit') return { label: 'KIT MEDICO // CURA COMPLETA', cost: definition.cost }
    if (definition.kind === 'ammo') return { label: 'RIFORNIMENTO MUNIZIONI', cost: definition.cost }
    if (definition.kind === 'box') return { label: 'CASSA MISTERIOSA // ARMA A SORPRESA', cost: definition.cost }
    const station = interaction.station
    const weaponId = station.weapon!
    const name = `${WEAPONS[weaponId].shortName} ${FIELD_TIERS[getFieldTier(Math.max(1, this.wave))].name}`
    // Un'arma già posseduta si ricarica a metà prezzo.
    return this.weapons.has(weaponId)
      ? { label: `MUNIZIONI ${name}`, cost: Math.ceil(station.cost / 2) }
      : { label: `ACQUISTA ${name}`, cost: station.cost }
  }

  private interact(): void {
    if (this.state !== 'playing' || this.coopStatus !== 'alive') return
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
      this.openDoor(interaction.door)
      if (this.coopRole === 'client') this.coop?.send({ t: 'door', id: interaction.door.definition.id })
      else if (this.coopRole === 'host') this.coop?.broadcast({ t: 'door', id: interaction.door.definition.id })
    } else {
      const { definition, model } = interaction.station
      if (definition.kind === 'medkit' && this.health >= this.stats.maxHealth) return
      this.shards -= cost
      if (definition.kind === 'medkit') {
        this.health = this.stats.maxHealth
        this.audio.play('heal')
      } else if (definition.kind === 'ammo') {
        this.weapons.refill()
        this.cooldowns.lethal = 0
        this.cooldowns.tactical = 0
      } else if (definition.kind === 'box') {
        // Arma a caso: le comuni escono spesso, le leggendarie di rado e con un grado MK in più.
        const owned = (['primary', 'secondary'] as const).map((slot) => this.weapons.currentOf(slot)?.id).filter((id): id is WeaponId => id !== undefined)
        const { weapon, rarity } = rollMysteryBox(Math.random, owned)
        const tier = Math.min(3, getFieldTier(Math.max(1, this.wave)) + RARITIES[rarity].tierBonus) as FieldTier
        const purchasable = weapon as PurchasableWeapon
        this.weapons.replace(resolveWeapon(WEAPONS[weapon], FIELD_ATTACHMENTS[purchasable], { fieldTier: tier, level: this.loadout.weaponLevels[weapon] }))
        this.events.onNotice?.(`${RARITIES[rarity].name} // ${WEAPONS[weapon].shortName} ${FIELD_TIERS[tier].name}`, WEAPONS[weapon].description, RARITIES[rarity].color)
      } else if (interaction.station.weapon) {
        const weaponId = interaction.station.weapon as PurchasableWeapon
        // Un'arma nuova sostituisce quella dello stesso slot; una posseduta si ricarica.
        if (this.weapons.has(weaponId)) this.weapons.refill(weaponId)
        else this.weapons.replace(resolveWeapon(WEAPONS[weaponId], FIELD_ATTACHMENTS[weaponId], { fieldTier: getFieldTier(Math.max(1, this.wave)), level: this.loadout.weaponLevels[weaponId] }))
      }
      this.effects.pulse(model.group.position, STATION_COLORS[definition.kind], 1.8)
      this.spawnBurst(model.group.position.clone().setY(model.group.position.y + 1.3), STATION_COLORS[definition.kind], 14)
    }
    this.audio.play('upgrade')
    this.emitHud()
  }

  private openDoor(door: Door): void {
    if (door.open) return
    door.open = true
    const obstacleIndex = this.obstacles.indexOf(door.obstacle)
    if (obstacleIndex >= 0) this.obstacles.splice(obstacleIndex, 1)
    this.spawnBurst(door.group.position.clone().setY(1), 0xffb657, 16)
    this.effects.pulse(door.group.position, 0xffb657, 2.4)
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
    this.cooldowns[slot] = definition.cooldown * this.stats.demolition
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
          this.spawnBurst(enemy.model.body.getWorldPosition(this.frameVectors.effect), 0xff7b38, 2)
        }
      }
      if (enemy.health <= 0) continue
      // Le élite hanno un alone dorato pulsante, riconoscibile a distanza.
      const eliteGlow = enemy.elite ? 0.55 + Math.sin(this.elapsed * 5 + enemy.phase) * 0.25 : 0
      enemy.model.body.material.emissive.setHex(enemy.hitFlash > 0 ? 0x882233 : enemy.burnTimer > 0 ? 0x8a2f09 : enemy.elite ? 0x7a5200 : 0x000000)
      enemy.model.body.material.emissiveIntensity = enemy.hitFlash > 0 ? 1.8 : enemy.burnTimer > 0 ? 1.2 : eliteGlow
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
        moveBody(enemy.body, this.frameVectors.stun.copy(enemy.knockback).multiplyScalar(delta), delta, enemy.radius, Math.min(enemy.model.height, 1.9), this.obstacles, this.map.arenaLimit)
        enemy.knockback.multiplyScalar(Math.exp(-delta * 8))
        continue
      }
      // Bersaglio: l'esca se è vicina, una posizione falsata se il giocatore è nel fumo.
      const victim = this.chooseVictim(enemy)
      let targetPoint: THREE.Vector3 = victim.position
      if (this.decoy && enemy.body.position.distanceTo(this.decoy.position) < 22) targetPoint = this.decoy.position
      else if (victim.id === null && this.equipment.isInSmoke(this.camera.position) && enemy.body.position.distanceTo(this.player) > 3) {
        targetPoint = this.frameVectors.target.copy(this.player)
        targetPoint.x += Math.sin(enemy.phase) * 6
        targetPoint.z += Math.cos(enemy.phase) * 6
      }
      const verticalGap = victim.position.y - enemy.body.position.y
      const sameLevel = Math.abs(verticalGap) < 1.3
      const playerDistance = Math.hypot(victim.position.x - enemy.body.position.x, victim.position.z - enemy.body.position.z)
      const detailDistance = this.graphicsQuality === 'low' ? 14 : 18
      const detailed = Math.hypot(this.player.x - enemy.body.position.x, this.player.z - enemy.body.position.z) < detailDistance
      for (const detail of enemy.model.details) detail.visible = detailed
      const toPlayer = this.frameVectors.toPlayer.copy(targetPoint).sub(enemy.model.group.position).setY(0)
      const distance = Math.max(toPlayer.length(), 0.001)
      const direction = this.frameVectors.direction.copy(toPlayer).divideScalar(distance)
      // Percorso fra piani e porte; inseguimento diretto quando si è nella stessa area.
      enemy.pathTimer -= delta
      if (enemy.pathTimer <= 0 && this.pathBudget > 0 && !(this.navigation.isOnStairs(enemy.body.position) && enemy.path.length > 0)) {
        this.pathBudget -= 1
        enemy.path = this.navigation.findPath(enemy.body.position, targetPoint, (doorId) => this.doors.some((door) => door.definition.id === doorId && door.open))
        enemy.pathTimer = 0.45 + Math.random() * 0.2
      }
      advanceWaypoints(enemy.body.position, enemy.path)
      const waypoint = enemy.path[0]
      const followingPath = waypoint !== undefined
      const travelDirection = followingPath
        ? this.frameVectors.travel.set(waypoint.x - enemy.body.position.x, 0, waypoint.z - enemy.body.position.z).normalize()
        : this.frameVectors.travel.copy(direction)
      const movement = this.frameVectors.movement.copy(travelDirection)
      let charging = enemy.chargeTimer > 0

      if (enemy.kind === 'runner' && !followingPath) {
        movement.add(this.frameVectors.strafe.set(-direction.z, 0, direction.x).multiplyScalar(Math.sin(this.elapsed * 4 + enemy.phase) * 0.7)).normalize()
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
        const eye = this.frameVectors.eye.copy(enemy.model.group.position).setY(enemy.body.position.y + enemy.model.height * 0.72)
        const victimEye = victim.id === null ? this.camera.position : victim.position.clone().setY(victim.position.y + 1.6)
        const aim = this.frameVectors.aim.copy(victimEye).sub(eye).normalize()
        const clearShot = raycastObstacles(eye, aim, eye.distanceTo(victimEye), this.obstacles) === null
        if (enemy.windup > 0) {
          // Caricamento: la gola si illumina e lampeggia, lo zombie si ferma per mirare.
          enemy.windup -= delta
          movement.set(0, 0, 0)
          enemy.model.weakPoint.material.emissiveIntensity = 2.5 + Math.sin(this.elapsed * 40) * 1.5
          if (enemy.windup <= 0) {
            enemy.model.weakPoint.material.emissiveIntensity = 1.5
            this.fireAcid(enemy, victimEye)
          }
        } else if (distance < 17 && enemy.specialCooldown <= 0 && clearShot) {
          enemy.windup = SPITTER_WINDUP
          enemy.specialCooldown = 2.8
          this.audio.playAt('acidCharge', enemy.model.group.position, this.player, this.yaw)
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
          this.spawnBurst(this.frameVectors.effect.copy(enemy.model.group.position).setY(enemy.model.height * 0.7), 0xc486ff, 20)
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

      if (enemy.kind === 'leaper' && enemy.body.grounded && enemy.specialCooldown <= 0 && distance > 4.5 && distance < 12 && sameLevel && !followingPath) {
        // Balzo verso il giocatore: può superare coperture basse.
        enemy.body.velocityY = 7.4
        enemy.body.grounded = false
        enemy.chargeDirection.copy(direction)
        enemy.specialCooldown = 3.8
        this.effects.pulse(enemy.body.position, getZombieColor('leaper'), 1)
      }
      // Arrampicata: se il bersaglio è sopra un ostacolo vicino, lo zombie salta su.
      enemy.climbCooldown = Math.max(0, enemy.climbCooldown - delta)
      if (!sameLevel && verticalGap > 0.6 && verticalGap < 3.2 && playerDistance < 2.8 && enemy.body.grounded && enemy.climbCooldown <= 0 && enemy.kind !== 'brute' && enemy.kind !== 'crawler') {
        enemy.body.velocityY = Math.sqrt(2 * GRAVITY * (verticalGap + 0.5))
        enemy.body.grounded = false
        enemy.climbCooldown = 1.6
      }
      const leaping = enemy.kind === 'leaper' && !enemy.body.grounded && enemy.specialCooldown > 3
      if (leaping) movement.copy(enemy.chargeDirection)
      if (enemy.kind === 'stalker') {
        // L'Ombra è quasi invisibile finché non è vicina o viene colpita.
        const opacity = enemy.hitFlash > 0 ? 1 : THREE.MathUtils.clamp((14 - playerDistance) / 7, 0.1, 1)
        for (const material of (enemy.model.group.userData.fadeMaterials as THREE.Material[] | undefined) ?? []) material.opacity = opacity
      }
      if (enemy.kind === 'bloater' && playerDistance < 1.8 && sameLevel) enemy.health = 0
      const speed = leaping ? 8.5 : enemy.speed * (enemy.slowTimer > 0 ? 0.45 : 1) * (enemy.buffTimer > 0 ? 1.3 : 1)
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
      // Chi sale su casse o coperture basse non è più al sicuro: gli zombie colpiscono verso l'alto.
      const verticalReach = enemy.kind === 'brute' ? 2.6 : 1.9
      const canStrike = sameLevel ? playerDistance < enemy.radius + 0.65 : verticalGap > 0 && verticalGap < verticalReach && playerDistance < enemy.radius + 0.9
      if (canStrike && enemy.attackCooldown <= 0) {
        enemy.attackAnim = 1
        this.hitVictim(victim, enemy.damage)
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
        const separation = this.frameVectors.separation.copy(b.model.group.position).sub(a.model.group.position).setY(0)
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
      const previousPosition = this.frameVectors.projectilePrevious.copy(projectile.mesh.position)
      const travelDistance = projectile.velocity.length() * delta
      const travelDirection = this.frameVectors.projectileDirection.copy(projectile.velocity).normalize()
      const wallDistance = raycastObstacles(previousPosition, travelDirection, travelDistance, this.obstacles)
      if (wallDistance !== null) {
        const impact = previousPosition.addScaledVector(travelDirection, wallDistance)
        this.spawnBurst(impact, 0x8cff62, 3)
        this.spawnHazard(impact)
        this.removeProjectile(index)
        continue
      }
      projectile.mesh.position.addScaledVector(projectile.velocity, delta)
      if (Math.random() < 0.6) this.spawnBurst(projectile.mesh.position, 0x8cff62, 1)
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
        continue
      }
      if (this.coopRole === 'host' && projectile.damage > 0) {
        const struck = this.teammates.all.find((mate) => mate.status === 'alive'
          && Math.hypot(mate.feet.x - projectile.mesh.position.x, mate.feet.z - projectile.mesh.position.z) < projectile.radius + 0.45
          && projectile.mesh.position.y > mate.feet.y - 0.2 && projectile.mesh.position.y < mate.feet.y + 2)
        if (struck) {
          this.hitPlayer(struck.id, projectile.damage)
          this.spawnHazard(projectile.mesh.position)
          this.removeProjectile(index)
        }
      }
    }
  }

  private updateHazards(delta: number): void {
    this.inAcid = false
    for (let index = this.hazards.length - 1; index >= 0; index -= 1) {
      const hazard = this.hazards[index]
      if (!hazard) continue
      hazard.life -= delta
      hazard.mesh.material.opacity = Math.min(0.42, hazard.life * 0.14)
      // Bordo che pulsa e bolle: la pozza si riconosce anche con la coda dell'occhio.
      const ring = hazard.mesh.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined
      if (ring) ring.material.opacity = Math.min(1, hazard.life * 0.4) * (0.55 + Math.sin(this.elapsed * 7 + index) * 0.35)
      if (Math.random() < delta * 6) this.spawnBurst(hazard.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.05, (Math.random() - 0.5) * 2.4)), 0xb6ff5c, 1)
      const dx = this.player.x - hazard.mesh.position.x
      const dz = this.player.z - hazard.mesh.position.z
      if (dx * dx + dz * dz < 1.55 ** 2 && Math.abs(this.player.y - hazard.mesh.position.y) < 0.6) {
        this.inAcid = true
        this.damagePlayer(5)
      }
      if (this.coopRole === 'host') {
        for (const mate of this.teammates.all) {
          if (mate.status !== 'alive' || mate.hazardCooldown > 0) continue
          if ((mate.feet.x - hazard.mesh.position.x) ** 2 + (mate.feet.z - hazard.mesh.position.z) ** 2 < 1.55 ** 2 && Math.abs(mate.feet.y - hazard.mesh.position.y) < 0.6) {
            mate.hazardCooldown = 0.32
            this.hitPlayer(mate.id, 5)
          }
        }
      }
      if (hazard.life <= 0) {
        this.scene.remove(hazard.mesh)
        hazard.mesh.geometry.dispose()
        hazard.mesh.material.dispose()
        ;(hazard.mesh.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined)?.material.dispose()
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

  /** Esecutore: danno bonus contro i nemici quasi sconfitti. */
  private executionBonus(enemy: Enemy): number {
    return this.stats.executioner > 0 && enemy.health < enemy.maxHealth * 0.3 ? 1 + this.stats.executioner : 1
  }

  /** Spinta della visuale per colpo, proporzionale alla potenza dell'arma impugnata. */
  private weaponPunch(): number {
    this.punchRoll = Math.random() < 0.5 ? -1 : 1
    const weapon = this.weaponDefinition
    return Math.min(1, 0.25 + weapon.recoil.vertical * 30 + (weapon.pellets > 1 ? 0.35 : 0))
  }

  /** Versi degli zombie: ogni tanto uno vicino ringhia, così si sentono arrivare anche alle spalle. */
  private updateGroans(delta: number): void {
    this.groanTimer -= delta
    if (this.groanTimer > 0 || this.enemies.length === 0) return
    this.groanTimer = 1.4 + Math.random() * 2.2 - Math.min(0.8, this.enemies.length * 0.03)
    const candidates = this.enemies.filter((enemy) => enemy.health > 0 && enemy.spawnTimer <= 0 && enemy.body.position.distanceTo(this.player) < 22)
    const enemy = candidates[Math.floor(Math.random() * candidates.length)]
    if (!enemy) return
    this.audio.playAt(enemy.kind === 'brute' || enemy.kind === 'bloater' ? 'groanBig' : 'groan', enemy.body.position, this.player, this.yaw)
  }

  /** Vero se lo scudo dello Scudiero è rivolto verso il punto indicato. */
  private isShieldFacing(enemy: Enemy, point: THREE.Vector3): boolean {
    const forward = new THREE.Vector3(-Math.sin(enemy.model.group.rotation.y), 0, -Math.cos(enemy.model.group.rotation.y))
    const toPoint = point.clone().sub(enemy.body.position).setY(0)
    return toPoint.lengthSq() > 0 && forward.dot(toPoint.normalize()) > 0.25
  }

  /** Il Gonfio esplode in una nube acida che ferisce il giocatore e gli zombie vicini. */
  private explodeBloater(position: THREE.Vector3): void {
    const center = position.clone().setY(position.y + 1)
    this.effects.explosion(center, BLOATER_BLAST.radius, getZombieColor('bloater'), position.y)
    this.spawnHazard(position)
    this.audio.playAt('explosion', position, this.player, this.yaw)
    const playerDistance = this.player.distanceTo(position)
    if (playerDistance < BLOATER_BLAST.radius && Math.abs(this.player.y - position.y) < 1.6) {
      this.damagePlayer(BLOATER_BLAST.playerDamage * Math.max(0.3, 1 - playerDistance / BLOATER_BLAST.radius))
    }
    if (this.coopRole === 'host') {
      for (const mate of this.teammates.all) {
        const distance = mate.feet.distanceTo(position)
        if (mate.status === 'alive' && distance < BLOATER_BLAST.radius) this.hitPlayer(mate.id, BLOATER_BLAST.playerDamage * Math.max(0.3, 1 - distance / BLOATER_BLAST.radius))
      }
    }
    for (const other of this.enemies) {
      if (other.health <= 0 || other.body.position.distanceTo(position) > BLOATER_BLAST.radius) continue
      other.health -= BLOATER_BLAST.zombieDamage
      other.hitFlash = 0.12
    }
  }

  private killEnemy(index: number): void {
    const enemy = this.enemies[index]
    if (!enemy) return
    const position = enemy.model.group.position.clone()
    if (enemy.kind === 'bloater') this.explodeBloater(position)
    const color = getZombieColor(enemy.kind)
    const score = enemy.score * this.wave * this.lootMultiplier
    const shards = enemy.kind === 'brute' ? 8 : Math.random() < 0.26 ? 1 : 0
    const killer = enemy.lastHitBy
    const active = new Set<PowerUpId>([...this.activePowerUps.keys(), ...this.powerPickups.map((pickup) => pickup.id)])
    const dropped = rollPowerUp(enemy.kind, Math.random, active, this.stats.luck)
    if (dropped) this.spawnPowerPickup(position, dropped)
    this.spawnBurst(position.clone().setY(position.y + enemy.model.height * 0.5), color, enemy.kind === 'brute' ? 28 : 12)
    if (this.coopRole === 'host') {
      this.coop?.broadcast({ t: 'kill', enemy: enemy.netId, by: killer ?? COOP_HOST_ID, kind: enemy.kind, pos: toVec3(position), score, xp: enemy.xp, shards, precision: false })
      if (killer) this.teammateKills.set(killer, (this.teammateKills.get(killer) ?? 0) + 1)
    }
    if (killer === null) this.rewardKill(enemy.kind, position, score, enemy.xp, shards, enemy.elite)
    this.enemies.splice(index, 1)
    enemy.model.group.rotation.x = 0
    this.dyingEnemies.push({ model: enemy.model, kind: enemy.kind, life: 0.65, direction: Math.random() < 0.5 ? -1 : 1, baseY: position.y })
    this.audio.playAt('kill', position, this.player, this.yaw)
  }

  /** Ricompense dell'uccisione per il giocatore locale: punti, esperienza, frammenti e kit. */
  private rewardKill(kind: EnemyKind, position: THREE.Vector3, score: number, xp: number, shards: number, elite = false): void {
    this.score += score
    this.kills += 1
    // Crediti per comprare in partita e esperienza per l'arma impugnata.
    this.shards += getKillCredits(kind, elite) * this.lootMultiplier
    const weaponId = this.weapons.current?.id
    if (weaponId && this.weapons.slot !== 'melee') this.weaponXp.set(weaponId, (this.weaponXp.get(weaponId) ?? 0) + getWeaponKillXp(kind, elite, WEAPON_XP.zombieKill))
    if (Math.random() < getMedkitDropChance(kind, this.health / this.stats.maxHealth) * this.stats.luck) this.spawnMedkit(position)
    if (this.stats.lifesteal > 0 && this.coopStatus === 'alive') this.health = Math.min(this.stats.maxHealth, this.health + this.stats.lifesteal)
    if (this.stats.adrenaline > 0) this.adrenalineTimer = this.stats.adrenaline
    for (let drop = 0; drop < shards; drop += 1) {
      const offset = shards > 1 ? new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3) : new THREE.Vector3()
      this.spawnPickup(position.clone().add(offset), 1)
    }
    this.gainXp(xp)
    this.events.onKill?.()
  }

  private get lootMultiplier(): number {
    return this.activePowerUps.has('double-loot') ? 2 : 1
  }

  /** Colpo letale: uccide gli zombie comuni e quadruplica il danno sul Bruto. */
  private scaleDamage(enemy: Enemy, damage: number): number {
    if (!this.activePowerUps.has('insta-kill')) return damage
    return enemy.kind === 'brute' ? damage * INSTA_KILL_BOSS_MULTIPLIER : Math.max(damage, enemy.health + 1)
  }

  private spawnPowerPickup(position: THREE.Vector3, id: PowerUpId, netId?: number): void {
    if (this.coopRole === 'client' && netId === undefined) return
    const definition = POWER_UPS[id]
    const group = new THREE.Group()
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshStandardMaterial({ color: definition.color, emissive: definition.color, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.25 }),
    )
    group.add(core)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.03, 8, 32),
      new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.8 }),
    )
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = `#${definition.color.toString(16).padStart(6, '0')}`
      context.font = 'bold 92px sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(definition.icon, 64, 70)
    }
    const texture = new THREE.CanvasTexture(canvas)
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
    icon.scale.setScalar(0.7)
    icon.position.y = 0.75
    group.add(icon)
    // Colonna di luce visibile da lontano.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.35, 5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    beam.position.y = 2.5
    group.add(beam)
    const baseY = getGroundHeight(position.x, position.z, position.y + 0.3, 0.2, this.obstacles)
    group.position.set(position.x, baseY + 0.6, position.z)
    this.scene.add(group)
    this.effects.pulse(group.position.clone().setY(baseY), definition.color, 1.4)
    const shared = netId ?? this.nextPowerId++
    this.powerPickups.push({ netId: shared, id, group, life: POWER_UP_LIFETIME, baseY, phase: Math.random() * Math.PI * 2 })
    if (this.coopRole === 'host') this.coop?.broadcast({ t: 'power-spawn', id: shared, power: id, pos: toVec3(position) })
  }

  private removePowerPickup(index: number): void {
    const pickup = this.powerPickups[index]
    if (!pickup) return
    this.scene.remove(pickup.group)
    disposeObject(pickup.group)
    this.powerPickups.splice(index, 1)
  }

  private activatePowerUp(id: PowerUpId, origin: THREE.Vector3 = this.player): void {
    const definition = POWER_UPS[id]
    this.audio.play('upgrade')
    this.effects.pulse(this.player, definition.color, 3)
    this.events.onPowerUp?.(definition.name, definition.description, definition.color)
    this.audio.play('powerUp')
    if (id === 'full-ammo') {
      this.weapons.refill()
      this.cooldowns.lethal = 0
      this.cooldowns.tactical = 0
    } else if (id === 'shockwave') {
      this.effects.explosion(origin.clone().setY(origin.y + 1), 6, definition.color, origin.y)
      this.cameraShake = Math.max(this.cameraShake, 0.4)
      // L'onda d'urto elimina gli zombie: in co-op lo decide l'host.
      if (this.coopRole !== 'client') {
        for (const enemy of this.enemies) {
          if (enemy.kind === 'brute' || enemy.health <= 0) continue
          if (enemy.body.position.distanceTo(origin) <= SHOCKWAVE_RADIUS) enemy.health = 0
        }
        this.killDestroyedEnemies()
      }
    }
    if (definition.duration > 0) this.activePowerUps.set(id, definition.duration)
    this.emitHud()
  }

  private updatePowerUps(delta: number): void {
    for (const [id, remaining] of this.activePowerUps) {
      if (remaining - delta <= 0) this.activePowerUps.delete(id)
      else this.activePowerUps.set(id, remaining - delta)
    }
    for (let index = this.powerPickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.powerPickups[index]!
      pickup.life -= delta
      pickup.group.rotation.y += delta * 2
      pickup.group.position.y = pickup.baseY + 0.6 + Math.sin(this.elapsed * 3 + pickup.phase) * 0.15
      // Negli ultimi secondi lampeggia prima di sparire.
      pickup.group.visible = pickup.life > 5 || Math.sin(pickup.life * 14) > 0
      // In co-op solo l'host decide chi lo raccoglie (lui o un compagno): l'effetto vale per tutti.
      if (this.coopRole === 'client') {
        if (pickup.life <= 0) this.removePowerPickup(index)
        continue
      }
      const near = (feet: THREE.Vector3) => Math.hypot(pickup.group.position.x - feet.x, pickup.group.position.z - feet.z) < 1.5 && Math.abs(pickup.baseY - feet.y) < 1.4
      const taker = this.coopStatus === 'alive' && near(this.player) ? COOP_HOST_ID : this.teammates.all.find((mate) => mate.status === 'alive' && near(mate.feet))?.id
      if (taker) {
        const id = pickup.id
        if (this.coopRole === 'host') this.coop?.broadcast({ t: 'power-take', id: pickup.netId, power: id, by: taker })
        this.removePowerPickup(index)
        this.activatePowerUp(id, taker === COOP_HOST_ID ? this.player : this.teammates.get(taker)?.feet)
        continue
      }
      if (pickup.life <= 0) this.removePowerPickup(index)
    }
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
    if (leveled) {
      this.audio.play('upgrade')
      this.offerNextUpgrade()
    }
  }

  private spawnMedkit(position: THREE.Vector3): void {
    const group = new THREE.Group()
    const box = new THREE.Mesh(this.medkitBoxGeometry, this.medkitBoxMaterial)
    group.add(box)
    for (const [width, height] of [[0.34, 0.1], [0.1, 0.34]] as const) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.02), this.medkitCrossMaterial)
      cross.position.z = 0.19
      group.add(cross)
      const back = cross.clone()
      back.position.z = -0.19
      group.add(back)
    }
    const baseY = getGroundHeight(position.x, position.z, position.y + 0.3, 0.2, this.obstacles)
    group.position.set(position.x + (Math.random() - 0.5) * 0.8, baseY + 0.45, position.z + (Math.random() - 0.5) * 0.8)
    this.scene.add(group)
    this.medkits.push({ group, baseY, life: MEDKIT_PICKUP_LIFETIME })
  }

  private updateMedkits(delta: number): void {
    for (let index = this.medkits.length - 1; index >= 0; index -= 1) {
      const medkit = this.medkits[index]!
      medkit.life -= delta
      medkit.group.rotation.y += delta * 1.8
      medkit.group.position.y = medkit.baseY + 0.45 + Math.sin(this.elapsed * 3 + index) * 0.08
      medkit.group.visible = medkit.life > 5 || Math.sin(this.elapsed * 14) > 0
      const close = Math.hypot(medkit.group.position.x - this.player.x, medkit.group.position.z - this.player.z) < 1.1
        && Math.abs(this.player.y - medkit.baseY) < 1.2
      // Si raccoglie solo se serve: a vita piena resta a terra per dopo.
      const take = close && this.health < this.stats.maxHealth
      if (!take && medkit.life > 0) continue
      if (take) {
        this.health = Math.min(this.stats.maxHealth, this.health + this.stats.maxHealth * MEDKIT_PICKUP_HEAL)
        this.effects.pulse(medkit.group.position.clone().setY(medkit.baseY), 0x7dff9b, 1.2)
        this.events.onNotice?.('KIT MEDICO', `+${Math.round(MEDKIT_PICKUP_HEAL * 100)}% integrità`, 0x7dff9b)
        this.audio.play('heal')
      }
      this.scene.remove(medkit.group)
      this.medkits.splice(index, 1)
    }
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
        const value = pickup.value * this.lootMultiplier
        this.shards += value
        this.shardsCollected += value
        this.score += 25 * value
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
    if (this.state !== 'playing' && !(this.coop && this.state === 'paused')) return
    if (this.invulnerability > 0 || this.activePowerUps.has('barrier') || this.coopStatus !== 'alive') return
    this.shieldDelay = 5
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount)
      this.shield -= absorbed
      amount -= absorbed
      this.effects.pulse(this.player, 0x6ad8ff, 0.8)
      if (amount <= 0) return
    }
    if (this.stats.secondWind > 0 && !this.secondWindUsed && this.health - Math.max(1, amount - this.stats.armor) <= 0) {
      this.secondWindUsed = true
      this.health = 1
      this.invulnerability = 2
      this.events.onNotice?.('SECONDO RESPIRO', 'Sopravvissuto a un colpo letale: hai 2 secondi per metterti al sicuro.', 0xffd166)
      return
    }
    this.health = Math.max(0, this.health - Math.max(1, amount - this.stats.armor))
    this.invulnerability = 0.32
    this.sinceDamage = 0
    this.cameraShake = 0.4
    this.events.onDamage()
    this.audio.play('damage')
    if (this.health > 0) return
    if (this.coop) this.goDown()
    else this.finishRun(false)
  }

  private removeProjectile(index: number): void {
    const projectile = this.projectiles[index]
    if (!projectile) return
    this.scene.remove(projectile.mesh)
    this.projectiles.splice(index, 1)
  }

  private clearEntities(): void {
    for (const medkit of this.medkits) this.scene.remove(medkit.group)
    this.medkits = []
    this.sinceDamage = 0
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
    for (let index = this.powerPickups.length - 1; index >= 0; index -= 1) this.removePowerPickup(index)
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

  // =========================================================================================
  // Co-op
  // =========================================================================================

  /** Compagno a terra abbastanza vicino da essere rianimato. */
  private findRevivable(): { id: string; name: string } | null {
    if (!this.coop) return null
    const mate = this.teammates.all.find((candidate) => candidate.status === 'down' && candidate.feet.distanceTo(this.player) < REVIVE_RANGE)
    return mate ? { id: mate.id, name: mate.name } : null
  }

  /** Zombie: insegue il giocatore in piedi più vicino (in solitaria sempre quello locale). */
  private chooseVictim(enemy: Enemy): Victim {
    let best: Victim = { position: this.player, id: null }
    const score = (feet: THREE.Vector3) => Math.hypot(feet.x - enemy.body.position.x, feet.z - enemy.body.position.z) + Math.abs(feet.y - enemy.body.position.y) * 3
    let bestScore = this.coopStatus === 'alive' ? score(this.player) : Number.POSITIVE_INFINITY
    if (this.coop) {
      for (const mate of this.teammates.all) {
        if (mate.status !== 'alive') continue
        const value = score(mate.feet)
        if (value < bestScore) {
          bestScore = value
          best = { position: mate.feet, id: mate.id }
        }
      }
    }
    // Una torretta vicina attira gli zombie più del giocatore lontano: la attaccano finché non esplode.
    for (const turret of this.equipment.attackableTurrets()) {
      const value = score(turret.position)
      if (value < TURRET_AGGRO_RANGE && value < bestScore) {
        bestScore = value
        best = { position: turret.position, id: null, turret }
      }
    }
    return best
  }

  private hitVictim(victim: Victim, amount: number): void {
    if (victim.turret) victim.turret.damage(amount)
    else this.hitPlayer(victim.id, amount)
  }

  private hitPlayer(id: string | null, amount: number): void {
    if (id === null) this.damagePlayer(amount)
    else this.coop?.sendTo(id, { t: 'damage', target: id, amount: Math.round(amount * 10) / 10 })
  }

  /** Danno inflitto dal giocatore locale. Il client lo dichiara all'host e non uccide da solo. */
  private dealDamage(enemy: Enemy, amount: number, precision = false): void {
    if (amount <= 0 || enemy.health <= 0) return
    if (this.coopRole === 'client') {
      this.coop?.send({ t: 'hit', enemy: enemy.netId, damage: Math.min(MAX_COOP_HIT_DAMAGE, Math.round(amount * 10) / 10), precision })
      enemy.health = Math.max(1, enemy.health - amount)
      return
    }
    enemy.health -= amount
    enemy.lastHitBy = null
  }

  private goDown(): void {
    this.coopStatus = 'down'
    this.bleedOut = BLEED_OUT_SECONDS
    this.health = 0
    this.firing = false
    this.aiming = false
    this.weapons.setVisible(false)
    this.sendCoopState()
  }

  private standUp(healthShare: number): void {
    this.weapons.setVisible(true)
    this.coopStatus = 'alive'
    this.bleedOut = 0
    this.health = this.stats.maxHealth * healthShare
    this.invulnerability = 1.5
    this.sinceDamage = 0
    this.audio.play('heal')
    this.sendCoopState()
  }

  /** Inizio ondata: chi era eliminato rientra con vita piena. */
  private onCoopWave(): void {
    if (!this.coop) return
    if (respawnAtWave(this.coopStatus) === 'alive' && this.coopStatus === 'dead') {
      this.controller.reset(this.map.playerSpawn.x, 0, this.map.playerSpawn.z)
      this.standUp(1)
      this.events.onNotice?.('DI NUOVO IN CAMPO', 'Nuova ondata: rientri con la vita piena.', 0x58f5e5)
    }
  }

  private updateCoop(delta: number): void {
    const coop = this.coop
    if (!coop) return
    this.teammates.update(delta, this.elapsed)
    // Dissanguamento a terra.
    if (this.coopStatus === 'down') {
      this.bleedOut = Math.max(0, this.bleedOut - delta)
      if (this.bleedOut <= 0) {
        this.coopStatus = 'dead'
        this.sendCoopState()
      }
    }
    // Rianimazione: tieni premuto E vicino a un compagno a terra.
    const downed = this.coopStatus === 'alive' && this.state === 'playing' && this.keys.has('KeyE') ? this.findRevivable() : null
    if (downed) {
      this.reviveProgress += delta
      if (this.reviveProgress >= REVIVE_SECONDS) {
        this.reviveProgress = 0
        if (coop.isHost) this.applyRevive(downed.id, COOP_HOST_ID)
        else coop.send({ t: 'revive', target: downed.id })
      }
    } else {
      this.reviveProgress = 0
    }
    this.coopNetTimer -= delta
    if (this.coopNetTimer > 0) return
    this.coopNetTimer = 1 / 15
    if (coop.isHost) {
      this.broadcastWorld()
      const statuses = [this.coopStatus, ...this.teammates.all.map((mate) => mate.status)]
      if (isTeamWiped(statuses) && this.isRunActive()) {
        coop.broadcast({ t: 'end', wave: this.wave, won: false })
        this.finishRun(false)
      }
    } else {
      this.sendCoopState()
    }
  }

  private sendCoopState(): void {
    if (this.coopRole !== 'client') return
    this.coop?.send({
      t: 'state', x: round2(this.player.x), y: round2(this.player.y), z: round2(this.player.z), yaw: round2(this.yaw), pitch: round2(this.pitch),
      crouch: this.controller.crouched, health: Math.round(this.health), status: this.coopStatus,
    })
  }

  private localPlayerState(id: string): CoopPlayerState {
    return { id, x: round2(this.player.x), y: round2(this.player.y), z: round2(this.player.z), yaw: round2(this.yaw), pitch: round2(this.pitch), crouch: this.controller.crouched, health: Math.round(this.health), status: this.coopStatus, kills: this.kills }
  }

  private broadcastWorld(): void {
    const enemies = this.enemies.filter((enemy) => enemy.health > 0).map((enemy) => packEnemy(
      enemy.netId, enemy.kind, enemy.body.position.x, enemy.body.position.y, enemy.body.position.z, enemy.model.group.rotation.y,
      enemy.health / enemy.maxHealth,
      (enemy.elite ? ENEMY_FLAG_ELITE : 0) | (enemy.spawnTimer > 0 ? ENEMY_FLAG_RISING : 0) | (enemy.attackAnim > 0 ? ENEMY_FLAG_ATTACK : 0),
    ))
    const players: CoopPlayerState[] = [
      this.localPlayerState(COOP_HOST_ID),
      ...this.teammates.all.map((mate) => ({ id: mate.id, x: round2(mate.target.x), y: round2(mate.target.y), z: round2(mate.target.z), yaw: round2(mate.targetYaw), pitch: 0, crouch: mate.crouch, health: Math.round(mate.health), status: mate.status, kills: this.teammateKills.get(mate.id) ?? 0 })),
    ]
    this.coop?.broadcast({ t: 'world', wave: this.wave, waveBreak: round2(this.waveBreak), remaining: this.enemies.length + this.spawnQueue, enemies, players })
  }

  private applyRevive(target: string, by: string): void {
    if (this.coopRole === 'host') this.coop?.broadcast({ t: 'revived', target, by })
    if (target === this.coop?.localId) {
      if (this.coopStatus === 'down') this.standUp(REVIVE_HEALTH_SHARE)
      return
    }
    const mate = this.teammates.get(target)
    if (mate && mate.status === 'down') {
      this.teammates.setStatus(mate, 'alive')
      mate.health = Math.round(100 * REVIVE_HEALTH_SHARE)
    }
  }

  /** Host: messaggi dei compagni. */
  private handleCoopClient(peerId: string, message: CoopClientMessage): void {
    switch (message.t) {
      case 'state': {
        const mate = this.teammates.get(peerId)
        if (!mate) return
        const limit = this.map.arenaLimit
        this.teammates.applyState({
          id: peerId, x: THREE.MathUtils.clamp(message.x, -limit, limit), y: THREE.MathUtils.clamp(message.y, 0, 16), z: THREE.MathUtils.clamp(message.z, -limit, limit),
          yaw: message.yaw, pitch: message.pitch, crouch: message.crouch, health: message.health, status: message.status, kills: this.teammateKills.get(peerId) ?? 0,
        })
        return
      }
      case 'hit': {
        const enemy = this.enemies.find((candidate) => candidate.netId === message.enemy)
        if (!enemy || enemy.health <= 0 || enemy.spawnTimer > 0) return
        enemy.health -= this.scaleDamage(enemy, message.damage)
        enemy.hitFlash = 0.08
        enemy.flinch = Math.min(1, enemy.flinch + 0.5)
        enemy.lastHitBy = peerId
        this.killDestroyedEnemies()
        return
      }
      case 'shot':
        this.coop?.broadcast({ t: 'shot', by: peerId, from: message.from, to: message.to })
        this.showRemoteShot(message.from, message.to)
        return
      case 'door': {
        const door = this.doors.find((candidate) => candidate.definition.id === message.id)
        if (!door) return
        this.openDoor(door)
        this.coop?.broadcast({ t: 'door', id: message.id })
        return
      }
      case 'revive':
        this.applyRevive(message.target, peerId)
        return
      default:
        return
    }
  }

  /** Client: messaggi dell'host. */
  private handleCoopHost(message: CoopHostMessage): void {
    if (!this.isRunActive() && message.t !== 'end') return
    const localId = this.coop?.localId
    switch (message.t) {
      case 'world': {
        this.waveBreak = message.waveBreak
        this.coopRemaining = message.remaining
        if (message.wave !== this.wave && message.wave > 0) this.applyRemoteWave(message.wave)
        const seen = new Set<number>()
        for (const packed of message.enemies) {
          const data = unpackEnemy(packed)
          seen.add(data.id)
          const enemy = this.enemies.find((candidate) => candidate.netId === data.id)
          if (!enemy) {
            this.spawnEnemy(data.kind, { id: data.id, elite: (data.flags & ENEMY_FLAG_ELITE) !== 0, position: new THREE.Vector3(data.x, data.y, data.z), rising: (data.flags & ENEMY_FLAG_RISING) !== 0 })
            continue
          }
          enemy.netTarget?.set(data.x, data.y, data.z)
          enemy.netYaw = data.yaw
          enemy.health = Math.max(1, data.healthShare * enemy.maxHealth)
          if ((data.flags & ENEMY_FLAG_ATTACK) !== 0 && enemy.attackAnim <= 0) enemy.attackAnim = 1
        }
        // Zombie spariti senza messaggio di uccisione (es. fuori sincronia): si rimuovono.
        for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
          const enemy = this.enemies[index]!
          if (seen.has(enemy.netId)) continue
          this.enemies.splice(index, 1)
          this.releaseEnemyModel(enemy.kind, enemy.model)
        }
        for (const player of message.players) if (player.id !== localId) this.teammates.applyState(player)
        return
      }
      case 'wave':
        this.applyRemoteWave(message.wave)
        return
      case 'kill': {
        const index = this.enemies.findIndex((candidate) => candidate.netId === message.enemy)
        const position = new THREE.Vector3(...message.pos)
        if (index >= 0) {
          const enemy = this.enemies[index]!
          this.enemies.splice(index, 1)
          enemy.model.group.rotation.x = 0
          this.dyingEnemies.push({ model: enemy.model, kind: enemy.kind, life: 0.65, direction: Math.random() < 0.5 ? -1 : 1, baseY: position.y })
        }
        if (message.kind === 'bloater') this.effects.explosion(position.clone().setY(position.y + 1), BLOATER_BLAST.radius, getZombieColor('bloater'), position.y)
        this.spawnBurst(position.clone().setY(position.y + 1), getZombieColor(message.kind), message.kind === 'brute' ? 28 : 12)
        this.audio.playAt('kill', position, this.player, this.yaw)
        if (message.by === localId) this.rewardKill(message.kind, position, message.score, message.xp, message.shards)
        return
      }
      case 'damage':
        if (message.target === localId) this.damagePlayer(message.amount)
        return
      case 'acid': {
        const mesh = new THREE.Mesh(this.acidGeometry, this.acidMaterial)
        mesh.position.set(...message.pos)
        this.scene.add(mesh)
        // Solo effetto visivo: il danno ai giocatori lo calcola l'host.
        this.projectiles.push({ mesh, velocity: new THREE.Vector3(...message.vel).multiplyScalar(7.5), damage: 0, life: 4, radius: 0.25 })
        return
      }
      case 'power-spawn':
        this.spawnPowerPickup(new THREE.Vector3(...message.pos), message.power, message.id)
        return
      case 'power-take': {
        const index = this.powerPickups.findIndex((pickup) => pickup.netId === message.id)
        if (index >= 0) this.removePowerPickup(index)
        const origin = message.by === localId ? this.player : this.teammates.get(message.by)?.feet ?? this.player
        this.activatePowerUp(message.power, origin)
        return
      }
      case 'door': {
        const door = this.doors.find((candidate) => candidate.definition.id === message.id)
        if (door) this.openDoor(door)
        return
      }
      case 'revived':
        this.applyRevive(message.target, message.by)
        return
      case 'shot':
        if (message.by !== localId) this.showRemoteShot(message.from, message.to)
        return
      case 'end':
        this.finishRun(message.won)
        return
      default:
        return
    }
  }

  private applyRemoteWave(wave: number): void {
    if (wave === this.wave) return
    this.wave = wave
    const previousTier = getFieldTier(Math.max(1, wave - 1))
    this.rotateStations(wave)
    const tier = getFieldTier(wave)
    if (wave > 1) this.events.onNotice?.(tier > previousTier ? `ARMI ${FIELD_TIERS[tier].name} DISPONIBILI` : 'POSTAZIONI AGGIORNATE', 'Le armi in vendita sulla mappa sono cambiate: controlla le postazioni.', 0x8f6bff)
    this.onCoopWave()
    this.events.onWave(wave)
  }

  private showRemoteShot(from: Vec3, to: Vec3): void {
    const start = new THREE.Vector3(...from)
    this.spawnTracer(start, new THREE.Vector3(...to))
    this.effects.muzzle(start, 0x8effd9)
    this.audio.gunshot(gunshotProfileForRemote(), getSpatialSound(start, this.player, this.yaw))
  }

  /** Client: zombie replicati, interpolati verso lo stato dell'host e animati in locale. */
  private updateReplicas(delta: number): void {
    const blend = 1 - Math.exp(-12 * delta)
    for (const enemy of this.enemies) {
      if (enemy.spawnTimer > 0) {
        enemy.spawnTimer = Math.max(0, enemy.spawnTimer - delta)
        enemy.model.group.position.y = (enemy.netTarget?.y ?? 0) - enemy.model.height * (enemy.spawnTimer / SPAWN_RISE)
      }
      const before = enemy.model.group.position.clone()
      if (enemy.netTarget && enemy.spawnTimer <= 0) enemy.model.group.position.lerp(enemy.netTarget, blend)
      const yawDelta = Math.atan2(Math.sin(enemy.netYaw - enemy.model.group.rotation.y), Math.cos(enemy.netYaw - enemy.model.group.rotation.y))
      enemy.model.group.rotation.y += yawDelta * blend
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta)
      enemy.attackAnim = Math.max(0, enemy.attackAnim - delta * 3)
      const eliteGlow = enemy.elite ? 0.55 + Math.sin(this.elapsed * 5 + enemy.phase) * 0.25 : 0
      enemy.model.body.material.emissive.setHex(enemy.hitFlash > 0 ? 0x882233 : enemy.elite ? 0x7a5200 : 0x000000)
      enemy.model.body.material.emissiveIntensity = enemy.hitFlash > 0 ? 1.8 : eliteGlow
      const speed = before.distanceTo(enemy.model.group.position) / Math.max(delta, 0.001)
      const walk = Math.sin(this.elapsed * 7 + enemy.phase) * Math.min(1, speed / 2) * 0.6
      enemy.model.leftLeg.rotation.x = walk
      enemy.model.rightLeg.rotation.x = -walk
      const swing = enemy.attackAnim > 0 ? Math.sin(enemy.attackAnim * Math.PI) : 0
      enemy.model.leftArm.rotation.x = -1.2 - swing * 1.4 - walk * 0.3
      enemy.model.rightArm.rotation.x = -1.1 - swing * 1.6 + walk * 0.3
      const detailed = Math.hypot(this.player.x - enemy.body.position.x, this.player.z - enemy.body.position.z) < (this.graphicsQuality === 'low' ? 14 : 18)
      for (const detail of enemy.model.details) detail.visible = detailed
      if (enemy.kind === 'stalker') {
        const distance = enemy.body.position.distanceTo(this.player)
        const opacity = enemy.hitFlash > 0 ? 1 : THREE.MathUtils.clamp((14 - distance) / 7, 0.1, 1)
        for (const material of (enemy.model.group.userData.fadeMaterials as THREE.Material[] | undefined) ?? []) material.opacity = opacity
      }
    }
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
      inAcid: this.inAcid,
      enemiesRemaining: this.coopRole === 'client' ? this.coopRemaining : this.enemies.length + this.spawnQueue,
      coop: this.coop ? {
        status: this.coopStatus,
        bleedOut: this.bleedOut,
        revive: this.reviveProgress > 0 ? this.reviveProgress / REVIVE_SECONDS : 0,
        team: this.teammates.all.map((mate) => ({ name: mate.name, health: mate.health, status: mate.status })),
      } : undefined,
      powerUps: [...this.activePowerUps].map(([id, remaining]) => ({
        id,
        name: POWER_UPS[id].name,
        icon: POWER_UPS[id].icon,
        remaining,
        duration: POWER_UPS[id].duration,
        color: POWER_UPS[id].color,
      })),
      equipment: (['lethal', 'tactical', 'gadget'] as const).map((slot) => ({
        key: slot === 'lethal' ? 'G' : slot === 'tactical' ? 'Q' : 'T',
        name: EQUIPMENT[this.loadout[slot]].name,
        cooldown: this.cooldowns[slot],
      })),
      interaction: (() => {
        const downed = this.findRevivable()
        if (this.coopStatus !== 'alive') return null
        if (downed) return { label: `TIENI PREMUTO E // RIANIMA ${downed.name}${this.reviveProgress > 0 ? ` ${Math.round((this.reviveProgress / REVIVE_SECONDS) * 100)}%` : ''}`, cost: 0, canAfford: true, denied: false }
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
    animateWeather(this.mapContent.weather, delta)
    this.updatePlayer(delta)
    if (!this.isRunActive()) return
    if (this.coopRole === 'client') {
      this.updateReplicas(delta)
    } else {
      this.updateSpawning(delta)
      if (!this.isRunActive()) return
      this.updateEnemies(delta)
    }
    if (this.coop) this.updateCoop(delta)
    if (!this.isRunActive()) return
    if (!this.isRunActive()) return
    this.updateDoors(delta)
    this.updateStations(delta)
    this.updateEquipment(delta)
    if (this.state !== 'playing') return
    this.updateProjectiles(delta)
    this.updateHazards(delta)
    if (this.state !== 'playing') return
    this.updatePickups(delta)
    this.updateMedkits(delta)
    this.updatePowerUps(delta)
    this.updateGroans(delta)
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
    this.pathBudget = PATH_BUDGET_PER_FRAME
    if (this.state === 'playing' || (this.state === 'paused' && this.coop)) this.update(delta)
    else if (this.state === 'menu') this.updateMenu(time)
    this.shadowTimer -= frameDuration
    if (this.shadowTimer <= 0) {
      this.renderer.shadowMap.needsUpdate = true
      this.shadowTimer = SHADOW_REFRESH_SECONDS
    }
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
    const sensitivity = this.mouseSensitivity * (this.aiming ? getAimSensitivityScale(this.camera.fov, 75, this.adsSensitivity) : 1)
    this.yaw -= event.movementX * sensitivity
    this.pitch -= event.movementY * sensitivity
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

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toVec3(vector: THREE.Vector3): Vec3 {
  return [round2(vector.x), round2(vector.y), round2(vector.z)]
}

/** Bersaglio di uno zombie: un giocatore (null = locale) oppure una torretta. */
interface Victim {
  position: THREE.Vector3
  id: string | null
  turret?: { position: THREE.Vector3; damage: (amount: number) => void }
}

/** Distanza (pesata) entro cui una torretta attira gli zombie più del giocatore. */
const TURRET_AGGRO_RANGE = 9
/** Secondi di caricamento visibile prima dello sputo acido. */
const SPITTER_WINDUP = 0.6

export interface RunSummary {
  weapons: { name: string; attachments: string[]; level: number }[]
  melee: string
  equipment: string[]
  upgrades: { name: string; description: string; icon: string; count: number }[]
  stats: { damage: number; fireRate: number; crit: number; armor: number; regen: number; shield: number; reload: number }
  slots: number
}

/** Aggiornamento della mappa d'ombra: 10 volte al secondo bastano per giocatori e porte in movimento. */
const SHADOW_REFRESH_SECONDS = 0.1

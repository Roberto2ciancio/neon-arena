export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory'

export type EnemyKind = 'walker' | 'runner' | 'armored' | 'brute' | 'crawler' | 'spitter' | 'screamer'
export type HitZone = 'body' | 'head' | 'legs' | 'generator' | 'core' | 'spine' | 'throat'

export interface PlayerStats {
  maxHealth: number
  speed: number
  damage: number
  fireRate: number
  projectileCount: number
  pierce: number
  critChance: number
  critMultiplier: number
  magnetRadius: number
  armor: number
  regen: number
  incendiary: number
  headshotExplosion: number
  chainLightning: number
}

export interface MetaBonuses {
  vitality: number
  power: number
  mobility: number
}

export interface TctHudData {
  teamScore: number
  enemyScore: number
  team: 'alpha' | 'bravo'
  timeRemaining: number
  playerRespawn: number
  minimap: {
    playerX: number
    playerZ: number
    yaw: number
    arenaLimit: number
    obstacles: { x: number; z: number; width: number; depth: number }[]
    players: { x: number; z: number; ally: boolean; alive: boolean }[]
  }
  allies: { id: string; x: number; y: number; health: number; name: string }[]
}

export interface HudData {
  health: number
  maxHealth: number
  mapName: string
  score: number
  wave: number
  level: number
  xp: number
  xpNext: number
  shards: number
  kills: number
  ammo: number
  magazineSize: number
  reserveAmmo: number | null
  weaponName: string
  reloading: boolean
  aiming: boolean
  waveBreak: number
  enemiesRemaining: number
  /** Letale (G), tattico (Q) e gadget (T) con il tempo di ricarica residuo. */
  equipment: { key: string; name: string; cooldown: number }[]
  /** Arma bianca impugnata. */
  melee: boolean
  /** Mira con ottica ad alto ingrandimento: sovrimpressione del mirino. */
  scoped: boolean
  /** Porta o postazione d'acquisto a portata di mano (tasto E). */
  interaction: { label: string; cost: number; canAfford: boolean; denied: boolean } | null
  weaponSlots: { key: string; name: string; owned: boolean; active: boolean }[]
  stance: 'stand' | 'crouch' | 'slide'
  /** Bonus attivi con il tempo residuo. */
  powerUps: { id: string; name: string; icon: string; remaining: number; duration: number; color: number }[]
  tct?: TctHudData
  performance?: { fps: number; drawCalls: number }
}

export interface RunResult {
  score: number
  wave: number
  kills: number
  shards: number
  time: number
  won?: boolean
}

export interface LeaderboardEntry {
  score: number
  wave: number
  kills: number
  time: number
  won: boolean
}

export interface GameEvents {
  onStateChange: (state: GameState) => void
  onHud: (hud: HudData) => void
  onUpgrade: (choices: string[], pending: number) => void
  onRunEnd: (result: RunResult) => void
  onWave: (wave: number) => void
  onDamage: () => void
  onHit: (headshot: boolean) => void
  /** Accecamento da flashbang (0–1). */
  onFlash?: (intensity: number) => void
  /** Bonus raccolto: annuncio a schermo. */
  onPowerUp?: (name: string, description: string, color: number) => void
}

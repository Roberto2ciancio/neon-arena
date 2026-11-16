export type GameState = 'menu' | 'playing' | 'paused' | 'upgrade' | 'gameover' | 'victory'

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
  alphaScore: number
  enemyScore: number
  timeRemaining: number
  playerRespawn: number
  minimap: {
    playerX: number
    playerZ: number
    yaw: number
    arenaLimit: number
    obstacles: { x: number; z: number; width: number; depth: number }[]
    bots: { x: number; z: number; team: 'alpha' | 'enemy'; alive: boolean }[]
  }
  allies: { id: number; x: number; y: number; health: number; role: string }[]
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
  grenadeCooldown: number
  turretCooldown: number
  door: { cost: number; canAfford: boolean; denied: boolean } | null
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
  onUpgrade: (choices: string[]) => void
  onRunEnd: (result: RunResult) => void
  onWave: (wave: number) => void
  onDamage: () => void
  onHit: (headshot: boolean) => void
}

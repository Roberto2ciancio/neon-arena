export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory'

export type EnemyKind = 'walker' | 'runner' | 'armored' | 'brute' | 'crawler' | 'spitter' | 'screamer' | 'leaper' | 'bloater' | 'stalker' | 'shielder'
export type HitZone = 'body' | 'head' | 'legs' | 'generator' | 'core' | 'spine' | 'throat' | 'back' | 'belly'

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
  /** Moltiplicatore del tempo di ricarica (1 = normale). */
  reloadTime: number
  /** Integrità recuperata a ogni uccisione. */
  lifesteal: number
  /** Secondi di scatto bonus dopo un'uccisione (0 = assente). */
  adrenaline: number
  /** Moltiplicatore della ricarica degli equipaggiamenti e del danno esplosivo. */
  demolition: number
  /** Danno bonus contro nemici sotto il 30% della vita. */
  executioner: number
  /** Moltiplicatore della probabilità di bonus e kit medici. */
  luck: number
  /** Sopravvivere una volta a un colpo letale. */
  secondWind: number
  /** Danno assorbito dallo scudo energetico prima di ricaricarsi. */
  energyShield: number
  /** Modulo di mobilità equipaggiato ('' se nessuno): decide quali potenziamenti escono. */
  mobilityModule: string
  /** Cariche in più del modulo ("Doppia carica"). */
  mobilityCharges: number
  /** Secondi di ricarica del modulo tolti a ogni uccisione ("Ricarica cinetica"). */
  mobilityKillRecharge: number
  /** Atterraggi pesanti e schianti esplodono ferendo gli zombie vicini. */
  explosiveLanding: number
  /** Secondi di corsa sui muri senza limite dopo un'uccisione multipla. */
  wallRunFrenzy: number
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
  /** Modulo di mobilità (solo Zombie). */
  mobility?: { key: string; name: string; charges: number; maxCharges: number; progress: number; cooldown: number; fuel?: number; active: boolean; /** Si attiva con il tasto (scatto, schianto, rampino). */ usesKey: boolean }
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
  /** Il giocatore è in una pozza acida. */
  inAcid?: boolean
  /** Evento casuale dell'ondata in corso, con l'avanzamento (taglia, zombie dorato). */
  waveEvent?: { name: string; icon: string; color: number; detail: string }
  /** Combo di uccisioni in corso (da 2 in su), con il tempo rimasto 0–1. */
  combo?: { count: number; multiplier: number; timer: number }
  /** Uno zombie da giustiziare è a portata di corpo a corpo. */
  execution?: boolean
  /** Solo partite Zombie cooperative. */
  coop?: {
    status: 'alive' | 'down' | 'dead'
    /** Secondi rimasti prima di essere eliminati quando si è a terra. */
    bleedOut: number
    /** Avanzamento 0–1 della rianimazione di un compagno. */
    revive: number
    team: { name: string; health: number; status: 'alive' | 'down' | 'dead' }[]
  }
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
  /** Mappa giocata (per lo storico del profilo). */
  map?: string
  /** Id della mappa (filtri della classifica online). */
  mapId?: string
  /** Giocatori della partita: 1 = solitaria, 2–4 = co-op. */
  players?: number
  /** Uccisioni per arma (id del catalogo). */
  weaponKills?: Partial<Record<string, number>>
  /** Colpi a segno su testa o punti deboli. */
  precisionHits?: number
  /** Esperienza guadagnata da ogni arma durante la run (livello dell'arma). */
  weaponXp?: Partial<Record<string, number>>
  /** Combo di uccisioni più lunga della run. */
  bestCombo?: number
  /** Medaglie ottenute nella run (combo, serie di colpi alla testa, esplosivi, esecuzioni). */
  medals?: { name: string; tier: 'bronze' | 'silver' | 'gold'; value: number }[]
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
  /** Nuova ondata, con l'eventuale evento casuale. */
  onWave: (wave: number, event?: { name: string; description: string; icon: string; color: number } | null) => void
  onDamage: () => void
  onHit: (headshot: boolean) => void
  /** Accecamento da flashbang (0–1). */
  onFlash?: (intensity: number) => void
  /** Bonus raccolto: annuncio a schermo. */
  onPowerUp?: (name: string, description: string, color: number) => void
  /** Uccisione confermata: il mirino mostra un segno dedicato. */
  onKill?: (variant?: 'kill' | 'headshot' | 'execution') => void
  /** Annuncio di combo (DOPPIA, MASSACRO…) o di esecuzione. */
  onCombo?: (text: string, count: number) => void
  /** Numero di danno da mostrare (coordinate dello schermo 0–1). */
  onDamageNumber?: (x: number, y: number, amount: number, kind: 'body' | 'head' | 'kill') => void
  /** Avviso informativo (es. nuovo tipo di zombie). */
  onNotice?: (title: string, text: string, color: number) => void
}

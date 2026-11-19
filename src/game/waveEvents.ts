import type { EnemyKind } from './types'
import { FINAL_WAVE } from './zombies'

/**
 * Eventi casuali delle ondate Zombie: ogni run ne pesca alcuni in ordine diverso, così due
 * partite non si somigliano. Sono quasi tutti modificatori numerici (vita, velocità, crediti,
 * luci) e non aggiungono mesh né luci: nessun costo di rendering e nessuna ricompilazione
 * degli shader quando partono.
 */
export type WaveEventId =
  | 'blackout'
  | 'frenzy'
  | 'swarm'
  | 'giants'
  | 'gold-rush'
  | 'golden-zombie'
  | 'supply-drop'
  | 'elite-night'
  | 'headhunter'
  | 'bounty'
  | 'no-regen'
  | 'chain-reaction'

export interface WaveEventModifiers {
  /** Moltiplicatore del numero di zombie dell'ondata. */
  spawnCount: number
  health: number
  speed: number
  damage: number
  /** Scala del modello (solo aspetto, la hitbox segue la scala del gruppo). */
  scale: number
  /** Probabilità d'élite aggiunta. */
  eliteBonus: number
  /** Moltiplicatore dei crediti ⬢ per uccisione. */
  credits: number
  score: number
  /** Moltiplicatore del danno sui punti deboli e sul resto del corpo. */
  precisionDamage: number
  bodyDamage: number
  /** Intensità delle luci della mappa e densità della nebbia. */
  lightScale: number
  fogScale: number
  /** Rigenerazione naturale della vita. */
  passiveRegen: boolean
  /** Solo questi tipi possono comparire (intersecati con quelli dell'ondata). */
  kinds?: readonly EnemyKind[]
}

export interface WaveEventDefinition {
  id: WaveEventId
  name: string
  description: string
  icon: string
  color: number
  /** Prima ondata in cui può capitare. */
  minWave: number
  modifiers: Partial<WaveEventModifiers>
}

export const NEUTRAL_MODIFIERS: Readonly<WaveEventModifiers> = Object.freeze({
  spawnCount: 1,
  health: 1,
  speed: 1,
  damage: 1,
  scale: 1,
  eliteBonus: 0,
  credits: 1,
  score: 1,
  precisionDamage: 1,
  bodyDamage: 1,
  lightScale: 1,
  fogScale: 1,
  passiveRegen: true,
})

export const WAVE_EVENTS: Record<WaveEventId, WaveEventDefinition> = {
  blackout: {
    id: 'blackout', name: 'BLACKOUT', icon: '◐', color: 0x8fa0ff, minWave: 3,
    description: 'Le luci saltano e sale la nebbia. Crediti ×1,5.',
    modifiers: { lightScale: 0.3, fogScale: 1.9, speed: 1.08, credits: 1.5 },
  },
  frenzy: {
    id: 'frenzy', name: 'FRENESIA', icon: '»', color: 0xff6b6b, minWave: 3,
    description: 'Zombie più veloci (+30%) ma più fragili (−20% vita).',
    modifiers: { speed: 1.3, health: 0.8, score: 1.2 },
  },
  swarm: {
    id: 'swarm', name: 'SCIAME', icon: '⁂', color: 0xb6ff6b, minWave: 3,
    description: 'Tanti zombie deboli: +60% di nemici, −45% vita, solo corridori e striscianti.',
    modifiers: { spawnCount: 1.6, health: 0.55, credits: 0.8, kinds: ['walker', 'runner', 'crawler'] },
  },
  giants: {
    id: 'giants', name: 'GIGANTI', icon: '▲', color: 0xff9a4a, minWave: 6,
    description: 'Meno zombie, ma enormi: vita ×2, danno +30%. Crediti ×2.',
    modifiers: { spawnCount: 0.6, health: 2, damage: 1.3, scale: 1.3, speed: 0.92, credits: 2, score: 1.5 },
  },
  'gold-rush': {
    id: 'gold-rush', name: 'FEBBRE DELL’ORO', icon: '⬢', color: 0xffd166, minWave: 3,
    description: 'Crediti ×2 e punti ×1,5 per tutta l’ondata.',
    modifiers: { credits: 2, score: 1.5 },
  },
  'golden-zombie': {
    id: 'golden-zombie', name: 'ZOMBIE DORATO', icon: '★', color: 0xffc94a, minWave: 3,
    description: 'Uno zombie d’oro gira per la mappa: abbattilo prima che scappi per un grosso bottino.',
    modifiers: {},
  },
  'supply-drop': {
    id: 'supply-drop', name: 'LANCIO DI RIFORNIMENTI', icon: '▼', color: 0x58f5e5, minWave: 3,
    description: 'Tre bonus sono caduti sulla mappa: cerca le colonne di luce.',
    modifiers: {},
  },
  'elite-night': {
    id: 'elite-night', name: 'NOTTE DELLE ÉLITE', icon: '♛', color: 0xe0a640, minWave: 5,
    description: 'Molte più élite (+35%). Crediti ×1,5.',
    modifiers: { eliteBonus: 0.35, credits: 1.5, score: 1.3 },
  },
  headhunter: {
    id: 'headhunter', name: 'CACCIATORE DI TESTE', icon: '◎', color: 0x58f5e5, minWave: 3,
    description: 'Punti deboli ×1,5, il resto del corpo ×0,7. Mira alla testa.',
    modifiers: { precisionDamage: 1.5, bodyDamage: 0.7 },
  },
  bounty: {
    id: 'bounty', name: 'TAGLIA', icon: '⌖', color: 0xff4f87, minWave: 3,
    description: 'Elimina abbastanza zombie prima che scada il tempo per una ricompensa.',
    modifiers: {},
  },
  'no-regen': {
    id: 'no-regen', name: 'SENZA RESPIRO', icon: '♥', color: 0xff4f6e, minWave: 4,
    description: 'Niente rigenerazione naturale della vita. Crediti ×1,75.',
    modifiers: { passiveRegen: false, credits: 1.75 },
  },
  'chain-reaction': {
    id: 'chain-reaction', name: 'REAZIONE A CATENA', icon: '✺', color: 0xff8a3d, minWave: 4,
    description: 'Gli zombie esplodono quando muoiono e feriscono quelli vicini.',
    modifiers: {},
  },
}

export const WAVE_EVENT_IDS = Object.keys(WAVE_EVENTS) as WaveEventId[]

export function getWaveEventModifiers(id: WaveEventId | null): WaveEventModifiers {
  if (!id) return { ...NEUTRAL_MODIFIERS }
  return { ...NEUTRAL_MODIFIERS, ...WAVE_EVENTS[id].modifiers }
}

export function isWaveEventId(value: unknown): value is WaveEventId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WAVE_EVENTS, value)
}

/** Probabilità di evento quando l'ondata precedente era normale. */
export const WAVE_EVENT_CHANCE = 0.55
/** Dopo un evento il successivo è meno probabile, per lasciare respiro. */
export const WAVE_EVENT_CHANCE_AFTER_EVENT = 0.25
/** Al massimo due ondate normali di fila (dalla terza ondata in poi). */
export const WAVE_EVENT_MAX_GAP = 3

/**
 * Sceglie l'evento dell'ondata. Mai nelle prime due ondate, nelle ondate del boss e
 * nell'ultima; nessun evento si ripete nella stessa run finché non sono usciti tutti quelli
 * disponibili.
 */
export function rollWaveEvent(wave: number, used: readonly WaveEventId[], lastEventWave: number, random: () => number = Math.random): WaveEventId | null {
  if (wave < 3 || wave % 5 === 0 || wave >= FINAL_WAVE) return null
  const gap = wave - Math.max(2, lastEventWave)
  const chance = gap >= WAVE_EVENT_MAX_GAP ? 1 : lastEventWave === wave - 1 ? WAVE_EVENT_CHANCE_AFTER_EVENT : WAVE_EVENT_CHANCE
  if (random() >= chance) return null
  const eligible = WAVE_EVENT_IDS.filter((id) => WAVE_EVENTS[id].minWave <= wave)
  let candidates = eligible.filter((id) => !used.includes(id))
  if (candidates.length === 0) candidates = eligible.filter((id) => id !== used[used.length - 1])
  return candidates[Math.floor(random() * candidates.length)] ?? null
}

/** Tipi ammessi dall'evento fra quelli dell'ondata; se nessuno coincide resta il gruppo dell'ondata. */
export function filterSpawnPool(pool: readonly EnemyKind[], kinds: readonly EnemyKind[] | undefined): readonly EnemyKind[] {
  if (!kinds) return pool
  const filtered = pool.filter((kind) => kinds.includes(kind))
  return filtered.length > 0 ? filtered : pool
}

// --- Zombie dorato ---
export const GOLDEN_LIFETIME = 40
export const GOLDEN_SPAWN_DELAY = 3
export const GOLDEN_HEALTH_MULTIPLIER = 6
export const GOLDEN_SPEED_MULTIPLIER = 1.35
export const GOLDEN_CREDITS = 150
export const GOLDEN_POWER_UPS = 2
/** In squadra ogni compagno di chi abbatte lo zombie dorato riceve questa quota. */
export const GOLDEN_TEAM_CREDITS = 75

// --- Taglia ---
export const BOUNTY_TIME = 45
export const BOUNTY_CREDITS = 120

/**
 * Eliminazioni richieste dalla taglia: cresce con l'ondata ma resta raggiungibile. In squadra
 * il contatore è unico e l'obiettivo sale come il numero di zombie (+50% per giocatore in più).
 */
export function getBountyTarget(wave: number, players = 1): number {
  return Math.round((10 + wave * 1.2) * (1 + 0.5 * (Math.max(1, players) - 1)))
}

// --- Rifornimenti ---
export const SUPPLY_DROP_COUNT = 3

// --- Reazione a catena ---
export const CHAIN_BLAST_RADIUS = 3.2
/** Pausa minima fra due esplosioni: limita effetti e calcoli con molte uccisioni insieme. */
export const CHAIN_BLAST_COOLDOWN = 0.3

export function getChainBlastDamage(wave: number): number {
  return 40 + wave * 12
}

/** Moltiplicatore del danno in base alla zona colpita (Cacciatore di teste). */
export function getZoneDamageMultiplier(modifiers: WaveEventModifiers, precision: boolean): number {
  return precision ? modifiers.precisionDamage : modifiers.bodyDamage
}

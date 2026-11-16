import type { EnemyKind } from './types'

export type PowerUpId = 'full-ammo' | 'insta-kill' | 'double-loot' | 'shockwave' | 'barrier' | 'rapid-fire'

export interface PowerUpDefinition {
  id: PowerUpId
  name: string
  description: string
  /** Durata dell'effetto in secondi (0 = istantaneo). */
  duration: number
  color: number
  icon: string
  /** Peso relativo nell'estrazione. */
  weight: number
}

export const POWER_UPS: Record<PowerUpId, PowerUpDefinition> = {
  'full-ammo': { id: 'full-ammo', name: 'RIFORNIMENTO TOTALE', description: 'Caricatori e riserve pieni, equipaggiamenti pronti.', duration: 0, color: 0x58f5e5, icon: '▤', weight: 30 },
  'insta-kill': { id: 'insta-kill', name: 'COLPO LETALE', description: 'Ogni colpo elimina lo zombie colpito.', duration: 12, color: 0xff4f6e, icon: '☠', weight: 18 },
  'double-loot': { id: 'double-loot', name: 'BOTTINO DOPPIO', description: 'Punti e frammenti raddoppiati.', duration: 20, color: 0xffd166, icon: '◆', weight: 20 },
  shockwave: { id: 'shockwave', name: 'ONDA D’URTO', description: 'Elimina gli zombie vicini (non i boss).', duration: 0, color: 0xff9a4a, icon: '✺', weight: 8 },
  barrier: { id: 'barrier', name: 'BARRIERA', description: 'Nessun danno subito per qualche secondo.', duration: 8, color: 0x9a7bff, icon: '⬡', weight: 12 },
  'rapid-fire': { id: 'rapid-fire', name: 'FUOCO RAPIDO', description: 'Cadenza di tiro +60%.', duration: 12, color: 0x72ff8b, icon: '≫', weight: 12 },
}

export const POWER_UP_ORDER = Object.keys(POWER_UPS) as PowerUpId[]
export const POWER_UP_DROP_CHANCE = 0.035
export const POWER_UP_LIFETIME = 22
export const SHOCKWAVE_RADIUS = 24
export const INSTA_KILL_BOSS_MULTIPLIER = 4

/**
 * Estrae il bonus lasciato da uno zombie ucciso, o null. Il Bruto ne lascia sempre uno;
 * `active` esclude i bonus già a terra o in corso per evitare doppioni.
 */
export function rollPowerUp(kind: EnemyKind, random: () => number, active: ReadonlySet<PowerUpId> = new Set()): PowerUpId | null {
  const guaranteed = kind === 'brute'
  if (!guaranteed && random() >= POWER_UP_DROP_CHANCE) return null
  const pool = POWER_UP_ORDER.filter((id) => !active.has(id))
  if (pool.length === 0) return null
  const total = pool.reduce((sum, id) => sum + POWER_UPS[id].weight, 0)
  let roll = Math.min(0.999999, Math.max(0, random())) * total
  for (const id of pool) {
    roll -= POWER_UPS[id].weight
    if (roll < 0) return id
  }
  return pool.at(-1) ?? null
}

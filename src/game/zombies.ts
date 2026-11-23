import type { EnemyKind } from './types'

export interface ZombieStats {
  name: string
  health: number
  speed: number
  damage: number
  radius: number
  score: number
  xp: number
  attackInterval: number
}

export const FINAL_WAVE = 15
export const WAVE_BREAK_SECONDS = 8
export const SPEED_SCALE_CAP = 1.4
/** Crescita della vita per ondata (esponenziale). */
export const HEALTH_GROWTH = 1.16
export const ELITE_FIRST_WAVE = 5

const BASE_STATS: Record<EnemyKind, ZombieStats> = {
  walker: { name: 'Errante', health: 58, speed: 1.85, damage: 12, radius: 0.52, score: 100, xp: 24, attackInterval: 0.9 },
  runner: { name: 'Corridore', health: 34, speed: 4.2, damage: 9, radius: 0.46, score: 170, xp: 32, attackInterval: 0.65 },
  armored: { name: 'Corazzato', health: 165, speed: 1.3, damage: 22, radius: 0.78, score: 280, xp: 52, attackInterval: 1.15 },
  brute: { name: 'Bruto', health: 650, speed: 1.6, damage: 30, radius: 1.05, score: 1600, xp: 190, attackInterval: 1.2 },
  crawler: { name: 'Strisciante', health: 42, speed: 2.35, damage: 14, radius: 0.5, score: 190, xp: 38, attackInterval: 0.8 },
  spitter: { name: 'Sputatore', health: 72, speed: 1.7, damage: 9, radius: 0.54, score: 240, xp: 48, attackInterval: 1.4 },
  screamer: { name: 'Urlatore', health: 88, speed: 1.55, damage: 8, radius: 0.55, score: 300, xp: 60, attackInterval: 1.5 },
  leaper: { name: 'Saltatore', health: 60, speed: 2.6, damage: 15, radius: 0.5, score: 280, xp: 56, attackInterval: 0.8 },
  bloater: { name: 'Gonfio', health: 140, speed: 1.25, damage: 10, radius: 0.75, score: 260, xp: 50, attackInterval: 1.3 },
  stalker: { name: 'Ombra', health: 70, speed: 3.2, damage: 16, radius: 0.48, score: 320, xp: 64, attackInterval: 0.7 },
  shielder: { name: 'Scudiero', health: 150, speed: 1.5, damage: 18, radius: 0.7, score: 340, xp: 66, attackInterval: 1.1 },
  tyrant: { name: 'Tiranno', health: 1050, speed: 1.35, damage: 34, radius: 1.15, score: 2600, xp: 300, attackInterval: 1.35 },
}

/** Boss: niente élite, niente smembramento, ricompense e scalatura dedicate. */
export function isBoss(kind: EnemyKind): boolean {
  return kind === 'brute' || kind === 'tyrant'
}

export function getWaveSpawnCount(wave: number): number {
  const normalizedWave = Math.max(1, wave)
  return 8 + Math.round(normalizedWave * 3.5) + Math.floor(normalizedWave / 3) * 2
}

/** Probabilità che uno zombie sia un'élite (più resistente, veloce e letale). */
export function getEliteChance(wave: number): number {
  return wave < ELITE_FIRST_WAVE ? 0 : Math.min(0.45, (wave - ELITE_FIRST_WAVE + 1) * 0.05)
}

export function getZombieStats(kind: EnemyKind, wave: number, elite = false): ZombieStats {
  const base = BASE_STATS[kind]
  const normalizedWave = Math.max(1, wave)
  // Vita esponenziale: dalla metà della run servono armi migliori e potenziate.
  const healthScale = HEALTH_GROWTH ** (normalizedWave - 1)
  const damageScale = 1 + (normalizedWave - 1) * 0.08
  const speedScale = Math.min(SPEED_SCALE_CAP, 1 + (normalizedWave - 1) * 0.028)
  const bossScale = isBoss(kind) ? 1 + (normalizedWave / 5 - 1) * 0.35 : 1
  const eliteScale = elite ? { health: 1.6, speed: 1.15, damage: 1.25, reward: 2 } : { health: 1, speed: 1, damage: 1, reward: 1 }

  return {
    ...base,
    health: base.health * healthScale * bossScale * eliteScale.health,
    speed: base.speed * speedScale * eliteScale.speed,
    damage: base.damage * damageScale * eliteScale.damage,
    score: base.score * eliteScale.reward,
    xp: base.xp * eliteScale.reward,
  }
}

export function getZombieColor(kind: EnemyKind): number {
  switch (kind) {
    case 'walker': return 0x7d9b73
    case 'runner': return 0xb96b5c
    case 'armored': return 0xc28b48
    case 'brute': return 0x9e384c
    case 'crawler': return 0x81905b
    case 'spitter': return 0x72bd68
    case 'screamer': return 0xa06db4
    case 'leaper': return 0x6f8f9e
    case 'bloater': return 0x9ea84a
    case 'stalker': return 0x3b3f4a
    case 'shielder': return 0x8a7a64
    case 'tyrant': return 0x5d7a3a
  }
}

/** Ondata in cui ogni tipo di zombie entra in gioco (il Bruto è il boss delle ondate multiple di 5). */
export const ENEMY_FIRST_WAVE: Record<Exclude<EnemyKind, 'brute' | 'tyrant'>, number> = {
  walker: 1,
  runner: 2,
  armored: 3,
  crawler: 3,
  leaper: 4,
  spitter: 4,
  bloater: 5,
  screamer: 6,
  stalker: 7,
  shielder: 9,
}

/** Composizione pesata dell'ondata: i tipi nuovi si aggiungono e quelli vecchi pesano sempre meno. */
export function getSpawnPool(wave: number): EnemyKind[] {
  const pool: EnemyKind[] = []
  for (const [kind, first] of Object.entries(ENEMY_FIRST_WAVE) as [Exclude<EnemyKind, 'brute' | 'tyrant'>, number][]) {
    if (wave < first) continue
    const weight = kind === 'walker' ? Math.max(1, 4 - Math.floor(wave / 4)) : wave - first < 2 ? 1 : 2
    for (let index = 0; index < weight; index += 1) pool.push(kind)
  }
  return pool
}

export const MELEE_ONE_SHOT_LAST_WAVE = 4
/** Quota massima della vita che un singolo colpo corpo a corpo può togliere dopo le prime ondate. */
export const MELEE_MAX_HEALTH_SHARE = 0.6

/** Danno corpo a corpo: fino all'ondata 4 può uccidere in un colpo, poi ne servono almeno due. */
export function getMeleeDamage(damage: number, wave: number, targetMaxHealth: number): number {
  if (wave <= MELEE_ONE_SHOT_LAST_WAVE) return damage
  return Math.min(damage, targetMaxHealth * MELEE_MAX_HEALTH_SHARE)
}

/** Esplosione del Gonfio: raggio e danni a giocatore e zombie vicini. */
export const BLOATER_BLAST = { radius: 3.4, playerDamage: 30, zombieDamage: 70 } as const
/** Lo scudo dello Scudiero blocca questa quota del danno frontale. */
export const SHIELD_FRONT_REDUCTION = 0.85

/**
 * Zombie vivi contemporaneamente: il resto dell'ondata aspetta in coda. Il totale dell'ondata
 * non cambia, ma il carico per frame (rendering, IA, collisioni) resta limitato.
 */
export const MAX_ACTIVE_ZOMBIES = { low: 18, medium: 24, high: 30 } as const

export function getMaxActiveZombies(quality: keyof typeof MAX_ACTIVE_ZOMBIES): number {
  return MAX_ACTIVE_ZOMBIES[quality]
}

/** Ricalcoli di percorso concessi per frame: gli altri zombie aspettano il frame successivo. */
export const PATH_BUDGET_PER_FRAME = 6

/** Modelli preparati a inizio partita per ogni tipo, così le prime apparizioni non bloccano il frame. */
export function getPrewarmCount(kind: EnemyKind): number {
  return isBoss(kind) ? 1 : 2
}

/** Avviso mostrato la prima volta che un tipo di zombie compare in una run: come affrontarlo. */
export const ENEMY_INTEL: Record<EnemyKind, string> = {
  walker: 'Lento ma numeroso: mira alla testa.',
  runner: 'Velocissimo e fragile: non farti accerchiare.',
  armored: 'Corazza frontale: distruggi il generatore luminoso.',
  brute: 'Carica in linea retta: schivala e colpisci il nucleo esposto.',
  crawler: 'Basso e scattante: mira alla spina dorsale.',
  spitter: 'Sputa acido da lontano: colpisci la gola.',
  screamer: 'Potenzia gli zombie vicini: abbattilo per primo, punta alla gola.',
  leaper: 'Balza da lontano: spara alla spina dorsale luminosa prima che atterri.',
  bloater: 'Esplode in acido: abbattilo a distanza, ferisce anche gli altri zombie.',
  stalker: 'Quasi invisibile da lontano: ascolta i passi e tieniti le spalle coperte.',
  shielder: 'Lo scudo blocca i colpi frontali: aggiralo e colpisci il generatore sulla schiena.',
  tyrant: 'Lancia macigni acidi e richiama Striscianti: spostati di lato e colpisci la sacca sulla spalla dopo ogni lancio.',
}

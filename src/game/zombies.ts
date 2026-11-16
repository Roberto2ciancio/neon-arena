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
  const bossScale = kind === 'brute' ? 1 + (normalizedWave / 5 - 1) * 0.35 : 1
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
  }
}

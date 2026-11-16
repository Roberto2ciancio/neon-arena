export const BURN_DURATION = 3
export const HEADSHOT_EXPLOSION_RADIUS = 2.8
export const CHAIN_LIGHTNING_RADIUS = 5.5

export function getBurnDamagePerSecond(level: number, baseDamage: number): number {
  return level > 0 ? baseDamage * 0.2 * level : 0
}

export function getHeadshotExplosionDamage(level: number, baseDamage: number): number {
  return level > 0 ? baseDamage * (1 + level) : 0
}

export function getChainLightningDamage(level: number, baseDamage: number): number {
  return level > 0 ? baseDamage * (0.4 + level * 0.2) : 0
}

export function getChainTargetCount(level: number): number {
  return level > 0 ? level + 1 : 0
}

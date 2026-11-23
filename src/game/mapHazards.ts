/**
 * Mappe che cambiano durante la run (piano gameplay G2): una nube tossica che avanza lenta
 * verso i giocatori e porte che si bloccano per un'ondata. Regole pure.
 */
export const TOXIC_CLOUD = {
  waves: [6, 9, 12] as readonly number[],
  radius: 6.5,
  speed: 1.1,
  /** Quota della vita massima persa ogni secondo dentro la nube. */
  damageShare: 0.06,
} as const

export function hasToxicCloud(wave: number): boolean {
  return TOXIC_CLOUD.waves.includes(wave)
}

/** Avanza la nube verso il bersaglio senza mai superarlo. */
export function stepToxicCloud(x: number, z: number, targetX: number, targetZ: number, delta: number): { x: number; z: number } {
  const dx = targetX - x
  const dz = targetZ - z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.001) return { x, z }
  const step = Math.min(distance, TOXIC_CLOUD.speed * delta)
  return { x: x + (dx / distance) * step, z: z + (dz / distance) * step }
}

export function isInsideToxicCloud(x: number, z: number, cloudX: number, cloudZ: number): boolean {
  return Math.hypot(x - cloudX, z - cloudZ) <= TOXIC_CLOUD.radius
}

/** Porte bloccate: dall'ottava ondata, mai nelle ondate dei boss né nell'ultima. */
export const DOOR_LOCK = { firstWave: 8, chance: 0.4, safeDistance: 4 } as const

export function shouldLockDoor(wave: number, finalWave: number, random: () => number = Math.random): boolean {
  return wave >= DOOR_LOCK.firstWave && wave % 5 !== 0 && wave < finalWave && random() < DOOR_LOCK.chance
}

/** Cassa maledetta: dalla quarta ondata, una volta ogni tanto. */
export const CURSED_BOX = { firstWave: 4, chance: 0.25, eliteHealth: 2.5 } as const

export function isBoxCursed(wave: number, random: () => number = Math.random): boolean {
  return wave >= CURSED_BOX.firstWave && random() < CURSED_BOX.chance
}

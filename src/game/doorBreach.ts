/**
 * Porte sfondate (Fase 13): se il giocatore si chiude in una zona raggiungibile solo da una
 * porta ancora chiusa (ci è entrato con un modulo di mobilità o da un'altra apertura), gli
 * zombie vanno alla porta e la abbattono. Regole pure; il comportamento sta in `Game.ts`.
 */
export const DOOR_BREACH_RANGE = 1.9

/** Resistenza di una porta chiusa: cresce con l'ondata. */
export function getDoorHealth(wave: number): number {
  return Math.round(260 * (1 + Math.max(0, wave - 1) * 0.12))
}

/** Danno di un colpo alla porta: i boss la sfondano molto più in fretta. */
export function getDoorHitDamage(enemyDamage: number, boss: boolean): number {
  return enemyDamage * (boss ? 4 : 1)
}

export interface DoorBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Distanza orizzontale da un punto al rettangolo della porta (0 se dentro). */
export function distanceToDoor(x: number, z: number, door: DoorBox): number {
  const dx = Math.max(door.minX - x, 0, x - door.maxX)
  const dz = Math.max(door.minZ - z, 0, z - door.maxZ)
  return Math.hypot(dx, dz)
}

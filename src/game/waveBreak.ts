/**
 * Pausa fra le ondate con un obiettivo (piano gameplay G1): una cassa di rifornimenti cade in
 * una zona con pozze acide; raggiungerla prima che riparta l'ondata dà una ricompensa piccola
 * ma concreta. In co-op ogni giocatore ha la sua cassa (nessun messaggio di rete in più).
 */
export type SupplyReward = 'credits' | 'ammo' | 'heal'

export const SUPPLY_CRATE = {
  /** Secondi aggiunti alla pausa quando c'è una cassa da raggiungere. */
  extraBreak: 6,
  minDistance: 10,
  maxDistance: 20,
  pickupRange: 1.6,
  /** Pozze acide attorno alla cassa. */
  hazards: 2,
  hazardDistance: 2.6,
  healShare: 0.4,
} as const

export const SUPPLY_LABELS: Record<SupplyReward, string> = {
  credits: 'CREDITI',
  ammo: 'MUNIZIONI',
  heal: 'KIT MEDICO',
}

/** Cura se si è feriti, munizioni se il caricatore di riserva è basso, altrimenti crediti. */
export function chooseSupplyReward(healthShare: number, reserveShare: number, random: () => number = Math.random): SupplyReward {
  if (healthShare < 0.5) return 'heal'
  if (reserveShare < 0.35) return 'ammo'
  return random() < 0.7 ? 'credits' : random() < 0.5 ? 'ammo' : 'heal'
}

export function getSupplyCredits(wave: number): number {
  return 20 + Math.max(1, wave) * 3
}

/** Niente cassa nell'ultima ondata (parte l'evacuazione) e prima della terza (si impara a giocare). */
export function shouldDropSupplyCrate(wave: number, finalWave: number): boolean {
  return wave >= 2 && wave < finalWave
}

export type LethalId = 'frag' | 'semtex' | 'molotov' | 'claymore'
export type TacticalId = 'flashbang' | 'smoke' | 'stun' | 'decoy'
export type GadgetId = 'turret' | 'shield' | 'ammo-crate' | 'radar'
export type EquipmentId = LethalId | TacticalId | GadgetId
export type EquipmentSlot = 'lethal' | 'tactical' | 'gadget'

export interface EquipmentDefinition {
  id: EquipmentId
  slot: EquipmentSlot
  name: string
  description: string
  /** Ricarica in secondi. */
  cooldown: number
  /** Lanciato (granate) oppure posizionato davanti al giocatore. */
  thrown: boolean
  unlockLevel: number
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDefinition> = {
  frag: { id: 'frag', slot: 'lethal', name: 'GRANATA', description: 'Rimbalza ed esplode dopo una breve miccia.', cooldown: 7, thrown: true, unlockLevel: 1 },
  semtex: { id: 'semtex', slot: 'lethal', name: 'SEMTEX', description: 'Si attacca a superfici e nemici, esplode in fretta.', cooldown: 8, thrown: true, unlockLevel: 5 },
  molotov: { id: 'molotov', slot: 'lethal', name: 'MOLOTOV', description: 'Crea un’area di fuoco che brucia chi la attraversa.', cooldown: 10, thrown: true, unlockLevel: 13 },
  claymore: { id: 'claymore', slot: 'lethal', name: 'CLAYMORE', description: 'Mina direzionale: esplode quando un nemico passa davanti.', cooldown: 12, thrown: false, unlockLevel: 9 },
  flashbang: { id: 'flashbang', slot: 'tactical', name: 'FLASHBANG', description: 'Acceca chi guarda l’esplosione, stordisce gli zombie.', cooldown: 9, thrown: true, unlockLevel: 1 },
  smoke: { id: 'smoke', slot: 'tactical', name: 'FUMOGENO', description: 'Nube densa che blocca la vista per alcuni secondi.', cooldown: 12, thrown: true, unlockLevel: 3 },
  stun: { id: 'stun', slot: 'tactical', name: 'STORDENTE', description: 'Rallenta e confonde chi si trova nell’area.', cooldown: 10, thrown: true, unlockLevel: 7 },
  decoy: { id: 'decoy', slot: 'tactical', name: 'ESCA', description: 'Attira gli zombie e simula spari sulla minimappa nemica.', cooldown: 14, thrown: true, unlockLevel: 11 },
  turret: { id: 'turret', slot: 'gadget', name: 'TORRETTA', description: 'Torretta automatica che colpisce i nemici vicini.', cooldown: 18, thrown: false, unlockLevel: 1 },
  shield: { id: 'shield', slot: 'gadget', name: 'SCUDO', description: 'Barriera dispiegabile che ferma i colpi.', cooldown: 22, thrown: false, unlockLevel: 6 },
  'ammo-crate': { id: 'ammo-crate', slot: 'gadget', name: 'CASSA MUNIZIONI', description: 'Rifornisce munizioni ed equipaggiamenti di chi è vicino.', cooldown: 30, thrown: false, unlockLevel: 10 },
  radar: { id: 'radar', slot: 'gadget', name: 'DRONE RADAR', description: 'Rivela i nemici sulla minimappa e attraverso i muri.', cooldown: 25, thrown: false, unlockLevel: 15 },
}

export const LETHAL_ORDER: readonly LethalId[] = ['frag', 'semtex', 'molotov', 'claymore']
export const TACTICAL_ORDER: readonly TacticalId[] = ['flashbang', 'smoke', 'stun', 'decoy']
export const GADGET_ORDER: readonly GadgetId[] = ['turret', 'shield', 'ammo-crate', 'radar']

export const EQUIPMENT_STATS = {
  fragRadius: 4.8,
  fragFuse: 1.6,
  semtexRadius: 4.2,
  semtexFuse: 1.2,
  molotovRadius: 2.8,
  molotovDuration: 5,
  molotovDps: 30,
  claymoreTrigger: 3.2,
  /** Metà ampiezza del cono frontale (coseno). */
  claymoreCone: 0.45,
  claymoreRadius: 4,
  claymoreDamage: 170,
  flashRadius: 13,
  flashDuration: 3.5,
  smokeRadius: 4.5,
  smokeDuration: 9,
  stunRadius: 5,
  stunDuration: 3.5,
  decoyDuration: 8,
  shieldDuration: 20,
  shieldWidth: 2.4,
  shieldHeight: 1.5,
  crateDuration: 20,
  crateRadius: 2.6,
  radarDuration: 10,
  turretLife: 16,
} as const

/**
 * Accecamento del flashbang (0–1). Nullo se c'è un ostacolo in mezzo, se si è fuori raggio
 * o se l'esplosione è alle spalle; massimo da vicino guardandola.
 * `facingDot` è il coseno fra la direzione dello sguardo e la direzione verso l'esplosione.
 */
export function getFlashIntensity(distance: number, facingDot: number, occluded: boolean): number {
  if (occluded || distance >= EQUIPMENT_STATS.flashRadius) return 0
  const proximity = 1 - distance / EQUIPMENT_STATS.flashRadius
  const facing = Math.min(1, Math.max(0, (facingDot + 0.15) / 1.15))
  // Molto vicino si resta abbagliati anche guardando di lato.
  const closeRange = distance < 2.5 ? 0.35 * (1 - distance / 2.5) : 0
  return Math.min(1, Math.max(closeRange * (facingDot > -0.5 ? 1 : 0), proximity ** 0.7 * facing))
}

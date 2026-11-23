/**
 * Sinergie (piano gameplay G2): due potenziamenti presi nella stessa run sbloccano un effetto
 * in più, annunciato quando lo si scopre. Regole pure; gli effetti stanno in `Game.ts`.
 */
export type SynergyId = 'wildfire' | 'blood-oath' | 'kinetic-shield'

export interface SynergyDefinition {
  id: SynergyId
  name: string
  description: string
  /** Id dei potenziamenti necessari (tutti). */
  requires: readonly string[]
  color: number
}

export const SYNERGIES: Record<SynergyId, SynergyDefinition> = {
  wildfire: { id: 'wildfire', name: 'INCENDIO', description: 'Le esplosioni lasciano gli zombie in fiamme.', requires: ['incendiary', 'demolition'], color: 0xff7b38 },
  'blood-oath': { id: 'blood-oath', name: 'PATTO DI SANGUE', description: 'Le esecuzioni curano il 25% dell’integrità invece del 10%.', requires: ['lifesteal', 'executioner'], color: 0xff4f6e },
  'kinetic-shield': { id: 'kinetic-shield', name: 'SCUDO CINETICO', description: 'Ogni uccisione ricarica subito lo scudo energetico.', requires: ['energy-shield', 'adrenaline'], color: 0x6ad8ff },
}

export const SYNERGY_IDS = Object.keys(SYNERGIES) as SynergyId[]
export const BLOOD_OATH_HEAL_SHARE = 0.25

export function getActiveSynergies(chosen: Iterable<string>): SynergyId[] {
  const set = new Set(chosen)
  return SYNERGY_IDS.filter((id) => SYNERGIES[id].requires.every((upgrade) => set.has(upgrade)))
}

/** Sinergie che diventano attive con il potenziamento appena scelto. */
export function getNewSynergies(before: Iterable<string>, upgrade: string): SynergyId[] {
  // Un iteratore (es. le chiavi di una Map) si può leggere una volta sola: si copia subito.
  const chosen = [...before]
  const previous = getActiveSynergies(chosen)
  return getActiveSynergies([...chosen, upgrade]).filter((id) => !previous.includes(id))
}

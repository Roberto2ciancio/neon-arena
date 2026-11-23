/**
 * Moduli di mobilità (Fase C): uno per classe, solo nella modalità Zombie. Regole pure di
 * catalogo, sblocco, cariche e ricarica; la fisica sta in `PlayerController`.
 */
export type MobilityId = 'double-jump' | 'dash' | 'wall-run' | 'slam' | 'grapple' | 'jetpack'

export interface MobilityDefinition {
  id: MobilityId
  name: string
  description: string
  icon: string
  unlockLevel: number
  /** Cariche di base (doppio salto: salti in aria; propulsore: 1 serbatoio). */
  charges: number
  /** Secondi per ricaricare una carica (0 = si ricarica toccando terra). */
  cooldown: number
  /** Come si attiva: in aria con il salto, con il tasto del modulo o da solo. */
  trigger: 'air-jump' | 'key' | 'passive'
}

export const MOBILITY_KEY = 'KeyB'
export const MOBILITY_KEY_LABEL = 'B'

export const MOBILITY: Record<MobilityId, MobilityDefinition> = {
  'double-jump': { id: 'double-jump', name: 'DOPPIO SALTO', description: 'Un secondo salto in aria. Si ricarica toccando terra.', icon: '⇈', unlockLevel: 1, charges: 1, cooldown: 0, trigger: 'air-jump' },
  dash: { id: 'dash', name: 'SCATTO', description: 'Spinta rapida nella direzione di movimento, 2 cariche. Breve invulnerabilità.', icon: '»', unlockLevel: 6, charges: 2, cooldown: 3.5, trigger: 'key' },
  'wall-run': { id: 'wall-run', name: 'CORSA SUI MURI', description: 'Saltando accanto a un muro ci si corre sopra fino a 1,5 s; salto per staccarsi.', icon: '⫽', unlockLevel: 12, charges: 1, cooldown: 0, trigger: 'passive' },
  slam: { id: 'slam', name: 'SCHIANTO', description: 'In aria: picchiata che scaglia via e ferisce gli zombie vicini.', icon: '⤓', unlockLevel: 18, charges: 1, cooldown: 7, trigger: 'key' },
  grapple: { id: 'grapple', name: 'RAMPINO', description: 'Si aggancia al punto mirato (fino a 22 m) e tira verso di esso.', icon: '⌖', unlockLevel: 24, charges: 1, cooldown: 6, trigger: 'key' },
  jetpack: { id: 'jetpack', name: 'PROPULSORE', description: 'Tieni premuto il salto in aria per volare brevemente e planare.', icon: '⇧', unlockLevel: 30, charges: 1, cooldown: 0, trigger: 'air-jump' },
}

export const MOBILITY_ORDER = Object.keys(MOBILITY) as MobilityId[]
export const DEFAULT_MOBILITY: MobilityId = 'double-jump'

export function isMobilityId(value: unknown): value is MobilityId {
  return typeof value === 'string' && value in MOBILITY
}

// --- Parametri fisici ----------------------------------------------------------------------
export const DOUBLE_JUMP_SPEED = 6.2
export const DASH_SPEED = 21
export const DASH_DURATION = 0.18
export const DASH_INVULNERABILITY = 0.25
export const WALL_RUN_DURATION = 1.5
/** Velocità orizzontale minima per attaccarsi al muro. */
export const WALL_RUN_MIN_SPEED = 4
export const WALL_JUMP_OUT = 6.5
export const WALL_JUMP_UP = 6.4
export const SLAM_SPEED = 24
export const SLAM_RADIUS = 4.2
export const SLAM_DAMAGE = 70
export const GRAPPLE_RANGE = 22
export const GRAPPLE_SPEED = 19
export const GRAPPLE_MAX_TIME = 1.4
/** Secondi di volo del propulsore per serbatoio; si ricarica a terra. */
export const JETPACK_FUEL = 1.1
export const JETPACK_THRUST = 26
export const JETPACK_MAX_RISE = 5.5
/** In planata (salto tenuto a serbatoio vuoto) la caduta è limitata. */
export const GLIDE_FALL_SPEED = 2.2
/** Il propulsore non porta più in alto di così sopra il pavimento di partenza. */
export const JETPACK_CEILING = 4.5

// --- Cariche e ricarica --------------------------------------------------------------------
export interface MobilityModifiers {
  /** Cariche in più (potenziamento "Doppia carica"). */
  extraCharges: number
  /** Secondi tolti alla ricarica per ogni uccisione ("Ricarica cinetica"). */
  killRecharge: number
}

export const NO_MODIFIERS: MobilityModifiers = { extraCharges: 0, killRecharge: 0 }

export interface MobilityState {
  id: MobilityId
  charges: number
  /** Secondi alla prossima carica (0 se piene o se si ricarica a terra). */
  cooldown: number
}

export function getMaxCharges(id: MobilityId, modifiers: MobilityModifiers = NO_MODIFIERS): number {
  return MOBILITY[id].charges + Math.max(0, Math.floor(modifiers.extraCharges))
}

export function createMobilityState(id: MobilityId, modifiers: MobilityModifiers = NO_MODIFIERS): MobilityState {
  return { id, charges: getMaxCharges(id, modifiers), cooldown: 0 }
}

/** Avanza la ricarica a tempo. I moduli che si ricaricano a terra usano `refillOnGround`. */
export function tickMobility(state: MobilityState, delta: number, modifiers: MobilityModifiers = NO_MODIFIERS): MobilityState {
  const definition = MOBILITY[state.id]
  const max = getMaxCharges(state.id, modifiers)
  if (definition.cooldown <= 0 || state.charges >= max) {
    return state.charges > max || state.cooldown !== 0 ? { ...state, charges: Math.min(max, state.charges), cooldown: 0 } : state
  }
  let cooldown = state.cooldown - delta
  let charges = state.charges
  while (cooldown <= 0 && charges < max) {
    charges += 1
    cooldown += definition.cooldown
  }
  return { ...state, charges, cooldown: charges >= max ? 0 : cooldown }
}

/** Usa una carica: restituisce lo stato nuovo, o null se non ce ne sono. */
export function useMobility(state: MobilityState): MobilityState | null {
  if (state.charges <= 0) return null
  const definition = MOBILITY[state.id]
  const startCooldown = definition.cooldown > 0 && state.cooldown <= 0
  return { ...state, charges: state.charges - 1, cooldown: startCooldown ? definition.cooldown : state.cooldown }
}

/** Toccando terra tornano le cariche dei moduli senza tempo di ricarica (doppio salto). */
export function refillOnGround(state: MobilityState, modifiers: MobilityModifiers = NO_MODIFIERS): MobilityState {
  if (MOBILITY[state.id].cooldown > 0) return state
  const max = getMaxCharges(state.id, modifiers)
  return state.charges === max ? state : { ...state, charges: max }
}

/** Un'uccisione accorcia la ricarica in corso ("Ricarica cinetica"). */
export function rechargeOnKill(state: MobilityState, modifiers: MobilityModifiers): MobilityState {
  if (modifiers.killRecharge <= 0 || state.cooldown <= 0) return state
  return tickMobility(state, modifiers.killRecharge, modifiers)
}

/** Avanzamento 0–1 della ricarica per l'HUD (1 = carica pronta). */
export function getRechargeProgress(state: MobilityState, modifiers: MobilityModifiers = NO_MODIFIERS): number {
  const definition = MOBILITY[state.id]
  if (definition.cooldown <= 0 || state.charges >= getMaxCharges(state.id, modifiers)) return 1
  return 1 - Math.max(0, state.cooldown) / definition.cooldown
}

/** Danno dello schianto: pieno al centro, metà al bordo. */
export function getSlamDamage(distance: number, bonus = 1): number {
  if (distance > SLAM_RADIUS) return 0
  return SLAM_DAMAGE * bonus * (1 - 0.5 * (distance / SLAM_RADIUS))
}

// --- Zone fuori portata --------------------------------------------------------------------
/** Gli zombie si arrampicano fino a questa altezza sopra il piano su cui camminano. */
export const ZOMBIE_CLIMB_HEIGHT = 3.2
/** Dopo questo tempo su una superficie irraggiungibile compare l'avviso... */
export const OUT_OF_REACH_WARNING = 2.5
/** ...e da qui in poi si subisce danno ogni secondo. */
export const OUT_OF_REACH_GRACE = 5
export const OUT_OF_REACH_DAMAGE_SHARE = 0.12

/**
 * Vero se uno zombie può raggiungere un giocatore in piedi a quota `standingY`, sapendo che il
 * piano calpestabile più alto sotto di lui (area di navigazione) è a quota `areaY`.
 */
export function isZombieReachable(standingY: number, areaY: number): boolean {
  return standingY - areaY <= ZOMBIE_CLIMB_HEIGHT + 0.05
}

/** Danno al secondo dopo il tempo di grazia (in percentuale della vita massima). */
export function getOutOfReachDamage(seconds: number, maxHealth: number): number {
  return seconds >= OUT_OF_REACH_GRACE ? maxHealth * OUT_OF_REACH_DAMAGE_SHARE : 0
}

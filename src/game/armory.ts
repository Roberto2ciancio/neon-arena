import { ATTACHMENTS, isAttachmentCompatible, MAX_WEAPON_LEVEL, resolveWeapon, WEAPON_LEVEL_COSTS } from './attachments'
import type { AttachmentId, AttachmentSelection, ResolvedWeapon } from './attachments'
import { CAMOS, DEFAULT_COSMETICS, normalizeCosmetics } from './cosmetics'
import type { CamoId, Cosmetics } from './cosmetics'
import { EQUIPMENT } from './equipment'
import type { GadgetId, LethalId, TacticalId } from './equipment'
import type { KeyValueStorage } from './progression'
import { MELEE_WEAPONS, WEAPONS } from './weapons'
import type { AttachmentSlot, MeleeDefinition, MeleeId, WeaponId } from './weapons'

export const ARMORY_STORAGE_KEY = 'neon-arena:armory:v1'
export const MAX_LEVEL = 30

export const XP_REWARDS = {
  zombieKill: 10,
  wave: 60,
  runComplete: 100,
  tctKill: 40,
  tctMatch: 200,
  tctWin: 200,
} as const

export interface Loadout {
  primary: WeaponId
  secondary: WeaponId
  melee: MeleeId
  lethal: LethalId
  tactical: TacticalId
  gadget: GadgetId
  attachments: Partial<Record<WeaponId, AttachmentSelection>>
  camos: Partial<Record<WeaponId, CamoId>>
}

export interface ArmoryState {
  level: number
  /** XP accumulata verso il livello successivo. */
  xp: number
  loadout: Loadout
  cosmetics: Cosmetics
  /** Livelli delle armi (0–5), validi solo nella modalità Zombie. */
  weaponLevels: Partial<Record<WeaponId, number>>
}

/** Loadout pronto per i motori di gioco: statistiche finali e scelte estetiche. */
export interface ResolvedLoadout {
  primary: ResolvedWeapon
  secondary: ResolvedWeapon
  melee: MeleeDefinition
  lethal: LethalId
  tactical: TacticalId
  gadget: GadgetId
  camos: Partial<Record<WeaponId, CamoId>>
  attachments: Partial<Record<WeaponId, AttachmentSelection>>
  /** Livelli applicati (vuoto nel TCT per non alterare l'equilibrio fra giocatori). */
  weaponLevels: Partial<Record<WeaponId, number>>
  cosmetics: Cosmetics
}

export const DEFAULT_LOADOUT: Loadout = {
  primary: 'ar-07',
  secondary: 'p-12',
  melee: 'knife',
  lethal: 'frag',
  tactical: 'flashbang',
  gadget: 'turret',
  attachments: {},
  camos: {},
}

export function createDefaultArmory(): ArmoryState {
  return { level: 1, xp: 0, loadout: structuredClone(DEFAULT_LOADOUT), cosmetics: { ...DEFAULT_COSMETICS }, weaponLevels: {} }
}

/** XP necessaria per passare da `level` a `level + 1`. */
export function xpForLevel(level: number): number {
  return Math.round(400 + (Math.max(1, level) - 1) * 180)
}

export function isUnlocked(state: Pick<ArmoryState, 'level'>, unlockLevel: number): boolean {
  return state.level >= unlockLevel
}

export function addXp(state: ArmoryState, amount: number): { state: ArmoryState; levelsGained: number } {
  if (!Number.isFinite(amount) || amount <= 0 || state.level >= MAX_LEVEL) return { state, levelsGained: 0 }
  let level = state.level
  let xp = state.xp + Math.floor(amount)
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level)
    level += 1
  }
  if (level >= MAX_LEVEL) xp = 0
  return { state: { ...state, level, xp }, levelsGained: level - state.level }
}

function pick<T extends string>(value: unknown, isValid: (candidate: string) => boolean, fallback: T): T {
  return typeof value === 'string' && isValid(value) ? value as T : fallback
}

/** Valida un loadout: id sconosciuti, oggetti bloccati o fuori slot ricadono sul default. */
export function normalizeLoadout(value: unknown, level: number): Loadout {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const weaponFor = (slot: 'primary' | 'secondary') => (id: string) => id in WEAPONS && WEAPONS[id as WeaponId].slot === slot && WEAPONS[id as WeaponId].unlockLevel <= level
  const equipmentFor = (slot: 'lethal' | 'tactical' | 'gadget') => (id: string) => id in EQUIPMENT && EQUIPMENT[id as LethalId].slot === slot && EQUIPMENT[id as LethalId].unlockLevel <= level
  const attachments: Partial<Record<WeaponId, AttachmentSelection>> = {}
  const rawAttachments = typeof source.attachments === 'object' && source.attachments !== null ? source.attachments as Record<string, unknown> : {}
  for (const [weaponId, selection] of Object.entries(rawAttachments)) {
    if (!(weaponId in WEAPONS) || typeof selection !== 'object' || selection === null) continue
    const weapon = WEAPONS[weaponId as WeaponId]
    const clean: AttachmentSelection = {}
    for (const [slot, id] of Object.entries(selection as Record<string, unknown>)) {
      if (typeof id !== 'string' || !(id in ATTACHMENTS)) continue
      const attachment = ATTACHMENTS[id as AttachmentId]
      if (attachment.slot !== slot || attachment.unlockLevel > level || !isAttachmentCompatible(weapon, attachment)) continue
      clean[slot as AttachmentSlot] = attachment.id
    }
    if (Object.keys(clean).length > 0) attachments[weaponId as WeaponId] = clean
  }
  const camos: Partial<Record<WeaponId, CamoId>> = {}
  const rawCamos = typeof source.camos === 'object' && source.camos !== null ? source.camos as Record<string, unknown> : {}
  for (const [weaponId, camo] of Object.entries(rawCamos)) {
    const option = CAMOS.find((candidate) => candidate.id === camo)
    if (weaponId in WEAPONS && option && option.unlockLevel <= level) camos[weaponId as WeaponId] = option.id
  }
  return {
    primary: pick(source.primary, weaponFor('primary'), DEFAULT_LOADOUT.primary),
    secondary: pick(source.secondary, weaponFor('secondary'), DEFAULT_LOADOUT.secondary),
    melee: pick(source.melee, (id) => id in MELEE_WEAPONS && MELEE_WEAPONS[id as MeleeId].unlockLevel <= level, DEFAULT_LOADOUT.melee),
    lethal: pick(source.lethal, equipmentFor('lethal'), DEFAULT_LOADOUT.lethal),
    tactical: pick(source.tactical, equipmentFor('tactical'), DEFAULT_LOADOUT.tactical),
    gadget: pick(source.gadget, equipmentFor('gadget'), DEFAULT_LOADOUT.gadget),
    attachments,
    camos,
  }
}

export function normalizeArmory(value: unknown): ArmoryState {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const level = typeof source.level === 'number' && Number.isFinite(source.level) ? Math.min(MAX_LEVEL, Math.max(1, Math.floor(source.level))) : 1
  const xp = typeof source.xp === 'number' && Number.isFinite(source.xp) ? Math.min(Math.max(0, Math.floor(source.xp)), xpForLevel(level) - 1) : 0
  return { level, xp: level >= MAX_LEVEL ? 0 : xp, loadout: normalizeLoadout(source.loadout, level), cosmetics: normalizeCosmetics(source.cosmetics, level), weaponLevels: normalizeWeaponLevels(source.weaponLevels) }
}

function normalizeWeaponLevels(value: unknown): Partial<Record<WeaponId, number>> {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const levels: Partial<Record<WeaponId, number>> = {}
  for (const [id, level] of Object.entries(source)) {
    if (!(id in WEAPONS) || typeof level !== 'number' || !Number.isFinite(level)) continue
    const clamped = Math.min(MAX_WEAPON_LEVEL, Math.max(0, Math.floor(level)))
    if (clamped > 0) levels[id as WeaponId] = clamped
  }
  return levels
}

/** Costo del prossimo livello dell'arma, o null se è già al massimo. */
export function getWeaponUpgradeCost(state: ArmoryState, weaponId: WeaponId): number | null {
  return WEAPON_LEVEL_COSTS[state.weaponLevels[weaponId] ?? 0] ?? null
}

/** Potenzia un'arma spendendo frammenti; null se al massimo o se i frammenti non bastano. */
export function upgradeWeapon(state: ArmoryState, weaponId: WeaponId, cores: number): { state: ArmoryState; cost: number } | null {
  const cost = getWeaponUpgradeCost(state, weaponId)
  if (cost === null || cores < cost) return null
  const level = (state.weaponLevels[weaponId] ?? 0) + 1
  return { state: { ...state, weaponLevels: { ...state.weaponLevels, [weaponId]: level } }, cost }
}

export function loadArmory(storage: KeyValueStorage): ArmoryState {
  try {
    const raw = storage.getItem(ARMORY_STORAGE_KEY)
    return raw ? normalizeArmory(JSON.parse(raw)) : createDefaultArmory()
  } catch {
    return createDefaultArmory()
  }
}

export function saveArmory(storage: KeyValueStorage, state: ArmoryState): void {
  try {
    storage.setItem(ARMORY_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage non disponibile: l'armeria resta valida per questa sessione.
  }
}

export function resolveLoadout(loadout: Loadout, cosmetics: Cosmetics, weaponLevels: Partial<Record<WeaponId, number>> = {}): ResolvedLoadout {
  return {
    primary: resolveWeapon(WEAPONS[loadout.primary], loadout.attachments[loadout.primary], { level: weaponLevels[loadout.primary] }),
    secondary: resolveWeapon(WEAPONS[loadout.secondary], loadout.attachments[loadout.secondary], { level: weaponLevels[loadout.secondary] }),
    melee: MELEE_WEAPONS[loadout.melee],
    lethal: loadout.lethal,
    tactical: loadout.tactical,
    gadget: loadout.gadget,
    camos: loadout.camos,
    attachments: loadout.attachments,
    weaponLevels,
    cosmetics,
  }
}

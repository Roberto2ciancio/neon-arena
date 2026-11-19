import { ATTACHMENTS, getAttachmentLimit, isAttachmentCompatible, MAX_WEAPON_LEVEL, resolveWeapon, WEAPON_LEVEL_COSTS } from './attachments'
import type { AttachmentId, AttachmentSelection, ResolvedWeapon } from './attachments'
import { CAMOS, DEFAULT_COSMETICS, isCosmeticUnlocked, normalizeCosmetics } from './cosmetics'
import type { CamoId, Cosmetics } from './cosmetics'
import { EQUIPMENT } from './equipment'
import type { GadgetId, LethalId, TacticalId } from './equipment'
import type { KeyValueStorage } from './progression'
import { MELEE_WEAPONS, WEAPONS } from './weapons'
import type { AttachmentSlot, MeleeDefinition, MeleeId, WeaponId } from './weapons'

export const ARMORY_STORAGE_KEY = 'neon-arena:armory:v1'
export const MAX_LEVEL = 50
export const MAX_PRESTIGE = 10
/** Livello massimo di un'arma (maestria), raggiunto con le uccisioni fatte usandola. */
export const MAX_WEAPON_MASTERY = 20
export const MAX_WEAPON_PRESTIGE = 3
export const CLASS_SLOTS = 5
/** Esperienza dell'arma per uccisione (in Zombie) e per eliminazione (nel TCT). */
export const WEAPON_XP = { zombieKill: 12, precisionKill: 18, tctKill: 70 } as const

export const XP_REWARDS = {
  zombieKill: 6,
  wave: 40,
  runComplete: 60,
  tctKill: 25,
  tctMatch: 120,
  tctWin: 120,
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

export interface WeaponMastery {
  level: number
  xp: number
  prestige: number
}

export interface LoadoutClass {
  name: string
  loadout: Loadout
}

export interface ArmoryState {
  level: number
  /** XP accumulata verso il livello successivo. */
  xp: number
  /** Prestigi del giocatore (0–10). */
  prestige: number
  /** Classe attiva (copia di `classes[activeClass].loadout`). */
  loadout: Loadout
  classes: LoadoutClass[]
  activeClass: number
  /** Livello, esperienza e prestigio di ogni arma: sbloccano accessori e mimetiche. */
  mastery: Partial<Record<WeaponId, WeaponMastery>>
  cosmetics: Cosmetics
  /** Potenziamenti comprati con i frammenti (0–10), validi solo nella modalità Zombie. */
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

export function createDefaultClasses(): LoadoutClass[] {
  return Array.from({ length: CLASS_SLOTS }, (_, index) => ({ name: `CLASSE ${index + 1}`, loadout: structuredClone(DEFAULT_LOADOUT) }))
}

export function createDefaultArmory(): ArmoryState {
  return { level: 1, xp: 0, prestige: 0, loadout: structuredClone(DEFAULT_LOADOUT), classes: createDefaultClasses(), activeClass: 0, mastery: {}, cosmetics: { ...DEFAULT_COSMETICS }, weaponLevels: {} }
}

/** Dopo il primo prestigio tutto ciò che si sblocca con il livello resta disponibile. */
export function effectiveUnlockLevel(state: Pick<ArmoryState, 'level' | 'prestige'>): number {
  return state.prestige > 0 ? Number.POSITIVE_INFINITY : state.level
}

export function canPrestige(state: Pick<ArmoryState, 'level' | 'prestige'>): boolean {
  return state.level >= MAX_LEVEL && state.prestige < MAX_PRESTIGE
}

/** Prestigio: si torna al livello 1 con una stella in più e oggetti esclusivi sbloccati. */
export function prestigeUp(state: ArmoryState): ArmoryState {
  if (!canPrestige(state)) return state
  const prestige = state.prestige + 1
  return { ...state, level: 1, xp: 0, prestige, cosmetics: { ...state.cosmetics, prestige } }
}

export function getMastery(state: Pick<ArmoryState, 'mastery'>, weaponId: WeaponId): WeaponMastery {
  return state.mastery[weaponId] ?? { level: 1, xp: 0, prestige: 0 }
}

/** Esperienza dell'arma per passare da `level` a `level + 1`: la curva rende lenti gli ultimi livelli. */
export function masteryXpForLevel(level: number): number {
  const step = Math.max(1, level) - 1
  return Math.round(100 + step * 60 + step * step * 4)
}

export function addWeaponXp(state: ArmoryState, weaponId: WeaponId, amount: number): { state: ArmoryState; levelsGained: number } {
  const current = getMastery(state, weaponId)
  if (!Number.isFinite(amount) || amount <= 0 || current.level >= MAX_WEAPON_MASTERY) return { state, levelsGained: 0 }
  let level = current.level
  let xp = current.xp + Math.floor(amount)
  while (level < MAX_WEAPON_MASTERY && xp >= masteryXpForLevel(level)) {
    xp -= masteryXpForLevel(level)
    level += 1
  }
  if (level >= MAX_WEAPON_MASTERY) xp = 0
  return { state: { ...state, mastery: { ...state.mastery, [weaponId]: { ...current, level, xp } } }, levelsGained: level - current.level }
}

export function canPrestigeWeapon(state: Pick<ArmoryState, 'mastery'>, weaponId: WeaponId): boolean {
  const mastery = getMastery(state, weaponId)
  return mastery.level >= MAX_WEAPON_MASTERY && mastery.prestige < MAX_WEAPON_PRESTIGE
}

/** Prestigio dell'arma: torna al livello 1, tiene gli accessori e sblocca una mimetica esclusiva. */
export function prestigeWeapon(state: ArmoryState, weaponId: WeaponId): ArmoryState {
  if (!canPrestigeWeapon(state, weaponId)) return state
  const mastery = getMastery(state, weaponId)
  return { ...state, mastery: { ...state.mastery, [weaponId]: { level: 1, xp: 0, prestige: mastery.prestige + 1 } } }
}

/** Accessori: si sbloccano con il livello dell'arma; dopo un prestigio dell'arma restano tutti disponibili. */
export function isAttachmentUnlocked(state: Pick<ArmoryState, 'mastery'>, weaponId: WeaponId, attachmentId: AttachmentId): boolean {
  const mastery = getMastery(state, weaponId)
  return mastery.prestige > 0 || mastery.level >= ATTACHMENTS[attachmentId].unlockMastery
}

/** Cambia classe: la classe attuale viene salvata e quella scelta diventa il loadout attivo. */
export function selectClass(state: ArmoryState, index: number): ArmoryState {
  if (index < 0 || index >= state.classes.length || index === state.activeClass) return state
  const classes = state.classes.map((entry, position) => position === state.activeClass ? { ...entry, loadout: state.loadout } : entry)
  return { ...state, classes, activeClass: index, loadout: structuredClone(classes[index]!.loadout) }
}

export function renameClass(state: ArmoryState, index: number, name: string): ArmoryState {
  const clean = name.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 14)
  if (!clean || !state.classes[index]) return state
  return { ...state, classes: state.classes.map((entry, position) => position === index ? { ...entry, name: clean } : entry) }
}

/** XP necessaria per passare da `level` a `level + 1`. */
export function xpForLevel(level: number): number {
  // Curva più ripida: i primi livelli arrivano presto, gli ultimi richiedono molte partite.
  const step = Math.max(1, level) - 1
  return Math.round(500 + step * 260 + step * step * 12)
}

export function isUnlocked(state: Pick<ArmoryState, 'level'> & Partial<Pick<ArmoryState, 'prestige'>>, unlockLevel: number): boolean {
  return (state.prestige ?? 0) > 0 || state.level >= unlockLevel
}

export function addXp(state: ArmoryState, amount: number): { state: ArmoryState; levelsGained: number } {
  if (!Number.isFinite(amount) || amount <= 0 || state.level >= MAX_LEVEL) return { state, levelsGained: 0 }
  // Livello 50: l'esperienza si ferma finché non si fa prestigio.
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
export function normalizeLoadout(value: unknown, level: number, mastery: Partial<Record<WeaponId, WeaponMastery>> = {}, prestige = 0): Loadout {
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
      if (attachment.slot !== slot || !isAttachmentUnlocked({ mastery }, weaponId as WeaponId, attachment.id) || !isAttachmentCompatible(weapon, attachment)) continue
      if (Object.keys(clean).length >= getAttachmentLimit(weapon)) break
      clean[slot as AttachmentSlot] = attachment.id
    }
    if (Object.keys(clean).length > 0) attachments[weaponId as WeaponId] = clean
  }
  const camos: Partial<Record<WeaponId, CamoId>> = {}
  const rawCamos = typeof source.camos === 'object' && source.camos !== null ? source.camos as Record<string, unknown> : {}
  for (const [weaponId, camo] of Object.entries(rawCamos)) {
    const option = CAMOS.find((candidate) => candidate.id === camo)
    if (weaponId in WEAPONS && option && isCosmeticUnlocked(option, level, prestige, getMastery({ mastery }, weaponId as WeaponId).prestige)) camos[weaponId as WeaponId] = option.id
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
  const prestige = typeof source.prestige === 'number' && Number.isFinite(source.prestige) ? Math.min(MAX_PRESTIGE, Math.max(0, Math.floor(source.prestige))) : 0
  const unlock = prestige > 0 ? Number.POSITIVE_INFINITY : level
  const mastery = normalizeMastery(source.mastery)
  const rawClasses = Array.isArray(source.classes) ? source.classes : []
  const activeClass = typeof source.activeClass === 'number' && Number.isInteger(source.activeClass) ? Math.min(CLASS_SLOTS - 1, Math.max(0, source.activeClass)) : 0
  const loadout = normalizeLoadout(source.loadout, unlock, mastery, prestige)
  // Salvataggi vecchi senza classi: il loadout esistente diventa la prima classe.
  const classes = createDefaultClasses().map((fallback, index) => {
    const entry = rawClasses[index] as Record<string, unknown> | undefined
    const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 14) || fallback.name : fallback.name
    const classLoadout = index === activeClass ? loadout : entry ? normalizeLoadout(entry.loadout, unlock, mastery, prestige) : fallback.loadout
    return { name, loadout: classLoadout }
  })
  return {
    level, xp: level >= MAX_LEVEL ? 0 : xp, prestige, loadout, classes, activeClass, mastery,
    cosmetics: normalizeCosmetics(source.cosmetics, unlock, prestige), weaponLevels: normalizeWeaponLevels(source.weaponLevels),
  }
}

function normalizeMastery(value: unknown): Partial<Record<WeaponId, WeaponMastery>> {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const result: Partial<Record<WeaponId, WeaponMastery>> = {}
  for (const [id, entry] of Object.entries(source)) {
    if (!(id in WEAPONS) || typeof entry !== 'object' || entry === null) continue
    const data = entry as Record<string, unknown>
    const number = (raw: unknown, min: number, max: number) => typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.floor(raw))) : min
    const level = number(data.level, 1, MAX_WEAPON_MASTERY)
    result[id as WeaponId] = { level, xp: level >= MAX_WEAPON_MASTERY ? 0 : number(data.xp, 0, masteryXpForLevel(level) - 1), prestige: number(data.prestige, 0, MAX_WEAPON_PRESTIGE) }
  }
  return result
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
    storage.setItem(ARMORY_STORAGE_KEY, JSON.stringify(syncActiveClass(state)))
  } catch {
    // Storage non disponibile: l'armeria resta valida per questa sessione.
  }
}

/** Riporta il loadout attivo nella sua classe (da chiamare prima di salvare). */
export function syncActiveClass(state: ArmoryState): ArmoryState {
  return { ...state, classes: state.classes.map((entry, index) => index === state.activeClass ? { ...entry, loadout: state.loadout } : entry) }
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

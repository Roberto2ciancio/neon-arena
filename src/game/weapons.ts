export type WeaponId =
  | 'ar-07' | 'ak-74r' | 'br-3'
  | 'smg-9' | 'vx-45'
  | 'sg-6' | 'as-12'
  | 'dmr-3' | 'sr-50'
  | 'lmg-75'
  | 'p-12' | 'r-44' | 'ap-18'

export type WeaponSlot = 'primary' | 'secondary'
export type WeaponCategory = 'assault' | 'smg' | 'shotgun' | 'sniper' | 'lmg' | 'pistol' | 'machine-pistol'
export type FireMode = 'auto' | 'semi' | 'burst' | 'bolt'
export type AttachmentSlot = 'optic' | 'muzzle' | 'barrel' | 'underbarrel' | 'magazine'

/** Rinculo per colpo in radianti: spinta verticale, deriva orizzontale, crescita nella raffica, recupero al secondo. */
export interface RecoilProfile {
  vertical: number
  horizontal: number
  growth: number
  recovery: number
}

export interface WeaponDefinition {
  id: WeaponId
  name: string
  shortName: string
  description: string
  slot: WeaponSlot
  category: WeaponCategory
  fireMode: FireMode
  /** Colpi per raffica (solo `burst`). */
  burstCount: number
  damage: number
  fireRate: number
  magazineSize: number
  reserveAmmo: number | null
  reloadDuration: number
  range: number
  hipSpread: number
  adsSpread: number
  recoil: RecoilProfile
  headshotMultiplier: number
  automatic: boolean
  pellets: number
  moveMultiplier: number
  /** Campo visivo in mira senza ottiche aggiuntive. */
  adsFov: number
  attachmentSlots: readonly AttachmentSlot[]
  unlockLevel: number
}

export interface MagazineState {
  ammo: number
  reserveAmmo: number | null
}

const RIFLE_SLOTS: readonly AttachmentSlot[] = ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine']
const PISTOL_SLOTS: readonly AttachmentSlot[] = ['optic', 'muzzle', 'magazine']
const SHOTGUN_SLOTS: readonly AttachmentSlot[] = ['optic', 'barrel', 'underbarrel', 'magazine']

type Base = Omit<WeaponDefinition, 'id' | 'automatic' | 'burstCount'> & { burstCount?: number }

function define(id: WeaponId, base: Base): WeaponDefinition {
  return { ...base, id, burstCount: base.burstCount ?? 1, automatic: base.fireMode === 'auto' }
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'ar-07': define('ar-07', {
    name: 'AR-07 // AUTOMATICO', shortName: 'AR-07', description: 'Fucile d’assalto equilibrato, preciso a media distanza.',
    slot: 'primary', category: 'assault', fireMode: 'auto', damage: 20, fireRate: 8.5, magazineSize: 30,
    reserveAmmo: 180, reloadDuration: 1.35, range: 75, hipSpread: 0.009, adsSpread: 0.002,
    recoil: { vertical: 0.0045, horizontal: 0.0022, growth: 0.05, recovery: 7 },
    headshotMultiplier: 2, pellets: 1, moveMultiplier: 1, adsFov: 52, attachmentSlots: RIFLE_SLOTS, unlockLevel: 1,
  }),
  'ak-74r': define('ak-74r', {
    name: 'AK-74R // PESANTE', shortName: 'AK-74R', description: 'Più danno per colpo, rinculo deciso da domare.',
    slot: 'primary', category: 'assault', fireMode: 'auto', damage: 26, fireRate: 7, magazineSize: 30,
    reserveAmmo: 210, reloadDuration: 1.5, range: 70, hipSpread: 0.011, adsSpread: 0.0028,
    recoil: { vertical: 0.0075, horizontal: 0.0042, growth: 0.07, recovery: 6 },
    headshotMultiplier: 2, pellets: 1, moveMultiplier: 0.97, adsFov: 52, attachmentSlots: RIFLE_SLOTS, unlockLevel: 6,
  }),
  'br-3': define('br-3', {
    name: 'BR-3 // RAFFICA', shortName: 'BR-3', description: 'Raffiche da tre colpi rapidissime e controllabili.',
    slot: 'primary', category: 'assault', fireMode: 'burst', burstCount: 3, damage: 22, fireRate: 13, magazineSize: 30,
    reserveAmmo: 210, reloadDuration: 1.4, range: 80, hipSpread: 0.01, adsSpread: 0.0018,
    recoil: { vertical: 0.0052, horizontal: 0.0016, growth: 0.04, recovery: 8 },
    headshotMultiplier: 2.1, pellets: 1, moveMultiplier: 1, adsFov: 50, attachmentSlots: RIFLE_SLOTS, unlockLevel: 10,
  }),
  'smg-9': define('smg-9', {
    name: 'SMG-9 // COMPATTA', shortName: 'SMG-9', description: 'Alta cadenza e mobilità, cala sulla distanza.',
    slot: 'primary', category: 'smg', fireMode: 'auto', damage: 14, fireRate: 12, magazineSize: 36,
    reserveAmmo: 216, reloadDuration: 1.2, range: 38, hipSpread: 0.014, adsSpread: 0.004,
    recoil: { vertical: 0.0035, horizontal: 0.0028, growth: 0.04, recovery: 9 },
    headshotMultiplier: 1.8, pellets: 1, moveMultiplier: 1.12, adsFov: 58, attachmentSlots: RIFLE_SLOTS, unlockLevel: 1,
  }),
  'vx-45': define('vx-45', {
    name: 'VX-45 // TEMPESTA', shortName: 'VX-45', description: 'Cadenza estrema per gli scontri ravvicinati.',
    slot: 'primary', category: 'smg', fireMode: 'auto', damage: 10, fireRate: 16, magazineSize: 40,
    reserveAmmo: 240, reloadDuration: 1.25, range: 32, hipSpread: 0.016, adsSpread: 0.006,
    recoil: { vertical: 0.0032, horizontal: 0.0034, growth: 0.035, recovery: 10 },
    headshotMultiplier: 1.7, pellets: 1, moveMultiplier: 1.15, adsFov: 60, attachmentSlots: RIFLE_SLOTS, unlockLevel: 8,
  }),
  'sg-6': define('sg-6', {
    name: 'SG-6 // POMPA', shortName: 'SG-6', description: 'Devastante da vicino, ricarica lenta.',
    slot: 'primary', category: 'shotgun', fireMode: 'semi', damage: 12, fireRate: 1.15, magazineSize: 6,
    reserveAmmo: 42, reloadDuration: 1.8, range: 24, hipSpread: 0.04, adsSpread: 0.022,
    recoil: { vertical: 0.018, horizontal: 0.004, growth: 0, recovery: 5 },
    headshotMultiplier: 1.5, pellets: 8, moveMultiplier: 0.96, adsFov: 62, attachmentSlots: SHOTGUN_SLOTS, unlockLevel: 1,
  }),
  'as-12': define('as-12', {
    name: 'AS-12 // AUTOMATICO', shortName: 'AS-12', description: 'Fucile a pompa automatico con caricatore a scatola.',
    slot: 'primary', category: 'shotgun', fireMode: 'auto', damage: 7, fireRate: 2.8, magazineSize: 10,
    reserveAmmo: 60, reloadDuration: 2.1, range: 20, hipSpread: 0.045, adsSpread: 0.028,
    recoil: { vertical: 0.014, horizontal: 0.006, growth: 0.06, recovery: 5 },
    headshotMultiplier: 1.4, pellets: 7, moveMultiplier: 0.93, adsFov: 62, attachmentSlots: SHOTGUN_SLOTS, unlockLevel: 14,
  }),
  'dmr-3': define('dmr-3', {
    name: 'DMR-3 // PRECISIONE', shortName: 'DMR-3', description: 'Semiautomatico con bonus elevato sui punti deboli.',
    slot: 'primary', category: 'sniper', fireMode: 'semi', damage: 44, fireRate: 2.8, magazineSize: 12,
    reserveAmmo: 60, reloadDuration: 1.65, range: 120, hipSpread: 0.008, adsSpread: 0.0005,
    recoil: { vertical: 0.012, horizontal: 0.003, growth: 0, recovery: 6 },
    headshotMultiplier: 2.5, pellets: 1, moveMultiplier: 0.94, adsFov: 45, attachmentSlots: RIFLE_SLOTS, unlockLevel: 1,
  }),
  'sr-50': define('sr-50', {
    name: 'SR-50 // OTTURATORE', shortName: 'SR-50', description: 'Fucile di precisione bolt-action: un colpo alla testa basta.',
    slot: 'primary', category: 'sniper', fireMode: 'bolt', damage: 105, fireRate: 0.75, magazineSize: 5,
    reserveAmmo: 30, reloadDuration: 2.4, range: 160, hipSpread: 0.03, adsSpread: 0.0002,
    recoil: { vertical: 0.035, horizontal: 0.006, growth: 0, recovery: 4 },
    headshotMultiplier: 2.6, pellets: 1, moveMultiplier: 0.88, adsFov: 20, attachmentSlots: ['muzzle', 'barrel', 'magazine'], unlockLevel: 12,
  }),
  'lmg-75': define('lmg-75', {
    name: 'LMG-75 // SUPPORTO', shortName: 'LMG-75', description: 'Caricatore enorme, ricarica lenta e rinculo pesante.',
    slot: 'primary', category: 'lmg', fireMode: 'auto', damage: 17, fireRate: 10, magazineSize: 75,
    reserveAmmo: 225, reloadDuration: 3.1, range: 70, hipSpread: 0.018, adsSpread: 0.005,
    recoil: { vertical: 0.006, horizontal: 0.0035, growth: 0.03, recovery: 5 },
    headshotMultiplier: 1.8, pellets: 1, moveMultiplier: 0.82, adsFov: 54, attachmentSlots: RIFLE_SLOTS, unlockLevel: 4,
  }),
  'p-12': define('p-12', {
    name: 'P-12 // SEMIAUTOMATICA', shortName: 'P-12', description: 'Pistola precisa e veloce da estrarre.',
    slot: 'secondary', category: 'pistol', fireMode: 'semi', damage: 28, fireRate: 4, magazineSize: 12,
    reserveAmmo: 72, reloadDuration: 1.05, range: 50, hipSpread: 0.005, adsSpread: 0.001,
    recoil: { vertical: 0.008, horizontal: 0.0025, growth: 0, recovery: 9 },
    headshotMultiplier: 2.2, pellets: 1, moveMultiplier: 1.08, adsFov: 60, attachmentSlots: PISTOL_SLOTS, unlockLevel: 1,
  }),
  'r-44': define('r-44', {
    name: 'R-44 // REVOLVER', shortName: 'R-44', description: 'Sei colpi potentissimi, cadenza bassa.',
    slot: 'secondary', category: 'pistol', fireMode: 'semi', damage: 50, fireRate: 1.8, magazineSize: 6,
    reserveAmmo: 42, reloadDuration: 1.9, range: 55, hipSpread: 0.007, adsSpread: 0.0012,
    recoil: { vertical: 0.022, horizontal: 0.005, growth: 0, recovery: 6 },
    headshotMultiplier: 2.3, pellets: 1, moveMultiplier: 1.05, adsFov: 58, attachmentSlots: ['optic', 'barrel'], unlockLevel: 5,
  }),
  'ap-18': define('ap-18', {
    name: 'AP-18 // RAFFICA CONTINUA', shortName: 'AP-18', description: 'Pistola automatica: una mitraglietta in tasca.',
    slot: 'secondary', category: 'machine-pistol', fireMode: 'auto', damage: 12, fireRate: 14, magazineSize: 20,
    reserveAmmo: 140, reloadDuration: 1.15, range: 30, hipSpread: 0.013, adsSpread: 0.006,
    recoil: { vertical: 0.0042, horizontal: 0.004, growth: 0.05, recovery: 9 },
    headshotMultiplier: 1.7, pellets: 1, moveMultiplier: 1.1, adsFov: 60, attachmentSlots: PISTOL_SLOTS, unlockLevel: 9,
  }),
}

export const DEFAULT_WEAPON = WEAPONS['ar-07']

/** Gittata per categoria: danno pieno fino a `effective`, poi cala fino a `minDamage` al limite. */
export interface RangeProfile {
  effective: number
  max: number
  minDamage: number
}

export const CATEGORY_RANGE: Record<WeaponCategory, RangeProfile> = {
  smg: { effective: 12, max: 38, minDamage: 0.5 },
  'machine-pistol': { effective: 9, max: 30, minDamage: 0.45 },
  shotgun: { effective: 6, max: 24, minDamage: 0.2 },
  assault: { effective: 28, max: 75, minDamage: 0.65 },
  lmg: { effective: 30, max: 70, minDamage: 0.7 },
  sniper: { effective: 120, max: 160, minDamage: 0.9 },
  pistol: { effective: 16, max: 50, minDamage: 0.55 },
}

/**
 * Moltiplicatore del danno alla distanza indicata. Gli accessori che allungano la gittata
 * (`weapon.range` più alta del limite di categoria) spostano in proporzione anche la distanza efficace.
 */
export function getRangeMultiplier(weapon: Pick<WeaponDefinition, 'category' | 'range'>, distance: number): number {
  const profile = CATEGORY_RANGE[weapon.category]
  const scale = weapon.range / profile.max
  const effective = profile.effective * scale
  const max = Math.max(effective + 0.01, weapon.range)
  if (distance <= effective) return 1
  if (distance >= max) return profile.minDamage
  return 1 - (1 - profile.minDamage) * ((distance - effective) / (max - effective))
}
export const WEAPON_ORDER = Object.keys(WEAPONS) as WeaponId[]
export const PRIMARY_WEAPONS = WEAPON_ORDER.filter((id) => WEAPONS[id].slot === 'primary')
export const SECONDARY_WEAPONS = WEAPON_ORDER.filter((id) => WEAPONS[id].slot === 'secondary')

export const CATEGORY_LABELS: Record<WeaponCategory, string> = {
  assault: 'FUCILI D’ASSALTO',
  smg: 'MITRAGLIETTE',
  shotgun: 'FUCILI A POMPA',
  sniper: 'PRECISIONE',
  lmg: 'MITRAGLIATRICI',
  pistol: 'PISTOLE',
  'machine-pistol': 'PISTOLE AUTOMATICHE',
}

export type MeleeId = 'knife' | 'machete' | 'plasma'

export interface MeleeDefinition {
  id: MeleeId
  name: string
  description: string
  damage: number
  range: number
  /** Ampiezza del colpo in radianti. */
  arc: number
  cooldown: number
  unlockLevel: number
}

export const MELEE_WEAPONS: Record<MeleeId, MeleeDefinition> = {
  knife: { id: 'knife', name: 'COLTELLO DA COMBATTIMENTO', description: 'Rapido e silenzioso.', damage: 90, range: 2.1, arc: 1.1, cooldown: 0.55, unlockLevel: 1 },
  machete: { id: 'machete', name: 'MACHETE', description: 'Fendente lento ma ampio e pesante.', damage: 140, range: 2.5, arc: 1.5, cooldown: 0.85, unlockLevel: 7 },
  plasma: { id: 'plasma', name: 'LAMA AL PLASMA', description: 'Lama energetica: veloce e letale.', damage: 120, range: 2.3, arc: 1.25, cooldown: 0.5, unlockLevel: 18 },
}

export const MELEE_ORDER = Object.keys(MELEE_WEAPONS) as MeleeId[]

export function createMagazine(weapon: Pick<WeaponDefinition, 'magazineSize' | 'reserveAmmo'>): MagazineState {
  return { ammo: weapon.magazineSize, reserveAmmo: weapon.reserveAmmo }
}

export function reloadMagazine(state: MagazineState, weapon: Pick<WeaponDefinition, 'magazineSize'>): MagazineState {
  const needed = weapon.magazineSize - state.ammo
  if (needed <= 0 || state.reserveAmmo === 0) return state
  const transferred = state.reserveAmmo === null ? needed : Math.min(needed, state.reserveAmmo)
  return {
    ammo: state.ammo + transferred,
    reserveAmmo: state.reserveAmmo === null ? null : state.reserveAmmo - transferred,
  }
}

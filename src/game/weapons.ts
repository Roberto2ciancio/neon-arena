export type WeaponId = 'ar-07' | 'p-12' | 'smg-9' | 'sg-6' | 'dmr-3' | 'lmg-75'

export interface WeaponDefinition {
  id: WeaponId
  name: string
  damage: number
  fireRate: number
  magazineSize: number
  reserveAmmo: number | null
  reloadDuration: number
  range: number
  hipSpread: number
  adsSpread: number
  recoil: number
  headshotMultiplier: number
  automatic: boolean
  pellets: number
  moveMultiplier: number
}

export interface MagazineState {
  ammo: number
  reserveAmmo: number | null
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  'ar-07': {
    id: 'ar-07', name: 'AR-07 // AUTOMATICO', damage: 20, fireRate: 8.5, magazineSize: 30,
    reserveAmmo: null, reloadDuration: 1.35, range: 60, hipSpread: 0.009, adsSpread: 0.002,
    recoil: 0.0045, headshotMultiplier: 2, automatic: true, pellets: 1, moveMultiplier: 1,
  },
  'p-12': {
    id: 'p-12', name: 'P-12 // SEMIAUTOMATICA', damage: 34, fireRate: 4, magazineSize: 12,
    reserveAmmo: 72, reloadDuration: 1.05, range: 45, hipSpread: 0.005, adsSpread: 0.001,
    recoil: 0.008, headshotMultiplier: 2.2, automatic: false, pellets: 1, moveMultiplier: 1.08,
  },
  'smg-9': {
    id: 'smg-9', name: 'SMG-9 // COMPATTA', damage: 13, fireRate: 12, magazineSize: 36,
    reserveAmmo: 180, reloadDuration: 1.2, range: 32, hipSpread: 0.014, adsSpread: 0.004,
    recoil: 0.0035, headshotMultiplier: 1.8, automatic: true, pellets: 1, moveMultiplier: 1.12,
  },
  'sg-6': {
    id: 'sg-6', name: 'SG-6 // POMPA', damage: 11, fireRate: 1.15, magazineSize: 6,
    reserveAmmo: 42, reloadDuration: 1.8, range: 24, hipSpread: 0.04, adsSpread: 0.022,
    recoil: 0.018, headshotMultiplier: 1.5, automatic: false, pellets: 8, moveMultiplier: 0.96,
  },
  'dmr-3': {
    id: 'dmr-3', name: 'DMR-3 // PRECISIONE', damage: 46, fireRate: 2.8, magazineSize: 12,
    reserveAmmo: 60, reloadDuration: 1.65, range: 85, hipSpread: 0.008, adsSpread: 0.0005,
    recoil: 0.012, headshotMultiplier: 2.5, automatic: false, pellets: 1, moveMultiplier: 0.94,
  },
  'lmg-75': {
    id: 'lmg-75', name: 'LMG-75 // SUPPORTO', damage: 18, fireRate: 10, magazineSize: 75,
    reserveAmmo: 225, reloadDuration: 3.1, range: 55, hipSpread: 0.018, adsSpread: 0.005,
    recoil: 0.006, headshotMultiplier: 1.8, automatic: true, pellets: 1, moveMultiplier: 0.82,
  },
}

export const DEFAULT_WEAPON = WEAPONS['ar-07']
export const WEAPON_ORDER: readonly WeaponId[] = ['ar-07', 'p-12', 'smg-9', 'sg-6', 'dmr-3', 'lmg-75']

export function createMagazine(weapon: WeaponDefinition): MagazineState {
  return { ammo: weapon.magazineSize, reserveAmmo: weapon.reserveAmmo }
}

export function reloadMagazine(state: MagazineState, weapon: WeaponDefinition): MagazineState {
  const needed = weapon.magazineSize - state.ammo
  if (needed <= 0 || state.reserveAmmo === 0) return state
  const transferred = state.reserveAmmo === null ? needed : Math.min(needed, state.reserveAmmo)
  return {
    ammo: state.ammo + transferred,
    reserveAmmo: state.reserveAmmo === null ? null : state.reserveAmmo - transferred,
  }
}

import { describe, expect, it } from 'vitest'
import { createMagazine, DEFAULT_WEAPON, MELEE_WEAPONS, PRIMARY_WEAPONS, reloadMagazine, SECONDARY_WEAPONS, WEAPON_ORDER, WEAPONS } from './weapons'

describe('armi basate su dati', () => {
  it('copre tutte le classi primarie e secondarie con slot coerenti', () => {
    expect(PRIMARY_WEAPONS).toHaveLength(10)
    expect(SECONDARY_WEAPONS).toHaveLength(3)
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id]
      expect(weapon.id).toBe(id)
      expect(weapon.slot === 'secondary').toBe(weapon.category === 'pistol' || weapon.category === 'machine-pistol')
      expect(weapon.automatic).toBe(weapon.fireMode === 'auto')
      expect(weapon.recoil.vertical).toBeGreaterThan(0)
    }
    expect(WEAPONS['br-3'].burstCount).toBe(3)
    expect(WEAPONS['sr-50'].damage * WEAPONS['sr-50'].headshotMultiplier).toBeGreaterThan(250)
    expect(MELEE_WEAPONS.knife.unlockLevel).toBe(1)
  })

  it('espone armi con modalità di fuoco e configurazioni distinte', () => {
    expect(WEAPONS['ar-07'].automatic).toBe(true)
    expect(WEAPONS['p-12'].automatic).toBe(false)
    expect(WEAPONS['sg-6'].pellets).toBe(8)
    expect(WEAPONS['lmg-75'].magazineSize).toBe(75)
    expect(WEAPONS['dmr-3'].range).toBeGreaterThan(WEAPONS['smg-9'].range)
  })
  it('inizializza il caricatore dalla definizione dell’arma', () => {
    // Nessuna arma ha più munizioni infinite: anche l'AR-07 iniziale ha una riserva.
    expect(createMagazine(DEFAULT_WEAPON)).toEqual({ ammo: 30, reserveAmmo: 180 })
    expect(Object.values(WEAPONS).every((weapon) => weapon.reserveAmmo !== null)).toBe(true)
    expect(createMagazine(WEAPONS['p-12'])).toEqual({ ammo: 12, reserveAmmo: 72 })
  })

  it('ricarica una riserva infinita senza consumarla', () => {
    const result = reloadMagazine({ ammo: 7, reserveAmmo: null }, DEFAULT_WEAPON)

    expect(result).toEqual({ ammo: 30, reserveAmmo: null })
  })

  it('trasferisce dalla riserva soltanto i colpi necessari', () => {
    const result = reloadMagazine({ ammo: 4, reserveAmmo: 30 }, WEAPONS['p-12'])

    expect(result).toEqual({ ammo: 12, reserveAmmo: 22 })
  })

  it('gestisce una riserva inferiore alla capacità mancante', () => {
    const result = reloadMagazine({ ammo: 2, reserveAmmo: 5 }, WEAPONS['p-12'])

    expect(result).toEqual({ ammo: 7, reserveAmmo: 0 })
  })

  it('non modifica un caricatore pieno o una riserva vuota', () => {
    const full = { ammo: 30, reserveAmmo: null }
    expect(reloadMagazine(full, DEFAULT_WEAPON)).toBe(full)

    const empty = { ammo: 0, reserveAmmo: 0 }
    expect(reloadMagazine(empty, WEAPONS['p-12'])).toBe(empty)
  })
})

describe('gittata per categoria', () => {
  it('danno pieno entro la distanza efficace, poi cala fino al minimo', async () => {
    const { getRangeMultiplier, WEAPONS: catalog } = await import('./weapons')
    expect(getRangeMultiplier(catalog['smg-9'], 10)).toBe(1)
    expect(getRangeMultiplier(catalog['smg-9'], 25)).toBeLessThan(1)
    expect(getRangeMultiplier(catalog['smg-9'], 80)).toBeCloseTo(0.5)
    expect(getRangeMultiplier(catalog['sg-6'], 20)).toBeLessThan(0.4)
    expect(getRangeMultiplier(catalog['sr-50'], 100)).toBe(1)
    // A 30 m un fucile d'assalto colpisce più forte di una mitraglietta, che perde danno prima.
    expect(getRangeMultiplier(catalog['ar-07'], 30)).toBeGreaterThan(getRangeMultiplier(catalog['smg-9'], 30))
    // Una canna lunga sposta in avanti la distanza efficace.
    expect(getRangeMultiplier({ ...catalog['smg-9'], range: 38 * 1.3 }, 14)).toBe(1)
  })
})

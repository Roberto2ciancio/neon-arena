import { describe, expect, it } from 'vitest'
import { createMagazine, DEFAULT_WEAPON, reloadMagazine, WEAPONS } from './weapons'

describe('armi basate su dati', () => {
  it('espone sei armi con modalità di fuoco e configurazioni distinte', () => {
    expect(Object.keys(WEAPONS)).toHaveLength(6)
    expect(WEAPONS['ar-07'].automatic).toBe(true)
    expect(WEAPONS['p-12'].automatic).toBe(false)
    expect(WEAPONS['sg-6'].pellets).toBe(8)
    expect(WEAPONS['lmg-75'].magazineSize).toBe(75)
    expect(WEAPONS['dmr-3'].range).toBeGreaterThan(WEAPONS['smg-9'].range)
  })
  it('inizializza il caricatore dalla definizione dell’arma', () => {
    expect(createMagazine(DEFAULT_WEAPON)).toEqual({ ammo: 30, reserveAmmo: null })
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

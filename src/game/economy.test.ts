import { describe, expect, it } from 'vitest'
import { getKillCredits, getRunShards, getWeaponKillXp } from './economy'

describe('valute', () => {
  it('i crediti in partita crescono con la difficoltà del nemico', () => {
    expect(getKillCredits('walker', false)).toBe(1)
    expect(getKillCredits('armored', true)).toBe(6)
    expect(getKillCredits('brute', false)).toBeGreaterThan(getKillCredits('shielder', true))
  })

  it('i frammenti di fine run dipendono da ondate ed eliminazioni, non dai crediti', () => {
    expect(getRunShards(1, 0, false)).toBe(0)
    expect(getRunShards(10, 150, false)).toBe(Math.floor(9 * 1.2 + 10))
    expect(getRunShards(15, 400, true)).toBeGreaterThan(getRunShards(15, 400, false))
  })

  it('l’esperienza delle armi premia élite e Bruto', () => {
    expect(getWeaponKillXp('walker', false, 12)).toBe(12)
    expect(getWeaponKillXp('walker', true, 12)).toBe(24)
    expect(getWeaponKillXp('brute', false, 12)).toBe(60)
  })
})

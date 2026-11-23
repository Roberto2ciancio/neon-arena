import { describe, expect, it } from 'vitest'
import {
  createMobilityState, getMaxCharges, getOutOfReachDamage, getRechargeProgress, getSlamDamage, isMobilityId, isZombieReachable,
  MOBILITY, MOBILITY_ORDER, OUT_OF_REACH_GRACE, rechargeOnKill, refillOnGround, SLAM_DAMAGE, SLAM_RADIUS, tickMobility, useMobility, ZOMBIE_CLIMB_HEIGHT,
} from './mobility'

describe('moduli di mobilità', () => {
  it('catalogo: sei moduli sbloccati in ordine di livello, il primo dal livello 1', () => {
    expect(MOBILITY_ORDER).toHaveLength(6)
    const levels = MOBILITY_ORDER.map((id) => MOBILITY[id].unlockLevel)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    expect(levels[0]).toBe(1)
    expect(isMobilityId('dash')).toBe(true)
    expect(isMobilityId('teletrasporto')).toBe(false)
  })

  it('lo scatto ha 2 cariche che si ricaricano una alla volta', () => {
    let state = createMobilityState('dash')
    expect(state.charges).toBe(2)
    state = useMobility(state)!
    state = useMobility(state)!
    expect(state.charges).toBe(0)
    expect(useMobility(state)).toBeNull()
    expect(state.cooldown).toBe(MOBILITY.dash.cooldown)
    state = tickMobility(state, MOBILITY.dash.cooldown + 0.01)
    expect(state.charges).toBe(1)
    expect(getRechargeProgress(state)).toBeLessThan(0.05)
    state = tickMobility(state, MOBILITY.dash.cooldown)
    expect(state.charges).toBe(2)
    expect(state.cooldown).toBe(0)
    expect(getRechargeProgress(state)).toBe(1)
  })

  it('il doppio salto si ricarica solo toccando terra, con le cariche extra del potenziamento', () => {
    const modifiers = { extraCharges: 1, killRecharge: 0 }
    expect(getMaxCharges('double-jump', modifiers)).toBe(2)
    let state = createMobilityState('double-jump', modifiers)
    state = useMobility(useMobility(state)!)!
    state = tickMobility(state, 30, modifiers)
    expect(state.charges).toBe(0)
    expect(refillOnGround(state, modifiers).charges).toBe(2)
    // Lo scatto non torna toccando terra.
    const dash = useMobility(createMobilityState('dash'))!
    expect(refillOnGround(dash).charges).toBe(1)
  })

  it('la ricarica cinetica accorcia il tempo a ogni uccisione', () => {
    const modifiers = { extraCharges: 0, killRecharge: 2 }
    let state = useMobility(createMobilityState('slam'))!
    expect(state.cooldown).toBe(MOBILITY.slam.cooldown)
    state = rechargeOnKill(state, modifiers)
    expect(state.cooldown).toBeCloseTo(MOBILITY.slam.cooldown - 2)
    for (let index = 0; index < 4; index += 1) state = rechargeOnKill(state, modifiers)
    expect(state.charges).toBe(1)
    expect(rechargeOnKill(state, { extraCharges: 0, killRecharge: 0 })).toBe(state)
  })

  it('lo schianto fa danno pieno al centro e metà al bordo', () => {
    expect(getSlamDamage(0)).toBe(SLAM_DAMAGE)
    expect(getSlamDamage(SLAM_RADIUS)).toBeCloseTo(SLAM_DAMAGE / 2)
    expect(getSlamDamage(SLAM_RADIUS + 0.1)).toBe(0)
    expect(getSlamDamage(0, 1.5)).toBe(SLAM_DAMAGE * 1.5)
  })

  it('zone fuori portata: oltre l’arrampicata degli zombie si viene puniti dopo un tempo di grazia', () => {
    expect(isZombieReachable(3, 0)).toBe(true)
    expect(isZombieReachable(ZOMBIE_CLIMB_HEIGHT + 0.5, 0)).toBe(false)
    expect(isZombieReachable(9.6, 6.4)).toBe(true)
    expect(getOutOfReachDamage(OUT_OF_REACH_GRACE - 0.1, 100)).toBe(0)
    expect(getOutOfReachDamage(OUT_OF_REACH_GRACE, 100)).toBeGreaterThan(0)
  })
})

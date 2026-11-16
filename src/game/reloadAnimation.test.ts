import { describe, expect, it } from 'vitest'
import { getReloadCues, getReloadParts, getReloadPose, SHELLS_PER_RELOAD } from './reloadAnimation'

describe('animazione di ricarica', () => {
  it('parte e finisce nella posa normale, senza scatti', () => {
    for (const style of ['magazine', 'pistol', 'shells', 'cylinder'] as const) {
      for (const progress of [-1, 0, 1]) {
        const pose = getReloadPose(style, progress)
        for (const value of Object.values(pose)) expect(Math.abs(value)).toBeLessThan(1e-6)
        const parts = getReloadParts(style, progress, -0.42, -0.6)
        expect(parts.magazineVisible).toBe(true)
        expect(Math.abs(parts.magazineY) + Math.abs(parts.handY) + Math.abs(parts.handZ)).toBeLessThan(1e-6)
      }
    }
  })

  it('il caricatore cade, sparisce e viene reinserito', () => {
    const falling = getReloadParts('magazine', 0.3, -0.42, -0.6)
    expect(falling.magazineY).toBeLessThan(-0.3)
    expect(getReloadParts('magazine', 0.39, -0.42, -0.6).magazineVisible).toBe(false)
    const inserting = getReloadParts('magazine', 0.5, -0.42, -0.6)
    expect(inserting.magazineVisible).toBe(true)
    expect(inserting.magazineY).toBeLessThan(0)
    expect(inserting.magazineY).toBeGreaterThan(-0.42)
    expect(getReloadParts('magazine', 0.7, -0.42, -0.6).magazineY).toBeCloseTo(0, 5)
  })

  it('l’arma resta inclinata durante la ricarica', () => {
    expect(getReloadPose('magazine', 0.4).rotZ).toBeLessThan(-0.5)
    expect(getReloadPose('cylinder', 0.4).rotZ).toBeLessThan(-0.5)
  })

  it('i suoni seguono l’ordine delle fasi', () => {
    const cues = getReloadCues('magazine').map((cue) => cue.sound)
    expect(cues).toEqual(['reloadOut', 'reloadIn', 'reloadRack'])
    const shells = getReloadCues('shells')
    expect(shells.filter((cue) => cue.sound === 'shellLoad')).toHaveLength(SHELLS_PER_RELOAD)
    for (const style of ['magazine', 'pistol', 'shells', 'cylinder'] as const) {
      const times = getReloadCues(style).map((cue) => cue.at)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(times.every((time) => time > 0 && time < 1)).toBe(true)
    }
  })
})

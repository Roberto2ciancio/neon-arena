import { describe, expect, it } from 'vitest'
import { RecoilState } from './recoil'
import { WEAPONS } from './weapons'

const hip = { aiming: false, crouched: false, vertical: 1, horizontal: 1 }

describe('rinculo', () => {
  it('cresce durante la raffica e si azzera dopo una pausa', () => {
    const recoil = new RecoilState()
    const first = recoil.shot(WEAPONS['ak-74r'].recoil, hip)
    let last = first
    for (let shot = 0; shot < 8; shot += 1) {
      recoil.update(0.05)
      last = recoil.shot(WEAPONS['ak-74r'].recoil, hip)
    }
    expect(last.pitch).toBeGreaterThan(first.pitch * 1.4)
    recoil.update(0.5)
    expect(recoil.shot(WEAPONS['ak-74r'].recoil, hip).pitch).toBeCloseTo(first.pitch)
  })

  it('la mira, l’accovacciamento e gli accessori riducono il rinculo', () => {
    const base = new RecoilState().shot(WEAPONS['ar-07'].recoil, hip).pitch
    const aimed = new RecoilState().shot(WEAPONS['ar-07'].recoil, { ...hip, aiming: true, crouched: true }).pitch
    const compensated = new RecoilState().shot(WEAPONS['ar-07'].recoil, { ...hip, vertical: 0.75 }).pitch
    expect(aimed).toBeLessThan(base * 0.6)
    expect(compensated).toBeCloseTo(base * 0.75)
  })

  it('l’andamento orizzontale è ripetibile fra due raffiche', () => {
    const run = () => {
      const recoil = new RecoilState()
      return Array.from({ length: 6 }, () => recoil.shot(WEAPONS['smg-9'].recoil, hip).yaw)
    }
    expect(run()).toEqual(run())
    expect(new Set(run().map((yaw) => Math.sign(yaw))).size).toBe(2)
  })

  it('il recupero non supera lo spostamento accumulato', () => {
    const recoil = new RecoilState()
    let kicked = 0
    for (let shot = 0; shot < 10; shot += 1) kicked += recoil.shot(WEAPONS['lmg-75'].recoil, hip).pitch
    let recovered = 0
    for (let frame = 0; frame < 300; frame += 1) recovered += recoil.update(1 / 60).pitch
    expect(recovered).toBeLessThanOrEqual(kicked)
    expect(recovered).toBeGreaterThan(kicked * 0.6)
  })
})

import { describe, expect, it } from 'vitest'
import { GAITS, getGaitPose } from './gait'
import type { EnemyKind } from './types'

describe('camminate degli zombie', () => {
  it('ogni tipo ha una camminata e le gambe si alternano', () => {
    for (const kind of Object.keys(GAITS) as EnemyKind[]) {
      const pose = getGaitPose(kind, 0.1, 0)
      expect(Math.sign(pose.leftLeg)).not.toBe(Math.sign(pose.rightLeg) || 99)
      for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('il corridore ha una falcata più ampia e veloce dell’errante', () => {
    expect(GAITS.runner.stride).toBeGreaterThan(GAITS.walker.stride)
    expect(GAITS.runner.legSwing).toBeGreaterThan(GAITS.walker.legSwing)
  })

  it('l’errante zoppica: un passo è più ampio dell’altro', () => {
    let maxLeft = 0
    let maxRight = 0
    for (let time = 0; time < 2; time += 0.01) {
      const pose = getGaitPose('walker', time, 0)
      maxLeft = Math.max(maxLeft, pose.leftLeg)
      maxRight = Math.max(maxRight, pose.rightLeg)
    }
    expect(Math.abs(maxLeft - maxRight)).toBeGreaterThan(0.05)
  })

  it('da fermo i movimenti si spengono', () => {
    const still = getGaitPose('bloater', 0.3, 0, 0)
    expect(still.leftLeg).toBe(0)
    expect(still.bodyRoll).toBe(0)
    expect(still.leftArm).toBe(GAITS.bloater.armBase)
  })
})

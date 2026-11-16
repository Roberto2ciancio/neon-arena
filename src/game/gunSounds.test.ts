import { describe, expect, it } from 'vitest'
import { getGunSoundProfile, jitterPitch } from './gunSounds'

describe('suoni delle armi', () => {
  it('le armi pesanti hanno un colpo più basso e più forte delle pistole', () => {
    const pistol = getGunSoundProfile('pistol', 'semi', false)
    const sniper = getGunSoundProfile('sniper', 'bolt', false)
    expect(sniper.thumpGain).toBeGreaterThan(pistol.thumpGain)
    expect(sniper.thumpEnd).toBeLessThan(pistol.thumpEnd)
    expect(sniper.reverb).toBeGreaterThan(pistol.reverb)
  })

  it('otturatore e pompa aggiungono il suono meccanico, le automatiche no', () => {
    expect(getGunSoundProfile('sniper', 'bolt', false).actionDelay).not.toBeNull()
    expect(getGunSoundProfile('shotgun', 'semi', false).actionDelay).not.toBeNull()
    expect(getGunSoundProfile('assault', 'auto', false).actionDelay).toBeNull()
    expect(getGunSoundProfile('sniper', 'semi', false).actionDelay).toBeNull()
  })

  it('il silenziatore attenua schiocco, corpo e riverbero', () => {
    const open = getGunSoundProfile('assault', 'auto', false)
    const suppressed = getGunSoundProfile('assault', 'auto', true)
    expect(suppressed.crackGain).toBeLessThan(open.crackGain * 0.5)
    expect(suppressed.bodyFrequency).toBeLessThanOrEqual(900)
    expect(suppressed.reverb).toBeLessThan(open.reverb)
  })

  it('varia l’intonazione entro i limiti', () => {
    expect(jitterPitch(0.05, () => 0)).toBeCloseTo(0.95)
    expect(jitterPitch(0.05, () => 1)).toBeCloseTo(1.05)
    expect(jitterPitch(0, Math.random)).toBe(1)
  })
})

describe('rinculo visivo', () => {
  it('cresce con la potenza dell’arma e resta limitato', async () => {
    const { getVisualKick } = await import('./WeaponHandler')
    const { WEAPONS } = await import('./weapons')
    expect(getVisualKick(WEAPONS['sr-50'])).toBeGreaterThan(getVisualKick(WEAPONS['smg-9']) * 2)
    expect(getVisualKick(WEAPONS['sg-6'])).toBeGreaterThan(getVisualKick(WEAPONS['ar-07']))
    for (const weapon of Object.values(WEAPONS)) expect(getVisualKick(weapon)).toBeLessThanOrEqual(0.22)
  })
})

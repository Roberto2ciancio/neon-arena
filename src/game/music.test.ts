import { describe, expect, it } from 'vitest'
import { getChord, getLayerLevels, getMusicIntensity, noteFrequency, smoothIntensity } from './music'

const calmWave = { nearbyEnemies: 0, healthRatio: 1, wave: 1, waveBreak: false, boss: false }

describe('musica dinamica', () => {
  it('l’intensità cresce con zombie vicini, poca vita, ondate avanzate e boss', () => {
    const base = getMusicIntensity(calmWave)
    expect(getMusicIntensity({ ...calmWave, nearbyEnemies: 8 })).toBeGreaterThan(base)
    expect(getMusicIntensity({ ...calmWave, healthRatio: 0.2 })).toBeGreaterThan(base)
    expect(getMusicIntensity({ ...calmWave, wave: 12 })).toBeGreaterThan(base)
    expect(getMusicIntensity({ ...calmWave, boss: true })).toBeGreaterThan(base)
    expect(getMusicIntensity({ nearbyEnemies: 40, healthRatio: 0, wave: 15, waveBreak: false, boss: true })).toBe(1)
    expect(getMusicIntensity({ ...calmWave, nearbyEnemies: 20, waveBreak: true })).toBeLessThan(base)
  })

  it('sale in fretta e scende lentamente', () => {
    const up = smoothIntensity(0, 1, 0.25)
    const down = smoothIntensity(1, 0, 0.25)
    expect(up).toBeGreaterThan(1 - down)
    expect(smoothIntensity(0.5, 0.52, 1)).toBe(0.52)
  })

  it('gli strati entrano in ordine con l’intensità', () => {
    const quiet = getLayerLevels(0.15, false, false)
    expect(quiet.pad).toBeGreaterThan(0)
    expect(quiet.bass + quiet.arp + quiet.drums + quiet.tension).toBe(0)
    const mid = getLayerLevels(0.5, false, false)
    expect(mid.bass).toBe(1)
    expect(mid.drums).toBe(0)
    const high = getLayerLevels(0.9, true, false)
    expect(high.drums).toBe(1)
    expect(high.tension).toBe(1)
    // Pausa fra le ondate: solo il tappeto, anche con il boss.
    const calm = getLayerLevels(0.9, true, true)
    expect(calm.bass + calm.arp + calm.drums + calm.tension).toBe(0)
  })

  it('armonia in re minore con progressione di quattro battute', () => {
    expect(noteFrequency(0)).toBeCloseTo(146.83)
    expect(noteFrequency(12)).toBeCloseTo(293.66)
    expect(getChord(0)).toEqual([0, 3, 7])
    expect(getChord(4)).toEqual(getChord(0))
    expect(getChord(-1)).toEqual(getChord(3))
  })
})

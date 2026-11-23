import { describe, expect, it } from 'vitest'
import {
  filterSpawnPool,
  getBountyTarget,
  getWaveEventModifiers,
  getZoneDamageMultiplier,
  isWaveEventId,
  RANDOM_EVENT_IDS,
  rollWaveEvent,
  THEME_WAVES,
  WAVE_EVENT_IDS,
  WAVE_EVENTS,
  type WaveEventId,
} from './waveEvents'

/** Generatore deterministico per i test. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

describe('eventi casuali delle ondate', () => {
  it('non capitano nelle prime due ondate, nelle ondate del boss e nell’ultima', () => {
    for (const wave of [1, 2, 5, 10, 15]) expect(rollWaveEvent(wave, [], 0, () => 0)).toBeNull()
    expect(rollWaveEvent(3, [], 0, () => 0)).not.toBeNull()
  })

  it('arrivano al più tardi dopo due ondate normali', () => {
    // Con random alto l'evento non scatta, tranne quando il distacco è massimo.
    expect(rollWaveEvent(7, [], 6, () => 0.99)).toBeNull()
    expect(rollWaveEvent(9, ['blackout'], 6, () => 0.99)).not.toBeNull()
  })

  it('dopo un evento il successivo è meno probabile', () => {
    expect(rollWaveEvent(7, ['blackout'], 6, () => 0.3)).toBeNull()
    expect(rollWaveEvent(7, ['blackout'], 5, () => 0.3)).not.toBeNull()
  })

  it('rispettano l’ondata minima e non si ripetono nella stessa run', () => {
    const used: WaveEventId[] = []
    const random = seeded(7)
    for (let run = 0; run < 200; run += 1) {
      const wave = 3 + (run % 9)
      if (wave % 5 === 0 || THEME_WAVES.includes(wave)) continue
      const event = rollWaveEvent(wave, used, 0, random)
      if (!event) continue
      expect(WAVE_EVENTS[event].minWave).toBeLessThanOrEqual(wave)
      expect(WAVE_EVENTS[event].theme).toBeFalsy()
      if (used.length < RANDOM_EVENT_IDS.filter((id) => WAVE_EVENTS[id].minWave <= wave).length) expect(used).not.toContain(event)
      used.push(event)
      if (used.length >= RANDOM_EVENT_IDS.length) used.length = 0
    }
  })

  it('producono sequenze diverse fra run diverse', () => {
    const simulate = (seed: number) => {
      const random = seeded(seed)
      const used: WaveEventId[] = []
      let last = 0
      const sequence: string[] = []
      for (let wave = 1; wave <= 15; wave += 1) {
        const event = rollWaveEvent(wave, used, last, random)
        if (event) {
          used.push(event)
          last = wave
        }
        sequence.push(event ?? '-')
      }
      return sequence.join(',')
    }
    const runs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(simulate))
    expect(runs.size).toBeGreaterThanOrEqual(7)
  })

  it('i modificatori partono neutri e cambiano solo ciò che l’evento dichiara', () => {
    expect(getWaveEventModifiers(null).credits).toBe(1)
    const giants = getWaveEventModifiers('giants')
    expect(giants.health).toBe(2)
    expect(giants.spawnCount).toBeLessThan(1)
    expect(giants.lightScale).toBe(1)
    expect(getWaveEventModifiers('no-regen').passiveRegen).toBe(false)
    expect(getWaveEventModifiers('blackout').lightScale).toBeLessThan(1)
  })

  it('lo sciame limita i tipi ma non svuota mai il gruppo dell’ondata', () => {
    expect(filterSpawnPool(['walker', 'runner', 'armored'], ['walker', 'runner', 'crawler'])).toEqual(['walker', 'runner'])
    expect(filterSpawnPool(['armored'], ['walker'])).toEqual(['armored'])
    expect(filterSpawnPool(['armored'], undefined)).toEqual(['armored'])
  })

  it('cacciatore di teste premia i punti deboli e penalizza il corpo', () => {
    const modifiers = getWaveEventModifiers('headhunter')
    expect(getZoneDamageMultiplier(modifiers, true)).toBeGreaterThan(1)
    expect(getZoneDamageMultiplier(modifiers, false)).toBeLessThan(1)
  })

  it('la taglia cresce con l’ondata', () => {
    expect(getBountyTarget(3)).toBeLessThan(getBountyTarget(14))
  })

  it('in squadra la taglia è unica e cresce con i giocatori come gli zombie', () => {
    expect(getBountyTarget(6, 1)).toBe(getBountyTarget(6))
    expect(getBountyTarget(6, 2)).toBe(Math.round(getBountyTarget(6) * 1.5))
    expect(getBountyTarget(6, 4)).toBe(Math.round(getBountyTarget(6) * 2.5))
    expect(getBountyTarget(6, 0)).toBe(getBountyTarget(6))
  })

  it('riconosce gli identificativi validi (messaggi co-op)', () => {
    expect(isWaveEventId('blackout')).toBe(true)
    expect(isWaveEventId('toString')).toBe(false)
    expect(isWaveEventId(3)).toBe(false)
  })
})

describe('ondate a tema', () => {
  it('escono sempre nelle ondate dedicate, senza ripetersi, e mai a caso nelle altre', () => {
    const used: WaveEventId[] = []
    for (const wave of THEME_WAVES) {
      const event = rollWaveEvent(wave, used, wave - 1, () => 0.99)
      expect(event).not.toBeNull()
      expect(WAVE_EVENTS[event!].theme).toBe(true)
      expect(used).not.toContain(event)
      used.push(event!)
    }
    // Le Ombre al buio non escono alla quarta ondata.
    for (let seed = 0; seed < 20; seed += 1) expect(rollWaveEvent(4, [], 3, seeded(seed))).not.toBe('theme-shadows')
  })

  it('i tipi del tema compaiono anche prima della loro ondata d’esordio', () => {
    const mods = getWaveEventModifiers('theme-shadows')
    expect(filterSpawnPool(['walker', 'runner'], mods.kinds, mods.forceKinds)).toEqual(['stalker', 'walker'])
    expect(filterSpawnPool(['walker'], ['stalker'])).toEqual(['walker'])
    expect(WAVE_EVENT_IDS.filter((id) => WAVE_EVENTS[id].theme).length).toBeGreaterThanOrEqual(THEME_WAVES.length)
  })
})

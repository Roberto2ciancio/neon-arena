import { describe, expect, it } from 'vitest'
import {
  chooseFallStyle,
  createCombo,
  getBloodColor,
  getBloodCount,
  getComboAnnouncement,
  getComboMultiplier,
  getDeathImpulse,
  getHitStop,
  isExecutable,
  normalizeGore,
  PART_HEAD,
  PART_LEFT_ARM,
  PART_LEFT_LEG,
  PART_RIGHT_ARM,
  PART_RIGHT_LEG,
  registerComboKill,
  rollDismemberment,
  tickCombo,
} from './killFeel'

const base = { kind: 'walker' as const, distance: 10, overkill: 0 }

describe('smembramento', () => {
  it('il colpo letale alla testa la fa saltare', () => {
    expect(rollDismemberment({ ...base, cause: 'bullet', zone: 'head' }, () => 0.99)).toBe(PART_HEAD)
    expect(rollDismemberment({ ...base, cause: 'execution', zone: 'body' })).toBe(PART_HEAD)
  })

  it('il fucile a pompa da vicino stacca un arto della zona colpita', () => {
    const legs = rollDismemberment({ ...base, cause: 'shotgun', zone: 'legs', distance: 3 }, () => 0.1)
    expect(legs === PART_LEFT_LEG || legs === PART_RIGHT_LEG).toBe(true)
    expect(rollDismemberment({ ...base, cause: 'shotgun', zone: 'body', distance: 12 }, () => 0.1)).toBe(0)
  })

  it('le esplosioni staccano sempre almeno un arto', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const value = (seed + 0.5) / 20
      const mask = rollDismemberment({ ...base, cause: 'explosion', zone: null }, () => value)
      expect(mask & (PART_LEFT_ARM | PART_RIGHT_ARM | PART_LEFT_LEG | PART_RIGHT_LEG)).not.toBe(0)
    }
  })

  it('un colpo al corpo normale non stacca nulla e il Bruto resta intero', () => {
    expect(rollDismemberment({ ...base, cause: 'bullet', zone: 'body' }, () => 0)).toBe(0)
    expect(rollDismemberment({ ...base, kind: 'brute', cause: 'explosion', zone: null }, () => 0)).toBe(0)
  })
})

describe('caduta e spinta', () => {
  it('lo stile dipende da causa e zona', () => {
    expect(chooseFallStyle('explosion', null)).toBe('launch')
    expect(chooseFallStyle('bullet', 'legs')).toBe('knees')
    expect(chooseFallStyle('shotgun', 'body')).toBe('back')
  })

  it('esplosioni e fucili a pompa spingono più dei proiettili', () => {
    expect(getDeathImpulse('explosion', 0)).toBeGreaterThan(getDeathImpulse('shotgun', 0))
    expect(getDeathImpulse('shotgun', 0)).toBeGreaterThan(getDeathImpulse('bullet', 0))
    expect(getDeathImpulse('bullet', 1)).toBeGreaterThan(getDeathImpulse('bullet', 0))
  })
})

describe('pausa d’impatto', () => {
  it('solo in solitaria e senza Riduci movimento', () => {
    expect(getHitStop({ lethalHeadshot: true }, false, false)).toBeGreaterThan(0)
    expect(getHitStop({ lethalHeadshot: true }, true, false)).toBe(0)
    expect(getHitStop({ boss: true }, false, true)).toBe(0)
    expect(getHitStop({}, false, false)).toBe(0)
  })

  it('il boss pesa più di un colpo alla testa', () => {
    expect(getHitStop({ boss: true }, false, false)).toBeGreaterThan(getHitStop({ lethalHeadshot: true }, false, false))
  })
})

describe('combo', () => {
  it('conta le uccisioni ravvicinate e si azzera dopo la finestra', () => {
    let state = createCombo()
    state = registerComboKill(state).state
    const second = registerComboKill(state)
    expect(second.state.count).toBe(2)
    expect(second.announcement).toBe('DOPPIA')
    state = tickCombo(second.state, 3)
    expect(state.count).toBe(0)
    expect(state.best).toBe(2)
  })

  it('il moltiplicatore cresce del 5% fino a ×2', () => {
    expect(getComboMultiplier(1)).toBe(1)
    expect(getComboMultiplier(5)).toBeCloseTo(1.2)
    expect(getComboMultiplier(100)).toBe(2)
  })

  it('annuncia solo le soglie', () => {
    expect(getComboAnnouncement(4)).toBeNull()
    expect(getComboAnnouncement(5)).toBe('MASSACRO')
    expect(getComboAnnouncement(40)).toBe('LEGGENDA ×40')
  })
})

describe('esecuzioni e sangue', () => {
  it('si giustiziano gli zombie storditi o quasi morti, mai il Bruto', () => {
    expect(isExecutable('walker', 10, 100, false)).toBe(true)
    expect(isExecutable('walker', 80, 100, true)).toBe(true)
    expect(isExecutable('walker', 80, 100, false)).toBe(false)
    expect(isExecutable('brute', 1, 100, true)).toBe(false)
  })

  it('il livello del sangue regola quantità e colore', () => {
    expect(normalizeGore('boh')).toBe('full')
    expect(getBloodCount('full', 10)).toBe(10)
    expect(getBloodCount('reduced', 10)).toBe(4)
    expect(getBloodCount('off', 10)).toBe(0)
    expect(getBloodColor('walker', 'off')).toBeNull()
    expect(getBloodColor('spitter', 'full')).not.toBe(getBloodColor('walker', 'full'))
  })
})

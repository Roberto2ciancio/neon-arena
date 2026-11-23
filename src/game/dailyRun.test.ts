import { describe, expect, it } from 'vitest'
import { createDailyRun, createSeededRandom, getUtcDayKey, loadDailyBest, recordDailyScore } from './dailyRun'
import { MAPS } from './maps'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('run del giorno', () => {
  it('uguale per tutti nello stesso giorno UTC, diversa nei giorni seguenti', () => {
    expect(getUtcDayKey(new Date(Date.UTC(2026, 10, 23, 23, 30)))).toBe('2026-11-23')
    expect(createDailyRun('2026-11-23')).toEqual(createDailyRun('2026-11-23'))
    const days = new Set(Array.from({ length: 10 }, (_, day) => JSON.stringify(createDailyRun(`2026-12-${String(day + 1).padStart(2, '0')}`))))
    expect(days.size).toBe(10)
  })

  it('mappa valida e una o due carte compatibili', () => {
    for (let day = 1; day <= 28; day += 1) {
      const run = createDailyRun(`2027-02-${String(day).padStart(2, '0')}`)
      expect(MAPS.some((map) => map.id === run.mapId)).toBe(true)
      expect(run.modifiers.length).toBeGreaterThanOrEqual(1)
      expect(run.modifiers.length).toBeLessThanOrEqual(2)
      expect(run.modifiers).not.toContain('one-hit')
      expect(run.modifiers.includes('pistols-only') && run.modifiers.includes('no-shop')).toBe(false)
    }
  })

  it('il generatore è riproducibile', () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('record locale del giorno', () => {
    const storage = memory()
    expect(recordDailyScore(storage, '2026-11-23', 500)).toBe(true)
    expect(recordDailyScore(storage, '2026-11-23', 400)).toBe(false)
    expect(loadDailyBest(storage, '2026-11-23')).toBe(500)
    expect(loadDailyBest(storage, '2026-11-24')).toBe(0)
  })
})

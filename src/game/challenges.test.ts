import { describe, expect, it } from 'vitest'
import { createChallengeSet, createChallengeState, describeChallenge, getChallengeRewards, getDailyKey, getWeekKey, loadChallenges, recordChallengeEvent, refreshChallenges, saveChallenges } from './challenges'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
}

describe('sfide giornaliere e settimanali', () => {
  it('sono le stesse per tutti nello stesso giorno e cambiano con la data', () => {
    expect(createChallengeSet('daily', '2026-11-23')).toEqual(createChallengeSet('daily', '2026-11-23'))
    const days = new Set(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map((key) => JSON.stringify(createChallengeSet('daily', key).items.map((item) => item.id + (item.param ?? '')))))
    expect(days.size).toBeGreaterThan(1)
    const set = createChallengeSet('daily', '2026-11-23')
    expect(set.items).toHaveLength(3)
    expect(new Set(set.items.map((item) => item.id)).size).toBe(3)
    expect(set.items.filter((item) => item.metric.startsWith('tct')).length).toBeLessThanOrEqual(1)
    for (const item of set.items) expect(describeChallenge(item).length).toBeGreaterThan(5)
  })

  it('chiavi di giorno e settimana ISO', () => {
    expect(getDailyKey(new Date(2026, 10, 23))).toBe('2026-11-23')
    expect(getWeekKey(new Date(2026, 10, 23))).toBe('2026-W48')
    expect(getWeekKey(new Date(2026, 10, 29))).toBe('2026-W48')
    expect(getWeekKey(new Date(2026, 10, 30))).toBe('2026-W49')
  })

  it('le run fanno avanzare le sfide; quelle "migliore" non si sommano', () => {
    const now = new Date(2026, 10, 23)
    const state = createChallengeState(now)
    state.daily.items = [
      { id: 'kills', metric: 'kills', goal: 150, progress: 0, done: false, best: false },
      { id: 'wave', metric: 'wave', goal: 8, progress: 0, done: false, best: true },
      { id: 'category-kills', metric: 'category-kills', goal: 20, progress: 0, done: false, best: false, param: 'shotgun' },
    ]
    const run = { score: 1, wave: 5, kills: 90, shards: 0, time: 300, weaponKills: { 'sg-6': 12, 'ar-07': 70 } }
    let result = recordChallengeEvent(state, { zombie: run }, now)
    expect(result.state.daily.items.map((item) => item.progress)).toEqual([90, 5, 12])
    result = recordChallengeEvent(result.state, { zombie: { ...run, wave: 9 } }, now)
    expect(result.state.daily.items.map((item) => item.progress)).toEqual([150, 8, 20])
    expect(result.daily.map((item) => item.id)).toEqual(['kills', 'wave', 'category-kills'])
    // Già completate: non si ricompensano due volte.
    expect(recordChallengeEvent(result.state, { zombie: run }, now).daily).toEqual([])
    expect(getChallengeRewards(3, 0)).toEqual({ xp: 750, shards: 9 })
  })

  it('a giorno nuovo il gruppo giornaliero si rinnova, quello settimanale resta', () => {
    const state = createChallengeState(new Date(2026, 10, 23))
    const next = refreshChallenges(state, new Date(2026, 10, 24))
    expect(next.daily.key).toBe('2026-11-24')
    expect(next.weekly).toBe(state.weekly)
  })

  it('salva e ricarica, e riparte da zero con un salvataggio corrotto', () => {
    const storage = memory()
    const now = new Date(2026, 10, 23)
    const state = createChallengeState(now)
    state.daily.items[0]!.progress = 1
    saveChallenges(storage, state)
    expect(loadChallenges(storage, now).daily.items[0]!.progress).toBe(1)
    storage.setItem('neon-arena:challenges:v1', '{rotto')
    expect(loadChallenges(storage, now).daily.items[0]!.progress).toBe(0)
  })
})

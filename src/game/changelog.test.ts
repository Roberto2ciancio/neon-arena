import { describe, expect, it } from 'vitest'
import { CHANGELOG, getLatestChangelogId, getUnseenEntries, loadSeenChangelog, markChangelogSeen, MAX_UNSEEN_ENTRIES } from './changelog'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('novità', () => {
  it('ogni voce ha id unico e ogni novità dice dove trovarla', () => {
    expect(new Set(CHANGELOG.map((entry) => entry.id)).size).toBe(CHANGELOG.length)
    for (const entry of CHANGELOG) {
      expect(entry.items.length).toBeGreaterThan(0)
      for (const item of entry.items) {
        expect(item.text.length).toBeGreaterThan(20)
        expect(item.where.length).toBeGreaterThan(3)
      }
    }
  })

  it('i nuovi giocatori non vedono nulla, chi torna vede quello che si è perso', () => {
    expect(getUnseenEntries(null, false)).toEqual([])
    expect(getUnseenEntries(null, true)).toHaveLength(Math.min(MAX_UNSEEN_ENTRIES, CHANGELOG.length))
    expect(getUnseenEntries(getLatestChangelogId(), true)).toEqual([])
    const older = CHANGELOG[CHANGELOG.length - 1]!.id
    expect(getUnseenEntries(older, true)).toHaveLength(CHANGELOG.length - 1)
    expect(getUnseenEntries('voce-rimossa', true)).toEqual([CHANGELOG[0]])
  })

  it('segnare come viste salva la voce più recente', () => {
    const storage = memory()
    expect(loadSeenChangelog(storage)).toBeNull()
    markChangelogSeen(storage)
    expect(loadSeenChangelog(storage)).toBe(getLatestChangelogId())
  })
})

import { describe, expect, it } from 'vitest'
import { createDefaultProgress, loadProgress, purchaseMetaUpgrade, recordRun, saveProgress, STORAGE_KEY } from './progression'
import type { KeyValueStorage, MetaProgress } from './progression'

function memoryStorage(initial?: string): KeyValueStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) { return key === STORAGE_KEY ? this.value : null },
    setItem(key, value) { if (key === STORAGE_KEY) this.value = value },
  }
}

function progressWithCores(cores: number): MetaProgress {
  return { ...createDefaultProgress(), cores }
}

describe('progressione permanente', () => {
  it('registra la run e conserva i record migliori', () => {
    const initial = { ...createDefaultProgress(), bestScore: 900, bestWave: 4 }
    const result = recordRun(initial, { score: 650, wave: 3, kills: 12, shards: 7, time: 95 })

    expect(result.cores).toBe(7)
    expect(result.bestScore).toBe(900)
    expect(result.bestWave).toBe(4)
    expect(result.totalKills).toBe(12)
    expect(result.runs).toBe(1)
  })

  it('acquista un livello e scala il costo successivo', () => {
    const first = purchaseMetaUpgrade(progressWithCores(30), 'power')
    const second = purchaseMetaUpgrade(first, 'power')

    expect(first.upgrades.power).toBe(1)
    expect(first.cores).toBe(22)
    expect(second.upgrades.power).toBe(2)
    expect(second.cores).toBe(4)
  })

  it('rifiuta acquisti senza fondi o oltre il livello massimo', () => {
    const poor = progressWithCores(2)
    expect(purchaseMetaUpgrade(poor, 'vitality')).toBe(poor)

    const maxed = progressWithCores(100)
    maxed.upgrades.vitality = 5
    expect(purchaseMetaUpgrade(maxed, 'vitality')).toBe(maxed)
  })

  it('mantiene una top 5 ordinata per ondata, punteggio e tempo', () => {
    let progress = createDefaultProgress()
    for (const result of [
      { score: 400, wave: 2, kills: 8, shards: 1, time: 80 },
      { score: 900, wave: 4, kills: 20, shards: 2, time: 150 },
      { score: 800, wave: 4, kills: 18, shards: 2, time: 130 },
      { score: 900, wave: 4, kills: 21, shards: 2, time: 140 },
      { score: 100, wave: 1, kills: 2, shards: 1, time: 40 },
      { score: 900, wave: 4, kills: 19, shards: 2, time: 120 },
    ]) progress = recordRun(progress, result)

    expect(progress.leaderboard).toHaveLength(5)
    expect(progress.leaderboard.map((entry) => entry.time)).toEqual([120, 140, 150, 130, 80])
    expect(progress.leaderboard.some((entry) => entry.wave === 1)).toBe(false)
  })

  it('salva e ricarica i dati', () => {
    const storage = memoryStorage()
    const progress = recordRun(progressWithCores(4), { score: 1200, wave: 5, kills: 20, shards: 9, time: 180 })
    saveProgress(storage, progress)

    expect(loadProgress(storage)).toEqual(progress)
  })

  it('recupera dati corrotti e limita valori non validi', () => {
    expect(loadProgress(memoryStorage('not json'))).toEqual(createDefaultProgress())

    const storage = memoryStorage(JSON.stringify({
      cores: -10,
      runs: 2.8,
      upgrades: { vitality: 99, power: 'invalid', mobility: 2 },
    }))
    const loaded = loadProgress(storage)
    expect(loaded.cores).toBe(0)
    expect(loaded.runs).toBe(2)
    expect(loaded.upgrades).toEqual({ vitality: 5, power: 0, mobility: 2 })
  })
})

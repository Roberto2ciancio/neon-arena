import type { LeaderboardEntry, MetaBonuses, RunResult } from './types'

export type MetaUpgradeId = 'vitality' | 'power' | 'mobility'

export interface MetaProgress {
  cores: number
  bestScore: number
  bestWave: number
  totalKills: number
  runs: number
  leaderboard: LeaderboardEntry[]
  upgrades: Record<MetaUpgradeId, number>
}

export interface KeyValueStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface MetaUpgradeDefinition {
  id: MetaUpgradeId
  name: string
  description: string
  icon: string
}

export const STORAGE_KEY = 'neon-arena:progress:v1'
export const MAX_META_LEVEL = 5
export const META_COSTS = [5, 12, 22, 35, 50] as const
export const META_UPGRADES: readonly MetaUpgradeDefinition[] = [
  { id: 'vitality', name: 'VITALITÀ', description: '+10 integrità iniziale per livello', icon: '⬡' },
  { id: 'power', name: 'POTENZA', description: '+5% danno iniziale per livello', icon: '⌁' },
  { id: 'mobility', name: 'MOBILITÀ', description: '+3% velocità iniziale per livello', icon: '»' },
]

export function createDefaultProgress(): MetaProgress {
  return {
    cores: 0,
    bestScore: 0,
    bestWave: 0,
    totalKills: 0,
    runs: 0,
    leaderboard: [],
    upgrades: { vitality: 0, power: 0, mobility: 0 },
  }
}

function safeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.floor(value)))
    : 0
}

function compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.wave - a.wave || b.score - a.score || a.time - b.time
}

function loadLeaderboard(value: unknown): LeaderboardEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const candidate = entry as Partial<LeaderboardEntry>
    return [{
      score: safeInteger(candidate.score),
      wave: safeInteger(candidate.wave),
      kills: safeInteger(candidate.kills),
      time: safeInteger(candidate.time),
      won: candidate.won === true,
    }]
  }).sort(compareLeaderboardEntries).slice(0, 5)
}

export function loadProgress(storage: KeyValueStorage): MetaProgress {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultProgress()

    const parsed = JSON.parse(raw) as Partial<MetaProgress>
    return {
      cores: safeInteger(parsed.cores),
      bestScore: safeInteger(parsed.bestScore),
      bestWave: safeInteger(parsed.bestWave),
      totalKills: safeInteger(parsed.totalKills),
      runs: safeInteger(parsed.runs),
      leaderboard: loadLeaderboard(parsed.leaderboard),
      upgrades: {
        vitality: safeInteger(parsed.upgrades?.vitality, MAX_META_LEVEL),
        power: safeInteger(parsed.upgrades?.power, MAX_META_LEVEL),
        mobility: safeInteger(parsed.upgrades?.mobility, MAX_META_LEVEL),
      },
    }
  } catch {
    return createDefaultProgress()
  }
}

export function saveProgress(storage: KeyValueStorage, progress: MetaProgress): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Il gioco resta utilizzabile anche se il browser blocca il salvataggio locale.
  }
}

export function recordRun(progress: MetaProgress, result: RunResult): MetaProgress {
  const entry: LeaderboardEntry = {
    score: safeInteger(result.score),
    wave: safeInteger(result.wave),
    kills: safeInteger(result.kills),
    time: safeInteger(result.time),
    won: result.won === true,
  }
  return {
    ...progress,
    leaderboard: [...progress.leaderboard, entry].sort(compareLeaderboardEntries).slice(0, 5),
    cores: progress.cores + safeInteger(result.shards),
    bestScore: Math.max(progress.bestScore, safeInteger(result.score)),
    bestWave: Math.max(progress.bestWave, safeInteger(result.wave)),
    totalKills: progress.totalKills + safeInteger(result.kills),
    runs: progress.runs + 1,
  }
}

export function purchaseMetaUpgrade(progress: MetaProgress, id: MetaUpgradeId): MetaProgress {
  const level = progress.upgrades[id]
  const cost = META_COSTS[level]
  if (cost === undefined || progress.cores < cost) return progress

  return {
    ...progress,
    cores: progress.cores - cost,
    upgrades: { ...progress.upgrades, [id]: level + 1 },
  }
}

export function getMetaBonuses(progress: MetaProgress): MetaBonuses {
  return { ...progress.upgrades }
}

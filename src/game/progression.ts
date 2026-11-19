import type { LeaderboardEntry, MetaBonuses, RunResult } from './types'

export type MetaUpgradeId = 'vitality' | 'power' | 'mobility'

/** Statistiche cumulative mostrate nel profilo. */
export interface PlayerStats {
  /** Secondi giocati in modalità Zombie. */
  playTime: number
  wins: number
  shardsEarned: number
  precisionHits: number
  bestKills: number
  tctMatches: number
  tctWins: number
  tctKills: number
  tctDeaths: number
}

/** Run recente nello storico del profilo (le più nuove per prime). */
export interface RunHistoryEntry {
  score: number
  wave: number
  kills: number
  time: number
  won: boolean
  map: string
  /** Momento della fine della run (millisecondi dall'epoca). */
  at: number
}

export const HISTORY_LIMIT = 10

export interface MetaProgress {
  cores: number
  bestScore: number
  bestWave: number
  totalKills: number
  runs: number
  leaderboard: LeaderboardEntry[]
  upgrades: Record<MetaUpgradeId, number>
  stats: PlayerStats
  history: RunHistoryEntry[]
}

export interface TctMatchRecord {
  kills: number
  deaths: number
  outcome: 'win' | 'loss' | 'draw'
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
export const META_COSTS = [8, 18, 32, 50, 75] as const
export const META_UPGRADES: readonly MetaUpgradeDefinition[] = [
  { id: 'vitality', name: 'VITALITÀ', description: '+6 integrità iniziale per livello', icon: '⬡' },
  { id: 'power', name: 'POTENZA', description: '+3% danno iniziale per livello', icon: '⌁' },
  { id: 'mobility', name: 'MOBILITÀ', description: '+2% velocità iniziale per livello', icon: '»' },
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
    stats: createDefaultStats(),
    history: [],
  }
}

export function createDefaultStats(): PlayerStats {
  return { playTime: 0, wins: 0, shardsEarned: 0, precisionHits: 0, bestKills: 0, tctMatches: 0, tctWins: 0, tctKills: 0, tctDeaths: 0 }
}

/** Statistiche lette da dati non affidabili (localStorage o database). */
export function normalizeStats(value: unknown): PlayerStats {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const stats = createDefaultStats()
  for (const key of Object.keys(stats) as (keyof PlayerStats)[]) stats[key] = safeInteger(source[key])
  return stats
}

export function normalizeHistory(value: unknown): RunHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): RunHistoryEntry[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    return [{
      score: safeInteger(row.score),
      wave: safeInteger(row.wave, 15),
      kills: safeInteger(row.kills),
      time: safeInteger(row.time),
      won: row.won === true,
      map: typeof row.map === 'string' ? row.map.slice(0, 32) : '',
      at: safeInteger(row.at),
    }]
  }).sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT)
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
      stats: normalizeStats(parsed.stats),
      history: normalizeHistory(parsed.history),
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

export function recordRun(progress: MetaProgress, result: RunResult, at = Date.now()): MetaProgress {
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
    stats: {
      ...progress.stats,
      playTime: progress.stats.playTime + entry.time,
      wins: progress.stats.wins + (entry.won ? 1 : 0),
      shardsEarned: progress.stats.shardsEarned + safeInteger(result.shards),
      precisionHits: progress.stats.precisionHits + safeInteger(result.precisionHits),
      bestKills: Math.max(progress.stats.bestKills, entry.kills),
    },
    history: [{ ...entry, map: result.map ?? '', at }, ...progress.history].slice(0, HISTORY_LIMIT),
  }
}

/** Registra una partita TCT nelle statistiche del profilo. */
export function recordTctMatch(progress: MetaProgress, match: TctMatchRecord): MetaProgress {
  return {
    ...progress,
    stats: {
      ...progress.stats,
      tctMatches: progress.stats.tctMatches + 1,
      tctWins: progress.stats.tctWins + (match.outcome === 'win' ? 1 : 0),
      tctKills: progress.stats.tctKills + safeInteger(match.kills),
      tctDeaths: progress.stats.tctDeaths + safeInteger(match.deaths),
    },
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

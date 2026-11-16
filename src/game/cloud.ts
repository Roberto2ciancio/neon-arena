import { normalizeCallsign } from './identity'
import type { PlayerIdentity } from './identity'
import type { MetaProgress } from './progression'
import type { LeaderboardEntry, RunResult } from './types'

export interface OnlineLeaderboardEntry extends LeaderboardEntry {
  callsign: string
}

function safeNumber(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0
}

export class SupabaseCloud {
  private readonly baseUrl: string

  constructor(
    url: string,
    private readonly anonKey: string,
    // Wrapper: chiamare window.fetch come metodo di un altro oggetto lancia "Illegal invocation".
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    this.baseUrl = url.replace(/\/$/, '')
  }

  async loadProfile(identity: PlayerIdentity): Promise<MetaProgress | null> {
    const rows = await this.request<Record<string, unknown>[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(identity.id)}&select=*&limit=1`)
    const row = rows[0]
    if (!row) return null
    const upgrades = typeof row.upgrades === 'object' && row.upgrades !== null ? row.upgrades as Record<string, unknown> : {}
    return {
      cores: safeNumber(row.cores),
      bestScore: safeNumber(row.best_score),
      bestWave: safeNumber(row.best_wave),
      totalKills: safeNumber(row.total_kills),
      runs: safeNumber(row.runs),
      leaderboard: [],
      upgrades: {
        vitality: safeNumber(upgrades.vitality, 5),
        power: safeNumber(upgrades.power, 5),
        mobility: safeNumber(upgrades.mobility, 5),
      },
    }
  }

  async saveProfile(identity: PlayerIdentity, progress: MetaProgress): Promise<void> {
    await this.request('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: identity.id,
        callsign: normalizeCallsign(identity.callsign),
        cores: progress.cores,
        best_score: progress.bestScore,
        best_wave: progress.bestWave,
        total_kills: progress.totalKills,
        runs: progress.runs,
        upgrades: progress.upgrades,
      }),
    })
  }

  async submitRun(identity: PlayerIdentity, result: RunResult): Promise<void> {
    await this.request('/rest/v1/leaderboard', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        player_id: identity.id,
        callsign: normalizeCallsign(identity.callsign),
        score: safeNumber(result.score),
        wave: safeNumber(result.wave),
        kills: safeNumber(result.kills),
        time_seconds: safeNumber(result.time),
        won: result.won === true,
      }),
    })
  }

  async getLeaderboard(): Promise<OnlineLeaderboardEntry[]> {
    const rows = await this.request<Record<string, unknown>[]>('/rest/v1/leaderboard?select=callsign,score,wave,kills,time_seconds,won&order=wave.desc,score.desc,time_seconds.asc&limit=5')
    return rows.map((row) => ({
      callsign: normalizeCallsign(row.callsign),
      score: safeNumber(row.score),
      wave: safeNumber(row.wave),
      kills: safeNumber(row.kills),
      time: safeNumber(row.time_seconds),
      won: row.won === true,
    }))
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    if (!response.ok) throw new Error(`Supabase: ${response.status}`)
    if (response.status === 204 || init.method === 'POST') return undefined as T
    return await response.json() as Promise<T>
  }
}

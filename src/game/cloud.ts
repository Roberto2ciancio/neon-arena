import { normalizeCallsign } from './identity'
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

  /**
   * Invia una run alla classifica online a nome dell'account. Il database accetta solo run
   * dell'utente autenticato e rifiuta quelle non plausibili (vedi supabase/schema.sql).
   */
  async submitRun(account: { accessToken: string; userId: string }, callsign: string, result: RunResult): Promise<void> {
    await this.request('/rest/v1/leaderboard', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({
        player_id: account.userId,
        callsign: normalizeCallsign(callsign),
        score: safeNumber(result.score),
        wave: safeNumber(result.wave, 15),
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

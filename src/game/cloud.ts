import { normalizeCallsign } from './identity'
import type { LeaderboardCategory } from './leaderboardView'
import type { RunResult } from './types'

function safeNumber(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0
}

function safeDecimal(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? Math.max(0, number) : 0
}

const ID_PATTERN = /^[a-z0-9-]{1,24}$/

function safeId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null
}

/**
 * Uccisioni per arma pronte per il database: solo id validi, interi, al massimo 12 armi (le più
 * usate) e mai più delle eliminazioni totali (stesse regole di `valid_weapon_kills`).
 */
export function sanitizeWeaponKills(source: Partial<Record<string, number>> | undefined, maxTotal: number): Record<string, number> {
  const entries = Object.entries(source ?? {})
    .map(([id, kills]) => [id, safeNumber(kills, 999_999)] as const)
    .filter(([id, kills]) => ID_PATTERN.test(id) && kills > 0)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 12)
  const result: Record<string, number> = {}
  let remaining = Math.max(0, Math.floor(maxTotal))
  for (const [id, kills] of entries) {
    const value = Math.min(kills, remaining)
    if (value <= 0) break
    result[id] = value
    remaining -= value
  }
  return result
}

export interface AccountToken {
  accessToken: string
  userId: string
}

export interface TctMatchSubmission {
  kills: number
  deaths: number
  outcome: 'win' | 'loss' | 'draw'
  duration?: number
  mapId?: string
  weaponKills?: Partial<Record<string, number>>
}

export interface GlobalLeaderboardQuery {
  category: LeaderboardCategory
  period?: 'all' | 'week'
  map?: string | null
  mode?: 'solo' | 'coop' | null
  weapon?: string | null
  limit?: number
}

export interface GlobalLeaderboardRow {
  rank: number
  username: string
  prestige: number
  value: number
  games: number
  isMe: boolean
}

export interface WeaponUsageRow {
  weaponId: string
  kills: number
  players: number
}

export interface PublicProfile {
  username: string
  prestige: number
  level: number
  zombie: { runs: number; wins: number; bestScore: number; bestWave: number; averageWave: number; kills: number; bestCombo: number; precisionHits: number; playTime: number }
  tct: { matches: number; wins: number; kills: number; deaths: number }
  recent: { score: number; wave: number; kills: number; time: number; won: boolean; map: string | null; combo: number }[]
  weapons: { id: string; kills: number }[]
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

export function parsePublicProfile(raw: unknown): PublicProfile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const data = record(raw)
  if (typeof data.username !== 'string') return null
  const zombie = record(data.zombie)
  const tct = record(data.tct)
  return {
    username: data.username,
    prestige: safeNumber(data.prestige, 10),
    level: Math.max(1, safeNumber(data.level, 50)),
    zombie: {
      runs: safeNumber(zombie.runs),
      wins: safeNumber(zombie.wins),
      bestScore: safeNumber(zombie.bestScore),
      bestWave: safeNumber(zombie.bestWave, 15),
      averageWave: safeDecimal(zombie.averageWave),
      kills: safeNumber(zombie.kills),
      bestCombo: safeNumber(zombie.bestCombo),
      precisionHits: safeNumber(zombie.precisionHits),
      playTime: safeNumber(zombie.playTime),
    },
    tct: { matches: safeNumber(tct.matches), wins: safeNumber(tct.wins), kills: safeNumber(tct.kills), deaths: safeNumber(tct.deaths) },
    recent: (Array.isArray(data.recent) ? data.recent : []).slice(0, 10).map((entry) => {
      const run = record(entry)
      return { score: safeNumber(run.score), wave: safeNumber(run.wave, 15), kills: safeNumber(run.kills), time: safeNumber(run.time), won: run.won === true, map: safeId(run.map), combo: safeNumber(run.combo) }
    }),
    weapons: (Array.isArray(data.weapons) ? data.weapons : []).slice(0, 3).flatMap((entry) => {
      const weapon = record(entry)
      const id = safeId(weapon.id)
      return id ? [{ id, kills: safeNumber(weapon.kills) }] : []
    }),
  }
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
  async submitRun(account: AccountToken, callsign: string, result: RunResult): Promise<void> {
    const kills = safeNumber(result.kills)
    const mapId = safeId(result.mapId)
    await this.request('/rest/v1/leaderboard', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({
        player_id: account.userId,
        callsign: normalizeCallsign(callsign),
        score: safeNumber(result.score),
        wave: safeNumber(result.wave, 15),
        kills,
        time_seconds: safeNumber(result.time),
        won: result.won === true,
        best_combo: Math.min(kills, safeNumber(result.bestCombo)),
        precision_hits: safeNumber(result.precisionHits),
        players: Math.max(1, safeNumber(result.players ?? 1, 4)),
        weapon_kills: sanitizeWeaponKills(result.weaponKills, kills),
        ...(mapId ? { map: mapId } : {}),
      }),
    })
  }

  /** Partita TCT dell'account (valori controllati dal database, vedi `validate_tct_match`). */
  async submitTctMatch(account: AccountToken, match: TctMatchSubmission): Promise<void> {
    const kills = safeNumber(match.kills, 30)
    const mapId = safeId(match.mapId)
    await this.request('/rest/v1/tct_matches', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({
        player_id: account.userId,
        kills,
        deaths: safeNumber(match.deaths, 40),
        outcome: match.outcome,
        duration_seconds: safeNumber(match.duration ?? 0, 300),
        weapon_kills: sanitizeWeaponKills(match.weaponKills, kills),
        ...(mapId ? { map: mapId } : {}),
      }),
    })
  }

  /** Classifica globale: prime posizioni più la riga dell'account che la chiede. */
  async getGlobalLeaderboard(query: GlobalLeaderboardQuery, accessToken?: string): Promise<GlobalLeaderboardRow[]> {
    const rows = await this.rpc<Record<string, unknown>[]>('get_leaderboard', {
      p_category: query.category,
      p_period: query.period ?? 'all',
      p_map: query.map ?? null,
      p_mode: query.mode ?? null,
      p_weapon: query.weapon ?? null,
      p_limit: query.limit ?? 100,
    }, accessToken)
    return (Array.isArray(rows) ? rows : []).flatMap((row) => typeof row.username === 'string' ? [{
      rank: Math.max(1, safeNumber(row.rank)),
      username: normalizeCallsign(row.username),
      prestige: safeNumber(row.prestige, 10),
      value: safeDecimal(row.value),
      games: safeNumber(row.games),
      isMe: row.is_me === true,
    }] : [])
  }

  async getWeaponUsage(period: 'all' | 'week' = 'all'): Promise<WeaponUsageRow[]> {
    const rows = await this.rpc<Record<string, unknown>[]>('get_weapon_usage', { p_period: period })
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const weaponId = safeId(row.weapon_id)
      return weaponId ? [{ weaponId, kills: safeNumber(row.kills), players: safeNumber(row.players) }] : []
    })
  }

  async getPublicProfile(username: string, accessToken?: string): Promise<PublicProfile | null> {
    return parsePublicProfile(await this.rpc<unknown>('get_public_profile', { p_username: username }, accessToken))
  }

  /** Vero se l'account ha scelto di non comparire nelle classifiche. */
  async getHidden(account: AccountToken): Promise<boolean> {
    const rows = await this.request<Record<string, unknown>[]>(`/rest/v1/leaderboard_privacy?select=hidden&user_id=eq.${encodeURIComponent(account.userId)}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    })
    return Array.isArray(rows) && rows[0]?.hidden === true
  }

  async setHidden(account: AccountToken, hidden: boolean): Promise<void> {
    await this.request('/rest/v1/leaderboard_privacy?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal', Authorization: `Bearer ${account.accessToken}` },
      body: JSON.stringify({ user_id: account.userId, hidden, updated_at: new Date().toISOString() }),
    })
  }

  private async rpc<T>(name: string, body: Record<string, unknown>, accessToken?: string): Promise<T> {
    return await this.request<T>(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    }, true)
  }

  private async request<T>(path: string, init: RequestInit = {}, expectBody = false): Promise<T> {
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
    if (response.status === 204 || (init.method === 'POST' && !expectBody)) return undefined as T
    return await response.json() as Promise<T>
  }
}

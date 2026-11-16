import { normalizeArmory } from './armory'
import type { ArmoryState } from './armory'
import type { SupabaseAuth } from './auth'
import { normalizeCallsign } from './identity'
import { createDefaultProgress, HISTORY_LIMIT, normalizeHistory, normalizeStats } from './progression'
import type { MetaProgress, PlayerStats } from './progression'
import type { LeaderboardEntry } from './types'

/** Tutto ciò che un account conserva fra dispositivi. */
export interface PlayerSave {
  callsign: string
  progress: MetaProgress
  armory: ArmoryState
}

function safeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0
}

export function normalizeProgress(value: unknown): MetaProgress {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const upgrades = typeof source.upgrades === 'object' && source.upgrades !== null ? source.upgrades as Record<string, unknown> : {}
  const leaderboard = Array.isArray(source.leaderboard) ? source.leaderboard : []
  const base = createDefaultProgress()
  return {
    cores: safeInteger(source.cores),
    bestScore: safeInteger(source.bestScore),
    bestWave: safeInteger(source.bestWave, 15),
    totalKills: safeInteger(source.totalKills),
    runs: safeInteger(source.runs),
    leaderboard: leaderboard.flatMap((entry): LeaderboardEntry[] => {
      if (typeof entry !== 'object' || entry === null) return []
      const row = entry as Record<string, unknown>
      return [{ score: safeInteger(row.score), wave: safeInteger(row.wave, 15), kills: safeInteger(row.kills), time: safeInteger(row.time), won: row.won === true }]
    }).slice(0, 5),
    upgrades: {
      vitality: Math.min(5, safeInteger(upgrades.vitality ?? base.upgrades.vitality)),
      power: Math.min(5, safeInteger(upgrades.power ?? base.upgrades.power)),
      mobility: Math.min(5, safeInteger(upgrades.mobility ?? base.upgrades.mobility)),
    },
    stats: normalizeStats(source.stats),
    history: normalizeHistory(source.history),
  }
}

function rankArmory(state: ArmoryState): number {
  return state.level * 1_000_000 + state.xp
}

/**
 * Unisce il profilo locale (ospite o dispositivo) con quello dell'account senza far perdere
 * progressi: record e contatori prendono il massimo, l'armeria quella più avanzata.
 */
export function mergeSaves(local: PlayerSave, remote: PlayerSave | null): PlayerSave {
  if (!remote) return local
  const leaderboard = [...local.progress.leaderboard, ...remote.progress.leaderboard]
    .sort((a, b) => b.wave - a.wave || b.score - a.score || a.time - b.time)
    .filter((entry, index, all) => index === all.findIndex((other) => other.score === entry.score && other.wave === entry.wave && other.time === entry.time && other.kills === entry.kills))
    .slice(0, 5)
  const progress: MetaProgress = {
    cores: Math.max(local.progress.cores, remote.progress.cores),
    bestScore: Math.max(local.progress.bestScore, remote.progress.bestScore),
    bestWave: Math.max(local.progress.bestWave, remote.progress.bestWave),
    totalKills: Math.max(local.progress.totalKills, remote.progress.totalKills),
    runs: Math.max(local.progress.runs, remote.progress.runs),
    leaderboard,
    upgrades: {
      vitality: Math.max(local.progress.upgrades.vitality, remote.progress.upgrades.vitality),
      power: Math.max(local.progress.upgrades.power, remote.progress.upgrades.power),
      mobility: Math.max(local.progress.upgrades.mobility, remote.progress.upgrades.mobility),
    },
    // Contatori: il massimo dei due, come per record e run (lo stesso profilo può esistere su più dispositivi).
    stats: Object.fromEntries(Object.keys(local.progress.stats).map((key) => [key, Math.max(local.progress.stats[key as keyof PlayerStats], remote.progress.stats[key as keyof PlayerStats])])) as unknown as PlayerStats,
    history: [...local.progress.history, ...remote.progress.history]
      .filter((entry, index, all) => index === all.findIndex((other) => other.at === entry.at && other.score === entry.score))
      .sort((a, b) => b.at - a.at)
      .slice(0, HISTORY_LIMIT),
  }
  const armory = rankArmory(remote.armory) >= rankArmory(local.armory) ? remote.armory : local.armory
  const callsign = remote.callsign !== 'PLAYER' ? remote.callsign : local.callsign
  return { callsign, progress, armory }
}

export function normalizeSave(row: Record<string, unknown>): PlayerSave {
  return {
    callsign: normalizeCallsign(row.callsign),
    progress: normalizeProgress(row.progress),
    armory: normalizeArmory(row.armory),
  }
}

/** Lettura e scrittura del salvataggio dell'account nella tabella `player_saves` (RLS per utente). */
export class AccountSaves {
  constructor(
    private readonly auth: SupabaseAuth,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async load(): Promise<PlayerSave | null> {
    const session = await this.auth.getValidSession()
    if (!session) throw new Error('Sessione scaduta')
    const response = await this.fetcher(`${this.auth.url}/rest/v1/player_saves?user_id=eq.${encodeURIComponent(session.user.id)}&select=callsign,progress,armory&limit=1`, {
      headers: this.auth.headers(session.accessToken),
    })
    if (!response.ok) throw new Error(`Supabase: ${response.status}`)
    const rows = await response.json() as Record<string, unknown>[]
    return rows[0] ? normalizeSave(rows[0]) : null
  }

  async save(data: PlayerSave): Promise<void> {
    const session = await this.auth.getValidSession()
    if (!session) throw new Error('Sessione scaduta')
    const response = await this.fetcher(`${this.auth.url}/rest/v1/player_saves`, {
      method: 'POST',
      headers: { ...this.auth.headers(session.accessToken), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: session.user.id,
        callsign: normalizeCallsign(data.callsign),
        progress: data.progress,
        armory: data.armory,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!response.ok) throw new Error(`Supabase: ${response.status}`)
  }
}

import { describe, expect, it, vi } from 'vitest'
import { parsePublicProfile, sanitizeWeaponKills, SupabaseCloud } from './cloud'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('Supabase cloud', () => {
  it('invia una run con il token dell’account e le statistiche nuove', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    await cloud.submitRun({ accessToken: 'user-token', userId: 'user-1' }, 'ace!', {
      score: 500, wave: 3, kills: 10, shards: 2, time: 90, won: false,
      bestCombo: 14, precisionHits: 6, players: 2, mapId: 'district-zero', weaponKills: { 'ar-07': 7, 'p-9': 5 },
    })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/rest/v1/leaderboard')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer user-token')
    expect(headers.apikey).toBe('public-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      player_id: 'user-1', callsign: 'ACE', score: 500, wave: 3, kills: 10, time_seconds: 90, won: false,
      // La combo non può superare le eliminazioni, le armi nemmeno nella somma.
      best_combo: 10, precision_hits: 6, players: 2, map: 'district-zero', weapon_kills: { 'ar-07': 7, 'p-9': 3 },
    })
  })

  it('invia la partita TCT con durata, mappa e armi', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    await cloud.submitTctMatch({ accessToken: 't', userId: 'u' }, { kills: 8, deaths: 3, outcome: 'win', duration: 175.4, mapId: 'depot-06', weaponKills: { 'smg-9': 8 } })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/rest/v1/tct_matches')
    expect(JSON.parse(String(init?.body))).toEqual({ player_id: 'u', kills: 8, deaths: 3, outcome: 'win', duration_seconds: 175, map: 'depot-06', weapon_kills: { 'smg-9': 8 } })
  })

  it('legge la classifica globale tramite la funzione pubblica', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse([
      { rank: 1, username: 'Nova_7', prestige: 2, value: '1.85', games: 24, is_me: false },
      { rank: 7, username: 'ace', prestige: 0, value: 1.1, games: 12, is_me: true },
      { rank: 8, username: null, value: 1 },
    ]))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    const rows = await cloud.getGlobalLeaderboard({ category: 'kd', period: 'week' }, 'user-token')
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/get_leaderboard')
    expect(JSON.parse(String(init?.body))).toEqual({ p_category: 'kd', p_period: 'week', p_map: null, p_mode: null, p_weapon: null, p_limit: 100 })
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer user-token')
    expect(rows).toEqual([
      { rank: 1, username: 'NOVA_7', prestige: 2, value: 1.85, games: 24, isMe: false },
      { rank: 7, username: 'ACE', prestige: 0, value: 1.1, games: 12, isMe: true },
    ])
  })

  it('converte profilo pubblico e armi più usate scartando i valori strani', async () => {
    expect(parsePublicProfile(null)).toBeNull()
    const profile = parsePublicProfile({
      username: 'Nova_7', prestige: 99, level: 31,
      zombie: { runs: 12, wins: 1, bestScore: 9000, bestWave: 15, averageWave: '8.5', kills: 400, bestCombo: 22, precisionHits: 300, playTime: 7200 },
      tct: { matches: 14, wins: 9, kills: 120, deaths: 60 },
      recent: [{ score: 100, wave: 3, kills: 10, time: 60, won: false, map: 'DROP TABLE', combo: 4 }],
      weapons: [{ id: 'ar-07', kills: 200 }, { id: '<script>', kills: 3 }],
    })
    expect(profile?.prestige).toBe(10)
    expect(profile?.zombie.averageWave).toBe(8.5)
    expect(profile?.recent[0]?.map).toBeNull()
    expect(profile?.weapons).toEqual([{ id: 'ar-07', kills: 200 }])
    const cloud = new SupabaseCloud('https://example.supabase.co', 'k', vi.fn(async () => jsonResponse([{ weapon_id: 'ar-07', kills: 50, players: 3 }, { weapon_id: 'BAD ID', kills: 1, players: 1 }])))
    expect(await cloud.getWeaponUsage()).toEqual([{ weaponId: 'ar-07', kills: 50, players: 3 }])
  })

  it('limita le uccisioni per arma come il database', () => {
    const many = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`w-${index}`, 15 - index]))
    expect(Object.keys(sanitizeWeaponKills(many, 1000))).toHaveLength(12)
    expect(sanitizeWeaponKills({ 'ok-1': 5, 'NO': 3, 'zero': 0 }, 10)).toEqual({ 'ok-1': 5 })
    expect(sanitizeWeaponKills(undefined, 10)).toEqual({})
  })

  it('salva la scelta di nascondere il profilo con un upsert', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'k', fetcher)
    await cloud.setHidden({ accessToken: 't', userId: 'u' }, true)
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/rest/v1/leaderboard_privacy?on_conflict=user_id')
    expect((init?.headers as Record<string, string>).Prefer).toContain('merge-duplicates')
    expect(JSON.parse(String(init?.body))).toMatchObject({ user_id: 'u', hidden: true })
  })

  it('segnala errori HTTP per attivare il fallback locale', async () => {
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', vi.fn(async () => new Response(null, { status: 503 })))
    await expect(cloud.getGlobalLeaderboard({ category: 'score' })).rejects.toThrow('Supabase: 503')
  })
})

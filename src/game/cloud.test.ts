import { describe, expect, it, vi } from 'vitest'
import { SupabaseCloud } from './cloud'

describe('Supabase cloud', () => {
  it('invia una run con il token dell’account, non con la chiave pubblica', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    await cloud.submitRun({ accessToken: 'user-token', userId: 'user-1' }, 'ace!', { score: 500, wave: 3, kills: 10, shards: 2, time: 90, won: false })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://example.supabase.co/rest/v1/leaderboard')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer user-token')
    expect(headers.apikey).toBe('public-key')
    expect(JSON.parse(String(init?.body))).toEqual({ player_id: 'user-1', callsign: 'ACE', score: 500, wave: 3, kills: 10, time_seconds: 90, won: false })
  })

  it('ordina e converte la classifica online', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ callsign: 'ace!', score: 900, wave: 5, kills: 20, time_seconds: 120, won: true }]), { status: 200 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    expect(await cloud.getLeaderboard()).toEqual([{ callsign: 'ACE', score: 900, wave: 5, kills: 20, time: 120, won: true }])
  })

  it('segnala errori HTTP per attivare il fallback locale', async () => {
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', vi.fn(async () => new Response(null, { status: 503 })))
    await expect(cloud.getLeaderboard()).rejects.toThrow('Supabase: 503')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { SupabaseCloud } from './cloud'
import { createDefaultProgress } from './progression'

const identity = { id: '12345678-1234-1234-1234-123456789012', callsign: 'ACE' }

describe('Supabase cloud', () => {
  it('carica e converte un profilo remoto', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      cores: 12,
      best_score: 800,
      best_wave: 4,
      total_kills: 30,
      runs: 3,
      upgrades: { vitality: 2, power: 1, mobility: 0 },
    }]), { status: 200 }))
    const cloud = new SupabaseCloud('https://example.supabase.co/', 'public-key', fetcher)
    const profile = await cloud.loadProfile(identity)
    expect(profile?.cores).toBe(12)
    expect(profile?.upgrades.vitality).toBe(2)
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/rest/v1/profiles?id=eq.'), expect.objectContaining({ headers: expect.objectContaining({ apikey: 'public-key' }) }))
  })

  it('salva profilo e invia una run senza dipendenze esterne', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }))
    const cloud = new SupabaseCloud('https://example.supabase.co', 'public-key', fetcher)
    await cloud.saveProfile(identity, createDefaultProgress())
    await cloud.submitRun(identity, { score: 500, wave: 3, kills: 10, shards: 2, time: 90, won: false })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toContain('/rest/v1/leaderboard')
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

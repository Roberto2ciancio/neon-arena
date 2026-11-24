import { describe, expect, it } from 'vitest'
import { AccountSaves, mergeSaves, normalizeSave } from './accountSave'
import type { PlayerSave } from './accountSave'
import { createDefaultArmory, normalizeArmory } from './armory'
import { AUTH_STORAGE_KEY, AuthError, mapAuthError, parseAuthRedirect, SupabaseAuth } from './auth'
import { createDefaultProgress } from './progression'

function memoryStorage() {
  const data: Record<string, string> = {}
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value } }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const sessionBody = (token = 'access-1') => ({ access_token: token, refresh_token: `refresh-${token}`, expires_in: 3600, user: { id: 'user-1', email: 'nova@example.com' } })

describe('accesso con account', () => {
  it('accede, conserva la sessione e la ripristina al riavvio', async () => {
    const storage = memoryStorage()
    const calls: string[] = []
    const auth = new SupabaseAuth('https://demo.supabase.co/', 'anon', storage, async (input) => {
      calls.push(String(input))
      return jsonResponse(200, sessionBody())
    }, () => 1000)
    const session = await auth.signIn('nova@example.com', 'segreta1')
    expect(calls[0]).toBe('https://demo.supabase.co/auth/v1/token?grant_type=password')
    expect(session.user.email).toBe('nova@example.com')
    expect(new SupabaseAuth('https://demo.supabase.co', 'anon', storage).session?.accessToken).toBe('access-1')
  })

  it('rinnova il token in scadenza e si disconnette se il rinnovo viene rifiutato', async () => {
    const storage = memoryStorage()
    let now = 0
    let refuse = false
    const auth = new SupabaseAuth('https://demo.supabase.co', 'anon', storage, async (input) => {
      if (String(input).includes('refresh_token')) return refuse ? jsonResponse(400, { error_code: 'refresh_token_not_found' }) : jsonResponse(200, sessionBody('access-2'))
      return jsonResponse(200, sessionBody())
    }, () => now)
    await auth.signIn('nova@example.com', 'segreta1')
    now = 3_590_000
    expect((await auth.getValidSession())?.accessToken).toBe('access-2')
    now += 3_590_000
    refuse = true
    expect(await auth.getValidSession()).toBeNull()
    expect(storage.data[AUTH_STORAGE_KEY]).toBe('null')
  })

  it('traduce gli errori di Supabase in messaggi chiari', async () => {
    expect(mapAuthError(400, { error_code: 'invalid_credentials' })).toBe('invalid-credentials')
    expect(mapAuthError(422, { error_code: 'user_already_exists' })).toBe('email-taken')
    expect(mapAuthError(422, { error_code: 'weak_password' })).toBe('weak-password')
    expect(mapAuthError(400, { error_code: 'email_not_confirmed' })).toBe('email-not-confirmed')
    expect(mapAuthError(429, {})).toBe('rate-limited')
    const auth = new SupabaseAuth('https://demo.supabase.co', 'anon', memoryStorage(), async () => { throw new TypeError('offline') })
    await expect(auth.signIn('nova@example.com', 'segreta1')).rejects.toMatchObject({ code: 'network' })
    await expect(auth.signUp('non-una-email', 'segreta1')).rejects.toBeInstanceOf(AuthError)
    await expect(auth.signUp('nova@example.com', '123')).rejects.toMatchObject({ code: 'weak-password' })
  })

  it('segnala quando la registrazione richiede la conferma dell’email', async () => {
    const auth = new SupabaseAuth('https://demo.supabase.co', 'anon', memoryStorage(), async () => jsonResponse(200, { id: 'user-1', email: 'nova@example.com' }))
    const result = await auth.signUp('nova@example.com', 'segreta1')
    expect(result.needsConfirmation).toBe(true)
    expect(auth.session).toBeNull()
  })
})

describe('gestione dell’account', () => {
  type Call = { url: string; method: string; body: string | undefined; auth: string | undefined }
  function recordingAuth(respond: (call: Call) => Response = () => jsonResponse(200, sessionBody())) {
    const calls: Call[] = []
    const storage = memoryStorage()
    const auth = new SupabaseAuth('https://demo.supabase.co', 'anon', storage, async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined, auth: headers.Authorization }
      calls.push(call)
      return respond(call)
    }, () => 1000)
    return { auth, calls, storage }
  }

  it('legge i link email di Supabase e ignora gli altri frammenti', () => {
    expect(parseAuthRedirect('#access_token=a&refresh_token=r&expires_in=600&type=recovery')).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 600, type: 'recovery' })
    expect(parseAuthRedirect('#access_token=a&refresh_token=r&type=strano')).toMatchObject({ type: null, expiresIn: 3600 })
    expect(parseAuthRedirect('#error=access_denied&error_code=otp_expired')).toEqual({ error: 'link-expired' })
    expect(parseAuthRedirect('#sezione')).toBeNull()
    expect(parseAuthRedirect('')).toBeNull()
  })

  it('chiede il link di recupero con l’indirizzo di ritorno', async () => {
    const { auth, calls } = recordingAuth(() => jsonResponse(200, {}))
    await auth.requestPasswordReset(' nova@example.com ', 'https://gioco.example/neon/')
    expect(calls[0]!.url).toBe('https://demo.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fgioco.example%2Fneon%2F')
    expect(JSON.parse(calls[0]!.body!)).toEqual({ email: 'nova@example.com' })
    await expect(auth.requestPasswordReset('non-email', 'x')).rejects.toMatchObject({ code: 'invalid-email' })
  })

  it('completa l’accesso dal link di recupero e salva la nuova password', async () => {
    const { auth, calls, storage } = recordingAuth((call) => call.url.endsWith('/auth/v1/user') && call.method === 'GET'
      ? jsonResponse(200, { id: 'user-1', email: 'nova@example.com' })
      : jsonResponse(200, { id: 'user-1' }))
    const result = await auth.completeRedirect('#access_token=tok&refresh_token=ref&expires_in=3600&type=recovery')
    expect(result).toEqual({ type: 'recovery', error: null })
    expect(calls[0]!.auth).toBe('Bearer tok')
    expect(JSON.parse(storage.data[AUTH_STORAGE_KEY]!).user.email).toBe('nova@example.com')
    await auth.updatePassword('nuova-segreta')
    expect(calls[1]).toMatchObject({ url: 'https://demo.supabase.co/auth/v1/user', method: 'PUT', auth: 'Bearer tok' })
    await expect(auth.updatePassword('123')).rejects.toMatchObject({ code: 'weak-password' })
  })

  it('segnala un link scaduto senza salvare la sessione', async () => {
    const { auth } = recordingAuth(() => jsonResponse(401, { msg: 'invalid JWT' }))
    expect(await auth.completeRedirect('#error=access_denied&error_code=otp_expired')).toEqual({ type: null, error: 'link-expired' })
    expect(await auth.completeRedirect('#access_token=tok&refresh_token=ref&type=recovery')).toEqual({ type: 'recovery', error: 'link-expired' })
    expect(auth.session).toBeNull()
  })

  it('cambia email solo da connesso e verso un indirizzo diverso', async () => {
    const { auth, calls } = recordingAuth()
    await expect(auth.requestEmailChange('altra@example.com', 'https://x/')).rejects.toMatchObject({ code: 'signed-out' })
    await auth.signIn('nova@example.com', 'segreta1')
    await expect(auth.requestEmailChange('NOVA@example.com', 'https://x/')).rejects.toMatchObject({ code: 'same-email' })
    await auth.requestEmailChange('altra@example.com', 'https://x/')
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', auth: 'Bearer access-1' })
    expect(calls.at(-1)!.url).toBe('https://demo.supabase.co/auth/v1/user?redirect_to=https%3A%2F%2Fx%2F')
  })

  it('elimina l’account con la funzione del database e disconnette', async () => {
    const { auth, calls, storage } = recordingAuth((call) => call.url.includes('/rpc/') ? new Response(null, { status: 204 }) : jsonResponse(200, sessionBody()))
    await auth.signIn('nova@example.com', 'segreta1')
    await auth.deleteAccount()
    expect(calls.at(-1)).toMatchObject({ url: 'https://demo.supabase.co/rest/v1/rpc/delete_my_account', method: 'POST', auth: 'Bearer access-1' })
    expect(auth.session).toBeNull()
    expect(storage.data[AUTH_STORAGE_KEY]).toBe('null')
  })

  it('non disconnette se l’eliminazione fallisce', async () => {
    const { auth } = recordingAuth((call) => call.url.includes('/rpc/') ? jsonResponse(500, { message: 'errore' }) : jsonResponse(200, sessionBody()))
    await auth.signIn('nova@example.com', 'segreta1')
    await expect(auth.deleteAccount()).rejects.toBeInstanceOf(AuthError)
    expect(auth.session).not.toBeNull()
  })
})

describe('salvataggi dell’account', () => {
  const local: PlayerSave = {
    callsign: 'NOVA',
    progress: { ...createDefaultProgress(), cores: 12, bestWave: 4, runs: 3, upgrades: { vitality: 2, power: 0, mobility: 1 }, leaderboard: [{ score: 500, wave: 4, kills: 20, time: 300, won: false }] },
    armory: normalizeArmory({ level: 3, xp: 50 }),
  }

  it('unisce ospite e account senza perdere progressi', () => {
    const remote: PlayerSave = {
      callsign: 'PLAYER',
      progress: { ...createDefaultProgress(), cores: 5, bestWave: 9, runs: 10, upgrades: { vitality: 1, power: 3, mobility: 0 }, leaderboard: [{ score: 2000, wave: 9, kills: 80, time: 900, won: false }] },
      armory: normalizeArmory({ level: 7, xp: 10 }),
    }
    const merged = mergeSaves(local, remote)
    expect(merged.callsign).toBe('NOVA')
    expect(merged.progress).toMatchObject({ cores: 12, bestWave: 9, runs: 10, upgrades: { vitality: 2, power: 3, mobility: 1 } })
    expect(merged.progress.leaderboard.map((entry) => entry.wave)).toEqual([9, 4])
    expect(merged.armory.level).toBe(7)
    expect(mergeSaves(local, null)).toBe(local)
  })

  it('normalizza righe corrotte del database', () => {
    const save = normalizeSave({ callsign: 'x!', progress: { cores: -4, bestWave: 99, upgrades: { power: 50 } }, armory: 'boh' })
    expect(save.callsign).toBe('X')
    expect(save.progress.cores).toBe(0)
    expect(save.progress.bestWave).toBe(15)
    expect(save.progress.upgrades.power).toBe(5)
    expect(save.armory).toEqual(createDefaultArmory())
  })

  it('legge e scrive il salvataggio con il token dell’utente', async () => {
    const storage = memoryStorage()
    const requests: { url: string; init?: RequestInit }[] = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (String(input).includes('/auth/v1/')) return jsonResponse(200, sessionBody())
      if (init?.method === 'POST') return new Response(null, { status: 201 })
      return jsonResponse(200, [{ callsign: 'NOVA', progress: local.progress, armory: local.armory }])
    }) as typeof fetch
    const auth = new SupabaseAuth('https://demo.supabase.co', 'anon', storage, fetcher, () => 0)
    await auth.signIn('nova@example.com', 'segreta1')
    const saves = new AccountSaves(auth, fetcher)
    expect((await saves.load())?.callsign).toBe('NOVA')
    await saves.save(local)
    const write = requests.at(-1)!
    expect(write.url).toBe('https://demo.supabase.co/rest/v1/player_saves')
    expect((write.init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
    expect(JSON.parse(String(write.init?.body))).toMatchObject({ user_id: 'user-1', callsign: 'NOVA' })
  })
})

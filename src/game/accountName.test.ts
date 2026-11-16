import { describe, expect, it, vi } from 'vitest'
import { AccountNames, checkUsername, UsernameError } from './accountName'
import { SupabaseAuth } from './auth'

function signedInAuth(): SupabaseAuth {
  const storage = new Map<string, string>()
  storage.set('neon-arena:auth:v1', JSON.stringify({ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 3_600_000, user: { id: 'user-1', email: 'nova@example.com' } }))
  return new SupabaseAuth('https://demo.supabase.co', 'anon', { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) })
}

describe('nome utente', () => {
  it('valida lunghezza e caratteri come il database', () => {
    expect(checkUsername('Nova_7')).toBeNull()
    expect(checkUsername('ab')).toBe('too-short')
    expect(checkUsername('nome_troppo_lungo')).toBe('too-long')
    expect(checkUsername('con spazio')).toBe('invalid-characters')
    expect(checkUsername('àccento')).toBe('invalid-characters')
  })

  it('rivendica il nome con il token dell’account', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 }))
    const names = new AccountNames(signedInAuth(), fetcher)
    await expect(names.claim(' Nova_7 ')).resolves.toBe('Nova_7')
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toContain('/rest/v1/accounts?on_conflict=user_id')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token')
    expect(JSON.parse(String(init?.body))).toMatchObject({ user_id: 'user-1', username: 'Nova_7' })
  })

  it('segnala un nome già preso e non invia nomi non validi', async () => {
    const taken = new AccountNames(signedInAuth(), vi.fn(async () => new Response('{}', { status: 409 })))
    await expect(taken.claim('Ombra')).rejects.toMatchObject({ code: 'taken' })
    const fetcher = vi.fn()
    await expect(new AccountNames(signedInAuth(), fetcher).claim('a b')).rejects.toBeInstanceOf(UsernameError)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('legge il nome salvato o null se non è ancora stato scelto', async () => {
    const names = new AccountNames(signedInAuth(), vi.fn(async () => new Response(JSON.stringify([{ username: 'Nova' }]), { status: 200 })))
    expect(await names.load()).toBe('Nova')
    const empty = new AccountNames(signedInAuth(), vi.fn(async () => new Response('[]', { status: 200 })))
    expect(await empty.load()).toBeNull()
  })
})

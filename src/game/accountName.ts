import type { SupabaseAuth } from './auth'

/** Stesse regole del vincolo nel database (`public.accounts`). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,12}$/

export type UsernameProblem = 'too-short' | 'too-long' | 'invalid-characters' | null

export const USERNAME_MESSAGES: Record<Exclude<UsernameProblem, null> | 'taken' | 'network', string> = {
  'too-short': 'Il nome utente deve avere almeno 3 caratteri.',
  'too-long': 'Il nome utente può avere al massimo 12 caratteri.',
  'invalid-characters': 'Usa solo lettere, numeri e trattino basso (_), senza spazi.',
  taken: 'Questo nome utente è già preso: scegline un altro.',
  network: 'Impossibile salvare il nome utente adesso: riprova fra poco.',
}

export function checkUsername(value: string): UsernameProblem {
  const name = value.trim()
  if (name.length < 3) return 'too-short'
  if (name.length > 12) return 'too-long'
  return USERNAME_PATTERN.test(name) ? null : 'invalid-characters'
}

export class UsernameError extends Error {
  constructor(readonly code: keyof typeof USERNAME_MESSAGES) {
    super(USERNAME_MESSAGES[code])
  }
}

/** Nome utente dell'account nella tabella `accounts` (RLS: ognuno vede e modifica solo il proprio). */
export class AccountNames {
  constructor(
    private readonly auth: SupabaseAuth,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async load(): Promise<string | null> {
    const session = await this.auth.getValidSession()
    if (!session) throw new UsernameError('network')
    const response = await this.fetcher(`${this.auth.url}/rest/v1/accounts?user_id=eq.${encodeURIComponent(session.user.id)}&select=username&limit=1`, {
      headers: this.auth.headers(session.accessToken),
    })
    if (!response.ok) throw new UsernameError('network')
    const rows = await response.json() as { username?: unknown }[]
    return typeof rows[0]?.username === 'string' ? rows[0].username : null
  }

  /** Crea o cambia il nome utente. L'indice unico del database rifiuta i nomi già presi (409). */
  async claim(value: string): Promise<string> {
    const username = value.trim()
    const problem = checkUsername(username)
    if (problem) throw new UsernameError(problem)
    const session = await this.auth.getValidSession()
    if (!session) throw new UsernameError('network')
    let response: Response
    try {
      response = await this.fetcher(`${this.auth.url}/rest/v1/accounts?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...this.auth.headers(session.accessToken), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: session.user.id, username, updated_at: new Date().toISOString() }),
      })
    } catch {
      throw new UsernameError('network')
    }
    if (response.status === 409) throw new UsernameError('taken')
    if (!response.ok) throw new UsernameError('network')
    return username
  }
}

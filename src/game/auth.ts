import type { KeyValueStorage } from './progression'

export const AUTH_STORAGE_KEY = 'neon-arena:auth:v1'
const REFRESH_MARGIN_MS = 60_000

export interface AuthUser {
  id: string
  email: string
  /** Nome utente scelto alla registrazione (metadati), rivendicato al primo accesso. */
  username?: string
}

function metadataUsername(user: Record<string, unknown>): string | undefined {
  const metadata = (user.user_metadata ?? user.username) as Record<string, unknown> | string | undefined
  if (typeof metadata === 'string') return metadata
  return typeof metadata?.username === 'string' ? metadata.username : undefined
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  /** Scadenza del token di accesso (ms epoch). */
  expiresAt: number
  user: AuthUser
}

export type AuthErrorCode = 'invalid-credentials' | 'email-taken' | 'weak-password' | 'invalid-email' | 'email-not-confirmed' | 'rate-limited' | 'network' | 'unavailable'

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-credentials': 'Email o password non corretti.',
  'email-taken': 'Esiste già un account con questa email: accedi.',
  'weak-password': 'Password troppo debole: usa almeno 6 caratteri.',
  'invalid-email': 'Indirizzo email non valido.',
  'email-not-confirmed': 'Conferma l’indirizzo email dal messaggio che hai ricevuto, poi accedi.',
  'rate-limited': 'Troppi tentativi: riprova fra qualche minuto.',
  network: 'Server non raggiungibile. Controlla la connessione e riprova.',
  unavailable: 'Gli account non sono attivi su questa versione del gioco.',
}

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(AUTH_ERROR_MESSAGES[code])
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/** Traduce le risposte di errore di Supabase Auth in codici stabili. */
export function mapAuthError(status: number, body: Record<string, unknown>): AuthErrorCode {
  const code = String(body.error_code ?? body.code ?? body.error ?? '')
  const message = String(body.msg ?? body.message ?? body.error_description ?? '').toLowerCase()
  if (status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'rate-limited'
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) return 'email-taken'
  if (code === 'weak_password' || message.includes('password should be')) return 'weak-password'
  if (code === 'email_not_confirmed' || message.includes('not confirmed')) return 'email-not-confirmed'
  if (code === 'email_address_invalid' || code === 'validation_failed' || message.includes('invalid email')) return 'invalid-email'
  if (code === 'invalid_credentials' || code === 'invalid_grant' || message.includes('invalid login')) return 'invalid-credentials'
  return status >= 500 ? 'network' : 'invalid-credentials'
}

function parseSession(body: Record<string, unknown>, now: number): AuthSession | null {
  const user = body.user as Record<string, unknown> | undefined
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || !user || typeof user.id !== 'string') return null
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + expiresIn * 1000,
    user: { id: user.id, email: typeof user.email === 'string' ? user.email : '', username: metadataUsername(user) },
  }
}

function normalizeStoredSession(value: unknown): AuthSession | null {
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>
  const user = data.user as Record<string, unknown> | undefined
  if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string' || typeof data.expiresAt !== 'number' || !user || typeof user.id !== 'string') return null
  return { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.expiresAt, user: { id: user.id, email: typeof user.email === 'string' ? user.email : '', username: metadataUsername(user) } }
}

/**
 * Accesso con email e password tramite l'API REST di Supabase Auth. La sessione è
 * conservata in locale e il token di accesso viene rinnovato prima della scadenza.
 */
export class SupabaseAuth {
  private readonly baseUrl: string
  private current: AuthSession | null

  constructor(
    url: string,
    private readonly anonKey: string,
    private readonly storage: KeyValueStorage,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.baseUrl = url.replace(/\/$/, '')
    let stored: AuthSession | null = null
    try {
      stored = normalizeStoredSession(JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? 'null'))
    } catch {
      stored = null
    }
    this.current = stored
  }

  get session(): AuthSession | null {
    return this.current
  }

  async signUp(email: string, password: string, username?: string): Promise<{ session: AuthSession | null; needsConfirmation: boolean }> {
    if (!isValidEmail(email)) throw new AuthError('invalid-email')
    if (password.length < 6) throw new AuthError('weak-password')
    const body = await this.post('/auth/v1/signup', { email: email.trim(), password, data: username ? { username: username.trim() } : {} })
    const session = parseSession(body, this.now())
    if (session) this.store(session)
    return { session, needsConfirmation: !session }
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    if (!isValidEmail(email)) throw new AuthError('invalid-email')
    const body = await this.post('/auth/v1/token?grant_type=password', { email: email.trim(), password })
    const session = parseSession(body, this.now())
    if (!session) throw new AuthError('invalid-credentials')
    this.store(session)
    return session
  }

  /** Sessione valida, rinnovata se in scadenza; null se scaduta o revocata. */
  async getValidSession(): Promise<AuthSession | null> {
    const session = this.current
    if (!session) return null
    if (session.expiresAt - this.now() > REFRESH_MARGIN_MS) return session
    try {
      const body = await this.post('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refreshToken })
      const refreshed = parseSession(body, this.now())
      if (!refreshed) throw new AuthError('invalid-credentials')
      this.store(refreshed)
      return refreshed
    } catch (error) {
      // Un errore di rete non deve disconnettere: si riproverà alla prossima occasione.
      if (error instanceof AuthError && error.code === 'network') return null
      this.store(null)
      return null
    }
  }

  async signOut(): Promise<void> {
    const session = this.current
    this.store(null)
    if (!session) return
    try {
      await this.fetcher(`${this.baseUrl}/auth/v1/logout`, { method: 'POST', headers: this.headers(session.accessToken) })
    } catch {
      // La sessione locale è già stata rimossa.
    }
  }

  headers(accessToken?: string): Record<string, string> {
    return { apikey: this.anonKey, Authorization: `Bearer ${accessToken ?? this.anonKey}`, 'Content-Type': 'application/json' }
  }

  get url(): string {
    return this.baseUrl
  }

  private store(session: AuthSession | null): void {
    this.current = session
    try {
      if (session) this.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
      else this.storage.setItem(AUTH_STORAGE_KEY, 'null')
    } catch {
      // Storage non disponibile: la sessione resta valida solo in memoria.
    }
  }

  private async post(path: string, payload: unknown): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) })
    } catch {
      throw new AuthError('network')
    }
    let body: Record<string, unknown> = {}
    try {
      body = await response.json() as Record<string, unknown>
    } catch {
      body = {}
    }
    if (!response.ok) throw new AuthError(mapAuthError(response.status, body))
    return body
  }
}

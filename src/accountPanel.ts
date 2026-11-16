import { AccountSaves, mergeSaves } from './game/accountSave'
import type { PlayerSave } from './game/accountSave'
import { AUTH_ERROR_MESSAGES, AuthError, SupabaseAuth } from './game/auth'

const WELCOME_KEY = 'neon-arena:welcome:v1'
const SAVE_DELAY_MS = 1500

interface AccountPanelOptions {
  /** Null quando Supabase non è configurato: resta disponibile solo la modalità ospite. */
  auth: SupabaseAuth | null
  storage: Storage
  getLocal: () => PlayerSave
  applyMerged: (save: PlayerSave) => void
  onProfileChange: () => void
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Elemento mancante: #${id}`)
  return element as T
}

/**
 * Profilo del giocatore: ospite locale oppure account Supabase. Gestisce la schermata di
 * accesso, il benvenuto al primo avvio, l'unione dei progressi al login e il salvataggio
 * automatico (con ritardo) dopo ogni cambiamento.
 */
export class AccountPanel {
  private readonly saves: AccountSaves | null
  private mode: 'login' | 'signup' = 'login'
  private saveTimer = 0
  private busy = false

  constructor(private readonly options: AccountPanelOptions) {
    this.saves = options.auth ? new AccountSaves(options.auth) : null
    byId('account-button').addEventListener('click', () => this.open())
    byId('account-close').addEventListener('click', () => this.close())
    byId('welcome-guest').addEventListener('click', () => this.dismissWelcome())
    byId('welcome-account').addEventListener('click', () => {
      this.dismissWelcome()
      this.setMode('signup')
      this.open()
    })
    document.querySelectorAll<HTMLButtonElement>('[data-account-tab]').forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.accountTab === 'signup' ? 'signup' : 'login'))
    })
    byId<HTMLFormElement>('account-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.submit()
    })
    byId('account-logout').addEventListener('click', () => void this.logout())
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.isOpen) this.close()
    })
    let welcomed = false
    try {
      welcomed = options.storage.getItem(WELCOME_KEY) === '1'
    } catch {
      welcomed = true
    }
    byId('welcome-card').classList.toggle('hidden', welcomed || this.signedIn)
    this.render()
  }

  get signedIn(): boolean {
    return this.options.auth?.session != null
  }

  /** Credenziali dell'account per le richieste a nome dell'utente (classifica online), o null da ospite. */
  async accountCredentials(): Promise<{ accessToken: string; userId: string } | null> {
    const session = await this.options.auth?.getValidSession()
    return session ? { accessToken: session.accessToken, userId: session.user.id } : null
  }

  get email(): string {
    return this.options.auth?.session?.user.email ?? ''
  }

  get isOpen(): boolean {
    return !byId('account-screen').classList.contains('hidden')
  }

  /** All'avvio: se c'è una sessione valida, scarica e unisce il salvataggio dell'account. */
  async initialize(): Promise<void> {
    if (!this.options.auth?.session) return
    const session = await this.options.auth.getValidSession()
    if (!session) {
      this.render()
      this.options.onProfileChange()
      return
    }
    await this.pull()
  }

  open(): void {
    byId('account-screen').classList.remove('hidden')
    this.setStatus(this.options.auth ? '' : AUTH_ERROR_MESSAGES.unavailable, !this.options.auth)
    this.render()
    if (!this.signedIn && this.options.auth) byId<HTMLInputElement>('account-email').focus()
  }

  close(): void {
    byId('account-screen').classList.add('hidden')
  }

  /** Da chiamare dopo ogni modifica di progressi, armeria o callsign. */
  scheduleSave(): void {
    if (!this.saves || !this.signedIn) return
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => void this.push(), SAVE_DELAY_MS)
  }

  private dismissWelcome(): void {
    try {
      this.options.storage.setItem(WELCOME_KEY, '1')
    } catch {
      // Il benvenuto ricomparirà al prossimo avvio.
    }
    byId('welcome-card').classList.add('hidden')
  }

  private setMode(mode: 'login' | 'signup'): void {
    this.mode = mode
    document.querySelectorAll<HTMLButtonElement>('[data-account-tab]').forEach((button) => {
      const selected = button.dataset.accountTab === mode
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-selected', String(selected))
    })
    byId('account-submit').querySelector('span')!.textContent = mode === 'signup' ? 'CREA ACCOUNT' : 'ACCEDI'
    byId<HTMLInputElement>('account-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password'
    this.setStatus(mode === 'signup' ? 'Il profilo ospite attuale verrà salvato nel nuovo account.' : '')
  }

  private setStatus(text: string, error = false, success = false): void {
    const status = byId('account-status')
    status.textContent = text
    status.classList.toggle('error', error)
    status.classList.toggle('success', success)
  }

  private render(): void {
    const available = this.options.auth !== null
    const signedIn = this.signedIn
    byId('account-form').classList.toggle('hidden', signedIn || !available)
    byId('account-signed').classList.toggle('hidden', !signedIn)
    byId('account-email-display').textContent = this.email
    byId('account-button').textContent = signedIn ? 'ACCOUNT' : 'ACCEDI / REGISTRATI'
    byId('account-close').textContent = signedIn ? 'CHIUDI' : 'CONTINUA COME OSPITE'
    byId('welcome-account').toggleAttribute('disabled', !available)
    byId<HTMLButtonElement>('account-submit').disabled = this.busy
  }

  private async submit(): Promise<void> {
    const auth = this.options.auth
    if (!auth || this.busy) return
    const email = byId<HTMLInputElement>('account-email').value
    const password = byId<HTMLInputElement>('account-password').value
    this.busy = true
    this.render()
    this.setStatus(this.mode === 'signup' ? 'Creazione dell’account...' : 'Accesso in corso...')
    try {
      if (this.mode === 'signup') {
        const result = await auth.signUp(email, password)
        if (result.needsConfirmation) {
          this.setStatus('Account creato: apri il link di conferma che ti abbiamo inviato via email, poi accedi.', false, true)
          this.setMode('login')
          return
        }
      } else {
        await auth.signIn(email, password)
      }
      byId<HTMLInputElement>('account-password').value = ''
      await this.pull()
      this.setStatus('Accesso effettuato: i progressi ora sono salvati sull’account.', false, true)
    } catch (error) {
      this.setStatus(error instanceof AuthError ? error.message : AUTH_ERROR_MESSAGES.network, true)
    } finally {
      this.busy = false
      this.render()
      this.options.onProfileChange()
    }
  }

  /** Scarica il salvataggio, lo unisce al profilo locale e risalva il risultato. */
  private async pull(): Promise<void> {
    if (!this.saves) return
    try {
      const remote = await this.saves.load()
      const merged = mergeSaves(this.options.getLocal(), remote)
      this.options.applyMerged(merged)
      await this.saves.save(merged)
    } catch {
      this.setStatus('Accesso riuscito, ma il salvataggio online non è raggiungibile: riproverò più tardi.', true)
    }
    byId('welcome-card').classList.add('hidden')
    this.render()
    this.options.onProfileChange()
  }

  private async push(): Promise<void> {
    if (!this.saves || !this.signedIn) return
    try {
      await this.saves.save(this.options.getLocal())
    } catch {
      // Il prossimo salvataggio riproverà con i dati aggiornati.
    }
  }

  private async logout(): Promise<void> {
    window.clearTimeout(this.saveTimer)
    await this.push()
    await this.options.auth?.signOut()
    this.setStatus('Disconnesso. I progressi restano anche su questo dispositivo.', false, true)
    this.render()
    this.options.onProfileChange()
  }
}

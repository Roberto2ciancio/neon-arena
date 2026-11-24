import { AccountSaves, mergeSaves } from './game/accountSave'
import type { PlayerSave } from './game/accountSave'
import { AccountNames, checkUsername, USERNAME_MESSAGES, UsernameError } from './game/accountName'
import { AUTH_ERROR_MESSAGES, AuthError, SupabaseAuth } from './game/auth'

/** Parola da scrivere per confermare l'eliminazione dell'account. */
export const DELETE_CONFIRM_WORD = 'ELIMINA'

const WELCOME_KEY = 'neon-arena:welcome:v1'
const SAVE_DELAY_MS = 1500

interface AccountPanelOptions {
  /** Null quando Supabase non è configurato: resta disponibile solo la modalità ospite. */
  auth: SupabaseAuth | null
  storage: Storage
  getLocal: () => PlayerSave
  applyMerged: (save: PlayerSave) => void
  onProfileChange: () => void
  /** Nome utente dell'account appena letto o cambiato (null se non ancora scelto). */
  onUsername: (username: string | null) => void
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
  private readonly names: AccountNames | null
  private currentUsername: string | null = null
  private mode: 'login' | 'signup' = 'login'
  /** Arrivati da un link di recupero: si mostra solo la scelta della nuova password. */
  private recovering = false
  private saveTimer = 0
  private busy = false

  constructor(private readonly options: AccountPanelOptions) {
    this.saves = options.auth ? new AccountSaves(options.auth) : null
    this.names = options.auth ? new AccountNames(options.auth) : null
    byId<HTMLFormElement>('account-name-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.saveUsername(byId<HTMLInputElement>('account-name-input').value)
    })
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
    byId('account-forgot').addEventListener('click', () => void this.forgotPassword())
    byId<HTMLFormElement>('account-recovery-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.saveRecoveredPassword()
    })
    byId<HTMLFormElement>('account-email-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.changeEmail()
    })
    byId<HTMLFormElement>('account-password-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.changePassword()
    })
    byId('account-delete').addEventListener('click', () => {
      byId('account-delete-form').classList.remove('hidden')
      byId<HTMLInputElement>('account-delete-confirm').focus()
    })
    byId<HTMLInputElement>('account-delete-confirm').addEventListener('input', () => this.render())
    byId<HTMLFormElement>('account-delete-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.deleteAccount()
    })
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

  /** Nome utente dell'account, o null da ospite o se non è ancora stato scelto. */
  get username(): string | null {
    return this.signedIn ? this.currentUsername : null
  }

  get email(): string {
    return this.options.auth?.session?.user.email ?? ''
  }

  get isOpen(): boolean {
    return !byId('account-screen').classList.contains('hidden')
  }

  /** All'avvio: se c'è una sessione valida, scarica e unisce il salvataggio dell'account. */
  async initialize(): Promise<void> {
    if (await this.handleEmailLink()) return
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
    // Chiudendo senza scegliere la password si resta connessi: si può cambiarla dopo.
    this.recovering = false
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
    byId('account-username-row').classList.toggle('hidden', mode !== 'signup')
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
    byId('account-form').classList.toggle('hidden', signedIn || !available || this.recovering)
    byId('account-recovery-form').classList.toggle('hidden', !this.recovering || !signedIn)
    byId('account-signed').classList.toggle('hidden', !signedIn || this.recovering)
    byId('account-forgot').classList.toggle('hidden', this.mode !== 'login')
    byId<HTMLButtonElement>('account-recovery-save').disabled = this.busy
    const confirmWord = byId<HTMLInputElement>('account-delete-confirm').value.trim().toUpperCase()
    byId<HTMLButtonElement>('account-delete-final').disabled = this.busy || confirmWord !== DELETE_CONFIRM_WORD
    byId('account-email-display').textContent = this.email
    byId('account-name-label').textContent = this.currentUsername ? 'NOME UTENTE' : 'SCEGLI IL TUO NOME UTENTE'
    const nameInput = byId<HTMLInputElement>('account-name-input')
    if (document.activeElement !== nameInput) nameInput.value = this.currentUsername ?? ''
    byId<HTMLButtonElement>('account-name-save').disabled = this.busy
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
        const username = byId<HTMLInputElement>('account-username').value.trim()
        const problem = checkUsername(username)
        if (problem) {
          this.setStatus(USERNAME_MESSAGES[problem], true)
          return
        }
        const result = await auth.signUp(email, password, username)
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
    await this.resolveUsername()
    byId('welcome-card').classList.add('hidden')
    this.render()
    this.options.onProfileChange()
  }

  /**
   * Legge il nome utente dell'account. Al primo accesso rivendica quello scelto alla
   * registrazione; se è stato preso nel frattempo, chiede di sceglierne un altro.
   */
  private async resolveUsername(): Promise<void> {
    if (!this.names) return
    try {
      this.currentUsername = await this.names.load()
      const wanted = this.options.auth?.session?.user.username
      if (!this.currentUsername && wanted) {
        try {
          this.currentUsername = await this.names.claim(wanted)
        } catch (error) {
          if (error instanceof UsernameError && error.code === 'taken') this.setStatus(`Il nome ${wanted} è stato preso da un altro giocatore: scegline uno nuovo.`, true)
        }
      }
      if (!this.currentUsername) {
        this.open()
        byId<HTMLInputElement>('account-name-input').focus()
      }
    } catch {
      // Riproveremo al prossimo accesso; nel frattempo resta il callsign locale.
    }
    this.options.onUsername(this.currentUsername)
    this.render()
  }

  private async saveUsername(value: string): Promise<void> {
    if (!this.names || this.busy) return
    this.busy = true
    this.render()
    try {
      this.currentUsername = await this.names.claim(value)
      this.setStatus(`Nome utente salvato: ${this.currentUsername}.`, false, true)
      this.options.onUsername(this.currentUsername)
    } catch (error) {
      this.setStatus(error instanceof UsernameError ? error.message : USERNAME_MESSAGES.network, true)
    } finally {
      this.busy = false
      this.render()
      this.options.onProfileChange()
    }
  }

  private async push(): Promise<void> {
    if (!this.saves || !this.signedIn) return
    try {
      await this.saves.save(this.options.getLocal())
    } catch {
      // Il prossimo salvataggio riproverà con i dati aggiornati.
    }
  }

  /** Indirizzo a cui riportano i link email (questa pagina, senza frammento). */
  private get redirectUrl(): string {
    return `${window.location.origin}${window.location.pathname}`
  }

  private errorText(error: unknown): string {
    return error instanceof AuthError ? error.message : AUTH_ERROR_MESSAGES.network
  }

  /**
   * Link arrivato via email (conferma, recupero, cambio email): completa l'accesso, pulisce
   * l'indirizzo e mostra cosa è successo. True se il link è stato gestito.
   */
  private async handleEmailLink(): Promise<boolean> {
    const auth = this.options.auth
    const hash = window.location.hash
    if (!auth || hash.length < 2) return false
    const params = new URLSearchParams(hash.slice(1))
    // Cambio email sicuro: il primo dei due link conferma solo metà del cambio.
    if (params.has('message') && !params.has('access_token')) {
      this.clearHash()
      this.open()
      this.setStatus('Link accettato: apri anche il link inviato all’altro indirizzo per completare il cambio email.', false, true)
      return false
    }
    const result = await auth.completeRedirect(hash)
    if (!result) return false
    this.clearHash()
    if (result.error) {
      this.open()
      this.setStatus(AUTH_ERROR_MESSAGES[result.error], true)
      return false
    }
    if (result.type === 'recovery') {
      this.recovering = true
      this.open()
      this.setStatus('')
      byId<HTMLInputElement>('account-recovery-password').focus()
      // I progressi si uniscono subito: la nuova password si può scegliere con calma.
      await this.pull()
      this.open()
      return true
    }
    await this.pull()
    this.open()
    this.setStatus(result.type === 'email_change' ? `Email aggiornata: ora è ${this.email}.` : 'Email confermata: sei connesso e i progressi sono salvati sull’account.', false, true)
    return true
  }

  private clearHash(): void {
    try {
      window.history.replaceState(null, '', this.redirectUrl + window.location.search)
    } catch {
      window.location.hash = ''
    }
  }

  private async forgotPassword(): Promise<void> {
    const auth = this.options.auth
    if (!auth || this.busy) return
    const email = byId<HTMLInputElement>('account-email').value
    if (!email.trim()) {
      this.setStatus('Scrivi l’email del tuo account qui sopra, poi premi di nuovo PASSWORD DIMENTICATA.', true)
      byId<HTMLInputElement>('account-email').focus()
      return
    }
    await this.run('Invio del link...', async () => {
      await auth.requestPasswordReset(email, this.redirectUrl)
      // Stesso messaggio anche se l'email non esiste: non si rivela chi è registrato.
      this.setStatus(`Se esiste un account con ${email.trim()}, riceverai un link per scegliere una nuova password.`, false, true)
    })
  }

  private async saveRecoveredPassword(): Promise<void> {
    const auth = this.options.auth
    if (!auth) return
    const input = byId<HTMLInputElement>('account-recovery-password')
    await this.run('Salvataggio della password...', async () => {
      await auth.updatePassword(input.value)
      input.value = ''
      this.recovering = false
      this.setStatus('Password aggiornata: sei connesso.', false, true)
    })
  }

  private async changeEmail(): Promise<void> {
    const auth = this.options.auth
    if (!auth) return
    const input = byId<HTMLInputElement>('account-new-email')
    await this.run('Invio della conferma...', async () => {
      await auth.requestEmailChange(input.value, this.redirectUrl)
      this.setStatus(`Controlla la posta di ${input.value.trim()} e apri il link di conferma: fino ad allora resta l’email attuale.`, false, true)
      input.value = ''
    })
  }

  private async changePassword(): Promise<void> {
    const auth = this.options.auth
    if (!auth) return
    const input = byId<HTMLInputElement>('account-new-password')
    await this.run('Salvataggio della password...', async () => {
      await auth.updatePassword(input.value)
      input.value = ''
      this.setStatus('Password aggiornata.', false, true)
    })
  }

  private async deleteAccount(): Promise<void> {
    const auth = this.options.auth
    if (!auth) return
    if (byId<HTMLInputElement>('account-delete-confirm').value.trim().toUpperCase() !== DELETE_CONFIRM_WORD) return
    window.clearTimeout(this.saveTimer)
    await this.run('Eliminazione dell’account...', async () => {
      await auth.deleteAccount()
      this.currentUsername = null
      this.options.onUsername(null)
      byId<HTMLInputElement>('account-delete-confirm').value = ''
      byId('account-delete-form').classList.add('hidden')
      byId<HTMLDetailsElement>('account-manage').open = false
      this.setStatus('Account eliminato con tutti i dati online. I progressi restano su questo dispositivo come ospite.', false, true)
    })
  }

  /** Esegue un'operazione dell'account mostrando lo stato e gli errori. */
  private async run(pending: string, action: () => Promise<void>): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.setStatus(pending)
    this.render()
    try {
      await action()
    } catch (error) {
      this.setStatus(this.errorText(error), true)
    } finally {
      this.busy = false
      this.render()
      this.options.onProfileChange()
    }
  }

  private async logout(): Promise<void> {
    window.clearTimeout(this.saveTimer)
    await this.push()
    await this.options.auth?.signOut()
    this.currentUsername = null
    this.options.onUsername(null)
    this.setStatus('Disconnesso. I progressi restano anche su questo dispositivo.', false, true)
    this.render()
    this.options.onProfileChange()
  }
}

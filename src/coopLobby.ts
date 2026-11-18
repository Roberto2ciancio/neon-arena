import type { Cosmetics } from './game/cosmetics'
import { CoopSession, CoopSessionError } from './game/coop/CoopSession'
import { COOP_ERROR_MESSAGES } from './game/coop/coopProtocol'
import type { CoopErrorCode, CoopLobbyPlayer } from './game/coop/coopProtocol'
import { getCoopScaling, MAX_COOP_PLAYERS } from './game/coop/coopRules'
import { generateRoomCode, normalizeRoomCode } from './game/net/protocol'
import type { TransportKind } from './game/net/transport'

interface CoopLobbyOptions {
  transport: TransportKind
  getName: () => string
  getCosmetics: () => Cosmetics
  getMapId: () => string
  /** La partita parte per tutti i giocatori della stanza. */
  onStart: (session: CoopSession, mapId: string, players: CoopLobbyPlayer[]) => void
  /** L'host ha chiuso la stanza o la connessione è caduta. */
  onClosed: () => void
  /** Stanza aperta o chiusa: il menu nasconde la partita in solitaria e blocca la mappa agli ospiti. */
  onRoomChange: (inRoom: boolean, isHost: boolean) => void
}

const IDLE_TEXT = 'Facoltativo: in squadra gli zombie sono più numerosi e resistenti.'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Elemento mancante: #${id}`)
  return element as T
}

/** Lobby della modalità Zombie in squadra: crea o entra in una stanza e avvia la partita. */
export class CoopLobby {
  private session: CoopSession | null = null
  private busy = false

  constructor(private readonly options: CoopLobbyOptions) {
    byId('coop-create').addEventListener('click', () => void this.create())
    byId('coop-join').addEventListener('click', () => void this.join())
    byId<HTMLInputElement>('coop-code').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.join()
    })
    byId('coop-leave').addEventListener('click', () => this.leave())
    byId('coop-start').addEventListener('click', () => {
      if (this.session?.isHost) this.session.start()
    })
    this.render()
  }

  get active(): CoopSession | null {
    return this.session
  }

  setMap(mapId: string): void {
    this.session?.setMap(mapId)
  }

  /** Fine partita: l'host riapre la stanza per una nuova partita con gli stessi compagni. */
  backToLobby(): void {
    this.session?.backToLobby()
    this.render()
  }

  leave(): void {
    if (!this.session) return
    this.session.close()
    this.session = null
    this.setStatus(IDLE_TEXT)
    this.render()
    this.options.onRoomChange(false, false)
  }

  private async create(): Promise<void> {
    if (this.busy || this.session) return
    this.busy = true
    this.render()
    this.setStatus('Creazione della squadra...')
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          this.attach(await CoopSession.host(generateRoomCode(), this.options.getName(), this.options.getMapId(), this.options.transport, this.options.getCosmetics()))
          break
        } catch (error) {
          if (!(error instanceof CoopSessionError && error.code === 'code-taken') || attempt === 2) throw error
        }
      }
      this.setStatus('Squadra creata: condividi il codice con gli amici, poi avvia la partita.')
    } catch (error) {
      this.setStatus(this.describe(error), true)
    } finally {
      this.busy = false
      this.render()
    }
  }

  private async join(): Promise<void> {
    if (this.busy || this.session) return
    const code = normalizeRoomCode(byId<HTMLInputElement>('coop-code').value)
    if (!code) {
      this.setStatus('Il codice ha 5 caratteri (lettere e numeri).', true)
      return
    }
    this.busy = true
    this.render()
    this.setStatus('Connessione alla squadra...')
    try {
      this.attach(await CoopSession.join(code, this.options.getName(), this.options.transport, this.options.getCosmetics()))
      this.setStatus('Sei nella squadra: la partita parte quando l’host la avvia.')
    } catch (error) {
      this.setStatus(this.describe(error), true)
    } finally {
      this.busy = false
      this.render()
    }
  }

  private attach(session: CoopSession): void {
    this.session = session
    session.onHost((message) => {
      if (message.t === 'lobby') this.render()
      if (message.t === 'start') this.options.onStart(session, message.mapId, message.players)
    })
    session.onClose((code: CoopErrorCode) => {
      this.session = null
      this.setStatus(COOP_ERROR_MESSAGES[code], true)
      this.render()
      this.options.onRoomChange(false, false)
      this.options.onClosed()
    })
    this.options.onRoomChange(true, session.isHost)
    this.render()
  }

  private describe(error: unknown): string {
    return error instanceof CoopSessionError ? error.message : COOP_ERROR_MESSAGES.network
  }

  private setStatus(text: string, error = false): void {
    const status = byId('coop-status')
    status.textContent = text
    status.classList.toggle('error', error)
  }

  private render(): void {
    const session = this.session
    byId('coop-connect').classList.toggle('hidden', session !== null)
    byId('coop-room').classList.toggle('hidden', session === null)
    byId<HTMLButtonElement>('coop-create').disabled = this.busy
    byId<HTMLButtonElement>('coop-join').disabled = this.busy
    if (!session) return
    byId('coop-code-display').textContent = session.code
    const players = session.lobby
    byId('coop-players').replaceChildren(...players.map((player) => {
      const item = document.createElement('li')
      item.textContent = player.id === session.localId ? `${player.name} (TU)` : player.name
      if (player.id === 'host') item.classList.add('host')
      return item
    }))
    const scaling = getCoopScaling(players.length)
    byId('coop-difficulty').textContent = players.length > 1
      ? `${players.length}/${MAX_COOP_PLAYERS} GIOCATORI // ZOMBIE +${Math.round((scaling.spawnCount - 1) * 100)}% E VITA +${Math.round((scaling.health - 1) * 100)}%`
      : `1/${MAX_COOP_PLAYERS} GIOCATORI // IN ATTESA DEGLI AMICI`
    const start = byId<HTMLButtonElement>('coop-start')
    start.classList.toggle('hidden', !session.isHost)
    start.disabled = this.busy
  }
}

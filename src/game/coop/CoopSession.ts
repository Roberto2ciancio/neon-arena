import { createHostTransport, joinHostTransport, TransportError } from '../net/transport'
import type { ClientTransport, HostTransport, TransportKind } from '../net/transport'
import type { Cosmetics } from '../cosmetics'
import { MAX_COOP_PLAYERS } from './coopRules'
import { COOP_ERROR_MESSAGES, COOP_PROTOCOL_VERSION, parseCoopClientMessage, parseCoopHostMessage } from './coopProtocol'
import type { CoopClientMessage, CoopErrorCode, CoopHostMessage, CoopLobbyPlayer } from './coopProtocol'

export const COOP_HOST_ID = 'host'
/** Prefisso dei codici stanza co-op: distinti da quelli del TCT, così non ci si unisce per errore. */
const COOP_CODE_PREFIX = 'Z'

export class CoopSessionError extends Error {
  constructor(readonly code: CoopErrorCode | 'code-taken') {
    super(code === 'code-taken' ? 'Codice stanza già in uso, riprova.' : COOP_ERROR_MESSAGES[code])
  }
}

type HostListener = (message: CoopHostMessage) => void
type ClientListener = (peerId: string, message: CoopClientMessage) => void

/**
 * Stanza della modalità Zombie cooperativa. L'host gestisce la lobby e inoltra al gioco i
 * messaggi dei compagni; la simulazione degli zombie resta nel `Game` dell'host, che invia
 * lo stato del mondo con `broadcast`. I client ricevono i messaggi dell'host con `onHost`.
 */
export class CoopSession {
  private readonly hostListeners = new Set<HostListener>()
  private readonly clientListeners = new Set<ClientListener>()
  private readonly leaveListeners = new Set<(peerId: string) => void>()
  private readonly players = new Map<string, CoopLobbyPlayer>()
  private closeHandler: ((code: CoopErrorCode) => void) | null = null
  private closed = false
  private started = false
  private currentMapId: string

  private constructor(
    readonly code: string,
    readonly localId: string,
    private readonly hostTransport: HostTransport | null,
    private readonly clientTransport: ClientTransport | null,
    mapId: string,
  ) {
    this.currentMapId = mapId
  }

  static async host(code: string, name: string, mapId: string, kind: TransportKind, cosmetics: Cosmetics): Promise<CoopSession> {
    let transport: HostTransport
    try {
      transport = await createHostTransport(COOP_CODE_PREFIX + code, kind)
    } catch (error) {
      throw new CoopSessionError(error instanceof TransportError && error.code === 'code-taken' ? 'code-taken' : 'network')
    }
    const session = new CoopSession(code, COOP_HOST_ID, transport, null, mapId)
    session.players.set(COOP_HOST_ID, { id: COOP_HOST_ID, name, cosmetics })
    transport.onConnect = () => undefined
    transport.onMessage = (peerId, data) => session.handleClient(peerId, data)
    transport.onDisconnect = (peerId) => session.handleLeave(peerId)
    return session
  }

  static async join(code: string, name: string, kind: TransportKind, cosmetics: Cosmetics): Promise<CoopSession> {
    let transport: ClientTransport
    try {
      transport = await joinHostTransport(COOP_CODE_PREFIX + code, kind)
    } catch (error) {
      throw new CoopSessionError(error instanceof TransportError && error.code === 'not-found' ? 'not-found' : 'network')
    }
    const session = new CoopSession(code, transport.id, null, transport, '')
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        transport.close()
        reject(new CoopSessionError('network'))
      }, 8000)
      transport.onMessage = (data) => {
        const message = parseCoopHostMessage(data)
        if (!message) return
        if (message.t === 'error') {
          window.clearTimeout(timer)
          transport.close()
          reject(new CoopSessionError(message.code))
          return
        }
        if (message.t === 'welcome') {
          window.clearTimeout(timer)
          resolve()
        }
        session.dispatch(message)
      }
      transport.onClose = () => {
        window.clearTimeout(timer)
        reject(new CoopSessionError('host-left'))
      }
      transport.send(JSON.stringify({ t: 'hello', v: COOP_PROTOCOL_VERSION, name, cosmetics } satisfies CoopClientMessage))
    })
    transport.onClose = () => session.handleRemoteClose('host-left')
    return session
  }

  get isHost(): boolean {
    return this.hostTransport !== null
  }

  get lobby(): CoopLobbyPlayer[] {
    return [...this.players.values()]
  }

  get mapId(): string {
    return this.currentMapId
  }

  onHost(listener: HostListener): () => void {
    this.hostListeners.add(listener)
    return () => this.hostListeners.delete(listener)
  }

  /** Solo host: messaggi dei compagni durante la partita. */
  onClient(listener: ClientListener): () => void {
    this.clientListeners.add(listener)
    return () => this.clientListeners.delete(listener)
  }

  onPeerLeft(listener: (peerId: string) => void): () => void {
    this.leaveListeners.add(listener)
    return () => this.leaveListeners.delete(listener)
  }

  onClose(handler: (code: CoopErrorCode) => void): void {
    this.closeHandler = handler
  }

  /** Client: invia un messaggio all'host. */
  send(message: CoopClientMessage): void {
    if (this.closed || !this.clientTransport) return
    this.clientTransport.send(JSON.stringify(message))
  }

  /** Host: invia a tutti i compagni (non a se stesso). */
  broadcast(message: CoopHostMessage): void {
    if (this.closed || !this.hostTransport) return
    const payload = JSON.stringify(message)
    for (const player of this.players.values()) if (player.id !== COOP_HOST_ID) this.hostTransport.send(player.id, payload)
  }

  sendTo(peerId: string, message: CoopHostMessage): void {
    if (this.closed || !this.hostTransport || peerId === COOP_HOST_ID) return
    this.hostTransport.send(peerId, JSON.stringify(message))
  }

  setMap(mapId: string): void {
    if (!this.isHost || this.started) return
    this.currentMapId = mapId
    this.broadcastLobby()
  }

  /** Host: avvia la partita per tutti. */
  start(): boolean {
    if (!this.isHost) return false
    this.started = true
    const message: CoopHostMessage = { t: 'start', mapId: this.currentMapId, players: this.lobby }
    this.broadcast(message)
    this.dispatchLater(message)
    return true
  }

  /** Host: torna alla lobby a fine partita (nuovi compagni possono entrare). */
  backToLobby(): void {
    this.started = false
    this.broadcastLobby()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.hostTransport?.close()
    this.clientTransport?.close()
    this.hostListeners.clear()
    this.clientListeners.clear()
    this.leaveListeners.clear()
  }

  private handleClient(peerId: string, raw: unknown): void {
    const message = parseCoopClientMessage(raw)
    if (!message) return
    if (message.t === 'hello') {
      if (this.players.has(peerId)) return
      const reject = (code: CoopErrorCode) => this.hostTransport?.send(peerId, JSON.stringify({ t: 'error', code } satisfies CoopHostMessage))
      if (message.v !== COOP_PROTOCOL_VERSION) return reject('bad-version')
      if (this.started) return reject('match-running')
      if (this.players.size >= MAX_COOP_PLAYERS) return reject('room-full')
      this.players.set(peerId, { id: peerId, name: message.name || 'PLAYER', cosmetics: message.cosmetics })
      this.sendTo(peerId, { t: 'welcome', v: COOP_PROTOCOL_VERSION, id: peerId, hostId: COOP_HOST_ID })
      this.broadcastLobby()
      return
    }
    if (!this.players.has(peerId)) return
    for (const listener of this.clientListeners) listener(peerId, message)
  }

  private handleLeave(peerId: string): void {
    if (!this.players.delete(peerId)) return
    for (const listener of this.leaveListeners) listener(peerId)
    this.broadcastLobby()
  }

  private broadcastLobby(): void {
    const message: CoopHostMessage = { t: 'lobby', players: this.lobby, mapId: this.currentMapId, hostId: COOP_HOST_ID }
    this.broadcast(message)
    this.dispatchLater(message)
  }

  private dispatchLater(message: CoopHostMessage): void {
    queueMicrotask(() => this.dispatch(message))
  }

  private dispatch(message: CoopHostMessage): void {
    if (this.closed) return
    if (message.t === 'lobby') {
      this.currentMapId = message.mapId
      if (!this.isHost) {
        this.players.clear()
        for (const player of message.players) this.players.set(player.id, player)
      }
    }
    if (message.t === 'start') this.currentMapId = message.mapId
    for (const listener of this.hostListeners) listener(message)
  }

  private handleRemoteClose(code: CoopErrorCode): void {
    if (this.closed) return
    this.close()
    this.closeHandler?.(code)
  }
}

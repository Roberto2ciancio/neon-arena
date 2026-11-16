import { MatchHost } from './MatchHost'
import { NET_ERROR_MESSAGES, PROTOCOL_VERSION, parseHostMessage } from './protocol'
import type { ClientMessage, HostMessage, LobbyPlayer, NetErrorCode } from './protocol'
import { createHostTransport, joinHostTransport, TransportError } from './transport'
import type { ClientTransport, HostTransport, TransportKind } from './transport'
import type { Cosmetics } from '../cosmetics'

const HOST_LOCAL_ID = 'host'
const HOST_TICK_MS = 1000 / 30

type Listener = (message: HostMessage) => void

export class NetSessionError extends Error {
  constructor(readonly code: NetErrorCode | 'code-taken') {
    super(code === 'code-taken' ? 'Codice stanza già in uso, riprova.' : NET_ERROR_MESSAGES[code])
  }
}

/**
 * Sessione di rete vista dal gioco. L'host è anche un giocatore: i suoi messaggi passano
 * in loopback dallo stesso `MatchHost` che serve i peer remoti, così host e client seguono
 * lo stesso percorso di codice.
 */
export class NetSession {
  private readonly listeners = new Set<Listener>()
  private closeHandler: ((code: NetErrorCode) => void) | null = null
  private closed = false
  private tickTimer = 0
  private lastTick = 0
  private latestLobby: LobbyPlayer[] = []
  private latestMapId = ''

  private constructor(
    readonly code: string,
    readonly localId: string,
    private readonly hostTransport: HostTransport | null,
    private readonly clientTransport: ClientTransport | null,
    private readonly match: MatchHost | null,
  ) {}

  static async host(code: string, name: string, mapId: string, kind: TransportKind, cosmetics: Cosmetics): Promise<NetSession> {
    let transport: HostTransport
    try {
      transport = await createHostTransport(code, kind)
    } catch (error) {
      throw new NetSessionError(error instanceof TransportError && error.code === 'code-taken' ? 'code-taken' : 'network')
    }
    let session: NetSession | null = null
    const match = new MatchHost(
      HOST_LOCAL_ID,
      mapId,
      (peerId, message) => session?.deliver(peerId, message),
      (message) => session?.deliverAll(message),
    )
    session = new NetSession(code, HOST_LOCAL_ID, transport, null, match)
    transport.onConnect = () => undefined
    transport.onMessage = (peerId, data) => match.handle(peerId, data)
    transport.onDisconnect = (peerId) => match.leave(peerId)
    match.handle(HOST_LOCAL_ID, { t: 'hello', v: PROTOCOL_VERSION, name, cosmetics })
    session.startHostLoop()
    return session
  }

  static async join(code: string, name: string, kind: TransportKind, cosmetics: Cosmetics): Promise<NetSession> {
    let transport: ClientTransport
    try {
      transport = await joinHostTransport(code, kind)
    } catch (error) {
      throw new NetSessionError(error instanceof TransportError && error.code === 'not-found' ? 'not-found' : 'network')
    }
    const session = new NetSession(code, transport.id, null, transport, null)
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        transport.close()
        reject(new NetSessionError('network'))
      }, 8000)
      transport.onMessage = (data) => {
        const message = parseHostMessage(data)
        if (!message) return
        if (message.t === 'error') {
          window.clearTimeout(timer)
          transport.close()
          reject(new NetSessionError(message.code))
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
        reject(new NetSessionError('host-left'))
      }
      transport.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name, cosmetics } satisfies ClientMessage))
    })
    transport.onClose = () => session.handleRemoteClose('host-left')
    return session
  }

  get isHost(): boolean {
    return this.match !== null
  }

  get lobby(): LobbyPlayer[] {
    return this.match?.lobby ?? this.latestLobby
  }

  get mapId(): string {
    return this.latestMapId
  }

  get canStart(): boolean {
    return this.match?.canStart ?? false
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onClose(handler: (code: NetErrorCode) => void): void {
    this.closeHandler = handler
  }

  send(message: ClientMessage): void {
    if (this.closed) return
    if (this.match) this.match.handle(HOST_LOCAL_ID, message)
    else this.clientTransport?.send(JSON.stringify(message))
  }

  startMatch(): boolean {
    return this.match?.start() ?? false
  }

  setMap(mapId: string): void {
    this.match?.setMap(mapId)
  }

  backToLobby(): void {
    this.match?.backToLobby()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    window.clearInterval(this.tickTimer)
    this.hostTransport?.close()
    this.clientTransport?.close()
    this.listeners.clear()
  }

  private startHostLoop(): void {
    this.lastTick = performance.now()
    this.tickTimer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(0.25, (now - this.lastTick) / 1000)
      this.lastTick = now
      this.match?.tick(delta)
    }, HOST_TICK_MS)
  }

  private deliver(peerId: string, message: HostMessage): void {
    if (peerId === HOST_LOCAL_ID) this.dispatchLater(message)
    else this.hostTransport?.send(peerId, JSON.stringify(message))
  }

  private deliverAll(message: HostMessage): void {
    const payload = JSON.stringify(message)
    for (const player of this.match?.lobby ?? []) {
      if (player.id !== HOST_LOCAL_ID) this.hostTransport?.send(player.id, payload)
    }
    this.dispatchLater(message)
  }

  /** Evita la rientranza: l'host riceve i propri messaggi dopo aver finito di gestire quello corrente. */
  private dispatchLater(message: HostMessage): void {
    queueMicrotask(() => this.dispatch(message))
  }

  private dispatch(message: HostMessage): void {
    if (this.closed) return
    if (message.t === 'lobby') {
      this.latestLobby = message.players
      this.latestMapId = message.mapId
    }
    if (message.t === 'start') this.latestMapId = message.mapId
    for (const listener of this.listeners) listener(message)
  }

  private handleRemoteClose(code: NetErrorCode): void {
    if (this.closed) return
    this.close()
    this.closeHandler?.(code)
  }
}

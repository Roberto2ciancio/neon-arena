import type { DataConnection, Peer as PeerInstance } from 'peerjs'

/** Lato host: accetta più peer e scambia messaggi serializzati con ciascuno. */
export interface HostTransport {
  onConnect: (peerId: string) => void
  onMessage: (peerId: string, data: unknown) => void
  onDisconnect: (peerId: string) => void
  send(peerId: string, data: string): void
  close(): void
}

/** Lato client: un solo canale verso l'host. */
export interface ClientTransport {
  readonly id: string
  onMessage: (data: unknown) => void
  onClose: () => void
  send(data: string): void
  close(): void
}

export type TransportKind = 'peer' | 'local'

const PEER_PREFIX = 'neon-arena-v1-'
const CONNECT_TIMEOUT_MS = 12000

export function getTransportKind(search = typeof window === 'undefined' ? '' : window.location.search): TransportKind {
  return new URLSearchParams(search).get('net') === 'local' ? 'local' : 'peer'
}

export class TransportError extends Error {
  constructor(readonly code: 'not-found' | 'network' | 'code-taken') {
    super(code)
  }
}

export async function createHostTransport(code: string, kind: TransportKind): Promise<HostTransport> {
  return kind === 'local' ? createLocalHost(code) : createPeerHost(code)
}

export async function joinHostTransport(code: string, kind: TransportKind): Promise<ClientTransport> {
  return kind === 'local' ? joinLocalHost(code) : joinPeerHost(code)
}

function noop(): void {}

// ---------------------------------------------------------------------------
// PeerJS (WebRTC): segnalazione tramite il broker pubblico PeerJS, dati in P2P.
// ---------------------------------------------------------------------------

async function loadPeer(): Promise<typeof import('peerjs').Peer> {
  const module = await import('peerjs')
  return module.Peer
}

function withTimeout<T>(promise: Promise<T>, onTimeout: () => void, error: TransportError): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout()
      reject(error)
    }, CONNECT_TIMEOUT_MS)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (reason: unknown) => {
        window.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

async function createPeerHost(code: string): Promise<HostTransport> {
  const Peer = await loadPeer()
  const peer: PeerInstance = new Peer(PEER_PREFIX + code)
  const connections = new Map<string, DataConnection>()
  const transport: HostTransport = {
    onConnect: noop,
    onMessage: noop,
    onDisconnect: noop,
    send(peerId, data) {
      const connection = connections.get(peerId)
      if (connection?.open) connection.send(data)
    },
    close() {
      for (const connection of connections.values()) connection.close()
      connections.clear()
      peer.destroy()
    },
  }
  await withTimeout(new Promise<void>((resolve, reject) => {
    peer.on('open', () => resolve())
    peer.on('error', (error) => {
      reject(new TransportError(error.type === 'unavailable-id' ? 'code-taken' : 'network'))
    })
  }), () => peer.destroy(), new TransportError('network'))
  peer.on('connection', (connection) => {
    const peerId = connection.peer
    connection.on('open', () => {
      connections.set(peerId, connection)
      transport.onConnect(peerId)
    })
    connection.on('data', (data) => transport.onMessage(peerId, data))
    const drop = (): void => {
      if (connections.get(peerId) !== connection) return
      connections.delete(peerId)
      transport.onDisconnect(peerId)
    }
    connection.on('close', drop)
    connection.on('error', drop)
  })
  return transport
}

async function joinPeerHost(code: string): Promise<ClientTransport> {
  const Peer = await loadPeer()
  const peer: PeerInstance = new Peer()
  const id = await withTimeout(new Promise<string>((resolve, reject) => {
    peer.on('open', resolve)
    peer.on('error', () => reject(new TransportError('network')))
  }), () => peer.destroy(), new TransportError('network'))
  const connection = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'raw' })
  let closed = false
  const transport: ClientTransport = {
    id,
    onMessage: noop,
    onClose: noop,
    send(data) {
      if (connection.open) connection.send(data)
    },
    close() {
      closed = true
      connection.close()
      peer.destroy()
    },
  }
  await withTimeout(new Promise<void>((resolve, reject) => {
    connection.on('open', () => resolve())
    peer.on('error', (error) => reject(new TransportError(error.type === 'peer-unavailable' ? 'not-found' : 'network')))
  }), () => peer.destroy(), new TransportError('not-found'))
  connection.on('data', (data) => transport.onMessage(data))
  const handleClose = (): void => {
    if (closed) return
    closed = true
    peer.destroy()
    transport.onClose()
  }
  connection.on('close', handleClose)
  peer.on('disconnected', () => {
    // Persa la connessione al broker: i canali P2P già aperti restano validi.
    if (!peer.destroyed) peer.reconnect()
  })
  return transport
}

// ---------------------------------------------------------------------------
// BroadcastChannel: stanze fra schede dello stesso browser (sviluppo e test e2e).
// ---------------------------------------------------------------------------

interface LocalEnvelope {
  kind: 'connect' | 'accept' | 'data' | 'bye' | 'ping' | 'pong'
  from: string
  to: string
  data?: string
}

const HOST_ADDRESS = 'host'

function createLocalHost(code: string): Promise<HostTransport> {
  const channel = new BroadcastChannel(`neon-arena-room-${code}`)
  const peers = new Set<string>()
  const post = (envelope: LocalEnvelope): void => channel.postMessage(envelope)
  const transport: HostTransport = {
    onConnect: noop,
    onMessage: noop,
    onDisconnect: noop,
    send(peerId, data) {
      if (peers.has(peerId)) post({ kind: 'data', from: HOST_ADDRESS, to: peerId, data })
    },
    close() {
      for (const peerId of peers) post({ kind: 'bye', from: HOST_ADDRESS, to: peerId })
      peers.clear()
      channel.close()
    },
  }
  channel.onmessage = (event: MessageEvent<LocalEnvelope>) => {
    const envelope = event.data
    if (envelope.to !== HOST_ADDRESS) return
    if (envelope.kind === 'ping') post({ kind: 'pong', from: HOST_ADDRESS, to: envelope.from })
    if (envelope.kind === 'connect' && !peers.has(envelope.from)) {
      peers.add(envelope.from)
      post({ kind: 'accept', from: HOST_ADDRESS, to: envelope.from })
      transport.onConnect(envelope.from)
    }
    if (envelope.kind === 'data' && peers.has(envelope.from)) transport.onMessage(envelope.from, envelope.data)
    if (envelope.kind === 'bye' && peers.delete(envelope.from)) transport.onDisconnect(envelope.from)
  }
  window.addEventListener('pagehide', () => transport.close(), { once: true })
  return Promise.resolve(transport)
}

function joinLocalHost(code: string): Promise<ClientTransport> {
  const channel = new BroadcastChannel(`neon-arena-room-${code}`)
  const id = `local-${Math.random().toString(36).slice(2, 10)}`
  const post = (envelope: LocalEnvelope): void => channel.postMessage(envelope)
  let closed = false
  const transport: ClientTransport = {
    id,
    onMessage: noop,
    onClose: noop,
    send(data) {
      if (!closed) post({ kind: 'data', from: id, to: HOST_ADDRESS, data })
    },
    close() {
      if (closed) return
      closed = true
      post({ kind: 'bye', from: id, to: HOST_ADDRESS })
      channel.close()
    },
  }
  return new Promise<ClientTransport>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      channel.close()
      reject(new TransportError('not-found'))
    }, 3000)
    channel.onmessage = (event: MessageEvent<LocalEnvelope>) => {
      const envelope = event.data
      if (envelope.to !== id) return
      if (envelope.kind === 'accept') {
        window.clearTimeout(timer)
        resolve(transport)
      }
      if (envelope.kind === 'data') transport.onMessage(envelope.data)
      if (envelope.kind === 'bye' && !closed) {
        closed = true
        channel.close()
        transport.onClose()
      }
    }
    window.addEventListener('pagehide', () => transport.close(), { once: true })
    post({ kind: 'connect', from: id, to: HOST_ADDRESS })
  })
}

import type { KeyValueStorage } from './progression'

export interface PlayerIdentity {
  id: string
  callsign: string
}

export const IDENTITY_STORAGE_KEY = 'neon-arena:identity:v1'

export function normalizeCallsign(value: unknown): string {
  if (typeof value !== 'string') return 'PLAYER'
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12)
  return normalized || 'PLAYER'
}

export function loadIdentity(storage: KeyValueStorage, createId = () => crypto.randomUUID()): PlayerIdentity {
  try {
    const parsed = JSON.parse(storage.getItem(IDENTITY_STORAGE_KEY) ?? 'null') as Partial<PlayerIdentity> | null
    if (typeof parsed?.id === 'string' && parsed.id.length >= 8) return { id: parsed.id, callsign: normalizeCallsign(parsed.callsign) }
  } catch {}
  const identity = { id: createId(), callsign: 'PLAYER' }
  saveIdentity(storage, identity)
  return identity
}

export function saveIdentity(storage: KeyValueStorage, identity: PlayerIdentity): void {
  try {
    storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  } catch {}
}

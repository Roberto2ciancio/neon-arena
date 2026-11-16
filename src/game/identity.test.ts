import { describe, expect, it } from 'vitest'
import { IDENTITY_STORAGE_KEY, loadIdentity, normalizeCallsign, saveIdentity } from './identity'
import type { KeyValueStorage } from './progression'

function memoryStorage(): KeyValueStorage & { value: string | null } {
  return {
    value: null,
    getItem(key) { return key === IDENTITY_STORAGE_KEY ? this.value : null },
    setItem(key, value) { if (key === IDENTITY_STORAGE_KEY) this.value = value },
  }
}

describe('identità giocatore', () => {
  it('normalizza il callsign e limita la lunghezza', () => {
    expect(normalizeCallsign(' ace-01! ')).toBe('ACE-01')
    expect(normalizeCallsign('')).toBe('PLAYER')
    expect(normalizeCallsign('ABCDEFGHIJKLMNO')).toHaveLength(12)
  })

  it('crea e conserva il profilo locale', () => {
    const storage = memoryStorage()
    const identity = loadIdentity(storage, () => '12345678-1234-1234-1234-123456789012')
    expect(loadIdentity(storage)).toEqual(identity)
    saveIdentity(storage, { ...identity, callsign: 'NOVA' })
    expect(loadIdentity(storage).callsign).toBe('NOVA')
  })
})

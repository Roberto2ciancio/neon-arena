import { describe, expect, it } from 'vitest'
import { assignTeamSlot, canStartMatch, generateRoomCode, getMaxHitDamage, normalizeRoomCode, parseClientMessage } from './protocol'
import type { LobbyPlayer } from './protocol'
import { DEFAULT_COSMETICS } from '../cosmetics'

describe('protocollo TCT online', () => {
  it('genera codici stanza validi e normalizza l’input', () => {
    const code = generateRoomCode(() => 0.5)
    expect(code).toHaveLength(5)
    expect(normalizeRoomCode(code.toLowerCase())).toBe(code)
    expect(normalizeRoomCode(' ab2cd ')).toBe('AB2CD')
    expect(normalizeRoomCode('AB0CD')).toBeNull()
    expect(normalizeRoomCode('ABC')).toBeNull()
  })

  it('assegna la squadra preferita solo se ha posto', () => {
    const full: LobbyPlayer[] = [0, 1, 2, 3].map((slot) => ({ id: `a${slot}`, name: 'A', team: 'alpha', slot, cosmetics: DEFAULT_COSMETICS }))
    expect(assignTeamSlot(full, 'alpha')).toBeNull()
    expect(assignTeamSlot(full)).toEqual({ team: 'bravo', slot: 0 })
    expect(canStartMatch(full)).toBe(false)
    expect(canStartMatch([...full, { id: 'b', name: 'B', team: 'bravo', slot: 0, cosmetics: DEFAULT_COSMETICS }])).toBe(true)
  })

  it('calcola il danno massimo plausibile per arma e fonte', () => {
    expect(getMaxHitDamage('gun', 'sg-6')).toBeCloseTo(11 * 1.5 * 8)
    expect(getMaxHitDamage('grenade', 'ar-07')).toBe(150)
    expect(getMaxHitDamage('melee', 'ar-07')).toBe(140)
    expect(getMaxHitDamage('turret', 'ar-07')).toBe(14)
  })

  it('valida lo schema dei messaggi del client', () => {
    expect(parseClientMessage({ t: 'state', x: 1, y: 0, z: 2, yaw: 0.5, pitch: 0 })).not.toBeNull()
    expect(parseClientMessage({ t: 'state', x: '1', y: 0, z: 2, yaw: 0.5, pitch: 0 })).toBeNull()
    expect(parseClientMessage({ t: 'hit', target: 'p2', damage: -5, headshot: false, source: 'gun', weapon: 'ar-07' })).toBeNull()
    expect(parseClientMessage({ t: 'hit', target: 'p2', damage: 5, headshot: false, source: 'laser', weapon: 'ar-07' })).toBeNull()
    expect(parseClientMessage({ t: 'hit', target: 'p2', damage: 5, headshot: false, source: 'gun', weapon: 'bazooka' })).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'hello', v: 1, name: 'NOMEMOLTOLUNGO123' }))).toMatchObject({ t: 'hello', v: 1, name: 'NOMEMOLTOLUN', cosmetics: DEFAULT_COSMETICS })
    expect(parseClientMessage('x'.repeat(5000))).toBeNull()
    expect(parseClientMessage({ t: 'unknown' })).toBeNull()
  })
})

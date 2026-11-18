import { describe, expect, it } from 'vitest'
import { MAX_COOP_HIT_DAMAGE } from './coopRules'
import { MAX_COOP_CLIENT_BYTES, packEnemy, parseCoopClientMessage, parseCoopHostMessage, unpackEnemy } from './coopProtocol'

describe('protocollo del co-op', () => {
  it('accetta i messaggi validi dei compagni', () => {
    expect(parseCoopClientMessage(JSON.stringify({ t: 'hit', enemy: 12, damage: 40, precision: true }))).toEqual({ t: 'hit', enemy: 12, damage: 40, precision: true })
    expect(parseCoopClientMessage({ t: 'state', x: 1, y: 0, z: 2, yaw: 0.5, pitch: 0, crouch: true, health: 80, status: 'down' })).toMatchObject({ status: 'down', crouch: true })
    expect(parseCoopClientMessage({ t: 'hello', v: 1, name: 'NOME_TROPPO_LUNGO_X' })).toMatchObject({ name: 'NOME_TROPPO_' })
  })

  it('scarta messaggi malformati, danni assurdi e testi troppo lunghi', () => {
    expect(parseCoopClientMessage({ t: 'hit', enemy: 1.5, damage: 10 })).toBeNull()
    expect(parseCoopClientMessage({ t: 'hit', enemy: 1, damage: MAX_COOP_HIT_DAMAGE + 1 })).toBeNull()
    expect(parseCoopClientMessage({ t: 'hit', enemy: 1, damage: -5 })).toBeNull()
    expect(parseCoopClientMessage({ t: 'state', x: 1, y: 0, z: 2, yaw: 0, pitch: 0, health: 50, status: 'god' })).toBeNull()
    expect(parseCoopClientMessage('x'.repeat(MAX_COOP_CLIENT_BYTES + 1))).toBeNull()
    expect(parseCoopClientMessage({ t: 'unknown' })).toBeNull()
    expect(parseCoopClientMessage('{non json')).toBeNull()
  })

  it('controlla i campi dell’host usati come indici', () => {
    expect(parseCoopHostMessage({ t: 'kill', enemy: 1, by: 'a', kind: 'dragon', pos: [0, 0, 0] })).toBeNull()
    expect(parseCoopHostMessage({ t: 'power-take', id: 1, power: 'nope', by: 'a' })).toBeNull()
    expect(parseCoopHostMessage({ t: 'world', wave: 1, enemies: 'x', players: [] })).toBeNull()
    expect(parseCoopHostMessage({ t: 'wave', wave: 3 })).toEqual({ t: 'wave', wave: 3 })
  })

  it('comprime e ricostruisce gli zombie', () => {
    const packed = packEnemy(7, 'shielder', 1.234, 0, -5.678, 3.14159, 0.456, 1)
    expect(JSON.stringify(packed).length).toBeLessThan(48)
    expect(unpackEnemy(packed)).toEqual({ id: 7, kind: 'shielder', x: 1.23, y: 0, z: -5.68, yaw: 3.14, healthShare: 0.46, flags: 1 })
  })
})

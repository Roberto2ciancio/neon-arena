import { describe, expect, it } from 'vitest'
import { TCT_CONFIG } from '../tctRules'
import { WEAPONS } from '../weapons'
import { MatchHost, SPAWN_PROTECTION } from './MatchHost'
import { PROTOCOL_VERSION } from './protocol'
import type { HostMessage } from './protocol'

function createRoom() {
  const sent: { to: string; message: HostMessage }[] = []
  const broadcasts: HostMessage[] = []
  const host = new MatchHost('host', 'depot-06', (to, message) => sent.push({ to, message }), (message) => broadcasts.push(message))
  const join = (id: string, name = id) => host.handle(id, { t: 'hello', v: PROTOCOL_VERSION, name })
  return { host, sent, broadcasts, join }
}

function startedRoom() {
  const room = createRoom()
  room.join('host', 'HOST')
  room.join('p2', 'NOVA')
  room.host.start()
  // Supera la protezione allo spawn.
  room.host.tick(SPAWN_PROTECTION + 0.01)
  return room
}

const lastOfType = <T extends HostMessage['t']>(messages: HostMessage[], type: T) =>
  messages.filter((message): message is Extract<HostMessage, { t: T }> => message.t === type).at(-1)

describe('stanza TCT online', () => {
  it('bilancia le squadre e assegna slot univoci', () => {
    const { host, join } = createRoom()
    for (const id of ['a', 'b', 'c', 'd']) join(id)
    const lobby = host.lobby
    expect(lobby.filter((player) => player.team === 'alpha')).toHaveLength(2)
    expect(lobby.filter((player) => player.team === 'bravo')).toHaveLength(2)
    expect(new Set(lobby.map((player) => `${player.team}-${player.slot}`)).size).toBe(4)
  })

  it('rifiuta il nono giocatore e le versioni diverse', () => {
    const { host, sent, join } = createRoom()
    for (let index = 0; index < 9; index += 1) join(`p${index}`)
    expect(host.lobby).toHaveLength(8)
    expect(sent.at(-1)).toEqual({ to: 'p8', message: { t: 'error', code: 'room-full' } })
    host.handle('old', { t: 'hello', v: PROTOCOL_VERSION + 1, name: 'OLD' })
    expect(sent.at(-1)).toEqual({ to: 'old', message: { t: 'error', code: 'bad-version' } })
  })

  it('avvia solo con almeno un giocatore per squadra', () => {
    const { host, join } = createRoom()
    join('host')
    expect(host.start()).toBe(false)
    join('p2')
    expect(host.start()).toBe(true)
    expect(host.currentPhase).toBe('playing')
  })

  it('non accetta nuovi giocatori a partita iniziata', () => {
    const { host, sent, join } = startedRoom()
    join('late')
    expect(host.lobby).toHaveLength(2)
    expect(sent.at(-1)?.message).toEqual({ t: 'error', code: 'match-running' })
  })

  it('applica i colpi validi, limita il danno e assegna il punto alla squadra', () => {
    const { host, broadcasts } = startedRoom()
    const ar = WEAPONS['ar-07']
    host.handle('host', { t: 'hit', target: 'p2', damage: 9999, headshot: true, source: 'gun', weapon: 'ar-07' })
    const damage = lastOfType(broadcasts, 'damage')
    expect(damage?.amount).toBe(ar.damage * ar.headshotMultiplier)
    for (let shot = 0; shot < 5; shot += 1) {
      host.tick(0.06)
      host.handle('host', { t: 'hit', target: 'p2', damage: 40, headshot: true, source: 'gun', weapon: 'ar-07' })
    }
    expect(lastOfType(broadcasts, 'kill')).toEqual({ t: 'kill', killer: 'host', victim: 'p2', headshot: true })
    host.tick(0.1)
    const snapshot = lastOfType(broadcasts, 'snapshot')
    expect(snapshot?.scores).toEqual({ alpha: 1, bravo: 0 })
    expect(snapshot?.players.find((player) => player.id === 'p2')).toMatchObject({ alive: false, deaths: 1 })
  })

  it('ignora fuoco amico, bersagli inesistenti e colpi fuori gittata', () => {
    const { host, broadcasts, join } = createRoom()
    join('host')
    join('p2')
    join('p3')
    host.start()
    host.tick(SPAWN_PROTECTION + 0.01)
    const before = broadcasts.filter((message) => message.t === 'damage').length
    host.handle('host', { t: 'hit', target: 'p3', damage: 20, headshot: false, source: 'gun', weapon: 'ar-07' })
    host.handle('host', { t: 'hit', target: 'ghost', damage: 20, headshot: false, source: 'gun', weapon: 'ar-07' })
    host.handle('host', { t: 'state', x: 0, y: 0, z: 18, yaw: 0, pitch: 0 })
    host.handle('p2', { t: 'state', x: 0, y: 0, z: -18, yaw: 0, pitch: 0 })
    host.handle('host', { t: 'hit', target: 'p2', damage: 11, headshot: false, source: 'gun', weapon: 'sg-6' })
    expect(broadcasts.filter((message) => message.t === 'damage').length).toBe(before)
  })

  it('protegge allo spawn e fa rientrare dopo il ritardo di respawn', () => {
    const { host, broadcasts, join } = createRoom()
    join('host')
    join('p2')
    host.start()
    host.handle('host', { t: 'hit', target: 'p2', damage: 30, headshot: false, source: 'gun', weapon: 'ar-07' })
    expect(lastOfType(broadcasts, 'damage')).toBeUndefined()
    host.tick(SPAWN_PROTECTION + 0.01)
    host.handle('host', { t: 'hit', target: 'p2', damage: 90, headshot: false, source: 'grenade', weapon: 'ar-07' })
    host.tick(0.06)
    host.handle('host', { t: 'hit', target: 'p2', damage: 90, headshot: false, source: 'grenade', weapon: 'ar-07' })
    expect(lastOfType(broadcasts, 'kill')?.victim).toBe('p2')
    host.tick(TCT_CONFIG.respawnDelay + 0.1)
    const snapshot = lastOfType(broadcasts, 'snapshot')
    expect(snapshot?.players.find((player) => player.id === 'p2')).toMatchObject({ alive: true, health: 100 })
  })

  it('termina allo scadere del tempo e assegna la vittoria a tavolino se una squadra resta vuota', () => {
    const timed = startedRoom()
    timed.host.tick(TCT_CONFIG.matchDuration)
    expect(lastOfType(timed.broadcasts, 'end')?.winner).toBe('draw')

    const forfeit = startedRoom()
    forfeit.host.leave('p2')
    expect(lastOfType(forfeit.broadcasts, 'end')?.winner).toBe('alpha')
    expect(forfeit.host.currentPhase).toBe('ended')
  })

  it('scarta messaggi malformati senza alterare lo stato', () => {
    const { host, join } = startedRoom()
    host.handle('host', '{"t":"hit","target":"p2","damage":"tanto"}')
    host.handle('host', 'non json')
    host.handle('host', { t: 'state', x: Number.NaN, y: 0, z: 0, yaw: 0, pitch: 0 })
    join('x')
    expect(host.lobby).toHaveLength(2)
  })
})

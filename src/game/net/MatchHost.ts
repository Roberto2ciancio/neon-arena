import { MAPS } from '../maps'
import type { MapDefinition } from '../maps'
import { getMatchWinner, getTeamSpawn, TCT_CONFIG } from '../tctRules'
import {
  assignTeamSlot,
  canStartMatch,
  getMaxHitDamage,
  getMaxHitRange,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  parseClientMessage,
} from './protocol'
import type { HostMessage, LobbyPlayer, NetTeam, PlayerSnapshot, TeamScores } from './protocol'

export const SNAPSHOT_INTERVAL = 1 / 15
export const SPAWN_PROTECTION = 1
const HIT_INVULNERABILITY = 0.05
const MAX_HITS_PER_SECOND = 40
/** Quota massima raggiungibile: tetti degli edifici più alti con margine per il salto. */
const MAX_HEIGHT = 14

interface HostPlayer extends PlayerSnapshot {
  invulnerability: number
  hitBudget: number
}

export type MatchPhase = 'lobby' | 'playing' | 'ended'

/**
 * Stato autorevole della stanza TCT. Vive solo sul browser dell'host e non dipende da DOM o rete:
 * riceve messaggi già associati a un peer e produce messaggi tramite `send` / `broadcast`.
 */
export class MatchHost {
  private readonly players = new Map<string, HostPlayer>()
  private phase: MatchPhase = 'lobby'
  private map: MapDefinition
  private scores: TeamScores = { alpha: 0, bravo: 0 }
  private timeRemaining: number = TCT_CONFIG.matchDuration
  private snapshotTimer = 0

  constructor(
    readonly hostId: string,
    mapId: string,
    private readonly send: (peerId: string, message: HostMessage) => void,
    private readonly broadcast: (message: HostMessage) => void,
  ) {
    this.map = MAPS.find((map) => map.id === mapId) ?? MAPS[1]
  }

  get currentPhase(): MatchPhase {
    return this.phase
  }

  get lobby(): LobbyPlayer[] {
    return [...this.players.values()].map(({ id, name, team, slot }) => ({ id, name, team, slot }))
  }

  get canStart(): boolean {
    return this.phase !== 'playing' && canStartMatch(this.lobby)
  }

  setMap(mapId: string): void {
    if (this.phase === 'playing') return
    const map = MAPS.find((candidate) => candidate.id === mapId)
    if (!map) return
    this.map = map
    this.broadcastLobby()
  }

  handle(peerId: string, raw: unknown): void {
    const message = parseClientMessage(raw)
    if (!message) return
    if (message.t === 'hello') {
      this.join(peerId, message.v, message.name)
      return
    }
    const player = this.players.get(peerId)
    if (!player) return
    switch (message.t) {
      case 'team': {
        if (this.phase === 'playing' || player.team === message.team) return
        const others = this.lobby.filter((entry) => entry.id !== peerId)
        const assignment = assignTeamSlot(others, message.team)
        if (!assignment) return
        player.team = assignment.team
        player.slot = assignment.slot
        this.broadcastLobby()
        return
      }
      case 'state':
        if (this.phase !== 'playing' || !player.alive) return
        player.x = clamp(message.x, -this.map.arenaLimit, this.map.arenaLimit)
        player.z = clamp(message.z, -this.map.arenaLimit, this.map.arenaLimit)
        player.y = clamp(message.y, 0, MAX_HEIGHT)
        player.crouch = message.crouch
        player.yaw = message.yaw
        player.pitch = clamp(message.pitch, -1.6, 1.6)
        return
      case 'shot':
        if (this.phase !== 'playing' || !player.alive) return
        this.broadcast({ t: 'shot', by: peerId, from: message.from, to: message.to })
        return
      case 'grenade':
        if (this.phase !== 'playing' || !player.alive) return
        this.broadcast({ t: 'grenade', by: peerId, pos: message.pos, vel: message.vel })
        return
      case 'turret':
        if (this.phase !== 'playing' || !player.alive) return
        this.broadcast({ t: 'turret', by: peerId, pos: message.pos })
        return
      case 'hit':
        this.applyHit(player, message.target, message.damage, message.headshot, getMaxHitDamage(message.source, message.weapon), getMaxHitRange(message.source, message.weapon), message.source === 'gun')
        return
    }
  }

  leave(peerId: string): void {
    if (!this.players.delete(peerId)) return
    if (this.phase === 'playing') {
      const winner = this.getForfeitWinner()
      if (winner) this.finish(winner)
    } else {
      this.broadcastLobby()
    }
  }

  start(): boolean {
    if (!this.canStart) return false
    this.phase = 'playing'
    this.scores = { alpha: 0, bravo: 0 }
    this.timeRemaining = TCT_CONFIG.matchDuration
    this.snapshotTimer = 0
    for (const player of this.players.values()) {
      this.resetPlayer(player)
      player.kills = 0
      player.deaths = 0
    }
    this.broadcast({ t: 'start', mapId: this.map.id, duration: TCT_CONFIG.matchDuration, scoreLimit: TCT_CONFIG.scoreLimit, players: this.lobby })
    this.broadcastSnapshot()
    return true
  }

  /** Riporta la stanza in lobby dopo la fine di un match, mantenendo i giocatori connessi. */
  backToLobby(): void {
    if (this.phase === 'playing') return
    this.phase = 'lobby'
    this.broadcastLobby()
  }

  tick(delta: number): void {
    if (this.phase !== 'playing') return
    this.timeRemaining = Math.max(0, this.timeRemaining - delta)
    for (const player of this.players.values()) {
      player.invulnerability = Math.max(0, player.invulnerability - delta)
      player.hitBudget = Math.min(MAX_HITS_PER_SECOND, player.hitBudget + MAX_HITS_PER_SECOND * delta)
      if (!player.alive) {
        player.respawn = Math.max(0, player.respawn - delta)
        if (player.respawn <= 0) this.resetPlayer(player)
      }
    }
    const winner = getWinner(this.scores, this.timeRemaining)
    if (winner) {
      this.finish(winner)
      return
    }
    this.snapshotTimer -= delta
    if (this.snapshotTimer <= 0) {
      this.snapshotTimer = SNAPSHOT_INTERVAL
      this.broadcastSnapshot()
    }
  }

  private join(peerId: string, version: number, name: string): void {
    if (version !== PROTOCOL_VERSION) {
      this.send(peerId, { t: 'error', code: 'bad-version' })
      return
    }
    if (this.players.has(peerId)) return
    if (this.phase === 'playing') {
      this.send(peerId, { t: 'error', code: 'match-running' })
      return
    }
    const assignment = this.players.size < MAX_PLAYERS ? assignTeamSlot(this.lobby) : null
    if (!assignment) {
      this.send(peerId, { t: 'error', code: 'room-full' })
      return
    }
    const spawn = getTeamSpawn(assignment.team, assignment.slot, this.map.arenaLimit)
    this.players.set(peerId, {
      id: peerId,
      name: name.trim() || 'PLAYER',
      team: assignment.team,
      slot: assignment.slot,
      x: spawn.x,
      y: 0,
      z: spawn.z,
      yaw: 0,
      pitch: 0,
      health: 100,
      alive: true,
      respawn: 0,
      kills: 0,
      deaths: 0,
      crouch: false,
      invulnerability: 0,
      hitBudget: MAX_HITS_PER_SECOND,
    })
    this.send(peerId, { t: 'welcome', v: PROTOCOL_VERSION, id: peerId, hostId: this.hostId })
    this.broadcastLobby()
  }

  private applyHit(shooter: HostPlayer, targetId: string, requested: number, headshot: boolean, maxDamage: number, maxRange: number, directFire: boolean): void {
    if (this.phase !== 'playing') return
    const target = this.players.get(targetId)
    if (!target || !target.alive || target.team === shooter.team || target.invulnerability > 0) return
    // Il fuoco diretto richiede che chi spara sia vivo; granate e torrette possono colpire dopo la morte del proprietario.
    if (directFire && !shooter.alive) return
    if (shooter.hitBudget < 1) return
    const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y, target.z - shooter.z)
    if (directFire && distance > maxRange) return
    shooter.hitBudget -= 1
    const damage = Math.min(requested, maxDamage)
    target.health = Math.max(0, target.health - damage)
    target.invulnerability = HIT_INVULNERABILITY
    this.broadcast({ t: 'damage', target: target.id, by: shooter.id, amount: damage, headshot })
    if (target.health > 0) return
    target.alive = false
    target.respawn = TCT_CONFIG.respawnDelay
    target.deaths += 1
    shooter.kills += 1
    this.scores[shooter.team] += 1
    this.broadcast({ t: 'kill', killer: shooter.id, victim: target.id, headshot })
  }

  private resetPlayer(player: HostPlayer): void {
    const spawn = getTeamSpawn(player.team, player.slot, this.map.arenaLimit)
    player.x = spawn.x
    player.y = 0
    player.z = spawn.z
    player.yaw = player.team === 'alpha' ? 0 : Math.PI
    player.pitch = 0
    player.health = 100
    player.crouch = false
    player.alive = true
    player.respawn = 0
    player.invulnerability = SPAWN_PROTECTION
  }

  private getForfeitWinner(): NetTeam | null {
    const lobby = this.lobby
    const alpha = lobby.some((player) => player.team === 'alpha')
    const bravo = lobby.some((player) => player.team === 'bravo')
    if (alpha && bravo) return null
    return alpha ? 'alpha' : 'bravo'
  }

  private finish(winner: NetTeam | 'draw'): void {
    this.phase = 'ended'
    this.broadcast({ t: 'end', winner, scores: { ...this.scores }, players: this.snapshotPlayers() })
  }

  private snapshotPlayers(): PlayerSnapshot[] {
    return [...this.players.values()].map(({ invulnerability: _invulnerability, hitBudget: _hitBudget, ...snapshot }) => ({
      ...snapshot,
      x: round(snapshot.x),
      y: round(snapshot.y),
      z: round(snapshot.z),
      yaw: round(snapshot.yaw, 3),
      pitch: round(snapshot.pitch, 3),
      health: Math.ceil(snapshot.health),
      respawn: round(snapshot.respawn, 1),
    }))
  }

  private broadcastSnapshot(): void {
    this.broadcast({ t: 'snapshot', time: round(this.timeRemaining, 1), scores: { ...this.scores }, players: this.snapshotPlayers() })
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', players: this.lobby, mapId: this.map.id, hostId: this.hostId })
  }
}

export function getWinner(scores: TeamScores, timeRemaining: number): NetTeam | 'draw' | null {
  return getMatchWinner(scores.alpha, scores.bravo, timeRemaining)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

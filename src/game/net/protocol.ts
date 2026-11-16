import { WEAPONS } from '../weapons'
import type { WeaponId } from '../weapons'
import { TCT_CONFIG } from '../tctRules'
import type { TctTeam } from '../tctRules'

export const PROTOCOL_VERSION = 1
export const MAX_PLAYERS_PER_TEAM: number = TCT_CONFIG.maxPlayersPerTeam
export const MAX_PLAYERS = MAX_PLAYERS_PER_TEAM * 2
export const MAX_MESSAGE_BYTES = 4096
export const ROOM_CODE_LENGTH = 5
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type NetTeam = TctTeam
export type Vec3 = [number, number, number]
export type HitSource = 'gun' | 'grenade' | 'turret'

export interface LobbyPlayer {
  id: string
  name: string
  team: NetTeam
  slot: number
}

export interface PlayerSnapshot extends LobbyPlayer {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  health: number
  alive: boolean
  respawn: number
  kills: number
  deaths: number
  crouch: boolean
}

export interface TeamScores {
  alpha: number
  bravo: number
}

export type ClientMessage =
  | { t: 'hello'; v: number; name: string }
  | { t: 'team'; team: NetTeam }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean }
  | { t: 'shot'; from: Vec3; to: Vec3 }
  | { t: 'hit'; target: string; damage: number; headshot: boolean; source: HitSource; weapon: WeaponId }
  | { t: 'grenade'; pos: Vec3; vel: Vec3 }
  | { t: 'turret'; pos: Vec3 }

export type HostMessage =
  | { t: 'welcome'; v: number; id: string; hostId: string }
  | { t: 'lobby'; players: LobbyPlayer[]; mapId: string; hostId: string }
  | { t: 'start'; mapId: string; duration: number; scoreLimit: number; players: LobbyPlayer[] }
  | { t: 'snapshot'; time: number; scores: TeamScores; players: PlayerSnapshot[] }
  | { t: 'shot'; by: string; from: Vec3; to: Vec3 }
  | { t: 'grenade'; by: string; pos: Vec3; vel: Vec3 }
  | { t: 'turret'; by: string; pos: Vec3 }
  | { t: 'damage'; target: string; by: string; amount: number; headshot: boolean }
  | { t: 'kill'; killer: string; victim: string; headshot: boolean }
  | { t: 'end'; winner: NetTeam | 'draw'; scores: TeamScores; players: PlayerSnapshot[] }
  | { t: 'error'; code: NetErrorCode }

export type NetErrorCode = 'room-full' | 'match-running' | 'bad-version' | 'host-left' | 'not-found' | 'network'

export const NET_ERROR_MESSAGES: Record<NetErrorCode, string> = {
  'room-full': 'La stanza è piena (massimo 8 giocatori).',
  'match-running': 'La partita in questa stanza è già iniziata.',
  'bad-version': 'Versione del gioco diversa da quella dell’host. Ricarica la pagina.',
  'host-left': 'L’host ha chiuso la stanza.',
  'not-found': 'Stanza non trovata. Controlla il codice.',
  network: 'Connessione non riuscita. Riprova.',
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.min(0.999999, Math.max(0, random())) * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  for (const character of code) if (!ROOM_CODE_ALPHABET.includes(character)) return null
  return code
}

export function otherTeam(team: NetTeam): NetTeam {
  return team === 'alpha' ? 'bravo' : 'alpha'
}

/** Assegna la squadra meno numerosa (alpha a parità) e il primo slot libero. */
export function assignTeamSlot(players: readonly LobbyPlayer[], preferred?: NetTeam): { team: NetTeam; slot: number } | null {
  const count = (team: NetTeam) => players.filter((player) => player.team === team).length
  const candidates: NetTeam[] = preferred
    ? [preferred]
    : count('bravo') < count('alpha') ? ['bravo', 'alpha'] : ['alpha', 'bravo']
  for (const team of candidates) {
    if (count(team) >= MAX_PLAYERS_PER_TEAM) continue
    const used = new Set(players.filter((player) => player.team === team).map((player) => player.slot))
    for (let slot = 0; slot < MAX_PLAYERS_PER_TEAM; slot += 1) {
      if (!used.has(slot)) return { team, slot }
    }
  }
  return null
}

export function canStartMatch(players: readonly LobbyPlayer[]): boolean {
  return players.some((player) => player.team === 'alpha') && players.some((player) => player.team === 'bravo')
}

/** Danno massimo plausibile per un singolo messaggio di colpo. */
export function getMaxHitDamage(source: HitSource, weapon: WeaponId): number {
  if (source === 'grenade') return 90
  if (source === 'turret') return 14
  const definition = WEAPONS[weapon]
  return definition.damage * definition.headshotMultiplier * definition.pellets
}

export function getMaxHitRange(source: HitSource, weapon: WeaponId): number {
  if (source === 'grenade') return 30
  if (source === 'turret') return 30
  return WEAPONS[weapon].range + 2
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
const isTeam = (value: unknown): value is NetTeam => value === 'alpha' || value === 'bravo'
const isShortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max

function decode(raw: unknown): Record<string, unknown> | null {
  let value = raw
  if (typeof raw === 'string') {
    if (raw.length > MAX_MESSAGE_BYTES) return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Valida un messaggio ricevuto da un client: tutto ciò che non rispetta lo schema viene scartato. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  const data = decode(raw)
  if (!data) return null
  switch (data.t) {
    case 'hello':
      return isFiniteNumber(data.v) && typeof data.name === 'string' ? { t: 'hello', v: data.v, name: data.name.slice(0, 12) } : null
    case 'team':
      return isTeam(data.team) ? { t: 'team', team: data.team } : null
    case 'state':
      return [data.x, data.y, data.z, data.yaw, data.pitch].every(isFiniteNumber)
        ? { t: 'state', x: data.x as number, y: data.y as number, z: data.z as number, yaw: data.yaw as number, pitch: data.pitch as number, crouch: data.crouch === true }
        : null
    case 'shot':
      return isVec3(data.from) && isVec3(data.to) ? { t: 'shot', from: data.from, to: data.to } : null
    case 'hit':
      if (!isShortString(data.target, 64) || !isFiniteNumber(data.damage) || data.damage <= 0 || typeof data.headshot !== 'boolean') return null
      if (data.source !== 'gun' && data.source !== 'grenade' && data.source !== 'turret') return null
      if (typeof data.weapon !== 'string' || !(data.weapon in WEAPONS)) return null
      return { t: 'hit', target: data.target, damage: data.damage, headshot: data.headshot, source: data.source, weapon: data.weapon as WeaponId }
    case 'grenade':
      return isVec3(data.pos) && isVec3(data.vel) ? { t: 'grenade', pos: data.pos, vel: data.vel } : null
    case 'turret':
      return isVec3(data.pos) ? { t: 'turret', pos: data.pos } : null
    default:
      return null
  }
}

/** I messaggi dell'host sono considerati affidabili: si controlla solo la forma minima. */
export function parseHostMessage(raw: unknown): HostMessage | null {
  const data = decode(raw)
  if (!data || typeof data.t !== 'string') return null
  const known = ['welcome', 'lobby', 'start', 'snapshot', 'shot', 'grenade', 'turret', 'damage', 'kill', 'end', 'error']
  return known.includes(data.t) ? data as unknown as HostMessage : null
}

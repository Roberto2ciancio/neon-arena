import { DEFAULT_COSMETICS, normalizeCosmetics } from '../cosmetics'
import type { Cosmetics } from '../cosmetics'
import type { EnemyKind } from '../types'
import type { PowerUpId } from '../powerups'
import { POWER_UPS } from '../powerups'
import { MAX_COOP_HIT_DAMAGE, MAX_COOP_PLAYERS } from './coopRules'
import type { CoopPlayerStatus } from './coopRules'

export const COOP_PROTOCOL_VERSION = 1
/** I messaggi dei client sono piccoli; quelli dell'host (stato del mondo) possono essere più grandi. */
export const MAX_COOP_CLIENT_BYTES = 2048
export const MAX_COOP_HOST_BYTES = 65536

export const ENEMY_KINDS: readonly EnemyKind[] = ['walker', 'runner', 'armored', 'brute', 'crawler', 'spitter', 'screamer', 'leaper', 'bloater', 'stalker', 'shielder']
const STATUSES: readonly CoopPlayerStatus[] = ['alive', 'down', 'dead']

export type Vec3 = [number, number, number]

export interface CoopLobbyPlayer {
  id: string
  name: string
  cosmetics: Cosmetics
}

/** Giocatore nello stato del mondo inviato dall'host. */
export interface CoopPlayerState {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  crouch: boolean
  health: number
  status: CoopPlayerStatus
  kills: number
}

/**
 * Zombie compresso in un array di numeri per ridurre la dimensione dei messaggi:
 * [id, tipo, x, y, z, rotazione, vita % 0–100, flag] — flag: 1 élite, 2 in uscita dal terreno, 4 attacco.
 */
export type PackedEnemy = [number, number, number, number, number, number, number, number]

export const ENEMY_FLAG_ELITE = 1
export const ENEMY_FLAG_RISING = 2
export const ENEMY_FLAG_ATTACK = 4

export type CoopClientMessage =
  | { t: 'hello'; v: number; name: string; cosmetics: Cosmetics }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean; health: number; status: CoopPlayerStatus }
  | { t: 'shot'; from: Vec3; to: Vec3 }
  | { t: 'hit'; enemy: number; damage: number; precision: boolean }
  | { t: 'door'; id: string }
  | { t: 'revive'; target: string }

export type CoopHostMessage =
  | { t: 'welcome'; v: number; id: string; hostId: string }
  | { t: 'lobby'; players: CoopLobbyPlayer[]; mapId: string; hostId: string }
  | { t: 'start'; mapId: string; players: CoopLobbyPlayer[] }
  | { t: 'world'; wave: number; waveBreak: number; remaining: number; enemies: PackedEnemy[]; players: CoopPlayerState[] }
  | { t: 'shot'; by: string; from: Vec3; to: Vec3 }
  | { t: 'wave'; wave: number }
  | { t: 'kill'; enemy: number; by: string; kind: EnemyKind; pos: Vec3; score: number; xp: number; shards: number; precision: boolean }
  | { t: 'damage'; target: string; amount: number }
  | { t: 'acid'; pos: Vec3; vel: Vec3 }
  | { t: 'power-spawn'; id: number; power: PowerUpId; pos: Vec3 }
  | { t: 'power-take'; id: number; power: PowerUpId; by: string }
  | { t: 'door'; id: string }
  | { t: 'revived'; target: string; by: string }
  | { t: 'end'; wave: number; won: boolean }
  | { t: 'error'; code: CoopErrorCode }

export type CoopErrorCode = 'room-full' | 'match-running' | 'bad-version' | 'host-left' | 'not-found' | 'network'

export const COOP_ERROR_MESSAGES: Record<CoopErrorCode, string> = {
  'room-full': `La squadra è al completo (massimo ${MAX_COOP_PLAYERS} giocatori).`,
  'match-running': 'La partita di questa stanza è già iniziata.',
  'bad-version': 'Versione del gioco diversa da quella dell’host. Ricarica la pagina.',
  'host-left': 'L’host ha chiuso la stanza.',
  'not-found': 'Stanza non trovata. Controlla il codice.',
  network: 'Connessione non riuscita. Riprova.',
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
const isShortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max

function decode(raw: unknown, maxBytes: number): Record<string, unknown> | null {
  let value = raw
  if (typeof raw === 'string') {
    if (raw.length > maxBytes) return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Messaggi dei compagni: tutto ciò che non rispetta lo schema viene scartato dall'host. */
export function parseCoopClientMessage(raw: unknown): CoopClientMessage | null {
  const data = decode(raw, MAX_COOP_CLIENT_BYTES)
  if (!data) return null
  switch (data.t) {
    case 'hello':
      if (!isFiniteNumber(data.v) || typeof data.name !== 'string') return null
      return { t: 'hello', v: data.v, name: data.name.slice(0, 12), cosmetics: data.cosmetics === undefined ? { ...DEFAULT_COSMETICS } : normalizeCosmetics(data.cosmetics) }
    case 'state':
      if (![data.x, data.y, data.z, data.yaw, data.pitch, data.health].every(isFiniteNumber)) return null
      if (!(STATUSES as readonly unknown[]).includes(data.status)) return null
      return {
        t: 'state', x: data.x as number, y: data.y as number, z: data.z as number, yaw: data.yaw as number, pitch: data.pitch as number,
        crouch: data.crouch === true, health: Math.max(0, data.health as number), status: data.status as CoopPlayerStatus,
      }
    case 'shot':
      return isVec3(data.from) && isVec3(data.to) ? { t: 'shot', from: data.from, to: data.to } : null
    case 'hit':
      if (!isFiniteNumber(data.enemy) || !Number.isInteger(data.enemy) || !isFiniteNumber(data.damage)) return null
      if (data.damage <= 0 || data.damage > MAX_COOP_HIT_DAMAGE) return null
      return { t: 'hit', enemy: data.enemy, damage: data.damage, precision: data.precision === true }
    case 'door':
      return isShortString(data.id, 64) ? { t: 'door', id: data.id } : null
    case 'revive':
      return isShortString(data.target, 64) ? { t: 'revive', target: data.target } : null
    default:
      return null
  }
}

const HOST_TYPES = ['welcome', 'lobby', 'start', 'world', 'shot', 'wave', 'kill', 'damage', 'acid', 'power-spawn', 'power-take', 'door', 'revived', 'end', 'error']

/** I messaggi dell'host sono affidabili: si controlla la forma minima e i valori usati come indici. */
export function parseCoopHostMessage(raw: unknown): CoopHostMessage | null {
  const data = decode(raw, MAX_COOP_HOST_BYTES)
  if (!data || typeof data.t !== 'string' || !HOST_TYPES.includes(data.t)) return null
  if (data.t === 'kill' && !ENEMY_KINDS.includes(data.kind as EnemyKind)) return null
  if ((data.t === 'power-spawn' || data.t === 'power-take') && !(typeof data.power === 'string' && data.power in POWER_UPS)) return null
  if (data.t === 'world' && (!Array.isArray(data.enemies) || !Array.isArray(data.players))) return null
  return data as unknown as CoopHostMessage
}

export function packEnemy(id: number, kind: EnemyKind, x: number, y: number, z: number, yaw: number, healthShare: number, flags: number): PackedEnemy {
  const round = (value: number) => Math.round(value * 100) / 100
  return [id, Math.max(0, ENEMY_KINDS.indexOf(kind)), round(x), round(y), round(z), round(yaw), Math.round(Math.min(1, Math.max(0, healthShare)) * 100), flags]
}

export function unpackEnemy(packed: PackedEnemy): { id: number; kind: EnemyKind; x: number; y: number; z: number; yaw: number; healthShare: number; flags: number } {
  const [id, kind, x, y, z, yaw, health, flags] = packed
  return { id, kind: ENEMY_KINDS[kind] ?? 'walker', x, y, z, yaw, healthShare: health / 100, flags }
}

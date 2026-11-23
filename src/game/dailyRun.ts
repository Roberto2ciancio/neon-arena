/**
 * Run del giorno (piano gameplay G5): stessa mappa, stesse carte e stessa sequenza di eventi,
 * miniboss ed eventi rari per tutti nello stesso giorno (UTC, come la classifica del giorno nel
 * database). Le postazioni sono già uguali per tutti (dipendono da mappa e ondata).
 */
import { MAPS } from './maps'
import type { RunModifierId } from './runModifiers'
import type { KeyValueStorage } from './progression'

export const DAILY_BEST_STORAGE_KEY = 'neon-arena:daily-best:v1'

/** Data UTC `AAAA-MM-GG`: cambia alla mezzanotte UTC per tutti. */
export function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function hashText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Generatore pseudo-casuale riproducibile (mulberry32). */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Carte possibili nella run del giorno (niente "un colpo e sei a terra": troppo punitiva per una sfida per tutti). */
const DAILY_CARD_POOL: readonly RunModifierId[] = ['pistols-only', 'giants', 'fast', 'no-shop', 'fragile', 'swarm', 'night']

export interface DailyRun {
  key: string
  seed: number
  mapId: string
  modifiers: RunModifierId[]
}

export function createDailyRun(key: string): DailyRun {
  const seed = hashText(`neon-arena-daily:${key}`)
  const random = createSeededRandom(seed)
  const mapId = MAPS[Math.floor(random() * MAPS.length)]!.id
  const pool = [...DAILY_CARD_POOL]
  const modifiers: RunModifierId[] = []
  const count = random() < 0.5 ? 1 : 2
  while (modifiers.length < count) modifiers.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!)
  // Solo pistole e niente acquisti insieme renderebbero la run senza scelte.
  if (modifiers.includes('pistols-only') && modifiers.includes('no-shop')) modifiers.splice(modifiers.indexOf('no-shop'), 1)
  return { key, seed, mapId, modifiers }
}

export function loadDailyBest(storage: KeyValueStorage, key: string): number {
  try {
    const parsed = JSON.parse(storage.getItem(DAILY_BEST_STORAGE_KEY) ?? 'null') as { key?: unknown; score?: unknown } | null
    return parsed && parsed.key === key && typeof parsed.score === 'number' ? parsed.score : 0
  } catch {
    return 0
  }
}

/** Salva il punteggio se è il migliore di oggi; restituisce true se è un nuovo record. */
export function recordDailyScore(storage: KeyValueStorage, key: string, score: number): boolean {
  if (score <= loadDailyBest(storage, key)) return false
  try {
    storage.setItem(DAILY_BEST_STORAGE_KEY, JSON.stringify({ key, score }))
  } catch {
    // Storage pieno o bloccato: il record vale per la sessione.
  }
  return true
}

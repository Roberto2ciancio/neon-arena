/**
 * Sfide giornaliere e settimanali (Fase 13). Scelte in modo riproducibile dalla data, così
 * sono uguali per tutti nello stesso giorno; l'avanzamento resta sul dispositivo (e nel
 * salvataggio dell'account). Le ricompense sono XP e frammenti, mai vantaggi in classifica:
 * finché manca un server autorevole le sfide non sono certificate.
 */
import type { RunResult } from './types'
import { WEAPONS } from './weapons'
import type { WeaponCategory } from './weapons'
import type { KeyValueStorage } from './progression'

export const CHALLENGES_STORAGE_KEY = 'neon-arena:challenges:v1'

export type ChallengeMetric =
  | 'kills' | 'precision' | 'wave' | 'combo' | 'runs' | 'coop' | 'victory'
  | 'category-kills' | 'map-kills' | 'tct-kills' | 'tct-wins'

export interface ChallengeTemplate {
  id: string
  metric: ChallengeMetric
  /** Obiettivo per le sfide giornaliere e settimanali (null = non usata in quel periodo). */
  daily: number | null
  weekly: number | null
  /** `wave` e `combo` contano il migliore in una singola run, le altre si sommano. */
  best?: boolean
}

export const CHALLENGE_POOL: readonly ChallengeTemplate[] = [
  { id: 'kills', metric: 'kills', daily: 150, weekly: 1200 },
  { id: 'precision', metric: 'precision', daily: 60, weekly: 500 },
  { id: 'wave', metric: 'wave', daily: 8, weekly: 12, best: true },
  { id: 'combo', metric: 'combo', daily: 15, weekly: 30, best: true },
  { id: 'runs', metric: 'runs', daily: 3, weekly: 15 },
  { id: 'coop', metric: 'coop', daily: 1, weekly: 4 },
  { id: 'victory', metric: 'victory', daily: null, weekly: 1 },
  { id: 'category-kills', metric: 'category-kills', daily: 60, weekly: 400 },
  { id: 'map-kills', metric: 'map-kills', daily: 100, weekly: 700 },
  { id: 'tct-kills', metric: 'tct-kills', daily: 15, weekly: 100 },
  { id: 'tct-wins', metric: 'tct-wins', daily: 1, weekly: 5 },
]

/** Categorie e mappe scelte dal seme per le sfide "con un tipo d'arma" e "su una mappa". */
export const CHALLENGE_CATEGORIES: readonly WeaponCategory[] = ['assault', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol', 'launcher']
export const CHALLENGE_MAPS: readonly { id: string; name: string }[] = [
  { id: 'station-13', name: 'STAZIONE 13' },
  { id: 'depot-06', name: 'DEPOSITO 06' },
  { id: 'district-zero', name: 'DISTRETTO ZERO' },
  { id: 'port-09', name: 'PORTO 09' },
  { id: 'lab-21', name: 'LAB 21' },
  { id: 'metro-07', name: 'METRO 7' },
]

const CATEGORY_NAMES: Record<WeaponCategory, string> = {
  assault: 'fucili d’assalto', smg: 'mitragliette', shotgun: 'fucili a pompa', sniper: 'armi di precisione',
  lmg: 'mitragliatrici', pistol: 'pistole', 'machine-pistol': 'pistole automatiche', launcher: 'lanciatori',
}

export const CHALLENGE_REWARDS = {
  daily: { xp: 250, shards: 3 },
  weekly: { xp: 1200, shards: 15 },
} as const

export type ChallengePeriod = keyof typeof CHALLENGE_REWARDS

export interface ActiveChallenge {
  id: string
  metric: ChallengeMetric
  goal: number
  progress: number
  done: boolean
  best: boolean
  /** Parametro scelto dal seme: categoria d'arma o id della mappa. */
  param?: string
}

export interface ChallengeSet {
  key: string
  items: ActiveChallenge[]
}

export interface ChallengeState {
  daily: ChallengeSet
  weekly: ChallengeSet
}

export function getDailyKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Settimana ISO (da lunedì): `2026-W48`. */
export function getWeekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Generatore pseudo-casuale riproducibile da una stringa (stesse sfide per tutti). */
function seeded(text: string): () => number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return (hash >>> 0) / 4294967296
  }
}

export function createChallengeSet(period: ChallengePeriod, key: string): ChallengeSet {
  const random = seeded(`${period}:${key}`)
  const pool = CHALLENGE_POOL.filter((template) => template[period] !== null)
  const count = period === 'daily' ? 3 : 2
  const items: ActiveChallenge[] = []
  // Al massimo una sfida TCT per gruppo: chi gioca solo Zombie non resta bloccato.
  let tct = false
  while (items.length < count && pool.length > 0) {
    const [template] = pool.splice(Math.floor(random() * pool.length), 1)
    if (!template) break
    const isTct = template.metric.startsWith('tct')
    if (isTct && tct) continue
    tct ||= isTct
    const item: ActiveChallenge = { id: template.id, metric: template.metric, goal: template[period]!, progress: 0, done: false, best: template.best === true }
    if (template.metric === 'category-kills') item.param = CHALLENGE_CATEGORIES[Math.floor(random() * CHALLENGE_CATEGORIES.length)]
    if (template.metric === 'map-kills') item.param = CHALLENGE_MAPS[Math.floor(random() * CHALLENGE_MAPS.length)]!.id
    items.push(item)
  }
  return { key, items }
}

export function createChallengeState(now: Date): ChallengeState {
  return { daily: createChallengeSet('daily', getDailyKey(now)), weekly: createChallengeSet('weekly', getWeekKey(now)) }
}

/** Rinnova i gruppi scaduti (nuovo giorno o nuova settimana). */
export function refreshChallenges(state: ChallengeState, now: Date): ChallengeState {
  const daily = state.daily.key === getDailyKey(now) ? state.daily : createChallengeSet('daily', getDailyKey(now))
  const weekly = state.weekly.key === getWeekKey(now) ? state.weekly : createChallengeSet('weekly', getWeekKey(now))
  return daily === state.daily && weekly === state.weekly ? state : { daily, weekly }
}

export function describeChallenge(item: ActiveChallenge): string {
  switch (item.metric) {
    case 'kills': return `Elimina ${item.goal} zombie`
    case 'precision': return `Metti a segno ${item.goal} colpi alla testa o ai punti deboli`
    case 'wave': return `Raggiungi l’ondata ${item.goal} in una run`
    case 'combo': return `Fai una combo da ${item.goal} uccisioni`
    case 'runs': return `Gioca ${item.goal} run Zombie`
    case 'coop': return `Gioca ${item.goal === 1 ? 'una run' : `${item.goal} run`} in squadra`
    case 'victory': return 'Sopravvivi a tutte le 15 ondate ed evacua'
    case 'category-kills': return `Elimina ${item.goal} zombie con ${CATEGORY_NAMES[item.param as WeaponCategory] ?? 'qualsiasi arma'}`
    case 'map-kills': return `Elimina ${item.goal} zombie a ${CHALLENGE_MAPS.find((map) => map.id === item.param)?.name ?? 'qualsiasi mappa'}`
    case 'tct-kills': return `Fai ${item.goal} eliminazioni nel TCT`
    case 'tct-wins': return `Vinci ${item.goal === 1 ? 'una partita' : `${item.goal} partite`} TCT`
  }
}

export interface ChallengeEvent {
  zombie?: RunResult
  tct?: { kills: number; won: boolean }
}

function measure(item: ActiveChallenge, event: ChallengeEvent): number {
  const run = event.zombie
  const tct = event.tct
  switch (item.metric) {
    case 'kills': return run?.kills ?? 0
    case 'precision': return run?.precisionHits ?? 0
    case 'wave': return run?.wave ?? 0
    case 'combo': return run?.bestCombo ?? 0
    case 'runs': return run ? 1 : 0
    case 'coop': return run && (run.players ?? 1) > 1 ? 1 : 0
    // Solo la vittoria della modalità classica (15 ondate ed evacuazione).
    case 'victory': return run?.won && (!run.mode || run.mode === 'classic') ? 1 : 0
    case 'map-kills': return run && run.mapId === item.param ? run.kills : 0
    case 'category-kills': {
      if (!run?.weaponKills) return 0
      let total = 0
      for (const [id, kills] of Object.entries(run.weaponKills)) {
        if (id in WEAPONS && WEAPONS[id as keyof typeof WEAPONS].category === item.param) total += kills ?? 0
      }
      return total
    }
    case 'tct-kills': return tct?.kills ?? 0
    case 'tct-wins': return tct?.won ? 1 : 0
  }
}

function applyToSet(set: ChallengeSet, event: ChallengeEvent): { set: ChallengeSet; completed: ActiveChallenge[] } {
  const completed: ActiveChallenge[] = []
  const items = set.items.map((item) => {
    if (item.done) return item
    const value = Math.max(0, Math.floor(measure(item, event)))
    if (value === 0) return item
    const progress = Math.min(item.goal, item.best ? Math.max(item.progress, value) : item.progress + value)
    const next = { ...item, progress, done: progress >= item.goal }
    if (next.done) completed.push(next)
    return next
  })
  return { set: { ...set, items }, completed }
}

/** Registra una run o una partita TCT; restituisce le sfide appena completate per periodo. */
export function recordChallengeEvent(state: ChallengeState, event: ChallengeEvent, now: Date): { state: ChallengeState; daily: ActiveChallenge[]; weekly: ActiveChallenge[] } {
  const current = refreshChallenges(state, now)
  const daily = applyToSet(current.daily, event)
  const weekly = applyToSet(current.weekly, event)
  return { state: { daily: daily.set, weekly: weekly.set }, daily: daily.completed, weekly: weekly.completed }
}

export function getChallengeRewards(daily: number, weekly: number): { xp: number; shards: number } {
  return {
    xp: daily * CHALLENGE_REWARDS.daily.xp + weekly * CHALLENGE_REWARDS.weekly.xp,
    shards: daily * CHALLENGE_REWARDS.daily.shards + weekly * CHALLENGE_REWARDS.weekly.shards,
  }
}

function isChallengeSet(value: unknown): value is ChallengeSet {
  if (typeof value !== 'object' || value === null) return false
  const set = value as Partial<ChallengeSet>
  return typeof set.key === 'string' && Array.isArray(set.items) && set.items.every((item) =>
    typeof item === 'object' && item !== null && typeof item.id === 'string' && Number.isFinite(item.goal) && Number.isFinite(item.progress))
}

export function loadChallenges(storage: KeyValueStorage, now: Date): ChallengeState {
  try {
    const raw = storage.getItem(CHALLENGES_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<ChallengeState> : null
    if (parsed && isChallengeSet(parsed.daily) && isChallengeSet(parsed.weekly)) return refreshChallenges({ daily: parsed.daily, weekly: parsed.weekly }, now)
  } catch {
    // Salvataggio corrotto: si riparte dalle sfide del giorno.
  }
  return createChallengeState(now)
}

export function saveChallenges(storage: KeyValueStorage, state: ChallengeState): void {
  try {
    storage.setItem(CHALLENGES_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Spazio pieno o storage bloccato: le sfide restano valide per la sessione.
  }
}

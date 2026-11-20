/**
 * Categorie della classifica globale (Fase F) e formattazione dei valori. Le classifiche si
 * calcolano nel database (`get_leaderboard`): qui ci sono solo etichette, soglie e testi.
 */
export type LeaderboardTab = 'zombie' | 'tct' | 'weapons' | 'weekly'

export type LeaderboardCategory =
  | 'score' | 'wave' | 'wins' | 'avg_wave' | 'kills' | 'combo' | 'precision' | 'playtime'
  | 'kd' | 'tct_kills' | 'tct_wins' | 'win_rate'
  | 'weapon'

export interface CategoryInfo {
  id: LeaderboardCategory
  label: string
  /** Unità mostrata accanto al valore. */
  unit: 'points' | 'wave' | 'count' | 'ratio' | 'percent' | 'time'
  /** Partite minime per entrare (mostrate accanto al valore). */
  minGames: number
  /** Nome della colonna con il numero di partite. */
  gamesLabel: 'RUN' | 'PARTITE'
}

export const ZOMBIE_CATEGORIES: readonly CategoryInfo[] = [
  { id: 'score', label: 'PUNTEGGIO MIGLIORE', unit: 'points', minGames: 0, gamesLabel: 'RUN' },
  { id: 'wave', label: 'ONDATA PIÙ ALTA', unit: 'wave', minGames: 0, gamesLabel: 'RUN' },
  { id: 'wins', label: 'RUN COMPLETATE', unit: 'count', minGames: 0, gamesLabel: 'RUN' },
  { id: 'avg_wave', label: 'MEDIA FINE RUN', unit: 'wave', minGames: 5, gamesLabel: 'RUN' },
  { id: 'kills', label: 'ELIMINAZIONI', unit: 'count', minGames: 0, gamesLabel: 'RUN' },
  { id: 'combo', label: 'COMBO PIÙ LUNGA', unit: 'count', minGames: 0, gamesLabel: 'RUN' },
  { id: 'precision', label: 'COLPI DI PRECISIONE', unit: 'count', minGames: 0, gamesLabel: 'RUN' },
  { id: 'playtime', label: 'TEMPO DI GIOCO', unit: 'time', minGames: 0, gamesLabel: 'RUN' },
]

/** K/D e percentuale di vittoria solo con almeno 10 partite (deciso con l'utente il 2026-11-20). */
export const TCT_MIN_MATCHES = 10

export const TCT_CATEGORIES: readonly CategoryInfo[] = [
  { id: 'kd', label: 'K/D', unit: 'ratio', minGames: TCT_MIN_MATCHES, gamesLabel: 'PARTITE' },
  { id: 'tct_kills', label: 'ELIMINAZIONI', unit: 'count', minGames: 0, gamesLabel: 'PARTITE' },
  { id: 'tct_wins', label: 'VITTORIE', unit: 'count', minGames: 0, gamesLabel: 'PARTITE' },
  { id: 'win_rate', label: '% VITTORIE', unit: 'percent', minGames: TCT_MIN_MATCHES, gamesLabel: 'PARTITE' },
]

export const WEAPON_CATEGORY: CategoryInfo = { id: 'weapon', label: 'UCCISIONI CON L’ARMA', unit: 'count', minGames: 0, gamesLabel: 'PARTITE' }

export function getTabCategories(tab: LeaderboardTab): readonly CategoryInfo[] {
  if (tab === 'tct') return TCT_CATEGORIES
  if (tab === 'weapons') return [WEAPON_CATEGORY]
  // La settimanale usa le stesse classifiche Zombie sugli ultimi 7 giorni.
  return ZOMBIE_CATEGORIES
}

export function getCategory(id: string): CategoryInfo {
  return [...ZOMBIE_CATEGORIES, ...TCT_CATEGORIES, WEAPON_CATEGORY].find((category) => category.id === id) ?? ZOMBIE_CATEGORIES[0]!
}

const integer = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

export function formatValue(category: CategoryInfo, value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  switch (category.unit) {
    case 'points': return `${integer.format(safe)} PT`
    case 'wave': return category.id === 'avg_wave' ? `ONDATA ${decimal.format(safe)}` : `ONDATA ${integer.format(safe)}`
    case 'ratio': return decimal.format(safe)
    case 'percent': return `${oneDecimal.format(safe)}%`
    case 'time': return formatDuration(safe)
    default: return integer.format(safe)
  }
}

/** Testo delle partite accanto al valore, es. "24 PARTITE" o "8 RUN". */
export function formatGames(category: CategoryInfo, games: number): string {
  return `${integer.format(Math.max(0, Math.floor(games)))} ${category.gamesLabel}`
}

export function getMinGamesNote(category: CategoryInfo): string | null {
  if (category.minGames <= 0) return null
  return category.gamesLabel === 'PARTITE'
    ? `Servono almeno ${category.minGames} partite per entrare in questa classifica. Le partite TCT si giocano fra browser: il database scarta i valori impossibili ma non può verificarle del tutto.`
    : `Servono almeno ${category.minGames} run per entrare in questa classifica.`
}

export function getKd(kills: number, deaths: number): number {
  return Math.round((Math.max(0, kills) / Math.max(1, deaths)) * 100) / 100
}

/** Classifica in cache per 60 secondi, per non interrogare il database a ogni apertura. */
export const LEADERBOARD_CACHE_MS = 60_000

export class TimedCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>()

  constructor(private readonly ttl: number, private readonly now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.at > this.ttl) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, at: this.now() })
  }

  clear(): void {
    this.entries.clear()
  }
}

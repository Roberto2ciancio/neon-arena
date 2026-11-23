/**
 * Modalità alternative brevi (piano gameplay G7). Le partite non classiche non entrano nella
 * classifica online (che confronta run a 15 ondate). Regole pure.
 */
export type GameMode = 'classic' | 'survival' | 'defend' | 'last-stand'

export interface GameModeDefinition {
  id: GameMode
  name: string
  description: string
  /** In solitaria, in squadra o entrambe. */
  solo: boolean
  coop: boolean
}

export const GAME_MODES: Record<GameMode, GameModeDefinition> = {
  classic: { id: 'classic', name: 'CLASSICA', description: '15 ondate, poi l’evacuazione.', solo: true, coop: true },
  survival: { id: 'survival', name: 'SOPRAVVIVI 5 MINUTI', description: 'Nessuna pausa: una nuova ondata ogni 30 secondi. Resisti fino alla fine.', solo: true, coop: true },
  defend: { id: 'defend', name: 'DIFENDI IL GENERATORE', description: 'Gli zombie puntano al generatore: tienilo in piedi per 10 ondate.', solo: true, coop: true },
  'last-stand': { id: 'last-stand', name: 'ULTIMO IN PIEDI', description: 'In squadra, niente rianimazioni né rientri: chi resta da solo guadagna di più.', solo: false, coop: true },
}

export const GAME_MODE_IDS = Object.keys(GAME_MODES) as GameMode[]

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && value in GAME_MODES
}

export const SURVIVAL = { duration: 300, waveEvery: 30 } as const

/** Ondata dovuta dopo `elapsed` secondi di Sopravvivi (la prima parte subito). */
export function getSurvivalWave(elapsed: number): number {
  return 1 + Math.floor(Math.max(0, elapsed) / SURVIVAL.waveEvery)
}

export const DEFEND = {
  waves: 10,
  baseHealth: 1600,
  /** A fine ondata il generatore recupera questa quota. */
  repairShare: 0.25,
  /** Raggio entro cui gli zombie preferiscono il generatore al giocatore. */
  aggroRange: 18,
} as const

export function getDefendHealth(players: number): number {
  return Math.round(DEFEND.baseHealth * (1 + 0.4 * Math.max(0, players - 1)))
}

export function repairGenerator(health: number, maxHealth: number): number {
  return Math.min(maxHealth, health + maxHealth * DEFEND.repairShare)
}

export const LAST_STAND = { soloBonusPerWave: 60 } as const

/** Ultimo in piedi: nessuna rianimazione e nessun rientro a inizio ondata. */
export function allowsRevive(mode: GameMode): boolean {
  return mode !== 'last-stand'
}

/** Solo la modalità classica entra nella classifica online. */
export function isRanked(mode: GameMode): boolean {
  return mode === 'classic'
}

export type TctTeam = 'alpha' | 'enemy'
export type TctWinner = TctTeam | 'draw' | null
export type BotRole = 'assault' | 'cover' | 'support' | 'sniper'

export const BOT_ROLES = {
  assault: { health: 120, speed: 4.2, damage: 13, fireInterval: 0.65, accuracy: 0.58, range: 26, preferredDistance: 8 },
  cover: { health: 100, speed: 3.2, damage: 12, fireInterval: 0.8, accuracy: 0.64, range: 30, preferredDistance: 13 },
  support: { health: 90, speed: 3.5, damage: 10, fireInterval: 0.9, accuracy: 0.55, range: 24, preferredDistance: 12 },
  sniper: { health: 80, speed: 2.8, damage: 28, fireInterval: 1.6, accuracy: 0.76, range: 45, preferredDistance: 22 },
} as const

export const TCT_CONFIG = {
  scoreLimit: 20,
  matchDuration: 180,
  respawnDelay: 3,
  allyBots: 3,
  enemyBots: 4,
} as const

export function getMatchWinner(alphaScore: number, enemyScore: number, timeRemaining: number): TctWinner {
  if (alphaScore >= TCT_CONFIG.scoreLimit) return 'alpha'
  if (enemyScore >= TCT_CONFIG.scoreLimit) return 'enemy'
  if (timeRemaining > 0) return null
  if (alphaScore === enemyScore) return 'draw'
  return alphaScore > enemyScore ? 'alpha' : 'enemy'
}

export function getTeamSpawn(team: TctTeam, index: number, arenaLimit: number): { x: number; z: number } {
  return {
    x: (index - 1.5) * 2.4,
    z: (team === 'alpha' ? 1 : -1) * (arenaLimit - 4),
  }
}

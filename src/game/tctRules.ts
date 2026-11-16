export type TctTeam = 'alpha' | 'bravo'
export type TctWinner = TctTeam | 'draw' | null

export const TCT_CONFIG = {
  scoreLimit: 20,
  matchDuration: 180,
  respawnDelay: 3,
  maxPlayersPerTeam: 4,
} as const

export function getMatchWinner(alphaScore: number, bravoScore: number, timeRemaining: number): TctWinner {
  if (alphaScore >= TCT_CONFIG.scoreLimit) return 'alpha'
  if (bravoScore >= TCT_CONFIG.scoreLimit) return 'bravo'
  if (timeRemaining > 0) return null
  if (alphaScore === bravoScore) return 'draw'
  return alphaScore > bravoScore ? 'alpha' : 'bravo'
}

export function getTeamSpawn(team: TctTeam, index: number, arenaLimit: number): { x: number; z: number } {
  return {
    x: (index - 1.5) * 2.4,
    z: (team === 'alpha' ? 1 : -1) * (arenaLimit - 4),
  }
}

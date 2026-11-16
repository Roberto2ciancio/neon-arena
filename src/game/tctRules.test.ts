import { describe, expect, it } from 'vitest'
import { getMatchWinner, getTeamSpawn, TCT_CONFIG } from './tctRules'

describe('regole TCT', () => {
  it('configura squadre fino a 4 contro 4 e respawn rapido', () => {
    expect(TCT_CONFIG.maxPlayersPerTeam).toBe(4)
    expect(TCT_CONFIG.respawnDelay).toBe(3)
  })

  it('termina al punteggio limite', () => {
    expect(getMatchWinner(TCT_CONFIG.scoreLimit, 4, 90)).toBe('alpha')
    expect(getMatchWinner(4, TCT_CONFIG.scoreLimit, 90)).toBe('bravo')
    expect(getMatchWinner(4, 5, 90)).toBeNull()
  })

  it('assegna vittoria o pareggio allo scadere', () => {
    expect(getMatchWinner(8, 5, 0)).toBe('alpha')
    expect(getMatchWinner(3, 5, 0)).toBe('bravo')
    expect(getMatchWinner(5, 5, 0)).toBe('draw')
  })

  it('posiziona le squadre ai lati opposti della mappa', () => {
    expect(getTeamSpawn('alpha', 0, 18).z).toBeGreaterThan(0)
    expect(getTeamSpawn('bravo', 0, 18).z).toBeLessThan(0)
  })
})

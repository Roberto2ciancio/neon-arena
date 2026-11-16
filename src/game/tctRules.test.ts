import { describe, expect, it } from 'vitest'
import { BOT_ROLES, getMatchWinner, getTeamSpawn, TCT_CONFIG } from './tctRules'

describe('regole TCT', () => {
  it('configura squadre 4 contro 4 e respawn rapido', () => {
    expect(TCT_CONFIG.allyBots + 1).toBe(4)
    expect(TCT_CONFIG.enemyBots).toBe(4)
    expect(TCT_CONFIG.respawnDelay).toBe(3)
  })

  it('termina al punteggio limite', () => {
    expect(getMatchWinner(TCT_CONFIG.scoreLimit, 4, 90)).toBe('alpha')
    expect(getMatchWinner(4, TCT_CONFIG.scoreLimit, 90)).toBe('enemy')
    expect(getMatchWinner(4, 5, 90)).toBeNull()
  })

  it('assegna vittoria o pareggio allo scadere', () => {
    expect(getMatchWinner(8, 5, 0)).toBe('alpha')
    expect(getMatchWinner(3, 5, 0)).toBe('enemy')
    expect(getMatchWinner(5, 5, 0)).toBe('draw')
  })

  it('distingue assalto, copertura, supporto e cecchino', () => {
    expect(Object.keys(BOT_ROLES)).toHaveLength(4)
    expect(BOT_ROLES.assault.health).toBeGreaterThan(BOT_ROLES.sniper.health)
    expect(BOT_ROLES.sniper.damage).toBeGreaterThan(BOT_ROLES.assault.damage)
    expect(BOT_ROLES.sniper.range).toBeGreaterThan(BOT_ROLES.support.range)
    expect(BOT_ROLES.cover.preferredDistance).toBeGreaterThan(BOT_ROLES.assault.preferredDistance)
  })

  it('posiziona le squadre ai lati opposti della mappa', () => {
    expect(getTeamSpawn('alpha', 0, 18).z).toBeGreaterThan(0)
    expect(getTeamSpawn('enemy', 0, 18).z).toBeLessThan(0)
  })
})

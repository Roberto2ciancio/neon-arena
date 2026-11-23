import { describe, expect, it } from 'vitest'
import { allowsRevive, DEFEND, GAME_MODES, getDefendHealth, getSurvivalWave, isGameMode, isRanked, repairGenerator, SURVIVAL } from './gameModes'

describe('modalità alternative', () => {
  it('Sopravvivi: una nuova ondata ogni 30 secondi, dieci in cinque minuti', () => {
    expect(getSurvivalWave(0)).toBe(1)
    expect(getSurvivalWave(SURVIVAL.waveEvery - 0.1)).toBe(1)
    expect(getSurvivalWave(SURVIVAL.waveEvery)).toBe(2)
    expect(getSurvivalWave(SURVIVAL.duration - 0.1)).toBe(10)
  })

  it('Difendi: generatore più resistente in squadra, si ripara a fine ondata', () => {
    expect(getDefendHealth(3)).toBeGreaterThan(getDefendHealth(1))
    expect(repairGenerator(100, 1000)).toBe(100 + 1000 * DEFEND.repairShare)
    expect(repairGenerator(990, 1000)).toBe(1000)
  })

  it('Ultimo in piedi solo in squadra e senza rianimazioni; in classifica solo la classica', () => {
    expect(GAME_MODES['last-stand'].solo).toBe(false)
    expect(allowsRevive('last-stand')).toBe(false)
    expect(allowsRevive('classic')).toBe(true)
    expect(isRanked('survival')).toBe(false)
    expect(isRanked('classic')).toBe(true)
    expect(isGameMode('defend')).toBe(true)
    expect(isGameMode('pvp')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { formatDuration, formatGames, formatValue, getCategory, getKd, getMinGamesNote, getTabCategories, TCT_MIN_MATCHES, TimedCache } from './leaderboardView'

describe('classifica globale: categorie e formattazione', () => {
  it('ogni scheda ha le sue categorie; la settimanale usa quelle Zombie', () => {
    expect(getTabCategories('zombie').map((category) => category.id)).toContain('avg_wave')
    expect(getTabCategories('weekly')).toBe(getTabCategories('zombie'))
    expect(getTabCategories('tct').map((category) => category.id)).toEqual(['kd', 'tct_kills', 'tct_wins', 'win_rate'])
    expect(getCategory('sconosciuta').id).toBe('score')
  })

  it('il K/D mostra il numero di partite e ha una soglia minima', () => {
    const kd = getCategory('kd')
    expect(kd.minGames).toBe(TCT_MIN_MATCHES)
    expect(formatValue(kd, 1.5)).toBe('1,50')
    expect(formatGames(kd, 24)).toBe('24 PARTITE')
    expect(getMinGamesNote(kd)).toContain('10 partite')
    expect(getMinGamesNote(getCategory('score'))).toBeNull()
    expect(getKd(9, 0)).toBe(9)
    expect(getKd(10, 3)).toBe(3.33)
  })

  it('formatta punteggi, ondate, percentuali e tempi', () => {
    expect(formatValue(getCategory('score'), 12500)).toBe('12.500 PT')
    expect(formatValue(getCategory('avg_wave'), 7.456)).toBe('ONDATA 7,46')
    expect(formatValue(getCategory('wave'), 12)).toBe('ONDATA 12')
    expect(formatValue(getCategory('win_rate'), 62.5)).toBe('62,5%')
    expect(formatValue(getCategory('kills'), Number.NaN)).toBe('0')
    expect(formatDuration(95)).toBe('1:35')
    expect(formatDuration(3 * 3600 + 7 * 60)).toBe('3 h 07 min')
    expect(formatGames(getCategory('score'), 8)).toBe('8 RUN')
  })

  it('la cache scade dopo il tempo indicato', () => {
    let now = 0
    const cache = new TimedCache<number>(60_000, () => now)
    cache.set('kd', 1)
    now = 59_000
    expect(cache.get('kd')).toBe(1)
    now = 61_000
    expect(cache.get('kd')).toBeUndefined()
  })
})

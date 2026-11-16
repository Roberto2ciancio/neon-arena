import { describe, expect, it } from 'vitest'
import { createDefaultProgress, recordRun, recordTctMatch } from './progression'
import { formatPlayTime, formatRunDate, getTctStats, getZombieStats } from './profileStats'

describe('statistiche del profilo', () => {
  it('accumula tempo, vittorie, frammenti, precisione e storico a ogni run', () => {
    let progress = createDefaultProgress()
    progress = recordRun(progress, { score: 900, wave: 4, kills: 30, shards: 6, time: 300, won: false, map: 'Stazione 13', precisionHits: 12 }, 1000)
    progress = recordRun(progress, { score: 9000, wave: 15, kills: 400, shards: 40, time: 1500, won: true, map: 'Deposito 06', precisionHits: 90 }, 2000)
    expect(progress.stats).toMatchObject({ playTime: 1800, wins: 1, shardsEarned: 46, precisionHits: 102, bestKills: 400 })
    expect(progress.history.map((entry) => entry.map)).toEqual(['Deposito 06', 'Stazione 13'])
  })

  it('tiene solo le ultime 10 run nello storico', () => {
    let progress = createDefaultProgress()
    for (let index = 0; index < 13; index += 1) progress = recordRun(progress, { score: index, wave: 1, kills: 1, shards: 0, time: 10 }, index)
    expect(progress.history).toHaveLength(10)
    expect(progress.history[0]?.score).toBe(12)
  })

  it('registra le partite TCT e calcola il rapporto eliminazioni/morti', () => {
    let progress = createDefaultProgress()
    progress = recordTctMatch(progress, { kills: 12, deaths: 4, outcome: 'win' })
    progress = recordTctMatch(progress, { kills: 3, deaths: 6, outcome: 'loss' })
    expect(progress.stats).toMatchObject({ tctMatches: 2, tctWins: 1, tctKills: 15, tctDeaths: 10 })
    const stats = getTctStats(progress)
    expect(stats.find((stat) => stat.label === 'RAPPORTO E/M')?.value).toBe('1,50')
    expect(stats[0]?.detail).toBe('1 vinte (50%)')
  })

  it('formatta valori leggibili anche con il profilo vuoto', () => {
    const stats = getZombieStats(createDefaultProgress())
    expect(stats.find((stat) => stat.label === 'RUN GIOCATE')?.detail).toBe('0 vinte (—)')
    expect(stats.find((stat) => stat.label === 'MIGLIOR ONDATA')?.value).toBe('0/15')
    expect(formatPlayTime(45)).toBe('45 s')
    expect(formatPlayTime(720)).toBe('12 min')
    expect(formatPlayTime(3 * 3600 + 300)).toBe('3 h 05 min')
  })

  it('scrive la data della run in modo relativo', () => {
    const now = new Date(2026, 10, 16, 18, 0).getTime()
    expect(formatRunDate(new Date(2026, 10, 16, 14, 5).getTime(), now)).toBe('oggi 14:05')
    expect(formatRunDate(new Date(2026, 10, 15, 22, 0).getTime(), now)).toBe('ieri')
    expect(formatRunDate(0, now)).toBe('')
  })
})

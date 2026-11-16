import type { MetaProgress } from './progression'

export interface ProfileStat {
  label: string
  value: string
  /** Riga secondaria facoltativa (media, percentuale...). */
  detail?: string
}

const integer = new Intl.NumberFormat('it-IT')

/** Durata leggibile: "45 s", "12 min", "3 h 05 min". */
export function formatPlayTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

function ratio(value: number, total: number, digits = 1): string {
  return total > 0 ? (value / total).toFixed(digits).replace('.', ',') : '0'
}

function percent(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '—'
}

export function getZombieStats(progress: MetaProgress): ProfileStat[] {
  const { stats } = progress
  return [
    { label: 'RUN GIOCATE', value: integer.format(progress.runs), detail: `${integer.format(stats.wins)} vinte (${percent(stats.wins, progress.runs)})` },
    { label: 'MIGLIOR PUNTEGGIO', value: integer.format(progress.bestScore) },
    { label: 'MIGLIOR ONDATA', value: `${progress.bestWave}/15` },
    { label: 'ELIMINAZIONI', value: integer.format(progress.totalKills), detail: `${ratio(progress.totalKills, progress.runs)} per run · record ${integer.format(stats.bestKills)}` },
    { label: 'COLPI DI PRECISIONE', value: integer.format(stats.precisionHits), detail: 'testa e punti deboli' },
    { label: 'TEMPO DI GIOCO', value: formatPlayTime(stats.playTime) },
    { label: 'FRAMMENTI RACCOLTI', value: integer.format(stats.shardsEarned), detail: `${integer.format(progress.cores)} disponibili` },
  ]
}

export function getTctStats(progress: MetaProgress): ProfileStat[] {
  const { stats } = progress
  return [
    { label: 'PARTITE TCT', value: integer.format(stats.tctMatches), detail: `${integer.format(stats.tctWins)} vinte (${percent(stats.tctWins, stats.tctMatches)})` },
    { label: 'ELIMINAZIONI TCT', value: integer.format(stats.tctKills), detail: `${integer.format(stats.tctDeaths)} morti` },
    { label: 'RAPPORTO E/M', value: stats.tctDeaths > 0 ? ratio(stats.tctKills, stats.tctDeaths, 2) : integer.format(stats.tctKills) },
  ]
}

/** Data breve della run: "oggi 14:05", "ieri", "12 nov". */
export function formatRunDate(at: number, now = Date.now()): string {
  if (at <= 0) return ''
  const date = new Date(at)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (at >= startOfToday) return `oggi ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (at >= startOfToday - 86_400_000) return 'ieri'
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

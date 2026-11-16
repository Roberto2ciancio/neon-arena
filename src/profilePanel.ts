import type { ArmoryState } from './game/armory'
import { MAX_LEVEL, xpForLevel } from './game/armory'
import { MAX_WEAPON_LEVEL } from './game/attachments'
import type { MetaProgress } from './game/progression'
import { formatPlayTime, formatRunDate, getTctStats, getZombieStats } from './game/profileStats'
import type { ProfileStat } from './game/profileStats'
import { WEAPONS } from './game/weapons'

export interface ProfileView {
  name: string
  signedIn: boolean
  email: string
  progress: MetaProgress
  armory: ArmoryState
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function statGrid(title: string, stats: ProfileStat[]): HTMLElement {
  const section = element('section', 'profile-section')
  section.append(element('h3', undefined, title))
  const grid = element('div', 'profile-stats')
  for (const stat of stats) {
    const card = element('div', 'profile-stat')
    card.append(element('span', 'hud-label', stat.label), element('strong', undefined, stat.value))
    if (stat.detail) card.append(element('small', undefined, stat.detail))
    grid.append(card)
  }
  section.append(grid)
  return section
}

/**
 * Sezione Profilo del menu: identità, livello, statistiche Zombie e TCT, armi potenziate
 * e ultime run. Si ridisegna da zero a ogni apertura con i dati correnti.
 */
export function renderProfilePanel(root: HTMLElement, view: ProfileView, onAccount: () => void): void {
  const header = element('header', 'profile-header')
  header.append(element('span', 'profile-avatar profile-avatar-large', view.name.charAt(0) || 'P'))
  const who = element('div')
  who.append(element('strong', 'profile-title', view.name))
  who.append(element('small', view.signedIn ? 'signed' : undefined, view.signedIn ? `ACCOUNT // ${view.email}` : 'OSPITE // PROGRESSI SU QUESTO DISPOSITIVO'))
  const level = view.armory.level
  const needed = xpForLevel(level)
  const bar = element('div', 'player-xp')
  const fill = element('i')
  fill.style.width = level >= MAX_LEVEL ? '100%' : `${Math.round((view.armory.xp / needed) * 100)}%`
  bar.append(fill)
  who.append(element('span', 'profile-level-line', level >= MAX_LEVEL ? `LIVELLO ${level} // MASSIMO` : `LIVELLO ${level} // ${view.armory.xp} / ${needed} XP`), bar)
  header.append(who)
  const accountButton = element('button', 'secondary-button profile-account-button', view.signedIn ? 'GESTISCI ACCOUNT' : 'CREA UN ACCOUNT')
  accountButton.type = 'button'
  accountButton.addEventListener('click', onAccount)
  header.append(accountButton)

  const sections: HTMLElement[] = [header, statGrid('ZOMBIE', getZombieStats(view.progress)), statGrid('TCT ONLINE', getTctStats(view.progress))]

  const upgraded = Object.entries(view.armory.weaponLevels)
    .filter(([id, value]) => (value ?? 0) > 0 && id in WEAPONS)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  const weapons = element('section', 'profile-section')
  weapons.append(element('h3', undefined, 'ARMI POTENZIATE'))
  if (upgraded.length === 0) {
    weapons.append(element('p', 'panel-description', 'Nessuna arma potenziata: nell’armeria puoi alzare il livello delle armi con i frammenti.'))
  } else {
    const list = element('ul', 'profile-list')
    for (const [id, value] of upgraded) {
      const row = element('li')
      row.append(element('span', undefined, WEAPONS[id as keyof typeof WEAPONS].shortName), element('b', 'stars', '★'.repeat(value ?? 0) + '☆'.repeat(MAX_WEAPON_LEVEL - (value ?? 0))))
      list.append(row)
    }
    weapons.append(list)
  }
  sections.push(weapons)

  const history = element('section', 'profile-section')
  history.append(element('h3', undefined, 'ULTIME RUN'))
  if (view.progress.history.length === 0) {
    history.append(element('p', 'panel-description', 'Le tue run compariranno qui dopo la prima partita in modalità Zombie.'))
  } else {
    const list = element('ul', 'profile-list profile-history')
    for (const run of view.progress.history) {
      const row = element('li', run.won ? 'won' : undefined)
      const main = element('div')
      main.append(element('strong', undefined, run.won ? 'VITTORIA' : `ONDATA ${run.wave}`), element('small', undefined, [run.map, formatRunDate(run.at)].filter(Boolean).join(' · ')))
      const numbers = element('div', 'profile-history-numbers')
      numbers.append(element('span', undefined, run.score.toLocaleString('it-IT')), element('small', undefined, `${run.kills} elim. · ${formatPlayTime(run.time)}`))
      row.append(main, numbers)
      list.append(row)
    }
    history.append(list)
  }
  sections.push(history)
  root.replaceChildren(...sections)
}

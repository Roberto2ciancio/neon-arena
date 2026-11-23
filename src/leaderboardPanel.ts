import type { GlobalLeaderboardRow, PublicProfile, SupabaseCloud, WeaponUsageRow } from './game/cloud'
import { prestigeBadge } from './game/cosmetics'
import { formatDuration, formatGames, formatValue, getCategory, getKd, getMinGamesNote, getTabCategories, LEADERBOARD_CACHE_MS, TimedCache, TCT_MIN_MATCHES } from './game/leaderboardView'
import type { LeaderboardCategory, LeaderboardTab } from './game/leaderboardView'
import { MAPS } from './game/maps'
import { MELEE_WEAPONS, WEAPON_ORDER, WEAPONS } from './game/weapons'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Elemento mancante: #${id}`)
  return element as T
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function weaponName(id: string): string {
  const weapon = (WEAPONS as Record<string, { shortName?: string; name: string }>)[id]
  if (weapon) return weapon.shortName ?? weapon.name
  const melee = (MELEE_WEAPONS as Record<string, { name: string }>)[id]
  return melee ? melee.name : id.toUpperCase()
}

function mapName(id: string | null): string {
  return MAPS.find((map) => map.id === id)?.name.toUpperCase() ?? '—'
}

interface PanelOptions {
  /** Null quando Supabase non è configurato: resta solo la classifica locale. */
  getCloud: () => SupabaseCloud | null
  /** Token dell'account (per la propria posizione), undefined da ospite. */
  getToken: () => Promise<string | undefined>
}

/**
 * Classifica globale (Fase F): schede Zombie / TCT / Armi / Settimanale, filtri, propria
 * posizione evidenziata e profilo pubblico. Senza Supabase resta visibile la classifica locale.
 */
export class LeaderboardPanel {
  private tab: LeaderboardTab = 'zombie'
  private category: LeaderboardCategory = 'score'
  private readonly cache = new TimedCache<GlobalLeaderboardRow[] | WeaponUsageRow[]>(LEADERBOARD_CACHE_MS)
  private requestId = 0

  constructor(private readonly options: PanelOptions) {
    document.querySelectorAll<HTMLButtonElement>('[data-lb-tab]').forEach((button) => {
      button.addEventListener('click', () => this.selectTab(button.dataset.lbTab as LeaderboardTab))
    })
    const map = byId<HTMLSelectElement>('lb-map')
    map.append(...MAPS.map((entry) => new Option(entry.name.toUpperCase(), entry.id)))
    const weapon = byId<HTMLSelectElement>('lb-weapon')
    weapon.append(...WEAPON_ORDER.map((id) => new Option(weaponName(id), id)))
    for (const id of ['lb-category', 'lb-map', 'lb-mode', 'lb-weapon']) {
      byId<HTMLSelectElement>(id).addEventListener('change', () => {
        if (id === 'lb-category') this.category = byId<HTMLSelectElement>('lb-category').value as LeaderboardCategory
        void this.refresh()
      })
    }
    byId('public-profile-close').addEventListener('click', () => this.closeProfile())
    byId('public-profile').addEventListener('click', (event) => {
      if (event.target === byId('public-profile')) this.closeProfile()
    })
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && !byId('public-profile').classList.contains('hidden')) {
        // Sullo stesso window c'è il listener che chiude il pannello: si ferma anche quello.
        event.stopImmediatePropagation()
        this.closeProfile()
      }
    }, true)
    this.renderControls()
  }

  get enabled(): boolean {
    return this.options.getCloud() !== null
  }

  /** Dopo l'invio di una run o una partita: la prossima apertura rilegge i dati. */
  invalidate(): void {
    this.cache.clear()
  }

  async open(): Promise<void> {
    byId('global-leaderboard').classList.toggle('hidden', !this.enabled)
    if (this.enabled) await this.refresh()
  }

  private selectTab(tab: LeaderboardTab): void {
    this.tab = tab
    this.category = getTabCategories(tab)[0]!.id
    this.renderControls()
    void this.refresh()
  }

  private renderControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-lb-tab]').forEach((button) => {
      const selected = button.dataset.lbTab === this.tab
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-selected', String(selected))
    })
    const category = byId<HTMLSelectElement>('lb-category')
    category.replaceChildren(...getTabCategories(this.tab).map((entry) => new Option(entry.label, entry.id)))
    category.value = this.category
    category.parentElement!.classList.toggle('hidden', this.tab === 'weapons' || this.tab === 'daily')
    byId('lb-weapon').parentElement!.classList.toggle('hidden', this.tab !== 'weapons')
    byId('lb-mode').parentElement!.classList.toggle('hidden', this.tab === 'tct' || this.tab === 'weapons' || this.tab === 'daily')
    byId('lb-map').parentElement!.classList.toggle('hidden', this.tab === 'weapons' || this.tab === 'daily')
  }

  private query() {
    const map = byId<HTMLSelectElement>('lb-map').value || null
    const mode = (byId<HTMLSelectElement>('lb-mode').value || null) as 'solo' | 'coop' | null
    const weapon = byId<HTMLSelectElement>('lb-weapon').value
    return {
      category: this.tab === 'weapons' ? 'weapon' as const : this.tab === 'daily' ? 'daily' as const : this.category,
      period: this.tab === 'weekly' ? 'week' as const : 'all' as const,
      map: this.tab === 'weapons' || this.tab === 'daily' ? null : map,
      mode: this.tab === 'zombie' || this.tab === 'weekly' ? mode : null,
      weapon: this.tab === 'weapons' ? weapon : null,
    }
  }

  async refresh(): Promise<void> {
    const cloud = this.options.getCloud()
    if (!cloud) return
    const query = this.query()
    const category = getCategory(query.category)
    byId('lb-note').textContent = getMinGamesNote(category) ?? (this.tab === 'weekly' ? 'Run degli ultimi 7 giorni.' : this.tab === 'daily' ? 'Run del giorno di oggi (giorno UTC): stessa mappa, carte ed eventi per tutti.' : '')
    const request = ++this.requestId
    const status = byId('lb-status')
    status.textContent = 'CARICAMENTO...'
    try {
      const token = await this.options.getToken()
      const key = JSON.stringify(query) + (token ? ':me' : '')
      let rows = this.cache.get(key) as GlobalLeaderboardRow[] | undefined
      if (!rows) {
        rows = await cloud.getGlobalLeaderboard(query, token)
        this.cache.set(key, rows)
      }
      let usage: WeaponUsageRow[] = []
      if (this.tab === 'weapons') {
        usage = this.cache.get('usage') as WeaponUsageRow[] | undefined ?? await cloud.getWeaponUsage()
        this.cache.set('usage', usage)
      }
      if (request !== this.requestId) return
      this.renderRows(rows, category)
      this.renderUsage(usage)
      status.textContent = rows.length === 0 ? 'Ancora nessun giocatore in questa classifica.' : ''
    } catch {
      if (request !== this.requestId) return
      byId('lb-rows').replaceChildren()
      this.renderUsage([])
      status.textContent = 'Classifica online non raggiungibile: riprova più tardi.'
    }
  }

  private renderRows(rows: GlobalLeaderboardRow[], category: ReturnType<typeof getCategory>): void {
    const nodes = rows.map((row) => {
      const line = element('div', `lb-row${row.isMe ? ' me' : ''}`)
      line.dataset.rank = String(row.rank)
      const rank = element('span', 'lb-rank', `#${row.rank}`)
      const name = element('button', 'lb-name')
      name.type = 'button'
      name.textContent = row.username
      if (row.prestige > 0) name.append(element('small', 'lb-prestige', ` ${prestigeBadge(row.prestige)}`))
      name.addEventListener('click', () => void this.openProfile(row.username))
      const value = element('strong', 'lb-value', formatValue(category, row.value))
      const games = element('span', 'lb-games', formatGames(category, row.games))
      line.append(rank, name, value, games)
      return line
    })
    byId('lb-rows').replaceChildren(...nodes)
  }

  private renderUsage(usage: WeaponUsageRow[]): void {
    const container = byId('lb-weapon-usage')
    container.classList.toggle('hidden', this.tab !== 'weapons' || usage.length === 0)
    const top = usage.slice(0, 8)
    const maximum = Math.max(1, ...top.map((row) => row.kills))
    container.replaceChildren(element('span', 'hud-label', 'ARMI PIÙ USATE DALLA COMUNITÀ'), ...top.map((row) => {
      const line = element('div', 'lb-usage-row')
      const bar = element('i')
      bar.style.transform = `scaleX(${(row.kills / maximum).toFixed(3)})`
      line.append(element('span', '', weaponName(row.weaponId)), bar, element('strong', '', row.kills.toLocaleString('it-IT')))
      line.title = `${row.players} giocatori`
      return line
    }))
  }

  private async openProfile(username: string): Promise<void> {
    const cloud = this.options.getCloud()
    if (!cloud) return
    const modal = byId('public-profile')
    const body = byId('public-profile-body')
    byId('public-profile-title').textContent = username
    body.replaceChildren(element('p', 'panel-description', 'Caricamento del profilo...'))
    modal.classList.remove('hidden')
    byId<HTMLButtonElement>('public-profile-close').focus()
    try {
      const profile = await cloud.getPublicProfile(username, await this.options.getToken())
      body.replaceChildren(...(profile ? renderProfile(profile) : [element('p', 'panel-description', 'Profilo non disponibile: il giocatore ha scelto di non comparire.')]))
    } catch {
      body.replaceChildren(element('p', 'panel-description', 'Profilo non raggiungibile: riprova più tardi.'))
    }
  }

  private closeProfile(): void {
    byId('public-profile').classList.add('hidden')
  }
}

function stat(label: string, value: string): HTMLElement {
  const card = element('div', 'pp-stat')
  card.append(element('span', '', label), element('strong', '', value))
  return card
}

export function renderProfile(profile: PublicProfile): HTMLElement[] {
  const header = element('p', 'pp-level', `LIVELLO ${profile.level}${profile.prestige > 0 ? ` · PRESTIGIO ${profile.prestige} ${prestigeBadge(profile.prestige)}` : ''}`)
  const zombie = element('div', 'pp-grid')
  zombie.append(
    stat('RUN', String(profile.zombie.runs)),
    stat('COMPLETATE', String(profile.zombie.wins)),
    stat('PUNTEGGIO MIGLIORE', profile.zombie.bestScore.toLocaleString('it-IT')),
    stat('ONDATA MIGLIORE', String(profile.zombie.bestWave)),
    stat('MEDIA FINE RUN', profile.zombie.runs > 0 ? profile.zombie.averageWave.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : '—'),
    stat('ELIMINAZIONI', profile.zombie.kills.toLocaleString('it-IT')),
    stat('COMBO PIÙ LUNGA', `×${profile.zombie.bestCombo}`),
    stat('TEMPO DI GIOCO', formatDuration(profile.zombie.playTime)),
  )
  const tct = element('div', 'pp-grid')
  const kd = profile.tct.matches >= TCT_MIN_MATCHES ? getKd(profile.tct.kills, profile.tct.deaths).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : '—'
  tct.append(
    stat('PARTITE', String(profile.tct.matches)),
    stat('VITTORIE', String(profile.tct.wins)),
    stat('K/D', `${kd} (${profile.tct.matches} partite)`),
    stat('ELIMINAZIONI / MORTI', `${profile.tct.kills} / ${profile.tct.deaths}`),
  )
  const weapons = element('div', 'pp-weapons')
  weapons.append(...(profile.weapons.length ? profile.weapons.map((weapon) => element('span', '', `${weaponName(weapon.id)} · ${weapon.kills.toLocaleString('it-IT')}`)) : [element('span', '', '—')]))
  const recent = element('div', 'pp-recent')
  recent.append(...(profile.recent.length ? profile.recent.map((run) => {
    const row = element('div', 'pp-run')
    row.append(
      element('span', '', run.won ? 'COMPLETATA' : `ONDATA ${run.wave}`),
      element('span', '', mapName(run.map)),
      element('span', '', `${run.score.toLocaleString('it-IT')} PT`),
      element('span', '', `${run.kills} ELIM. · ×${run.combo}`),
    )
    return row
  }) : [element('p', 'panel-description', 'Nessuna run registrata.')]))
  return [
    header,
    element('span', 'hud-label', 'ZOMBIE'), zombie,
    element('span', 'hud-label', 'TCT'), tct,
    element('span', 'hud-label', 'ARMI PREFERITE'), weapons,
    element('span', 'hud-label', 'ULTIME RUN'), recent,
  ]
}

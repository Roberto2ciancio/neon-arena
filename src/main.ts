import './style.css'
import { Game } from './game/Game'
import { loadAccessibility, saveAccessibility } from './game/accessibility'
import { SupabaseCloud } from './game/cloud'
import type { OnlineLeaderboardEntry } from './game/cloud'
import { loadIdentity, normalizeCallsign, saveIdentity } from './game/identity'
import { TctGame } from './game/TctGame'
import type { TctResult } from './game/TctGame'
import { MAPS, STATION_13 } from './game/maps'
import { normalizeGraphicsQuality } from './game/graphics'
import type { GraphicsQuality } from './game/graphics'
import { META_COSTS, META_UPGRADES, MAX_META_LEVEL, getMetaBonuses, loadProgress, purchaseMetaUpgrade, recordRun, saveProgress } from './game/progression'
import { UPGRADE_BY_ID } from './game/upgrades'
import { WEAPONS } from './game/weapons'
import type { WeaponId } from './game/weapons'
import type { GameState, HudData, RunResult, TctHudData } from './game/types'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Elemento mancante: #${id}`)
  return element as T
}

const GRAPHICS_STORAGE_KEY = 'neon-arena:graphics:v1'

function loadGraphicsQuality(): GraphicsQuality {
  try {
    return normalizeGraphicsQuality(window.localStorage.getItem(GRAPHICS_STORAGE_KEY))
  } catch {
    return 'medium'
  }
}

const app = byId('app')
const menuScreen = byId('menu-screen')
const hud = byId('hud')
const combatFooter = byId('combat-footer')
const pauseScreen = byId('pause-screen')
const upgradeScreen = byId('upgrade-screen')
const gameoverScreen = byId('gameover-screen')
const upgradeChoices = byId('upgrade-choices')
const waveBanner = byId('wave-banner')
const damageFlash = byId('damage-flash')
const weaponHud = byId('weapon-hud')
const equipmentHud = byId('equipment-hud')
const crosshair = byId('crosshair')
const hitmarker = byId('hitmarker')
const soundButton = byId<HTMLButtonElement>('sound-button')

let progress = loadProgress(window.localStorage)
let identity = loadIdentity(window.localStorage)
const cloud = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? new SupabaseCloud(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null
let onlineLeaderboard: OnlineLeaderboardEntry[] | null = null
let graphicsQuality = loadGraphicsQuality()
let accessibility = loadAccessibility(window.localStorage)
let currentState: GameState = 'menu'
let selectedMode: 'zombies' | 'tct' = 'zombies'
let selectedMap = STATION_13
let selectedPrimary: WeaponId = 'ar-07'
let availableUpgradeIds: string[] = []
let waveBannerTimer = 0
let damageFlashTimer = 0
let hitmarkerTimer = 0

const game = new Game(byId('scene'), {
  onStateChange: updateState,
  onHud: updateHud,
  onUpgrade: showUpgradeChoices,
  onRunEnd: completeRun,
  onWave: showWaveBanner,
  onDamage: flashDamage,
  onHit: showHitmarker,
})

const tctGame = new TctGame(byId('scene'), {
  onStateChange: updateState,
  onHud: updateHud,
  onMatchEnd: completeTctMatch,
  onDamage: flashDamage,
  onHit: showHitmarker,
})
tctGame.setActive(false)
game.setGraphicsQuality(graphicsQuality)
tctGame.setGraphicsQuality(graphicsQuality)
byId<HTMLSelectElement>('graphics-quality').value = graphicsQuality
byId<HTMLInputElement>('callsign').value = identity.callsign
applyAccessibility()
byId<HTMLInputElement>('reduced-motion').checked = accessibility.reducedMotion
byId<HTMLInputElement>('high-contrast').checked = accessibility.highContrast
byId<HTMLInputElement>('mouse-sensitivity').value = String(accessibility.sensitivity)
byId<HTMLOutputElement>('sensitivity-value').textContent = `${accessibility.sensitivity.toFixed(1).replace('.', ',')}×`

function updateState(state: GameState): void {
  currentState = state
  app.dataset.state = state
  menuScreen.classList.toggle('hidden', state !== 'menu')
  hud.classList.toggle('hidden', state === 'menu')
  hud.classList.toggle('tct', selectedMode === 'tct')
  combatFooter.classList.toggle('hidden', state !== 'playing')
  weaponHud.classList.toggle('hidden', state !== 'playing')
  equipmentHud.classList.toggle('hidden', state !== 'playing')
  byId('respawn-banner').classList.toggle('hidden', state !== 'playing')
  byId('tct-overlay').classList.toggle('hidden', state !== 'playing' || selectedMode !== 'tct')
  crosshair.classList.toggle('hidden', state !== 'playing')
  byId('door-prompt').classList.toggle('hidden', state !== 'playing')
  if (state !== 'playing') hitmarker.classList.remove('active')
  pauseScreen.classList.toggle('hidden', state !== 'paused')
  upgradeScreen.classList.toggle('hidden', state !== 'upgrade')
  gameoverScreen.classList.toggle('hidden', state !== 'gameover' && state !== 'victory')

  const status: Record<GameState, string> = {
    menu: 'SISTEMA PRONTO',
    playing: 'COMBATTIMENTO ATTIVO',
    paused: 'SIMULAZIONE SOSPESA',
    upgrade: 'SINCRONIZZAZIONE',
    gameover: 'SEGNALE INTERROTTO',
    victory: 'STAZIONE SICURA',
  }
  byId('system-status').textContent = status[state]
  if (state === 'menu') {
    waveBanner.classList.add('hidden')
    renderMenu()
  }
}

function updateHud(data: HudData): void {
  const healthPercentage = Math.max(0, (data.health / data.maxHealth) * 100)
  byId('health-text').textContent = `${Math.ceil(data.health)} / ${data.maxHealth}`
  if (data.performance) byId('performance-stats').textContent = `${data.performance.fps} FPS · ${data.performance.drawCalls} DC`
  byId('health-fill').style.width = `${healthPercentage}%`
  byId('health-fill').classList.toggle('critical', healthPercentage < 30)
  byId('xp-fill').style.width = `${Math.min(100, (data.xp / data.xpNext) * 100)}%`
  byId('level-text').textContent = String(data.level)
  byId('score-label').textContent = data.tct ? 'ALPHA // AVVERSARI' : 'PUNTEGGIO'
  byId('score-text').textContent = data.tct
    ? `${data.tct.alphaScore} : ${data.tct.enemyScore}`
    : String(data.score).padStart(6, '0')
  byId('map-name').textContent = data.mapName.toUpperCase()
  byId('wave-text').textContent = data.tct
    ? `TCT // ${Math.floor(data.tct.timeRemaining / 60)}:${String(Math.ceil(data.tct.timeRemaining) % 60).padStart(2, '0')}`
    : data.waveBreak > 0
      ? `INTERVALLO ${Math.ceil(data.waveBreak)}s`
      : `ONDATA ${String(data.wave).padStart(2, '0')}`
  const respawnBanner = byId('respawn-banner')
  respawnBanner.classList.toggle('hidden', !data.tct || data.tct.playerRespawn <= 0 || currentState !== 'playing')
  if (data.tct?.playerRespawn) respawnBanner.textContent = `RIENTRO IN COMBATTIMENTO // ${Math.ceil(data.tct.playerRespawn)}s`
  byId('wave-text').title = `${data.enemiesRemaining} nemici rimanenti`
  byId('shards-text').textContent = String(data.shards)
  byId('kills-text').textContent = String(data.kills)
  byId('ammo-text').textContent = String(data.ammo).padStart(2, '0')
  byId('reserve-text').textContent = data.reserveAmmo === null ? '∞' : String(data.reserveAmmo)
  byId('weapon-name').textContent = data.weaponName
  byId('reload-text').textContent = data.reloading ? 'RICARICA IN CORSO...' : data.ammo === 0 ? 'PREMI R PER RICARICARE' : 'CARICATORE PRONTO'
  weaponHud.classList.toggle('reloading', data.reloading)
  crosshair.classList.toggle('aiming', data.aiming)
  const grenadeStatus = byId('grenade-status')
  grenadeStatus.textContent = data.grenadeCooldown > 0 ? `${Math.ceil(data.grenadeCooldown)}s` : 'PRONTA'
  grenadeStatus.classList.toggle('cooldown', data.grenadeCooldown > 0)
  const turretStatus = byId('turret-status')
  turretStatus.textContent = data.turretCooldown > 0 ? `${Math.ceil(data.turretCooldown)}s` : 'PRONTA'
  turretStatus.classList.toggle('cooldown', data.turretCooldown > 0)
  const doorPrompt = byId('door-prompt')
  doorPrompt.classList.toggle('hidden', !data.door || currentState !== 'playing')
  doorPrompt.classList.toggle('denied', data.door?.denied ?? false)
  if (data.door) {
    byId('door-prompt-text').textContent = data.door.denied
      ? `SERVONO ${data.door.cost} FRAMMENTI`
      : `APRI PORTA // ◆ ${data.door.cost}`
  }
  if (data.tct) updateTctOverlay(data.tct)
}

function updateTctOverlay(data: TctHudData): void {
  const canvas = byId<HTMLCanvasElement>('minimap')
  const context = canvas.getContext('2d')
  if (!context) return
  const { minimap } = data
  const size = canvas.width
  const scale = size / (minimap.arenaLimit * 2 + 2)
  const point = (x: number, z: number) => ({ x: size / 2 + x * scale, y: size / 2 + z * scale })
  context.clearRect(0, 0, size, size)
  context.fillStyle = 'rgba(5, 9, 18, 0.9)'
  context.fillRect(0, 0, size, size)
  context.strokeStyle = '#294352'
  context.strokeRect(size / 2 - minimap.arenaLimit * scale, size / 2 - minimap.arenaLimit * scale, minimap.arenaLimit * scale * 2, minimap.arenaLimit * scale * 2)
  context.fillStyle = '#344554'
  for (const obstacle of minimap.obstacles) {
    const position = point(obstacle.x - obstacle.width / 2, obstacle.z - obstacle.depth / 2)
    context.fillRect(position.x, position.y, obstacle.width * scale, obstacle.depth * scale)
  }
  for (const bot of minimap.bots) {
    if (!bot.alive) continue
    const position = point(bot.x, bot.z)
    context.fillStyle = bot.team === 'alpha' ? '#58f5e5' : '#ff4f87'
    context.beginPath()
    context.arc(position.x, position.y, 3, 0, Math.PI * 2)
    context.fill()
  }
  const player = point(minimap.playerX, minimap.playerZ)
  context.save()
  context.translate(player.x, player.y)
  context.rotate(-minimap.yaw)
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(0, -6)
  context.lineTo(4, 5)
  context.lineTo(-4, 5)
  context.closePath()
  context.fill()
  context.restore()

  const markers = data.allies.map((ally) => {
    const marker = document.createElement('div')
    marker.className = 'ally-marker'
    marker.style.left = `${ally.x}%`
    marker.style.top = `${ally.y}%`
    marker.innerHTML = `${ally.role.toUpperCase()}<span class="ally-health"><i style="width:${Math.max(0, ally.health)}%"></i></span>`
    return marker
  })
  byId('ally-markers').replaceChildren(...markers)
}

function showUpgradeChoices(ids: string[]): void {
  availableUpgradeIds = ids
  const buttons: HTMLButtonElement[] = []
  ids.forEach((id, index) => {
    const upgrade = UPGRADE_BY_ID.get(id)
    if (!upgrade) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'upgrade-choice'
    button.innerHTML = `
      <span class="upgrade-key">${index + 1}</span>
      <span class="upgrade-icon" aria-hidden="true">${upgrade.icon}</span>
      <strong>${upgrade.name}</strong>
      <p>${upgrade.description}</p>
      <small>${upgrade.tag}</small>
    `
    button.addEventListener('click', () => game.chooseUpgrade(id))
    buttons.push(button)
  })
  upgradeChoices.replaceChildren(...buttons)
}

function syncCloudProfile(): void {
  if (!cloud) return
  void cloud.saveProfile(identity, progress).catch(() => {
    byId('cloud-status').textContent = 'OFFLINE // SALVATAGGIO LOCALE'
  })
}

async function refreshOnlineLeaderboard(): Promise<void> {
  if (!cloud) return
  try {
    onlineLeaderboard = await cloud.getLeaderboard()
    byId('cloud-status').textContent = 'ONLINE // SUPABASE'
  } catch {
    onlineLeaderboard = null
    byId('cloud-status').textContent = 'OFFLINE // CLASSIFICA LOCALE'
  }
  renderMenu()
}

async function initializeCloud(): Promise<void> {
  if (!cloud) return
  byId('cloud-status').textContent = 'SINCRONIZZAZIONE...'
  try {
    const remote = await cloud.loadProfile(identity)
    if (remote) {
      progress = {
        ...remote,
        cores: Math.max(progress.cores, remote.cores),
        bestScore: Math.max(progress.bestScore, remote.bestScore),
        bestWave: Math.max(progress.bestWave, remote.bestWave),
        totalKills: Math.max(progress.totalKills, remote.totalKills),
        runs: Math.max(progress.runs, remote.runs),
        leaderboard: progress.leaderboard,
        upgrades: {
          vitality: Math.max(progress.upgrades.vitality, remote.upgrades.vitality),
          power: Math.max(progress.upgrades.power, remote.upgrades.power),
          mobility: Math.max(progress.upgrades.mobility, remote.upgrades.mobility),
        },
      }
      saveProgress(window.localStorage, progress)
      renderMenu()
    }
    syncCloudProfile()
    await refreshOnlineLeaderboard()
  } catch {
    byId('cloud-status').textContent = 'OFFLINE // DATI LOCALI'
  }
}

function completeRun(result: RunResult): void {
  byId('result-score-label').textContent = 'PUNTEGGIO'
  byId('result-wave-label').textContent = 'ONDATA'
  byId('result-kills-label').textContent = 'ELIMINAZIONI'
  byId('result-shards').parentElement?.classList.remove('hidden')
  progress = recordRun(progress, result)
  saveProgress(window.localStorage, progress)
  syncCloudProfile()
  if (cloud) void cloud.submitRun(identity, result).then(refreshOnlineLeaderboard).catch(() => {
    byId('cloud-status').textContent = 'OFFLINE // RUN SALVATA IN LOCALE'
  })
  byId('result-score').textContent = result.score.toLocaleString('it-IT')
  byId('result-wave').textContent = String(result.wave)
  byId('result-kills').textContent = String(result.kills)
  byId('result-shards').textContent = `+${result.shards}`
  byId('gameover-title').textContent = result.won ? 'STAZIONE SICURA' : 'RUN TERMINATA'
  byId('gameover-message').textContent = result.won
    ? 'Hai superato tutte le 15 ondate. Bonus vittoria: 10 frammenti.'
    : 'L’orda ti ha sopraffatto. I frammenti recuperati sono al sicuro.'
  renderMenu()
}

function completeTctMatch(result: TctResult): void {
  byId('result-score-label').textContent = 'ALPHA'
  byId('result-wave-label').textContent = 'AVVERSARI'
  byId('result-kills-label').textContent = 'ELIMINAZIONI / MORTI'
  byId('result-score').textContent = String(result.alphaScore)
  byId('result-wave').textContent = String(result.enemyScore)
  byId('result-kills').textContent = `${result.kills} / ${result.deaths}`
  byId('result-shards').parentElement?.classList.add('hidden')
  byId('gameover-title').textContent = result.winner === 'draw' ? 'PAREGGIO' : result.winner === 'alpha' ? 'VITTORIA ALPHA' : 'SCONFITTA'
  byId('gameover-message').textContent = 'Match TCT terminato. La progressione zombie non è stata modificata.'
}

function renderMenu(): void {
  byId('best-score').textContent = progress.bestScore.toLocaleString('it-IT')
  byId('best-wave').textContent = String(progress.bestWave)
  byId('total-runs').textContent = String(progress.runs)
  byId('core-balance').textContent = String(progress.cores)

  const ranking = onlineLeaderboard ?? progress.leaderboard
  byId('leaderboard-title').textContent = onlineLeaderboard ? 'CLASSIFICA ONLINE // TOP 5' : 'CLASSIFICA LOCALE // TOP 5'
  const leaderboardRows: HTMLElement[] = ranking.map((entry, index) => {
    const row = document.createElement('div')
    row.className = 'leaderboard-row'
    const minutes = Math.floor(entry.time / 60)
    const seconds = String(entry.time % 60).padStart(2, '0')
    const waveLabel = 'callsign' in entry ? `${entry.callsign} · ONDATA ${entry.wave}` : `ONDATA ${entry.wave}`
    row.innerHTML = `<span>#${index + 1}</span><span>${waveLabel}</span><span>${entry.score.toLocaleString('it-IT')} PT</span><span>${minutes}:${seconds}</span>`
    return row
  })
  if (leaderboardRows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'leaderboard-empty'
    empty.textContent = 'Nessuna run registrata.'
    leaderboardRows.push(empty)
  }
  byId('leaderboard-rows').replaceChildren(...leaderboardRows)

  const cards = META_UPGRADES.map((upgrade) => {
    const level = progress.upgrades[upgrade.id]
    const cost = META_COSTS[level]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'meta-upgrade'
    button.disabled = cost === undefined || progress.cores < cost
    button.setAttribute('aria-label', cost === undefined
      ? `${upgrade.name}: livello massimo`
      : `${upgrade.name}: livello ${level}, potenzia per ${cost} frammenti`)
    const levels = Array.from({ length: MAX_META_LEVEL }, (_, index) => `<i class="${index < level ? 'active' : ''}"></i>`).join('')
    button.innerHTML = `
      <span class="meta-icon" aria-hidden="true">${upgrade.icon}</span>
      <span class="meta-info">
        <strong>${upgrade.name}</strong>
        <small>${upgrade.description}</small>
        <span class="meta-level" aria-hidden="true">${levels}</span>
      </span>
      <span class="meta-cost">${cost === undefined ? 'MAX' : `◆ ${cost}`}</span>
    `
    button.addEventListener('click', () => {
      const next = purchaseMetaUpgrade(progress, upgrade.id)
      if (next === progress) return
      progress = next
      saveProgress(window.localStorage, progress)
      syncCloudProfile()
      renderMenu()
    })
    return button
  })
  byId('meta-upgrades').replaceChildren(...cards)
}

function showWaveBanner(wave: number): void {
  window.clearTimeout(waveBannerTimer)
  byId('wave-banner-title').textContent = wave % 5 === 0 ? `BOSS // ONDATA ${wave}` : `ONDATA ${wave}`
  waveBanner.classList.add('hidden')
  waveBanner.style.animation = 'none'
  void waveBanner.offsetWidth
  waveBanner.style.animation = ''
  waveBanner.classList.remove('hidden')
  waveBannerTimer = window.setTimeout(() => waveBanner.classList.add('hidden'), 2400)
}

function showHitmarker(headshot: boolean): void {
  window.clearTimeout(hitmarkerTimer)
  hitmarker.classList.toggle('headshot', headshot)
  hitmarker.classList.add('active')
  hitmarkerTimer = window.setTimeout(() => hitmarker.classList.remove('active'), 100)
}

function flashDamage(): void {
  window.clearTimeout(damageFlashTimer)
  damageFlash.classList.add('active')
  damageFlashTimer = window.setTimeout(() => damageFlash.classList.remove('active'), 90)
}

function startRun(): void {
  if (selectedMode === 'tct') tctGame.start(selectedMap, selectedPrimary)
  else game.start(getMetaBonuses(progress), selectedMap)
}

function activeGame(): Game | TctGame {
  return selectedMode === 'tct' ? tctGame : game
}

function applyAccessibility(): void {
  app.classList.toggle('reduced-motion', accessibility.reducedMotion)
  app.classList.toggle('high-contrast', accessibility.highContrast)
  game.setAccessibility(accessibility)
  tctGame.setAccessibility(accessibility)
}

function updateAccessibility(patch: Partial<typeof accessibility>): void {
  accessibility = { ...accessibility, ...patch }
  applyAccessibility()
  saveAccessibility(window.localStorage, accessibility)
}

document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((button) => {
  button.addEventListener('click', () => {
    const map = MAPS.find((candidate) => candidate.id === button.dataset.map)
    if (!map) return
    selectedMap = map
    document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((option) => {
      const selected = option === button
      option.classList.toggle('selected', selected)
      option.setAttribute('aria-pressed', String(selected))
    })
  })
})

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedMode = button.dataset.mode === 'tct' ? 'tct' : 'zombies'
    game.setActive(selectedMode === 'zombies')
    tctGame.setActive(selectedMode === 'tct')
    byId('tct-loadout').classList.toggle('hidden', selectedMode !== 'tct')
    if (selectedMode === 'tct') document.querySelector<HTMLButtonElement>('[data-map="depot-06"]')?.click()
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((option) => {
      const selected = option === button
      option.classList.toggle('selected', selected)
      option.setAttribute('aria-pressed', String(selected))
    })
    byId('start-button').querySelector('span')!.textContent = selectedMode === 'tct' ? 'INIZIA MATCH' : 'INIZIA RUN'
  })
})

document.querySelectorAll<HTMLButtonElement>('[data-primary]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.primary as WeaponId
    if (!WEAPONS[id]) return
    selectedPrimary = id
    document.querySelectorAll<HTMLButtonElement>('[data-primary]').forEach((option) => option.classList.toggle('selected', option === button))
  })
})

byId<HTMLInputElement>('reduced-motion').addEventListener('change', (event) => updateAccessibility({ reducedMotion: (event.target as HTMLInputElement).checked }))
byId<HTMLInputElement>('high-contrast').addEventListener('change', (event) => updateAccessibility({ highContrast: (event.target as HTMLInputElement).checked }))
byId<HTMLInputElement>('mouse-sensitivity').addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement
  const sensitivity = Number(input.value)
  byId<HTMLOutputElement>('sensitivity-value').textContent = `${sensitivity.toFixed(1).replace('.', ',')}×`
  updateAccessibility({ sensitivity })
})

byId<HTMLInputElement>('callsign').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement
  identity = { ...identity, callsign: normalizeCallsign(input.value) }
  input.value = identity.callsign
  saveIdentity(window.localStorage, identity)
  syncCloudProfile()
})

byId<HTMLSelectElement>('graphics-quality').addEventListener('change', (event) => {
  graphicsQuality = normalizeGraphicsQuality((event.target as HTMLSelectElement).value)
  game.setGraphicsQuality(graphicsQuality)
  tctGame.setGraphicsQuality(graphicsQuality)
  try {
    window.localStorage.setItem(GRAPHICS_STORAGE_KEY, graphicsQuality)
  } catch {}
})

byId<HTMLButtonElement>('start-button').addEventListener('click', startRun)
byId<HTMLButtonElement>('restart-button').addEventListener('click', startRun)
byId<HTMLButtonElement>('pause-button').addEventListener('click', () => activeGame().pause())
byId<HTMLButtonElement>('resume-button').addEventListener('click', () => activeGame().resume())
byId<HTMLButtonElement>('abandon-button').addEventListener('click', () => activeGame().abandon())
byId<HTMLButtonElement>('menu-button').addEventListener('click', () => activeGame().returnToMenu())
soundButton.addEventListener('click', () => {
  const current = activeGame()
  current.setAudioMuted(!current.isAudioMuted)
  soundButton.textContent = current.isAudioMuted ? 'AUDIO OFF' : 'AUDIO ON'
  soundButton.setAttribute('aria-label', current.isAudioMuted ? 'Attiva audio' : 'Disattiva audio')
})

window.addEventListener('keydown', (event) => {
  if (currentState !== 'upgrade' || !['Digit1', 'Digit2', 'Digit3'].includes(event.code)) return
  const index = Number(event.code.at(-1)) - 1
  const upgradeId = availableUpgradeIds[index]
  if (upgradeId) game.chooseUpgrade(upgradeId)
})

renderMenu()
void initializeCloud()
if (import.meta.hot) import.meta.hot.dispose(() => {
  game.destroy()
  tctGame.destroy()
})

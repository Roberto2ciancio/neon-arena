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
import { NetSession, NetSessionError } from './game/net/NetSession'
import { generateRoomCode, NET_ERROR_MESSAGES, normalizeRoomCode, otherTeam } from './game/net/protocol'
import type { HostMessage } from './game/net/protocol'
import { getTransportKind } from './game/net/transport'
import { addXp, loadArmory, MAX_LEVEL, resolveLoadout, saveArmory, XP_REWARDS, xpForLevel } from './game/armory'
import type { ArmoryState } from './game/armory'
import { ArmoryScreen } from './armoryScreen'
import { AccountPanel } from './accountPanel'
import { SupabaseAuth } from './game/auth'
import type { PlayerSave } from './game/accountSave'
import { ATTACHMENTS } from './game/attachments'
import { CAMOS, COSMETIC_CATALOG } from './game/cosmetics'
import type { CosmeticOption } from './game/cosmetics'
import { EQUIPMENT } from './game/equipment'
import { MELEE_WEAPONS } from './game/weapons'
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
const upgradePanel = byId('upgrade-panel')
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
let armory: ArmoryState = loadArmory(window.localStorage)
let accountPanel: AccountPanel | null = null
let session: NetSession | null = null
let lobbyBusy = false
const transportKind = getTransportKind()
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
  onFlash: showFlash,
  onPowerUp: showPowerUp,
})

const tctGame = new TctGame(byId('scene'), {
  onStateChange: updateState,
  onHud: updateHud,
  onMatchEnd: completeTctMatch,
  onDamage: flashDamage,
  onHit: showHitmarker,
  onFlash: showFlash,
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
  if (state !== 'playing' && state !== 'paused') upgradePanel.classList.add('hidden')
  gameoverScreen.classList.toggle('hidden', state !== 'gameover' && state !== 'victory')

  const status: Record<GameState, string> = {
    menu: 'SISTEMA PRONTO',
    playing: 'COMBATTIMENTO ATTIVO',
    paused: 'SIMULAZIONE SOSPESA',
    gameover: 'SEGNALE INTERROTTO',
    victory: 'STAZIONE SICURA',
  }
  byId('system-status').textContent = status[state]
  if (state === 'menu') {
    waveBanner.classList.add('hidden')
    renderMenu()
  }
}

const hudElements = new Map<string, HTMLElement>()

/** Elemento dell'HUD in cache: l'HUD si aggiorna 20 volte al secondo. */
function hudEl<T extends HTMLElement = HTMLElement>(id: string): T {
  let element = hudElements.get(id)
  if (!element) {
    element = byId(id)
    hudElements.set(id, element)
  }
  return element as T
}

/** Scrive il testo solo se è cambiato, per non invalidare stile e layout a ogni aggiornamento. */
function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value
}

let powerUpsKey = ''

function renderPowerUps(powerUps: HudData['powerUps']): void {
  const key = powerUps.map((power) => `${power.id}:${Math.ceil(power.remaining)}`).join('|')
  if (key === powerUpsKey) return
  powerUpsKey = key
  hudEl('power-ups').replaceChildren(...powerUps.map((power) => {
    const item = document.createElement('span')
    item.className = 'power-up'
    item.style.color = `#${power.color.toString(16).padStart(6, '0')}`
    item.innerHTML = `<b>${power.icon}</b>${power.name} ${Math.ceil(power.remaining)}s<i style="width:${Math.round((power.remaining / Math.max(power.duration, 0.1)) * 100)}%"></i>`
    return item
  }))
}

function updateHud(data: HudData): void {
  const healthPercentage = Math.max(0, (data.health / data.maxHealth) * 100)
  setText(hudEl('health-text'), `${Math.ceil(data.health)} / ${data.maxHealth}`)
  if (data.performance) setText(hudEl('performance-stats'), `${data.performance.fps} FPS · ${data.performance.drawCalls} DC`)
  hudEl('health-fill').style.width = `${healthPercentage}%`
  hudEl('health-fill').classList.toggle('critical', healthPercentage < 30)
  hudEl('xp-fill').style.width = `${Math.min(100, (data.xp / data.xpNext) * 100)}%`
  setText(hudEl('level-text'), String(data.level))
  setText(hudEl('score-label'), data.tct ? `${data.tct.team.toUpperCase()} // AVVERSARI` : 'PUNTEGGIO')
  setText(hudEl('score-text'), data.tct
    ? `${data.tct.teamScore} : ${data.tct.enemyScore}`
    : String(data.score).padStart(6, '0'))
  setText(hudEl('map-name'), data.mapName.toUpperCase())
  setText(hudEl('wave-text'), data.tct
    ? `TCT // ${Math.floor(data.tct.timeRemaining / 60)}:${String(Math.ceil(data.tct.timeRemaining) % 60).padStart(2, '0')}`
    : data.waveBreak > 0
      ? `INTERVALLO ${Math.ceil(data.waveBreak)}s`
      : `ONDATA ${String(data.wave).padStart(2, '0')}`)
  const respawnBanner = hudEl('respawn-banner')
  respawnBanner.classList.toggle('hidden', !data.tct || data.tct.playerRespawn <= 0 || currentState !== 'playing')
  if (data.tct?.playerRespawn) setText(respawnBanner, `RIENTRO IN COMBATTIMENTO // ${Math.ceil(data.tct.playerRespawn)}s`)
  hudEl('wave-text').title = `${data.enemiesRemaining} nemici rimanenti`
  setText(hudEl('shards-text'), String(data.shards))
  setText(hudEl('kills-text'), String(data.kills))
  setText(hudEl('ammo-text'), data.melee ? '—' : String(data.ammo).padStart(2, '0'))
  setText(hudEl('reserve-text'), data.melee ? '—' : data.reserveAmmo === null ? '∞' : String(data.reserveAmmo))
  setText(hudEl('weapon-name'), data.weaponName)
  setText(hudEl('reload-text'), data.melee ? 'CLICK O F PER COLPIRE' : data.reloading ? 'RICARICA IN CORSO...' : data.ammo === 0 ? 'PREMI R PER RICARICARE' : 'CARICATORE PRONTO')
  hudEl('scope-overlay').classList.toggle('hidden', !data.scoped || currentState !== 'playing')
  hud.classList.toggle('scoped', data.scoped)
  weaponHud.classList.toggle('reloading', data.reloading)
  crosshair.classList.toggle('aiming', data.aiming)
  const equipmentIds = [['lethal-name', 'grenade-status'], ['tactical-name', 'tactical-status'], ['gadget-name', 'turret-status']] as const
  data.equipment.forEach((entry, index) => {
    const ids = equipmentIds[index]
    if (!ids) return
    setText(hudEl(ids[0]), entry.name)
    const status = hudEl(ids[1])
    setText(status, entry.cooldown > 0 ? `${Math.ceil(entry.cooldown)}s` : 'PRONTA')
    status.classList.toggle('cooldown', entry.cooldown > 0)
  })
  const doorPrompt = hudEl('door-prompt')
  doorPrompt.classList.toggle('hidden', !data.interaction || currentState !== 'playing')
  doorPrompt.classList.toggle('denied', data.interaction?.denied ?? false)
  if (data.interaction) {
    setText(hudEl('door-prompt-text'), data.interaction.denied
      ? `SERVONO ${data.interaction.cost} FRAMMENTI`
      : `${data.interaction.label} // ◆ ${data.interaction.cost}`)
  }
  crosshair.classList.toggle('crouched', data.stance !== 'stand')
  renderWeaponSlots(data.weaponSlots)
  renderPowerUps(data.powerUps)
  if (data.tct) updateTctOverlay(data.tct)
}

let weaponSlotsKey = ''

function renderWeaponSlots(slots: HudData['weaponSlots']): void {
  const key = slots.map((slot) => `${slot.owned ? 1 : 0}${slot.active ? 1 : 0}`).join('')
  if (key === weaponSlotsKey) return
  weaponSlotsKey = key
  const items = slots.map((slot) => {
    const item = document.createElement('span')
    item.className = 'weapon-slot'
    item.classList.toggle('owned', slot.owned)
    item.classList.toggle('active', slot.active)
    item.textContent = `${slot.key} ${slot.name}`
    item.title = slot.owned ? slot.name : `${slot.name}: acquistabile a una postazione`
    return item
  })
  byId('weapon-slots').replaceChildren(...items)
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
  for (const entry of minimap.players) {
    if (!entry.alive) continue
    const position = point(entry.x, entry.z)
    context.fillStyle = entry.ally ? '#58f5e5' : '#ff4f87'
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
    marker.textContent = ally.name
    const health = document.createElement('span')
    health.className = 'ally-health'
    health.innerHTML = `<i style="width:${Math.max(0, ally.health)}%"></i>`
    marker.append(health)
    return marker
  })
  byId('ally-markers').replaceChildren(...markers)
}

const UPGRADE_KEY_LABELS = ['Z', 'X', 'V']

function showUpgradeChoices(ids: string[], pending: number): void {
  const buttons: HTMLButtonElement[] = []
  ids.forEach((id, index) => {
    const upgrade = UPGRADE_BY_ID.get(id)
    if (!upgrade) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'upgrade-choice'
    button.title = upgrade.description
    button.innerHTML = `
      <span class="upgrade-key">${UPGRADE_KEY_LABELS[index] ?? ''}</span>
      <span class="upgrade-icon" aria-hidden="true">${upgrade.icon}</span>
      <span><strong>${upgrade.name}</strong><small>${upgrade.description}</small></span>
    `
    button.addEventListener('click', () => game.chooseUpgrade(id))
    buttons.push(button)
  })
  upgradeChoices.replaceChildren(...buttons)
  byId('upgrade-pending').textContent = pending > 1 ? `+${pending - 1} IN CODA` : ''
  const wasHidden = upgradePanel.classList.contains('hidden')
  upgradePanel.classList.toggle('hidden', buttons.length === 0)
  if (wasHidden && buttons.length > 0) byId('upgrade-title').textContent = pending > 1 ? `LIVELLO SU! SCEGLI UN POTENZIAMENTO (${pending})` : 'LIVELLO SU! SCEGLI UN POTENZIAMENTO'
}

function syncCloudProfile(): void {
  accountPanel?.scheduleSave()
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

function setArmory(next: ArmoryState): void {
  armory = next
  saveArmory(window.localStorage, armory)
  renderPlayerLevel()
  accountPanel?.scheduleSave()
}

// ---------------------------------------------------------------------------
// Profilo: ospite o account, pannelli laterali del menu
// ---------------------------------------------------------------------------

function renderProfile(): void {
  byId('profile-name').textContent = identity.callsign
  byId('profile-avatar').textContent = identity.callsign.charAt(0) || 'P'
  const signedIn = accountPanel?.signedIn ?? false
  byId('profile-kind').textContent = signedIn ? `ACCOUNT // ${accountPanel?.email ?? ''}` : 'OSPITE // PROGRESSI SU QUESTO DISPOSITIVO'
  byId('profile-kind').parentElement?.parentElement?.classList.toggle('signed', signedIn)
  byId<HTMLInputElement>('callsign').value = identity.callsign
}

function localSave(): PlayerSave {
  return { callsign: identity.callsign, progress, armory }
}

function applyMergedSave(save: PlayerSave): void {
  progress = save.progress
  saveProgress(window.localStorage, progress)
  identity = { ...identity, callsign: save.callsign }
  saveIdentity(window.localStorage, identity)
  armory = save.armory
  saveArmory(window.localStorage, armory)
  renderPlayerLevel()
  renderMenu()
  renderProfile()
}

const DRAWER_TITLES: Record<string, string> = {
  workshop: 'OFFICINA',
  leaderboard: 'CLASSIFICA',
  settings: 'IMPOSTAZIONI',
  controls: 'COMANDI',
}

function openDrawer(panel: string): void {
  byId('drawer-title').textContent = DRAWER_TITLES[panel] ?? ''
  document.querySelectorAll<HTMLElement>('[data-drawer-panel]').forEach((section) => {
    section.classList.toggle('active', section.dataset.drawerPanel === panel)
  })
  byId('menu-drawer').classList.remove('hidden')
  byId<HTMLButtonElement>('drawer-close').focus()
}

function closeDrawer(): void {
  byId('menu-drawer').classList.add('hidden')
}

function renderPlayerLevel(): void {
  byId('player-level').textContent = String(armory.level)
  const needed = xpForLevel(armory.level)
  byId<HTMLElement>('player-xp-fill').style.width = armory.level >= MAX_LEVEL ? '100%' : `${Math.round((armory.xp / needed) * 100)}%`
  byId('player-xp-text').textContent = armory.level >= MAX_LEVEL ? 'LIVELLO MASSIMO' : `${armory.xp} / ${needed} XP`
}

/** Nomi degli oggetti sbloccati raggiungendo esattamente un dato livello. */
function unlocksAt(level: number): string[] {
  const names: string[] = []
  for (const weapon of Object.values(WEAPONS)) if (weapon.unlockLevel === level) names.push(weapon.shortName)
  for (const melee of Object.values(MELEE_WEAPONS)) if (melee.unlockLevel === level) names.push(melee.name)
  for (const item of Object.values(EQUIPMENT)) if (item.unlockLevel === level) names.push(item.name)
  for (const attachment of Object.values(ATTACHMENTS)) if (attachment.unlockLevel === level) names.push(attachment.name)
  for (const camo of CAMOS) if (camo.unlockLevel === level) names.push(`MIMETICA ${camo.name}`)
  for (const options of Object.values(COSMETIC_CATALOG) as (readonly CosmeticOption<string>[])[]) {
    for (const option of options) if (option.unlockLevel === level && option.unlockLevel > 1 && !names.includes(option.name)) names.push(option.name)
  }
  return names
}

/** Assegna l'XP di fine partita e descrive eventuali nuovi livelli e sblocchi. */
function grantXp(amount: number): string {
  const before = armory.level
  const result = addXp(armory, amount)
  setArmory(result.state)
  if (result.levelsGained === 0) return ` +${amount} XP.`
  const unlocked: string[] = []
  for (let level = before + 1; level <= result.state.level; level += 1) unlocked.push(...unlocksAt(level))
  return ` +${amount} XP // LIVELLO ${result.state.level}!${unlocked.length > 0 ? ` Sbloccati: ${unlocked.join(', ')}.` : ''}`
}

/** I livelli delle armi valgono solo in Zombie: nel TCT tutti hanno le stesse statistiche. */
function currentLoadout(mode: 'zombies' | 'tct' = 'zombies') {
  return resolveLoadout(armory.loadout, armory.cosmetics, mode === 'zombies' ? armory.weaponLevels : {})
}

function completeRun(result: RunResult): void {
  byId('restart-button').textContent = 'NUOVA RUN'
  byId('menu-button').textContent = 'TORNA ALL’OFFICINA'
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
  const xp = result.kills * XP_REWARDS.zombieKill + Math.max(0, result.wave - 1) * XP_REWARDS.wave + XP_REWARDS.runComplete
  byId('gameover-message').textContent = (result.won
    ? 'Hai superato tutte le 15 ondate. Bonus vittoria: 10 frammenti.'
    : 'L’orda ti ha sopraffatto. I frammenti recuperati sono al sicuro.') + grantXp(xp)
  renderMenu()
}

function completeTctMatch(result: TctResult): void {
  byId('result-score-label').textContent = 'SQUADRA'
  byId('result-wave-label').textContent = 'AVVERSARI'
  byId('result-kills-label').textContent = 'ELIMINAZIONI / MORTI'
  byId('result-score').textContent = String(result.teamScore)
  byId('result-wave').textContent = String(result.enemyScore)
  byId('result-kills').textContent = `${result.kills} / ${result.deaths}`
  byId('result-shards').parentElement?.classList.add('hidden')
  byId('gameover-title').textContent = result.outcome === 'draw' ? 'PAREGGIO' : result.outcome === 'win' ? 'VITTORIA' : 'SCONFITTA'
  const xp = result.kills * XP_REWARDS.tctKill + XP_REWARDS.tctMatch + (result.outcome === 'win' ? XP_REWARDS.tctWin : 0)
  byId('gameover-message').textContent = `Match TCT online terminato.${grantXp(xp)}`
  byId('restart-button').textContent = 'TORNA ALLA LOBBY'
  byId('menu-button').textContent = 'ESCI DALLA STANZA'
}

function renderMenu(): void {
  byId('best-score').textContent = progress.bestScore.toLocaleString('it-IT')
  byId('best-wave').textContent = String(progress.bestWave)
  byId('total-runs').textContent = String(progress.runs)
  byId('core-balance').textContent = String(progress.cores)
  byId('core-balance-side').textContent = String(progress.cores)

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

let flashTimer = 0
let powerBannerTimer = 0

function showPowerUp(name: string, description: string, color: number): void {
  const banner = byId<HTMLElement>('power-banner')
  window.clearTimeout(powerBannerTimer)
  banner.style.color = `#${color.toString(16).padStart(6, '0')}`
  byId('power-banner-title').textContent = name
  byId('power-banner-text').textContent = description
  banner.classList.add('hidden')
  void banner.offsetWidth
  banner.classList.remove('hidden')
  powerBannerTimer = window.setTimeout(() => banner.classList.add('hidden'), 2200)
}

/** Accecamento del flashbang: bianco pieno che sfuma in base all'intensità. */
function showFlash(intensity: number): void {
  const overlay = byId<HTMLElement>('flash-overlay')
  window.clearTimeout(flashTimer)
  overlay.style.transition = 'none'
  overlay.style.opacity = String(Math.min(1, intensity))
  void overlay.offsetWidth
  flashTimer = window.setTimeout(() => {
    overlay.style.transition = `opacity ${(0.6 + intensity * 2.6).toFixed(2)}s ease-in`
    overlay.style.opacity = '0'
  }, 120 + intensity * 600)
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
  if (selectedMode === 'tct') returnToLobby()
  else game.start(getMetaBonuses(progress), selectedMap, currentLoadout())
}

// ---------------------------------------------------------------------------
// TCT online: stanza P2P con host autorevole
// ---------------------------------------------------------------------------

const LOBBY_IDLE_TEXT = 'Crea una stanza o inserisci il codice di un amico.'

function setLobbyStatus(text: string, error = false): void {
  const status = byId('lobby-status')
  status.textContent = text
  status.classList.toggle('error', error)
}

function describeError(error: unknown): string {
  return error instanceof NetSessionError ? error.message : NET_ERROR_MESSAGES.network
}

async function createRoom(): Promise<void> {
  if (session || lobbyBusy) return
  lobbyBusy = true
  setLobbyStatus('Creazione della stanza...')
  renderLobby()
  try {
    for (let attempt = 0; attempt < 3 && !session; attempt += 1) {
      try {
        attachSession(await NetSession.host(generateRoomCode(), identity.callsign, selectedMap.id, transportKind, armory.cosmetics))
      } catch (error) {
        if (!(error instanceof NetSessionError && error.code === 'code-taken') || attempt === 2) throw error
      }
    }
  } catch (error) {
    setLobbyStatus(describeError(error), true)
  } finally {
    lobbyBusy = false
    renderLobby()
  }
}

async function joinRoom(): Promise<void> {
  if (session || lobbyBusy) return
  const input = byId<HTMLInputElement>('room-code')
  const code = normalizeRoomCode(input.value)
  if (!code) {
    setLobbyStatus('Il codice è composto da 5 caratteri.', true)
    return
  }
  lobbyBusy = true
  setLobbyStatus(`Connessione alla stanza ${code}...`)
  renderLobby()
  try {
    attachSession(await NetSession.join(code, identity.callsign, transportKind, armory.cosmetics))
    setLobbyStatus('Connesso. In attesa che l’host avvii la partita.')
  } catch (error) {
    setLobbyStatus(describeError(error), true)
  } finally {
    lobbyBusy = false
    renderLobby()
  }
}

function attachSession(next: NetSession): void {
  session = next
  next.subscribe(onSessionMessage)
  next.onClose((code) => {
    session = null
    if (selectedMode === 'tct' && currentState !== 'menu') tctGame.returnToMenu()
    setLobbyStatus(NET_ERROR_MESSAGES[code], true)
    renderLobby()
  })
  if (next.mapId) syncLobbyMap(next.mapId)
}

function onSessionMessage(message: HostMessage): void {
  if (!session) return
  if (message.t === 'lobby') {
    syncLobbyMap(message.mapId)
    renderLobby()
  }
  if (message.t === 'start' && selectedMode === 'tct') {
    armoryScreen.close()
    tctGame.start(session, message.mapId, message.players, currentLoadout('tct'))
  }
}

function syncLobbyMap(mapId: string): void {
  const map = MAPS.find((candidate) => candidate.id === mapId)
  if (!map) return
  selectedMap = map
  document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((option) => {
    const selected = option.dataset.map === mapId
    option.classList.toggle('selected', selected)
    option.setAttribute('aria-pressed', String(selected))
  })
  tctGame.previewMap(mapId)
}

function leaveRoom(): void {
  if (!session) return
  session.close()
  session = null
  setLobbyStatus(LOBBY_IDLE_TEXT)
  renderLobby()
}

function returnToLobby(): void {
  if (session?.isHost) session.backToLobby()
  tctGame.returnToMenu()
  renderLobby()
}

function renderLobby(): void {
  const inRoom = session !== null
  byId('lobby-connect').classList.toggle('hidden', inRoom)
  byId('lobby-room').classList.toggle('hidden', !inRoom)
  byId<HTMLButtonElement>('create-room').disabled = lobbyBusy
  byId<HTMLButtonElement>('join-room').disabled = lobbyBusy
  const guestInRoom = inRoom && !session?.isHost
  document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((option) => {
    option.disabled = selectedMode === 'tct' && guestInRoom
  })
  if (!session) return
  const current = session
  byId('room-code-display').textContent = current.code
  const players = current.lobby
  for (const team of ['alpha', 'bravo'] as const) {
    const items = players.filter((player) => player.team === team).sort((a, b) => a.slot - b.slot).map((player) => {
      const item = document.createElement('li')
      item.textContent = player.name
      item.classList.toggle('me', player.id === current.localId)
      const tags = [player.id === current.localId ? 'TU' : '', player.id === 'host' ? 'HOST' : ''].filter(Boolean)
      if (tags.length > 0) {
        const small = document.createElement('small')
        small.textContent = ` ${tags.join(' · ')}`
        item.append(small)
      }
      return item
    })
    byId(`team-${team}`).replaceChildren(...items)
  }
  const startButton = byId<HTMLButtonElement>('start-match')
  startButton.classList.toggle('hidden', !current.isHost)
  startButton.disabled = !current.canStart
  if (current.isHost) {
    setLobbyStatus(current.canStart
      ? `${players.length} giocatori pronti. Avvia quando vuoi.`
      : 'Stanza pronta. Serve almeno un giocatore per squadra per avviare.')
  }
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
    if (selectedMode === 'tct') {
      session?.setMap(map.id)
      tctGame.previewMap(map.id)
    }
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
    byId('tct-lobby').classList.toggle('hidden', selectedMode !== 'tct')
    byId('start-button').classList.toggle('hidden', selectedMode === 'tct')
    byId('abandon-button').textContent = selectedMode === 'tct' ? 'ESCI DALLA PARTITA' : 'TERMINA RUN'
    if (selectedMode === 'tct') document.querySelector<HTMLButtonElement>('[data-map="depot-06"]')?.click()
    else leaveRoom()
    renderLobby()
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((option) => {
      const selected = option === button
      option.classList.toggle('selected', selected)
      option.setAttribute('aria-pressed', String(selected))
    })
    byId('start-button').querySelector('span')!.textContent = selectedMode === 'tct' ? 'INIZIA MATCH' : 'INIZIA RUN'
    byId('play-step').textContent = selectedMode === 'tct' ? '3 // CREA O ENTRA IN UNA STANZA' : '3 // GIOCA'
  })
})

const armoryScreen = new ArmoryScreen({
  root: byId('armory-screen'),
  getState: () => armory,
  setState: setArmory,
  getCores: () => progress.cores,
  spendCores: (amount) => {
    if (progress.cores < amount) return false
    progress = { ...progress, cores: progress.cores - amount }
    saveProgress(window.localStorage, progress)
    syncCloudProfile()
    renderMenu()
    return true
  },
})
byId<HTMLButtonElement>('armory-button').addEventListener('click', () => armoryScreen.open())
byId<HTMLButtonElement>('armory-close').addEventListener('click', () => armoryScreen.close())
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && armoryScreen.isOpen) armoryScreen.close()
})
renderPlayerLevel()


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
  renderProfile()
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
byId<HTMLButtonElement>('abandon-button').addEventListener('click', () => {
  if (selectedMode === 'tct') leaveRoom()
  activeGame().abandon()
})
byId<HTMLButtonElement>('menu-button').addEventListener('click', () => {
  if (selectedMode === 'tct') leaveRoom()
  activeGame().returnToMenu()
})
byId<HTMLButtonElement>('create-room').addEventListener('click', () => void createRoom())
byId<HTMLButtonElement>('join-room').addEventListener('click', () => void joinRoom())
byId<HTMLInputElement>('room-code').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void joinRoom()
})
byId<HTMLButtonElement>('leave-room').addEventListener('click', leaveRoom)
byId<HTMLButtonElement>('start-match').addEventListener('click', () => {
  if (!session?.startMatch()) setLobbyStatus('Serve almeno un giocatore per squadra per avviare.', true)
})
byId<HTMLButtonElement>('switch-team').addEventListener('click', () => {
  if (!session) return
  const me = session.lobby.find((player) => player.id === session?.localId)
  if (me) session.send({ t: 'team', team: otherTeam(me.team) })
})
soundButton.addEventListener('click', () => {
  const current = activeGame()
  current.setAudioMuted(!current.isAudioMuted)
  soundButton.textContent = current.isAudioMuted ? 'AUDIO OFF' : 'AUDIO ON'
  soundButton.setAttribute('aria-label', current.isAudioMuted ? 'Attiva audio' : 'Disattiva audio')
})

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
accountPanel = new AccountPanel({
  auth: supabaseUrl && supabaseKey ? new SupabaseAuth(supabaseUrl, supabaseKey, window.localStorage) : null,
  storage: window.localStorage,
  getLocal: localSave,
  applyMerged: applyMergedSave,
  onProfileChange: renderProfile,
})
document.querySelectorAll<HTMLButtonElement>('[data-drawer]').forEach((button) => {
  button.addEventListener('click', () => openDrawer(button.dataset.drawer ?? ''))
})
byId<HTMLButtonElement>('drawer-close').addEventListener('click', closeDrawer)
byId('menu-drawer').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeDrawer()
})
// In fase di cattura: con il pannello aperto Esc lo chiude soltanto, senza riprendere la partita in pausa.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || byId('menu-drawer').classList.contains('hidden')) return
  event.stopPropagation()
  closeDrawer()
}, true)
byId<HTMLButtonElement>('pause-settings-button').addEventListener('click', () => openDrawer('settings'))

renderMenu()
renderProfile()
void initializeCloud()
void accountPanel.initialize()
window.addEventListener('pagehide', () => session?.close())
// Accesso di debug per i test visivi, solo in sviluppo.
if (import.meta.env.DEV) Object.assign(window, { __neonArena: { game, tctGame } })
if (import.meta.hot) import.meta.hot.dispose(() => {
  session?.close()
  game.destroy()
  tctGame.destroy()
})

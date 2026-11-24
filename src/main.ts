import { prestigeBadge } from './game/cosmetics'
import { enterImmersive, loadTouchPreference, resolveTouchEnabled, saveTouchPreference, TouchControls } from './touchControls'
import { normalizeTouchPreference } from './game/touchInput'
import { normalizeGore } from './game/killFeel'
import * as THREE from 'three'
import './style.css'
import { GameAudio } from './game/audio'
import { getLowHealthWarning } from './game/healing'
import { Game } from './game/Game'
import { loadAccessibility, saveAccessibility } from './game/accessibility'
import { SupabaseCloud } from './game/cloud'
import { LeaderboardPanel } from './leaderboardPanel'
import { loadIdentity, normalizeCallsign, saveIdentity } from './game/identity'
import { TctGame } from './game/TctGame'
import type { TctResult } from './game/TctGame'
import { MAPS, STATION_13 } from './game/maps'
import { normalizeGraphicsQuality } from './game/graphics'
import type { GraphicsQuality } from './game/graphics'
import { AutomaticQuality } from './game/automaticQuality'
import { META_COSTS, META_UPGRADES, MAX_META_LEVEL, getMetaBonuses, loadProgress, purchaseMetaUpgrade, recordRun, recordTctMatch, saveProgress } from './game/progression'
import { UPGRADE_BY_ID } from './game/upgrades'
import { WEAPONS } from './game/weapons'
import type { WeaponId } from './game/weapons'
import { NetSession, NetSessionError } from './game/net/NetSession'
import { generateRoomCode, NET_ERROR_MESSAGES, normalizeRoomCode, otherTeam } from './game/net/protocol'
import type { HostMessage } from './game/net/protocol'
import { getTransportKind } from './game/net/transport'
import { addXp, loadArmory, MAX_LEVEL, resolveLoadout, saveArmory, XP_REWARDS, xpForLevel, addWeaponXp, getMastery, prestigeUp } from './game/armory'
import type { ArmoryState } from './game/armory'
import { ArmoryScreen } from './armoryScreen'
import { AccountPanel } from './accountPanel'
import { renderProfilePanel } from './profilePanel'
import { CoopLobby } from './coopLobby'
import { SupabaseAuth } from './game/auth'
import type { PlayerSave } from './game/accountSave'
import { CAMOS, COSMETIC_CATALOG } from './game/cosmetics'
import type { CosmeticOption } from './game/cosmetics'
import { EQUIPMENT } from './game/equipment'
import { JETPACK_FUEL, MOBILITY } from './game/mobility'
import { LORE, loadFoundLore, saveFoundLore } from './game/lore'
import { CHANGELOG, getUnseenEntries, loadSeenChangelog, markChangelogSeen } from './game/changelog'
import { assignKey, createDefaultBindings, getActionKeyLabel, getActiveBindings, getKeyLabel, isAssignableCode, isDefaultBindings, KEY_ACTIONS, loadBindings, remapKeyEvent, saveBindings, setActiveBindings } from './game/keyBindings'
import type { KeyAction } from './game/keyBindings'
import { createTutorialSave, loadTutorial, saveTutorial, TutorialTracker } from './game/tutorial'
import type { TutorialObservation } from './game/tutorial'
import { GAME_MODE_IDS, GAME_MODES, isGameMode, isRanked } from './game/gameModes'
import type { GameMode } from './game/gameModes'
import { createDailyRun, getUtcDayKey, loadDailyBest, recordDailyScore } from './game/dailyRun'
import { getRewardMultiplier, loadRunModifiers, MAX_RUN_MODIFIERS, RUN_MODIFIER_IDS, RUN_MODIFIERS, saveRunModifiers, toggleRunModifier } from './game/runModifiers'
import { CHALLENGE_REWARDS, describeChallenge, getChallengeRewards, loadChallenges, recordChallengeEvent, refreshChallenges, saveChallenges } from './game/challenges'
import type { ActiveChallenge, ChallengeEvent, ChallengeSet } from './game/challenges'
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
    const stored = window.localStorage.getItem(GRAPHICS_STORAGE_KEY)
    // Primo avvio su telefono o tablet: qualità bassa, poi l'utente può alzarla.
    if (stored === null && resolveTouchEnabled('auto')) return 'low'
    return normalizeGraphicsQuality(stored)
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
let cloud = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? new SupabaseCloud(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null
const leaderboardPanel = new LeaderboardPanel({ getCloud: () => cloud, getToken: accountToken })
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
let qualityNoticeTimer = 0
// Stato del tutorial: dichiarato prima del gioco, che notifica subito lo stato iniziale.
let tutorialSave = createTutorialSave(loadTutorial(window.localStorage), progress.runs > 0 || armory.level > 1)
saveTutorial(window.localStorage, tutorialSave)
let tutorial = createTracker()
let tutorialUpgradeOpen = false
let tutorialLastHud = 0
let tutorialLastAmmo: { weapon: string; ammo: number } | null = null
const tutorialPressed = new Set<KeyAction>()
const TUTORIAL_KEYS = new Map(KEY_ACTIONS.map((action) => [action.defaultCode, action.id]))
TUTORIAL_KEYS.set('ArrowUp', 'forward').set('ArrowDown', 'back').set('ArrowLeft', 'left').set('ArrowRight', 'right')

const automaticQuality = new AutomaticQuality()

const game = new Game(byId('scene'), {
  onStateChange: updateState,
  onHud: (data) => {
    updateHud(data)
    updateTutorial(data)
  },
  onUpgrade: (choices, pending) => {
    tutorialUpgradeOpen = choices.length > 0
    showUpgradeChoices(choices, pending)
  },
  onRunEnd: completeRun,
  onWave: showWaveBanner,
  onDamage: flashDamage,
  onHit: showHitmarker,
  onFlash: showFlash,
  onPowerUp: showPowerUp,
  onKill: showKillMarker,
  onCombo: showComboCallout,
  onLoreFound: (id) => {
    foundLore = [...new Set([...foundLore, id])]
    saveFoundLore(window.localStorage, foundLore)
    renderArchiveBadge()
  },
  onDamageNumber: showDamageNumber,
  // I colori dei nemici sono spenti: schiariti per restare leggibili sul fondo scuro.
  onNotice: (title, text, color) => showPowerUp(title, text, new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex()),
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

let touchPreference = loadTouchPreference()
const touchControls = new TouchControls(app, () => (selectedMode === 'tct' ? tctGame : game))

function applyTouchMode(): void {
  const enabled = resolveTouchEnabled(touchPreference)
  touchControls.setEnabled(enabled)
  game.setTouchMode(enabled)
  tctGame.setTouchMode(enabled)
  touchControls.setVisible(currentState === 'playing')
}
applyTouchMode()
byId<HTMLSelectElement>('touch-preference').value = touchPreference
byId<HTMLSelectElement>('touch-preference').addEventListener('change', (event) => {
  touchPreference = normalizeTouchPreference((event.target as HTMLSelectElement).value)
  saveTouchPreference(touchPreference)
  applyTouchMode()
})
game.setGraphicsQuality(graphicsQuality)
tctGame.setGraphicsQuality(graphicsQuality)
byId<HTMLSelectElement>('graphics-quality').value = graphicsQuality
byId<HTMLInputElement>('callsign').value = identity.callsign
applyAccessibility()
byId<HTMLInputElement>('reduced-motion').checked = accessibility.reducedMotion
byId<HTMLInputElement>('high-contrast').checked = accessibility.highContrast
byId<HTMLInputElement>('mouse-sensitivity').value = String(accessibility.sensitivity)
byId<HTMLOutputElement>('sensitivity-value').textContent = `${accessibility.sensitivity.toFixed(1).replace('.', ',')}×`
byId<HTMLInputElement>('ads-sensitivity').value = String(accessibility.adsSensitivity)
byId<HTMLOutputElement>('ads-sensitivity-value').textContent = `${accessibility.adsSensitivity.toFixed(2).replace('.', ',')}×`
byId<HTMLInputElement>('ads-sensitivity').addEventListener('input', (event) => {
  const adsSensitivity = Number((event.target as HTMLInputElement).value)
  byId<HTMLOutputElement>('ads-sensitivity-value').textContent = `${adsSensitivity.toFixed(2).replace('.', ',')}×`
  updateAccessibility({ adsSensitivity })
})

function applyGraphicsQuality(quality: GraphicsQuality, notify = false): void {
  graphicsQuality = quality
  game.setGraphicsQuality(quality)
  tctGame.setGraphicsQuality(quality)
  byId<HTMLSelectElement>('graphics-quality').value = quality
  automaticQuality.reset()
  try {
    window.localStorage.setItem(GRAPHICS_STORAGE_KEY, quality)
  } catch {}
  if (!notify) return
  const notice = byId('quality-notice')
  notice.textContent = `FPS BASSI // QUALITÀ ${quality === 'medium' ? 'MEDIA' : 'BASSA'} ATTIVATA`
  notice.classList.remove('hidden')
  window.clearTimeout(qualityNoticeTimer)
  qualityNoticeTimer = window.setTimeout(() => notice.classList.add('hidden'), 4000)
}

function updateState(state: GameState): void {
  if (state === 'menu' || (state === 'playing' && currentState === 'menu')) {
    // Partita nuova o finita: suggerimento a metà e stato di lettura ripartono puliti.
    tutorial.reset()
    tutorialLastAmmo = null
    tutorialUpgradeOpen = false
    byId('tutorial-hint').classList.add('hidden')
  }
  currentState = state
  if (state !== 'playing') automaticQuality.reset()
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
  touchControls.setVisible(state === 'playing')
  if (state === 'playing' && touchControls.isEnabled) enterImmersive()
  if (state === 'paused') renderPauseSummary()
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

let coopTeamKey = ''

function renderCoopHud(coop: HudData['coop']): void {
  hudEl('coop-team').classList.toggle('hidden', !coop || coop.team.length === 0)
  const banner = hudEl('downed-banner')
  banner.classList.toggle('hidden', !coop || coop.status === 'alive' || currentState !== 'playing' && currentState !== 'paused')
  if (coop && coop.status !== 'alive') {
    setText(hudEl('downed-title'), coop.status === 'down' ? `SEI A TERRA // ${Math.ceil(coop.bleedOut)}s` : 'ELIMINATO')
    setText(hudEl('downed-text'), coop.status === 'down' ? 'Un compagno può rianimarti tenendo premuto E vicino a te.' : 'Rientri in campo all’inizio della prossima ondata.')
  }
  if (!coop) return
  const key = coop.team.map((mate) => `${mate.name}:${Math.round(mate.health / 10)}:${mate.status}`).join('|')
  if (key === coopTeamKey) return
  coopTeamKey = key
  hudEl('coop-team').replaceChildren(...coop.team.map((mate) => {
    const item = document.createElement('li')
    item.className = `coop-mate ${mate.status}`
    const name = document.createElement('span')
    name.textContent = mate.status === 'alive' ? mate.name : `${mate.name} // ${mate.status === 'down' ? 'A TERRA' : 'ELIMINATO'}`
    const bar = document.createElement('i')
    bar.style.width = `${Math.max(0, Math.min(100, mate.health))}%`
    item.append(name, bar)
    return item
  }))
}

let objectiveKey = ''

/** Obiettivo in corso (generatore o evacuazione) sotto la barra del boss. */
function renderObjective(objective: HudData['objective']): void {
  const box = hudEl('objective-hud')
  box.classList.toggle('hidden', !objective || currentState !== 'playing')
  if (!objective) return
  const progress = objective.progress === undefined ? -1 : Math.round(objective.progress * 100) / 100
  const key = `${objective.title}|${objective.detail}|${progress}|${objective.color}`
  if (key === objectiveKey) return
  objectiveKey = key
  setText(hudEl('objective-title'), objective.title)
  setText(hudEl('objective-detail'), objective.detail)
  box.classList.toggle('no-progress', progress < 0)
  box.style.setProperty('--objective', `#${objective.color.toString(16).padStart(6, '0')}`)
  box.style.setProperty('--progress', String(Math.max(0, progress)))
}

let bossShare = -1

/** Barra del boss in alto: vita, fase e nucleo scoperto. */
function renderBossBar(boss: HudData['boss']): void {
  const bar = hudEl('boss-bar')
  bar.classList.toggle('hidden', !boss || currentState !== 'playing')
  if (!boss) return
  setText(hudEl('boss-name'), boss.name)
  setText(hudEl('boss-phase'), boss.miniboss ? 'MINIBOSS' : boss.exposed ? 'NUCLEO SCOPERTO' : `FASE ${boss.phase}`)
  bar.classList.toggle('exposed', boss.exposed)
  const share = Math.round(boss.health * 200) / 200
  if (share !== bossShare) {
    bossShare = share
    bar.style.setProperty('--boss', String(share))
  }
}

let mobilityProgress = -1

/** Modulo di mobilità: cariche, ricarica o serbatoio del propulsore. */
function renderMobilityHud(mobility: HudData['mobility']): void {
  const box = hudEl('mobility-hud')
  box.classList.toggle('hidden', !mobility)
  if (!mobility) return
  setText(hudEl('mobility-name'), mobility.name)
  const status = hudEl('mobility-status')
  let text: string
  if (mobility.fuel !== undefined) text = mobility.fuel >= JETPACK_FUEL ? 'PIENO' : `${Math.round((mobility.fuel / JETPACK_FUEL) * 100)}%`
  else if (mobility.name === MOBILITY['wall-run'].name) text = mobility.active ? 'IN CORSA' : 'PASSIVO'
  else if (mobility.charges > 0) text = mobility.maxCharges > 1 ? `${mobility.charges}/${mobility.maxCharges}` : 'PRONTO'
  else text = mobility.cooldown > 0 ? `${Math.ceil(mobility.cooldown)}s` : 'A TERRA'
  setText(status, text)
  status.classList.toggle('cooldown', mobility.charges === 0 || (mobility.fuel !== undefined && mobility.fuel <= 0))
  box.classList.toggle('active', mobility.active)
  const progress = mobility.fuel !== undefined ? mobility.fuel / JETPACK_FUEL : mobility.progress
  const rounded = Math.round(progress * 100) / 100
  if (rounded !== mobilityProgress) {
    mobilityProgress = rounded
    box.style.setProperty('--progress', String(rounded))
  }
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

let lastHud: HudData | null = null

function renderPauseLoadout(): void {
  const container = byId('pause-loadout')
  if (selectedMode === 'tct') {
    container.replaceChildren()
    return
  }
  const summary = game.getRunSummary()
  const section = (title: string, rows: HTMLElement[]) => {
    const box = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = title
    box.append(heading, ...rows)
    return box
  }
  const row = (main: string, detail = '') => {
    const item = document.createElement('div')
    item.className = 'pause-row'
    const strong = document.createElement('strong')
    strong.textContent = main
    item.append(strong)
    if (detail) {
      const small = document.createElement('small')
      small.textContent = detail
      item.append(small)
    }
    return item
  }
  const weapons = summary.weapons.map((weapon) => row(`${weapon.name}${weapon.level > 0 ? ` ★${weapon.level}` : ''}`, weapon.attachments.length > 0 ? weapon.attachments.join(' · ') : 'Nessun accessorio'))
  weapons.push(row(summary.melee, 'Arma bianca'), row(summary.equipment.join(' · '), 'G / Q / T'))
  const upgrades = summary.upgrades.length > 0
    ? summary.upgrades.map((upgrade) => row(`${upgrade.icon} ${upgrade.name}${upgrade.count > 1 ? ` ×${upgrade.count}` : ''}`, upgrade.description))
    : [row('Nessun potenziamento', 'Al level up scegli un potenziamento con Z / X / V.')]
  const { stats } = summary
  const totals = row(`Danno ${stats.damage >= 0 ? '+' : ''}${stats.damage}% · Cadenza +${stats.fireRate}% · Critico ${stats.crit}%`, `Armatura ${stats.armor} · Rigenerazione ${stats.regen.toFixed(1).replace('.', ',')}/s · Scudo ${stats.shield} · Ricarica −${stats.reload}%`)
  container.replaceChildren(section('LOADOUT', weapons), section('POTENZIAMENTI DELLA RUN', [...upgrades, totals]))
}

function renderPauseSummary(): void {
  renderPauseLoadout()
  const data = lastHud
  byId('pause-summary').textContent = !data ? '' : data.tct
    ? `${data.mapName.toUpperCase()} // ${data.tct.teamScore} : ${data.tct.enemyScore}`
    : `${data.mapName.toUpperCase()} // ONDATA ${data.wave}/15
${data.kills} ELIMINAZIONI // ${data.enemiesRemaining} NEMICI RIMASTI`
}

function updateHud(data: HudData): void {
  lastHud = data
  const healthPercentage = Math.max(0, (data.health / data.maxHealth) * 100)
  setText(hudEl('health-text'), `${Math.ceil(data.health)} / ${data.maxHealth}`)
  if (data.performance) {
    setText(hudEl('performance-stats'), `${data.performance.fps} FPS · ${data.performance.drawCalls} DC`)
    if (currentState === 'playing') {
      const nextQuality = automaticQuality.sample(graphicsQuality, data.performance.fps, performance.now())
      if (nextQuality) applyGraphicsQuality(nextQuality, true)
    }
  }
  hudEl('health-fill').style.width = `${healthPercentage}%`
  hudEl('health-fill').classList.toggle('critical', healthPercentage < 30)
  // Vita bassa: bordo rosso pulsante più intenso e più rapido quanto meno vita resta.
  const warning = currentState === 'playing' ? getLowHealthWarning(data.health, data.maxHealth) : { intensity: 0, heartbeatInterval: 0 }
  const lowHealth = hudEl('low-health')
  lowHealth.style.setProperty('--intensity', warning.intensity.toFixed(2))
  lowHealth.style.setProperty('--beat', `${(warning.heartbeatInterval || 1).toFixed(2)}s`)
  lowHealth.classList.toggle('active', warning.intensity > 0)
  hudEl('low-health-text').classList.toggle('hidden', warning.intensity < 0.6)
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
  renderMobilityHud(data.mobility)
  renderBossBar(data.boss)
  renderObjective(data.objective)
  const doorPrompt = hudEl('door-prompt')
  doorPrompt.classList.toggle('hidden', !data.interaction || currentState !== 'playing')
  doorPrompt.classList.toggle('denied', data.interaction?.denied ?? false)
  if (data.interaction) {
    setText(hudEl('door-prompt-text'), data.interaction.denied
      ? `SERVONO ${data.interaction.cost} CREDITI`
      : data.interaction.cost > 0 ? `${data.interaction.label} // ⬢ ${data.interaction.cost}` : data.interaction.label)
  }
  crosshair.classList.toggle('crouched', data.stance !== 'stand')
  renderWeaponSlots(data.weaponSlots)
  renderPowerUps(data.powerUps)
  renderCoopHud(data.coop)
  hudEl('acid-overlay').classList.toggle('active', data.inAcid === true && currentState === 'playing')
  if (data.tct) updateTctOverlay(data.tct)
  renderWaveEvent(data.waveEvent)
  renderCombo(data.combo)
  hudEl('execution-prompt').classList.toggle('hidden', !data.execution || currentState !== 'playing')
  touchControls.update(data)
}

/** Contatore della combo accanto al mirino, con il tempo rimasto. */
function renderCombo(combo: HudData['combo']): void {
  const meter = hudEl('combo-meter')
  meter.classList.toggle('hidden', !combo || currentState !== 'playing')
  if (!combo) return
  setText(hudEl('combo-count'), `×${combo.count}`)
  setText(hudEl('combo-multiplier'), `CREDITI ×${combo.multiplier.toFixed(2).replace('.', ',')}`)
  hudEl('combo-timer').style.transform = `scaleX(${Math.max(0, Math.min(1, combo.timer)).toFixed(3)})`
}

/** Evento casuale dell'ondata sotto il contatore, con l'avanzamento (taglia, zombie dorato). */
function renderWaveEvent(event: HudData['waveEvent']): void {
  const pill = hudEl('event-pill')
  pill.classList.toggle('hidden', !event)
  if (!event) return
  setText(pill, `${event.icon} ${event.name}${event.detail ? ` // ${event.detail}` : ''}`)
  const color = `#${event.color.toString(16).padStart(6, '0')}`
  if (pill.style.color !== color) pill.style.color = color
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

const UPGRADE_KEY_ACTIONS: readonly KeyAction[] = ['upgrade1', 'upgrade2', 'upgrade3']

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
      <span class="upgrade-key">${UPGRADE_KEY_ACTIONS[index] ? getActionKeyLabel(UPGRADE_KEY_ACTIONS[index]!) : ''}</span>
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

/** I progressi degli ospiti restano sul dispositivo; quelli degli account vanno in player_saves. */
function syncCloudProfile(): void {
  accountPanel?.scheduleSave()
}

async function refreshOnlineLeaderboard(): Promise<void> {
  if (!cloud) return
  leaderboardPanel.invalidate()
  try {
    await cloud.getGlobalLeaderboard({ category: 'score', limit: 1 })
    byId('cloud-status').textContent = 'ONLINE // SUPABASE'
  } catch {
    byId('cloud-status').textContent = 'OFFLINE // CLASSIFICA LOCALE'
  }
}

async function accountToken(): Promise<string | undefined> {
  return (await accountPanel?.accountCredentials())?.accessToken
}

/** Partite TCT nella classifica online: come le run, solo per gli account con un nome utente. */
async function submitOnlineMatch(result: TctResult): Promise<void> {
  if (!cloud || !accountPanel?.username) return
  const account = await accountPanel.accountCredentials()
  if (!account) return
  try {
    await cloud.submitTctMatch(account, { kills: result.kills, deaths: result.deaths, outcome: result.outcome, duration: result.duration, mapId: result.mapId, weaponKills: result.weaponKills })
    leaderboardPanel.invalidate()
  } catch {
    byId('cloud-status').textContent = 'OFFLINE // PARTITA SALVATA IN LOCALE'
  }
}

/** Legge la scelta "nascondi il mio profilo" dell'account. */
async function syncPrivacy(): Promise<void> {
  const checkbox = byId<HTMLInputElement>('account-hidden')
  const account = cloud ? await accountPanel?.accountCredentials() : null
  checkbox.disabled = !account
  if (!cloud || !account) return
  try {
    checkbox.checked = await cloud.getHidden(account)
  } catch {
    checkbox.disabled = true
  }
}

async function initializeCloud(): Promise<void> {
  if (!cloud) return
  byId('cloud-status').textContent = 'SINCRONIZZAZIONE...'
  await refreshOnlineLeaderboard()
}

/** Classifica online: solo per gli account, con validazione lato server. Da ospite resta locale. */
async function submitOnlineRun(result: RunResult): Promise<void> {
  if (!cloud) return
  // Le modalità alternative non si confrontano con le run a 15 ondate.
  if (isGameMode(result.mode) && !isRanked(result.mode)) return
  const account = await accountPanel?.accountCredentials()
  if (!account) {
    byId('cloud-status').textContent = 'OSPITE // ACCEDI PER LA CLASSIFICA ONLINE'
    return
  }
  if (!accountPanel?.username) {
    byId('cloud-status').textContent = 'SCEGLI UN NOME UTENTE PER LA CLASSIFICA ONLINE'
    return
  }
  try {
    await cloud.submitRun(account, identity.callsign, result)
    await refreshOnlineLeaderboard()
  } catch {
    byId('cloud-status').textContent = 'OFFLINE // RUN SALVATA IN LOCALE'
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
  const signedIn = accountPanel?.signedIn ?? false
  const username = accountPanel?.username ?? null
  const name = username ?? identity.callsign
  byId('profile-name').textContent = armory.prestige > 0 ? `${name} ${prestigeBadge(armory.prestige)}` : name
  byId('profile-avatar').textContent = name.charAt(0).toUpperCase() || 'P'
  // Con un nome utente il callsign non si modifica dalle impostazioni ma dall'account.
  const callsignInput = byId<HTMLInputElement>('callsign')
  callsignInput.disabled = username !== null
  callsignInput.title = username ? 'Con un account il nome è il tuo nome utente: cambialo dalla schermata account.' : ''
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
  news: 'NOVITÀ',
  archive: 'ARCHIVIO',
  challenges: 'SFIDE',
  profile: 'PROFILO',
  workshop: 'OFFICINA',
  leaderboard: 'CLASSIFICA',
  settings: 'IMPOSTAZIONI',
  controls: 'COMANDI',
}

function openDrawer(panel: string): void {
  byId('drawer-title').textContent = DRAWER_TITLES[panel] ?? ''
  if (panel === 'profile') renderProfileSection()
  if (panel === 'challenges') renderChallenges()
  if (panel === 'archive') renderArchive()
  if (panel === 'news') openNews()
  if (panel === 'leaderboard') void leaderboardPanel.open()
  document.querySelectorAll<HTMLElement>('[data-drawer-panel]').forEach((section) => {
    section.classList.toggle('active', section.dataset.drawerPanel === panel)
  })
  byId('menu-drawer').classList.remove('hidden')
  byId<HTMLButtonElement>('drawer-close').focus()
}

function renderProfileSection(): void {
  const username = accountPanel?.username
  renderProfilePanel(byId('profile-panel'), {
    name: username ?? identity.callsign,
    signedIn: accountPanel?.signedIn ?? false,
    email: accountPanel?.email ?? '',
    progress,
    armory,
  }, () => {
    closeDrawer()
    accountPanel?.open()
  }, () => {
    // Prestigio: livello 1, una stella in più e oggetti esclusivi; quello che era sbloccato resta.
    setArmory(prestigeUp(armory))
    renderProfile()
    renderProfileSection()
  })
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
  for (const module of Object.values(MOBILITY)) if (module.unlockLevel === level && level > 1) names.push(`MODULO ${module.name}`)
  for (const camo of CAMOS) if (camo.unlockLevel === level) names.push(`MIMETICA ${camo.name}`)
  for (const options of Object.values(COSMETIC_CATALOG) as (readonly CosmeticOption<string>[])[]) {
    for (const option of options) if (option.unlockLevel === level && option.unlockLevel > 1 && !names.includes(option.name)) names.push(option.name)
  }
  return names
}

/** Esperienza delle armi guadagnata in partita: livelli dell'arma e accessori sbloccati. */
function grantWeaponXp(gains: Partial<Record<string, number>>): string {
  const messages: string[] = []
  let next = armory
  for (const [id, amount] of Object.entries(gains)) {
    if (!(id in WEAPONS) || !amount) continue
    const result = addWeaponXp(next, id as WeaponId, amount)
    next = result.state
    if (result.levelsGained > 0) messages.push(`${WEAPONS[id as WeaponId].shortName} livello ${getMastery(next, id as WeaponId).level}`)
  }
  if (next !== armory) setArmory(next)
  return messages.length > 0 ? ` Armi: ${messages.join(', ')}.` : ''
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

// --- Sfide giornaliere e settimanali ----------------------------------------------------------
let challenges = loadChallenges(window.localStorage, new Date())

function renderChallenges(): void {
  challenges = refreshChallenges(challenges, new Date())
  const panel = byId('challenges-panel')
  panel.replaceChildren()
  const group = (title: string, set: ChallengeSet, reward: { xp: number; shards: number }) => {
    const section = document.createElement('section')
    section.className = 'challenge-group'
    const heading = document.createElement('h3')
    heading.textContent = title
    const small = document.createElement('small')
    small.textContent = `+${reward.xp} XP · ◆ ${reward.shards} ciascuna`
    heading.append(small)
    section.append(heading)
    for (const item of set.items) {
      const row = document.createElement('div')
      row.className = `challenge-item${item.done ? ' done' : ''}`
      const text = document.createElement('p')
      text.textContent = describeChallenge(item)
      const status = document.createElement('span')
      status.textContent = item.done ? 'COMPLETATA' : `${item.progress} / ${item.goal}${item.best ? ' // IN UNA SOLA RUN' : ''}`
      const bar = document.createElement('div')
      bar.className = 'challenge-bar'
      const fill = document.createElement('i')
      fill.style.width = `${Math.round((item.progress / item.goal) * 100)}%`
      bar.append(fill)
      row.append(text, bar, status)
      section.append(row)
    }
    panel.append(section)
  }
  group('GIORNALIERE', challenges.daily, CHALLENGE_REWARDS.daily)
  group('SETTIMANALI', challenges.weekly, CHALLENGE_REWARDS.weekly)
  renderChallengesBadge()
}

function renderChallengesBadge(): void {
  const open = [...challenges.daily.items, ...challenges.weekly.items].filter((item) => !item.done).length
  byId('challenges-badge').textContent = open > 0 ? `${open} DA FARE` : 'TUTTE FATTE'
}

/** Registra la partita nelle sfide; restituisce XP da aggiungere, frammenti già accreditati e il testo. */
function advanceChallenges(event: ChallengeEvent): { xp: number; text: string } {
  const outcome = recordChallengeEvent(challenges, event, new Date())
  challenges = outcome.state
  saveChallenges(window.localStorage, challenges)
  renderChallengesBadge()
  const completed: ActiveChallenge[] = [...outcome.daily, ...outcome.weekly]
  if (completed.length === 0) return { xp: 0, text: '' }
  const reward = getChallengeRewards(outcome.daily.length, outcome.weekly.length)
  progress = { ...progress, cores: progress.cores + reward.shards }
  saveProgress(window.localStorage, progress)
  return { xp: reward.xp, text: ` Sfide completate: ${completed.map(describeChallenge).join('; ')} (+◆ ${reward.shards}).` }
}

/** I livelli delle armi valgono solo in Zombie: nel TCT tutti hanno le stesse statistiche. */
function currentLoadout(mode: 'zombies' | 'tct' = 'zombies') {
  return resolveLoadout(armory.loadout, armory.cosmetics, mode === 'zombies' ? armory.weaponLevels : {}, mode === 'zombies')
}

function completeRun(result: RunResult): void {
  byId('restart-button').textContent = coopLobby.active ? 'TORNA ALLA SQUADRA' : 'NUOVA RUN'
  byId('menu-button').textContent = coopLobby.active ? 'ESCI DALLA SQUADRA' : 'TORNA ALL’OFFICINA'
  byId('result-score-label').textContent = 'PUNTEGGIO'
  byId('result-wave-label').textContent = 'ONDATA'
  byId('result-kills-label').textContent = 'ELIMINAZIONI'
  byId('result-shards').parentElement?.classList.remove('hidden')
  const previousBest = progress.bestScore
  progress = recordRun(progress, result)
  saveProgress(window.localStorage, progress)
  syncCloudProfile()
  void submitOnlineRun(result)
  byId('result-score').textContent = result.score.toLocaleString('it-IT')
  byId('result-wave').textContent = String(result.wave)
  byId('result-kills').textContent = String(result.kills)
  byId('result-shards').textContent = `+${result.shards}`
  byId('gameover-title').textContent = result.won ? 'STAZIONE SICURA' : 'RUN TERMINATA'
  const challengeOutcome = advanceChallenges({ zombie: result })
  const dailyRecord = result.dailyKey ? recordDailyScore(window.localStorage, result.dailyKey, result.score) : false
  renderDailyRun()
  // Le carte della run moltiplicano l'esperienza (i frammenti li moltiplica già la partita).
  const xp = Math.round((result.kills * XP_REWARDS.zombieKill + Math.max(0, result.wave - 1) * XP_REWARDS.wave + XP_REWARDS.runComplete) * (result.rewardMultiplier ?? 1)) + challengeOutcome.xp
  const modeName = isGameMode(result.mode) && result.mode !== 'classic' ? GAME_MODES[result.mode].name : null
  byId('gameover-message').textContent = (modeName
    ? `${modeName}: ${result.won ? 'missione compiuta' : 'missione fallita'} all’ondata ${result.wave}. Le modalità alternative non entrano nella classifica online.`
    : result.won
      ? 'Hai superato tutte le 15 ondate. Bonus vittoria: 8 frammenti.'
      : `L’orda ti ha sopraffatto all’ondata ${result.wave} di 15.`) + ((result.bestCombo ?? 0) >= 2 ? ` Combo migliore: ×${result.bestCombo}.` : '') + formatMedals(result.medals) + (result.dailyKey ? (dailyRecord ? ' Run del giorno: nuovo record di oggi!' : ' Run del giorno completata.') : '') + ((result.rewardMultiplier ?? 1) > 1 ? ` Carte della run: frammenti ed esperienza ×${(result.rewardMultiplier ?? 1).toLocaleString('it-IT')}.` : '') + challengeOutcome.text + grantXp(xp) + grantWeaponXp(result.weaponXp ?? {})
  byId('gameover-title').textContent += result.score > previousBest && result.score > 0 ? ' // NUOVO RECORD' : ''
  renderMenu()
}

function completeTctMatch(result: TctResult): void {
  progress = recordTctMatch(progress, { kills: result.kills, deaths: result.deaths, outcome: result.outcome })
  saveProgress(window.localStorage, progress)
  syncCloudProfile()
  void submitOnlineMatch(result)
  byId('result-score-label').textContent = 'SQUADRA'
  byId('result-wave-label').textContent = 'AVVERSARI'
  byId('result-kills-label').textContent = 'ELIMINAZIONI / MORTI'
  byId('result-score').textContent = String(result.teamScore)
  byId('result-wave').textContent = String(result.enemyScore)
  byId('result-kills').textContent = `${result.kills} / ${result.deaths}`
  byId('result-shards').parentElement?.classList.add('hidden')
  byId('gameover-title').textContent = result.outcome === 'draw' ? 'PAREGGIO' : result.outcome === 'win' ? 'VITTORIA' : 'SCONFITTA'
  const challengeOutcome = advanceChallenges({ tct: { kills: result.kills, won: result.outcome === 'win' } })
  const xp = result.kills * XP_REWARDS.tctKill + XP_REWARDS.tctMatch + (result.outcome === 'win' ? XP_REWARDS.tctWin : 0) + challengeOutcome.xp
  byId('gameover-message').textContent = `Match TCT online terminato.${challengeOutcome.text}${grantXp(xp)}${grantWeaponXp(result.weaponXp ?? {})}`
  byId('restart-button').textContent = 'TORNA ALLA LOBBY'
  byId('menu-button').textContent = 'ESCI DALLA STANZA'
}

function renderMenu(): void {
  byId('best-score').textContent = progress.bestScore.toLocaleString('it-IT')
  byId('best-wave').textContent = String(progress.bestWave)
  byId('total-runs').textContent = String(progress.runs)
  byId('core-balance').textContent = String(progress.cores)
  byId('core-balance-side').textContent = String(progress.cores)

  const ranking = progress.leaderboard
  const leaderboardRows: HTMLElement[] = ranking.map((entry, index) => {
    const row = document.createElement('div')
    row.className = 'leaderboard-row'
    const minutes = Math.floor(entry.time / 60)
    const seconds = String(entry.time % 60).padStart(2, '0')
    const waveLabel = `ONDATA ${entry.wave}`
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

function showWaveBanner(wave: number, event?: { name: string; description: string; icon: string; color: number } | null): void {
  window.clearTimeout(waveBannerTimer)
  byId('wave-banner-title').textContent = wave % 5 === 0 ? `BOSS // ONDATA ${wave}` : `ONDATA ${wave}`
  byId('wave-banner-subtitle').textContent = wave % 5 === 0 ? 'IL BRUTO STA ARRIVANDO' : wave === 15 ? 'ULTIMA ONDATA' : `MINACCE IN ARRIVO // ${wave}/15`
  const eventLine = byId('wave-banner-event')
  eventLine.classList.toggle('hidden', !event)
  if (event) {
    eventLine.style.color = `#${event.color.toString(16).padStart(6, '0')}`
    byId('wave-banner-event-name').textContent = `${event.icon} EVENTO // ${event.name}`
    byId('wave-banner-event-text').textContent = event.description
  }
  waveBanner.classList.add('hidden')
  waveBanner.style.animation = 'none'
  void waveBanner.offsetWidth
  waveBanner.style.animation = ''
  // Con un evento il banner resta più a lungo, per leggere la descrizione.
  waveBanner.style.animationDuration = event ? '4.2s' : ''
  waveBanner.classList.remove('hidden')
  waveBannerTimer = window.setTimeout(() => waveBanner.classList.add('hidden'), event ? 4200 : 2400)
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
  if (hitmarker.classList.contains('kill')) return
  window.clearTimeout(hitmarkerTimer)
  hitmarker.classList.toggle('headshot', headshot)
  hitmarker.classList.remove('active')
  void hitmarker.offsetWidth
  hitmarker.classList.add('active')
  hitmarkerTimer = window.setTimeout(() => hitmarker.classList.remove('active'), 120)
}

/** Uccisione: segno rosso più grande; dorato per la testa, viola per l'esecuzione. */
function showKillMarker(variant: 'kill' | 'headshot' | 'execution' = 'kill'): void {
  window.clearTimeout(hitmarkerTimer)
  hitmarker.classList.remove('active', 'headshot', 'kill-head', 'kill-execution')
  void hitmarker.offsetWidth
  hitmarker.classList.add('active', 'kill')
  if (variant === 'headshot') hitmarker.classList.add('kill-head')
  if (variant === 'execution') hitmarker.classList.add('kill-execution')
  hitmarkerTimer = window.setTimeout(() => hitmarker.classList.remove('active', 'kill', 'kill-head', 'kill-execution'), variant === 'kill' ? 260 : 380)
}

const MEDAL_TIER_LABEL = { bronze: 'BRONZO', silver: 'ARGENTO', gold: 'ORO' } as const

/** Medaglie della run in una riga: "Medaglie: CARNEFICINA (ORO, 21) · BOIA (BRONZO, 3)." */
function formatMedals(medals: RunResult['medals']): string {
  if (!medals || medals.length === 0) return ''
  return ` Medaglie: ${medals.map((medal) => `${medal.name} (${MEDAL_TIER_LABEL[medal.tier]}, ${medal.value})`).join(' · ')}.`
}

let comboCalloutTimer = 0

/** Annuncio breve vicino al mirino: DOPPIA, MASSACRO, ESECUZIONE… */
function showComboCallout(text: string, count: number): void {
  const callout = byId('combo-callout')
  window.clearTimeout(comboCalloutTimer)
  callout.textContent = count > 0 ? `${text} // ${count}` : text
  callout.classList.toggle('big', count >= 10 || count === 0)
  callout.classList.add('hidden')
  void callout.offsetWidth
  callout.classList.remove('hidden')
  comboCalloutTimer = window.setTimeout(() => callout.classList.add('hidden'), 1100)
}

/** Numeri di danno da un pool fisso di elementi, riusati a rotazione. */
const damageNumberPool: HTMLElement[] = []
let damageNumberIndex = 0

function showDamageNumber(x: number, y: number, amount: number, kind: 'body' | 'head' | 'kill'): void {
  const layer = byId('damage-numbers-layer')
  if (damageNumberPool.length === 0) {
    for (let index = 0; index < 12; index += 1) {
      const element = document.createElement('span')
      layer.append(element)
      damageNumberPool.push(element)
    }
  }
  const element = damageNumberPool[damageNumberIndex]!
  damageNumberIndex = (damageNumberIndex + 1) % damageNumberPool.length
  element.textContent = String(amount)
  element.className = `damage-number ${kind}`
  element.style.left = `${(x * 100).toFixed(2)}%`
  element.style.top = `${(y * 100).toFixed(2)}%`
  element.style.animation = 'none'
  void element.offsetWidth
  element.style.animation = ''
}

function flashDamage(): void {
  window.clearTimeout(damageFlashTimer)
  damageFlash.classList.add('active')
  damageFlashTimer = window.setTimeout(() => damageFlash.classList.remove('active'), 90)
}

// --- Modalità in solitaria ------------------------------------------------------------------
const MODE_STORAGE_KEY = 'neon-arena:solo-mode:v1'
let soloMode: GameMode = (() => {
  try {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY)
    return isGameMode(saved) && GAME_MODES[saved].solo ? saved : 'classic'
  } catch {
    return 'classic'
  }
})()

function renderGameModes(): void {
  const group = byId('game-modes')
  group.replaceChildren()
  for (const id of GAME_MODE_IDS.filter((mode) => GAME_MODES[mode].solo)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'game-mode'
    button.dataset.mode = id
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-checked', String(id === soloMode))
    button.title = GAME_MODES[id].description
    button.textContent = GAME_MODES[id].name
    button.addEventListener('click', () => {
      soloMode = id
      try {
        window.localStorage.setItem(MODE_STORAGE_KEY, id)
      } catch {
        // Storage non disponibile: la scelta vale per la sessione.
      }
      renderGameModes()
    })
    group.append(button)
  }
}

// --- Carte della run ------------------------------------------------------------------------
let runCards = loadRunModifiers(window.localStorage)

function renderRunCards(): void {
  const list = byId('run-cards-list')
  list.replaceChildren()
  for (const id of RUN_MODIFIER_IDS) {
    const card = RUN_MODIFIERS[id]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'run-card'
    button.dataset.card = id
    const selected = runCards.includes(id)
    button.setAttribute('aria-pressed', String(selected))
    button.disabled = !selected && runCards.length >= MAX_RUN_MODIFIERS
    const title = document.createElement('strong')
    title.textContent = `${card.icon} ${card.name}`
    const text = document.createElement('small')
    text.textContent = card.description
    const reward = document.createElement('b')
    reward.textContent = `×${card.reward.toLocaleString('it-IT')}`
    button.append(title, text, reward)
    button.addEventListener('click', () => {
      runCards = toggleRunModifier(runCards, id)
      saveRunModifiers(window.localStorage, runCards)
      renderRunCards()
    })
    list.append(button)
  }
  byId('run-cards-summary').textContent = runCards.length > 0
    ? `${runCards.length} ${runCards.length === 1 ? 'carta' : 'carte'} · frammenti ed esperienza ×${getRewardMultiplier(runCards).toLocaleString('it-IT')}`
    : 'Facoltative: più difficile, più frammenti ed esperienza'
}

// --- Tasti ----------------------------------------------------------------------------------
setActiveBindings(loadBindings(window.localStorage))
const KEY_GROUP_TITLES: Record<string, string> = { movimento: 'MOVIMENTO', combattimento: 'COMBATTIMENTO', armi: 'ARMI E POTENZIAMENTI' }
let listeningAction: KeyAction | null = null

/** Aggiorna i tasti mostrati nell'HUD e nei suggerimenti. */
function renderKeyLabels(): void {
  document.querySelectorAll<HTMLElement>('[data-key-label]').forEach((element) => {
    const actions = (element.dataset.keyLabel ?? '').split(',') as KeyAction[]
    const labels = actions.map((action) => getActionKeyLabel(action))
    element.textContent = labels.every((label) => label.length === 1) ? labels.join('') : labels.join(' ')
  })
}

function renderKeyBindings(): void {
  const container = byId('key-bindings')
  const bindings = getActiveBindings()
  container.replaceChildren()
  let group = ''
  for (const action of KEY_ACTIONS) {
    if (action.group !== group) {
      group = action.group
      const title = document.createElement('h4')
      title.textContent = KEY_GROUP_TITLES[group] ?? group
      container.append(title)
    }
    const row = document.createElement('div')
    row.className = 'key-row'
    const name = document.createElement('span')
    name.textContent = action.label
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.keyAction = action.id
    const listening = listeningAction === action.id
    button.className = `${listening ? 'listening' : ''}${bindings[action.id] !== action.defaultCode ? ' changed' : ''}`.trim()
    button.textContent = listening ? 'PREMI UN TASTO' : getKeyLabel(bindings[action.id])
    button.setAttribute('aria-label', `${action.label}: ${getKeyLabel(bindings[action.id])}. Premi per cambiare`)
    button.addEventListener('click', () => {
      listeningAction = listeningAction === action.id ? null : action.id
      byId('key-status').textContent = listeningAction ? `Premi il nuovo tasto per «${action.label}».` : ''
      renderKeyBindings()
      container.querySelector<HTMLButtonElement>(`[data-key-action="${action.id}"]`)?.focus()
    })
    row.append(name, button)
    container.append(row)
  }
  byId<HTMLButtonElement>('key-reset').disabled = isDefaultBindings(bindings)
}

function applyBindings(next: ReturnType<typeof getActiveBindings>, message: string): void {
  setActiveBindings(next)
  saveBindings(window.localStorage, next)
  byId('key-status').textContent = message
  renderKeyBindings()
  renderKeyLabels()
}

// In ascolto del nuovo tasto: fase di cattura, così ESC annulla senza chiudere il pannello.
window.addEventListener('keydown', (event) => {
  if (!listeningAction) return
  // Pannello chiuso nel frattempo: l'ascolto si annulla e il tasto torna al gioco.
  if (byId('menu-drawer').classList.contains('hidden')) {
    listeningAction = null
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  const action = KEY_ACTIONS.find((entry) => entry.id === listeningAction)!
  listeningAction = null
  if (event.code === 'Escape') {
    byId('key-status').textContent = 'Modifica annullata.'
    renderKeyBindings()
    return
  }
  if (!isAssignableCode(event.code)) {
    byId('key-status').textContent = `Il tasto ${getKeyLabel(event.code)} non si può assegnare.`
    renderKeyBindings()
    return
  }
  const before = getActiveBindings()
  const swapped = KEY_ACTIONS.find((entry) => entry.id !== action.id && before[entry.id] === event.code)
  const next = assignKey(before, action.id, event.code)
  if (!next) return
  applyBindings(next, swapped
    ? `«${action.label}» ora usa ${getKeyLabel(event.code)}; «${swapped.label}» passa a ${getKeyLabel(before[action.id])}.`
    : `«${action.label}» ora usa ${getKeyLabel(event.code)}.`)
  byId('key-bindings').querySelector<HTMLButtonElement>(`[data-key-action="${action.id}"]`)?.focus()
}, { capture: true })

byId<HTMLButtonElement>('key-reset').addEventListener('click', () => {
  listeningAction = null
  applyBindings(createDefaultBindings(), 'Tasti predefiniti ripristinati.')
})
renderKeyBindings()
renderKeyLabels()

// --- Tutorial della prima partita ----------------------------------------------------------
function createTracker(): TutorialTracker {
  return new TutorialTracker(tutorialSave.seen, getActionKeyLabel, (seen) => {
    tutorialSave = { ...tutorialSave, seen }
    saveTutorial(window.localStorage, tutorialSave)
  })
}

window.addEventListener('keydown', (event) => {
  if (currentState !== 'playing' || selectedMode === 'tct') return
  const action = TUTORIAL_KEYS.get(remapKeyEvent(event).code)
  if (action) tutorialPressed.add(action)
})

function hideTutorialHint(): void {
  byId('tutorial-hint').classList.add('hidden')
}

/** Aggiorna il suggerimento del tutorial con i dati dell'HUD (solo modalità Zombie). */
function updateTutorial(data: HudData): void {
  const now = performance.now()
  const dt = tutorialLastHud > 0 ? Math.min(0.5, (now - tutorialLastHud) / 1000) : 0
  tutorialLastHud = now
  if (!tutorialSave.enabled || tutorial.finished || currentState !== 'playing' || data.tct) {
    tutorialPressed.clear()
    hideTutorialHint()
    return
  }
  const fired = tutorialLastAmmo !== null && tutorialLastAmmo.weapon === data.weaponName && data.ammo < tutorialLastAmmo.ammo && !data.reloading
  tutorialLastAmmo = { weapon: data.weaponName, ammo: data.ammo }
  const observation: TutorialObservation = {
    pressed: tutorialPressed,
    fired,
    ammoRatio: data.magazineSize > 0 ? data.ammo / data.magazineSize : 1,
    reloading: data.reloading,
    interaction: data.interaction !== null,
    upgradeOpen: tutorialUpgradeOpen,
    mobility: Boolean(data.mobility),
    equipment: data.equipment.length > 0,
    wave: data.wave,
    waveBreak: data.waveBreak > 0,
    miniboss: Boolean(data.boss?.miniboss),
    boss: Boolean(data.boss && !data.boss.miniboss),
    objective: Boolean(data.objective),
    waveEvent: Boolean(data.waveEvent),
    execution: Boolean(data.execution),
    coop: Boolean(data.coop && data.coop.team.length > 1),
  }
  const hint = tutorial.update(observation, dt)
  tutorialPressed.clear()
  const element = byId('tutorial-hint')
  if (!hint) {
    hideTutorialHint()
    return
  }
  if (element.dataset.step !== hint.id) {
    element.dataset.step = hint.id
    byId('tutorial-step').textContent = `${hint.step}/${hint.total}`
    byId('tutorial-title').textContent = hint.title
    byId('tutorial-text').textContent = hint.text
  }
  element.classList.remove('hidden')
}

byId<HTMLInputElement>('tutorial-enabled').checked = tutorialSave.enabled
byId<HTMLInputElement>('tutorial-enabled').addEventListener('change', (event) => {
  tutorialSave = { ...tutorialSave, enabled: (event.target as HTMLInputElement).checked }
  saveTutorial(window.localStorage, tutorialSave)
  if (!tutorialSave.enabled) hideTutorialHint()
})
byId<HTMLButtonElement>('tutorial-restart').addEventListener('click', () => {
  tutorialSave = { seen: [], enabled: true }
  saveTutorial(window.localStorage, tutorialSave)
  tutorial = createTracker()
  byId<HTMLInputElement>('tutorial-enabled').checked = true
  byId('tutorial-restart').textContent = 'TUTORIAL AZZERATO: RIPARTE ALLA PROSSIMA PARTITA'
})

// --- Novità --------------------------------------------------------------------------------
/** Voci non ancora viste, calcolate all'apertura: restano evidenziate finché la pagina è aperta. */
let unseenNews = getUnseenEntries(loadSeenChangelog(window.localStorage), progress.runs > 0 || armory.level > 1)
// Un nuovo giocatore non ha nulla da recuperare: si parte da qui per i prossimi aggiornamenti.
if (unseenNews.length === 0) markChangelogSeen(window.localStorage)

function renderNewsCard(): void {
  const card = byId('news-card')
  card.classList.toggle('hidden', unseenNews.length === 0)
  byId('news-badge').textContent = unseenNews.length > 0 ? 'NUOVO' : ''
  const summary = byId('news-summary')
  summary.replaceChildren()
  for (const entry of unseenNews) {
    const line = document.createElement('li')
    line.textContent = `${entry.title}: ${entry.items.map((item) => item.name.charAt(0).toLowerCase() + item.name.slice(1)).join(', ')}`
    summary.append(line)
  }
}

function renderNewsPanel(highlight: readonly string[]): void {
  const panel = byId('news-panel')
  panel.replaceChildren()
  for (const entry of CHANGELOG) {
    const section = document.createElement('section')
    section.className = `news-entry${highlight.includes(entry.id) ? ' unseen' : ''}`
    const heading = document.createElement('h3')
    heading.textContent = entry.title.toUpperCase()
    const date = document.createElement('small')
    date.textContent = entry.date
    heading.append(date)
    section.append(heading)
    for (const item of entry.items) {
      const row = document.createElement('div')
      row.className = 'news-item'
      const name = document.createElement('strong')
      name.textContent = item.name
      const text = document.createElement('p')
      text.textContent = item.text
      const where = document.createElement('span')
      where.textContent = `DOVE: ${item.where}`
      row.append(name, text, where)
      section.append(row)
    }
    panel.append(section)
  }
}

/** Aprendo le novità si considerano lette (restano evidenziate fino alla chiusura del pannello). */
function openNews(): void {
  renderNewsPanel(unseenNews.map((entry) => entry.id))
  markChangelogSeen(window.localStorage)
  unseenNews = []
  renderNewsCard()
}

// --- Archivio della storia ------------------------------------------------------------------
let foundLore: string[] = loadFoundLore(window.localStorage)

function renderArchiveBadge(): void {
  byId('archive-badge').textContent = `${foundLore.length}/${LORE.length}`
}

function renderArchive(): void {
  const panel = byId('archive-panel')
  panel.replaceChildren()
  for (const map of MAPS) {
    const section = document.createElement('section')
    section.className = 'challenge-group'
    const heading = document.createElement('h3')
    heading.textContent = map.name.toUpperCase()
    const entries = LORE.filter((entry) => entry.map === map.id)
    const count = document.createElement('small')
    count.textContent = `${entries.filter((entry) => foundLore.includes(entry.id)).length}/${entries.length}`
    heading.append(count)
    section.append(heading)
    for (const entry of entries) {
      const found = foundLore.includes(entry.id)
      const row = document.createElement('div')
      row.className = `challenge-item${found ? ' done' : ''}`
      const title = document.createElement('p')
      title.textContent = found ? entry.title : '??? // REGISTRAZIONE NON TROVATA'
      const detail = document.createElement('span')
      detail.textContent = found ? `${entry.author} — ${entry.text}` : 'Cercala in questa mappa.'
      row.append(title, detail)
      section.append(row)
    }
    panel.append(section)
  }
  renderArchiveBadge()
}

// --- Run del giorno -------------------------------------------------------------------------
/** L'ultima run era quella del giorno: "Nuova run" la ripropone. */
let lastRunDaily = false

function renderDailyRun(): void {
  const daily = createDailyRun(getUtcDayKey(new Date()))
  const map = MAPS.find((candidate) => candidate.id === daily.mapId)
  const best = loadDailyBest(window.localStorage, daily.key)
  const cards = daily.modifiers.map((id) => RUN_MODIFIERS[id].name).join(' · ')
  byId('daily-run-detail').textContent = `${map?.name.toUpperCase() ?? daily.mapId} · ${cards}${best > 0 ? ` · record di oggi ${best.toLocaleString('it-IT')}` : ''}`
}

function startDailyRun(): void {
  const daily = createDailyRun(getUtcDayKey(new Date()))
  const map = MAPS.find((candidate) => candidate.id === daily.mapId) ?? STATION_13
  lastRunDaily = true
  game.start(getMetaBonuses(progress), map, currentLoadout(), { modifiers: daily.modifiers, daily: { key: daily.key, seed: daily.seed }, foundLore })
}

function startRun(): void {
  if (lastRunDaily && selectedMode !== 'tct' && !coopLobby.active && currentState !== 'menu') {
    startDailyRun()
    return
  }
  lastRunDaily = false
  if (selectedMode === 'tct') returnToLobby()
  else if (coopLobby.active) {
    // Squadra: si torna alla stanza; l'host può avviare una nuova partita.
    game.returnToMenu()
    coopLobby.backToLobby()
  } else game.start(getMetaBonuses(progress), selectedMap, currentLoadout(), { modifiers: runCards, foundLore, mode: soloMode })
}

const coopLobby = new CoopLobby({
  transport: transportKind,
  getName: () => identity.callsign,
  getCosmetics: () => armory.cosmetics,
  getMapId: () => selectedMap.id,
  onStart: (coopSession, mapId, players, mode) => {
    closeDrawer()
    game.startCoop(coopSession, mapId, players, getMetaBonuses(progress), currentLoadout('zombies'), foundLore, mode)
  },
  onClosed: () => {
    if (game.isCoop) game.returnToMenu()
  },
  onRoomChange: (inRoom, isHost) => {
    byId('start-button').classList.toggle('hidden', inRoom || selectedMode === 'tct')
    document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((option) => { option.disabled = inRoom && !isHost })
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((option) => { option.disabled = inRoom })
  },
})

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
    } else {
      coopLobby.setMap(map.id)
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
    byId('coop-lobby').classList.toggle('hidden', selectedMode === 'tct')
    byId('start-button').classList.toggle('hidden', selectedMode === 'tct')
    byId('run-cards').classList.toggle('hidden', selectedMode === 'tct')
    byId('game-modes').classList.toggle('hidden', selectedMode === 'tct')
    byId('daily-run').classList.toggle('hidden', selectedMode === 'tct')
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


byId<HTMLSelectElement>('gore-level').value = accessibility.gore
byId<HTMLSelectElement>('gore-level').addEventListener('change', (event) => updateAccessibility({ gore: normalizeGore((event.target as HTMLSelectElement).value) }))
byId<HTMLInputElement>('damage-numbers').checked = accessibility.damageNumbers
byId<HTMLInputElement>('damage-numbers').addEventListener('change', (event) => updateAccessibility({ damageNumbers: (event.target as HTMLInputElement).checked }))
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
  applyGraphicsQuality(normalizeGraphicsQuality((event.target as HTMLSelectElement).value))
})

byId<HTMLButtonElement>('start-button').addEventListener('click', startRun)
byId<HTMLButtonElement>('restart-button').addEventListener('click', startRun)
byId<HTMLButtonElement>('pause-button').addEventListener('click', () => activeGame().pause())
byId<HTMLButtonElement>('resume-button').addEventListener('click', () => activeGame().resume())
byId<HTMLButtonElement>('abandon-button').addEventListener('click', () => {
  if (selectedMode === 'tct') leaveRoom()
  else coopLobby.leave()
  activeGame().abandon()
})
byId<HTMLButtonElement>('menu-button').addEventListener('click', () => {
  if (selectedMode === 'tct') leaveRoom()
  else coopLobby.leave()
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
const volumeInput = byId<HTMLInputElement>('master-volume')
volumeInput.value = String(GameAudio.masterVolume)
byId<HTMLOutputElement>('volume-value').textContent = `${Math.round(GameAudio.masterVolume * 100)}%`
volumeInput.addEventListener('input', () => {
  GameAudio.setMasterVolume(Number(volumeInput.value))
  byId<HTMLOutputElement>('volume-value').textContent = `${Math.round(GameAudio.masterVolume * 100)}%`
})

const musicInput = byId<HTMLInputElement>('music-volume')
musicInput.value = String(GameAudio.musicVolume)
byId<HTMLOutputElement>('music-volume-value').textContent = `${Math.round(GameAudio.musicVolume * 100)}%`
musicInput.addEventListener('input', () => {
  GameAudio.setMusicVolume(Number(musicInput.value))
  byId<HTMLOutputElement>('music-volume-value').textContent = `${Math.round(GameAudio.musicVolume * 100)}%`
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
  onProfileChange: () => {
    renderProfile()
    void syncPrivacy()
  },
  onUsername: (username) => {
    // Con un account il nome mostrato (classifica, TCT) è il nome utente; da ospite resta il callsign libero.
    if (username) {
      identity = { ...identity, callsign: normalizeCallsign(username) }
      saveIdentity(window.localStorage, identity)
    }
    renderProfile()
  },
})
byId('profile-chip').addEventListener('click', () => openDrawer('profile'))
byId('profile-chip').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openDrawer('profile')
  }
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
renderChallengesBadge()
renderRunCards()
renderGameModes()
renderDailyRun()
renderArchiveBadge()
renderNewsCard()
byId<HTMLButtonElement>('news-open').addEventListener('click', () => openDrawer('news'))
byId<HTMLButtonElement>('news-dismiss').addEventListener('click', () => {
  markChangelogSeen(window.localStorage)
  unseenNews = []
  renderNewsCard()
})
byId<HTMLButtonElement>('daily-run-start').addEventListener('click', startDailyRun)
renderProfile()
void initializeCloud()
void accountPanel.initialize()
window.addEventListener('pagehide', () => session?.close())
// Accesso di debug per i test visivi, solo in sviluppo.
byId<HTMLInputElement>('account-hidden').addEventListener('change', async (event) => {
  const checkbox = event.target as HTMLInputElement
  const account = await accountPanel?.accountCredentials()
  if (!cloud || !account) return
  try {
    await cloud.setHidden(account, checkbox.checked)
    leaderboardPanel.invalidate()
  } catch {
    checkbox.checked = !checkbox.checked
  }
})

if (import.meta.env.DEV) {
  Object.assign(window, {
    __neonArena: {
      game,
      tctGame,
      // Solo nei test: collega la classifica a un server finto (Playwright intercetta le richieste).
      useCloud: (url: string, key: string) => {
        cloud = new SupabaseCloud(url, key)
        leaderboardPanel.invalidate()
      },
    },
  })
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  session?.close()
  game.destroy()
  tctGame.destroy()
})

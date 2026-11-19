import { getReloadCues } from './reloadAnimation'
import type { ReloadCue } from './reloadAnimation'
import { getGunSoundProfile } from './gunSounds'
import type { GunSoundProfile } from './gunSounds'
import * as THREE from 'three'
import type { ResolvedLoadout } from './armory'
import type { ResolvedWeapon } from './attachments'
import { colorOf, GLOVE_COLORS } from './cosmetics'
import type { CamoId } from './cosmetics'
import { disposeObject } from './equipmentModels'
import type { WeaponModel } from './models'
import { RecoilState } from './recoil'
import type { RecoilKick } from './recoil'
import { createMeleeView, createViewWeapon } from './weaponModels'
import { WeaponAnimator } from './WeaponAnimator'
import type { WeaponPoseInput } from './WeaponAnimator'
import { createMagazine, reloadMagazine } from './weapons'
import type { MagazineState, MeleeDefinition, WeaponSlot } from './weapons'

export type ActiveSlot = WeaponSlot | 'melee'

interface GunSlot {
  weapon: ResolvedWeapon
  model: WeaponModel
  magazine: MagazineState
}

export interface FrameInput {
  aiming: boolean
  crouched: boolean
  /** Scatto, stordimento o altro che impedisce di sparare. */
  blocked: boolean
  /** Potenziamenti della cadenza (1 = invariata). */
  fireRateMultiplier?: number
}

export type MechanicalSound = 'dry' | ReloadCue

export interface FrameResult {
  /** Colpi da risolvere in questo frame (raycast a carico del motore). */
  shots: number
  recovery: RecoilKick
  /** Suoni meccanici dell'arma avvenuti in questo frame (ricarica, colpo a vuoto). */
  sounds: MechanicalSound[]
}

const MELEE_SWING = 0.38
/** Tempo di estrazione dopo un cambio arma prima di poter sparare. */
const DRAW_TIME = 0.16
const BURST_PAUSE = 0.3

/**
 * Armi del loadout: modelli in prima persona, caricatori, modalità di fuoco (automatica,
 * semiautomatica, raffica, otturatore), ricarica, rinculo, cambio arma e corpo a corpo.
 */
export class WeaponHandler {
  readonly animator = new WeaponAnimator()
  private readonly recoilState = new RecoilState()
  private slots: Record<WeaponSlot, GunSlot> | null = null
  private meleeDefinition: MeleeDefinition | null = null
  private meleeModel: THREE.Group | null = null
  private camos: Partial<Record<string, CamoId>> = {}
  private gloveColor = 0x181a1d
  private activeSlot: ActiveSlot = 'primary'
  private fireTimer = 0
  private reloadTimer = 0
  private burstRemaining = 0
  private triggerHeld = false
  private triggerConsumed = false
  private muzzleTimer = 0
  private drawTimer = 0
  private meleeTimer = 0
  private meleeCooldown = 0
  private quickMelee = false
  private visible = false
  private scoped = false
  visualRecoil = 0
  /** Moltiplicatore del tempo di ricarica dai potenziamenti della run. */
  reloadMultiplier = 1
  private reloadTotal = 1
  private pendingSounds: MechanicalSound[] = []
  private reloadCueIndex = 0

  /** Luce del lampo di sparo: sempre nella scena, si accende solo variando l'intensità. */
  private readonly muzzleLight = new THREE.PointLight(0xffa34d, 0, 3)

  constructor(private readonly parent: THREE.Object3D) {
    parent.add(this.muzzleLight)
  }

  configure(loadout: ResolvedLoadout): void {
    this.disposeModels()
    this.camos = loadout.camos
    this.gloveColor = colorOf(GLOVE_COLORS, loadout.cosmetics.gloves)
    this.slots = {
      primary: this.createSlot(loadout.primary),
      secondary: this.createSlot(loadout.secondary),
    }
    this.meleeDefinition = loadout.melee
    this.meleeModel = createMeleeView(loadout.melee.id, this.gloveColor)
    this.parent.add(this.meleeModel)
    this.activeSlot = 'primary'
    this.reset()
    this.updateVisibility()
  }

  private createSlot(weapon: ResolvedWeapon): GunSlot {
    const model = createViewWeapon(weapon, weapon.attachments, { camo: this.camos[weapon.id] ?? 'standard', gloveColor: this.gloveColor })
    this.parent.add(model.group)
    return { weapon, model, magazine: createMagazine(weapon) }
  }

  private disposeModels(): void {
    if (this.slots) {
      for (const slot of Object.values(this.slots)) {
        this.parent.remove(slot.model.group)
        disposeObject(slot.model.group)
      }
    }
    if (this.meleeModel) {
      this.parent.remove(this.meleeModel)
      disposeObject(this.meleeModel)
    }
    this.slots = null
    this.meleeModel = null
  }

  reset(): void {
    this.fireTimer = 0
    this.reloadTimer = 0
    this.burstRemaining = 0
    this.triggerHeld = false
    this.triggerConsumed = false
    this.muzzleTimer = 0
    this.drawTimer = 0
    this.meleeTimer = 0
    this.meleeCooldown = 0
    this.quickMelee = false
    this.visualRecoil = 0
    this.recoilState.reset()
    this.animator.reset()
  }

  /** Arma acquistata in partita: sostituisce lo slot della sua classe e diventa attiva. */
  replace(weapon: ResolvedWeapon): void {
    if (!this.slots) return
    const slot = weapon.slot
    this.parent.remove(this.slots[slot].model.group)
    disposeObject(this.slots[slot].model.group)
    this.slots[slot] = this.createSlot(weapon)
    this.activeSlot = slot
    this.reloadTimer = 0
    this.drawTimer = DRAW_TIME
    this.animator.startSwitch()
    this.updateVisibility()
  }

  has(weaponId: string): boolean {
    return !!this.slots && (this.slots.primary.weapon.id === weaponId || this.slots.secondary.weapon.id === weaponId)
  }

  refill(weaponId?: string): void {
    if (!this.slots) return
    for (const slot of Object.values(this.slots)) {
      if (!weaponId || slot.weapon.id === weaponId) slot.magazine = createMagazine(slot.weapon)
    }
  }

  /** Aggiunge un caricatore di riserva a ogni arma (cassa munizioni). */
  topUp(): void {
    if (!this.slots) return
    for (const slot of Object.values(this.slots)) {
      if (slot.magazine.reserveAmmo === null || slot.weapon.reserveAmmo === null) continue
      slot.magazine = { ...slot.magazine, reserveAmmo: Math.min(slot.weapon.reserveAmmo, slot.magazine.reserveAmmo + slot.weapon.magazineSize) }
    }
  }

  get slot(): ActiveSlot {
    return this.activeSlot
  }

  get current(): ResolvedWeapon | null {
    return this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot].weapon : null
  }

  get melee(): MeleeDefinition | null {
    return this.meleeDefinition
  }

  get model(): WeaponModel | null {
    return this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot].model : null
  }

  get ammo(): number {
    return this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot].magazine.ammo : 0
  }

  get reserve(): number | null {
    return this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot].magazine.reserveAmmo : null
  }

  get reloading(): boolean {
    return this.reloadTimer > 0
  }

  get swinging(): boolean {
    return this.meleeTimer > 0
  }

  get weaponName(): string {
    return this.current?.name ?? this.meleeDefinition?.name ?? ''
  }

  get hudSlots(): { key: string; name: string; owned: boolean; active: boolean }[] {
    if (!this.slots || !this.meleeDefinition) return []
    return [
      { key: '1', name: this.slots.primary.weapon.shortName, owned: true, active: this.activeSlot === 'primary' },
      { key: '2', name: this.slots.secondary.weapon.shortName, owned: true, active: this.activeSlot === 'secondary' },
      { key: '3', name: this.meleeDefinition.name.split(' ')[0]!, owned: true, active: this.activeSlot === 'melee' },
    ]
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.updateVisibility()
  }

  /** Nasconde l'arma quando si guarda attraverso un'ottica ad alto ingrandimento. */
  setScoped(scoped: boolean): void {
    if (this.scoped === scoped) return
    this.scoped = scoped
    this.updateVisibility()
  }

  private updateVisibility(): void {
    if (!this.slots || !this.meleeModel) return
    const showMelee = this.activeSlot === 'melee' || this.meleeTimer > 0
    this.muzzleLight.intensity = 0
    for (const [key, slot] of Object.entries(this.slots) as [WeaponSlot, GunSlot][]) {
      slot.model.group.visible = this.visible && !showMelee && !this.scoped && key === this.activeSlot
      slot.model.flash.visible = slot.model.group.visible && this.muzzleTimer > 0
      if (slot.model.flash.visible) {
        this.muzzleLight.position.copy(this.parent.worldToLocal(slot.model.muzzle.getWorldPosition(new THREE.Vector3())))
        this.muzzleLight.intensity = slot.weapon.suppressed ? 2 : 7
      }
    }
    this.meleeModel.visible = this.visible && showMelee
  }

  /** Slot successivo (rotella giù) o precedente (rotella su), in ciclo. */
  nextSlot(direction: 1 | -1): ActiveSlot {
    const order: ActiveSlot[] = ['primary', 'secondary', 'melee']
    const index = order.indexOf(this.activeSlot)
    return order[(index + direction + order.length) % order.length]!
  }

  switchTo(slot: ActiveSlot): boolean {
    if (!this.slots || slot === this.activeSlot || this.meleeTimer > 0) return false
    this.activeSlot = slot
    this.reloadTimer = 0
    this.burstRemaining = 0
    this.drawTimer = DRAW_TIME
    // Chi tiene premuto durante il cambio deve rilasciare prima di sparare con armi semiautomatiche.
    this.triggerConsumed = this.triggerHeld
    this.animator.startSwitch()
    this.updateVisibility()
    return true
  }

  setTrigger(down: boolean): void {
    if (down !== this.triggerHeld) this.triggerConsumed = false
    this.triggerHeld = down
  }

  startReload(): boolean {
    const current = this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot] : null
    if (!current || this.reloadTimer > 0 || current.magazine.ammo >= current.weapon.magazineSize || current.magazine.reserveAmmo === 0) return false
    this.reloadTimer = current.weapon.reloadDuration * this.reloadMultiplier
    this.reloadTotal = this.reloadTimer
    this.burstRemaining = 0
    this.reloadCueIndex = 0
    return true
  }

  /** Avvia un fendente; con `quick` si torna all'arma da fuoco al termine. */
  startMelee(quick: boolean): MeleeDefinition | null {
    if (!this.meleeDefinition || this.meleeCooldown > 0 || this.meleeTimer > 0) return null
    this.meleeTimer = MELEE_SWING
    this.meleeCooldown = this.meleeDefinition.cooldown
    this.quickMelee = quick && this.activeSlot !== 'melee'
    this.reloadTimer = 0
    this.burstRemaining = 0
    this.updateVisibility()
    return this.meleeDefinition
  }

  update(delta: number, input: FrameInput): FrameResult {
    this.fireTimer -= delta
    this.drawTimer = Math.max(0, this.drawTimer - delta)
    this.muzzleTimer = Math.max(0, this.muzzleTimer - delta)
    this.meleeCooldown = Math.max(0, this.meleeCooldown - delta)
    this.visualRecoil = Math.max(0, this.visualRecoil - delta * 4)
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - delta)
      if (this.meleeTimer === 0 && this.quickMelee) this.quickMelee = false
    }
    const recovery = this.recoilState.update(delta)
    const current = this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot] : null
    let shots = 0
    if (current && this.reloadTimer > 0) {
      this.reloadTimer -= delta
      // Rumori meccanici sincronizzati con le fasi dell'animazione.
      const progress = Math.min(1, 1 - this.reloadTimer / this.reloadTotal)
      const cues = getReloadCues(current.model.reloadStyle ?? 'magazine')
      while (this.reloadCueIndex < cues.length && progress >= cues[this.reloadCueIndex]!.at) {
        this.pendingSounds.push(cues[this.reloadCueIndex]!.sound)
        this.reloadCueIndex += 1
      }
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0
        current.magazine = reloadMagazine(current.magazine, current.weapon)
      }
    }
    if (current && this.reloadTimer <= 0 && this.meleeTimer <= 0 && !input.blocked && this.drawTimer <= 0) {
      const weapon = current.weapon
      const wantsShot = this.burstRemaining > 0 || (this.triggerHeld && (weapon.fireMode === 'auto' || !this.triggerConsumed))
      if (wantsShot && this.fireTimer <= 0) {
        if (current.magazine.ammo <= 0) {
          this.burstRemaining = 0
          if (!this.startReload()) {
            // Caricatore e riserva vuoti: scatto a vuoto, ripetuto al massimo ogni 0,3 s.
            this.pendingSounds.push('dry')
            this.fireTimer = 0.3
            this.triggerConsumed = true
          }
        } else {
          if (weapon.fireMode === 'burst' && this.burstRemaining === 0) this.burstRemaining = weapon.burstCount
          current.magazine = { ...current.magazine, ammo: current.magazine.ammo - 1 }
          shots = 1
          this.muzzleTimer = weapon.suppressed ? 0.03 : 0.045
          // Rinculo visivo proporzionale alla potenza dell'arma: pistole e SMG leggeri, fucili a pompa e cecchini pesanti.
          this.visualRecoil = Math.min(0.24, this.visualRecoil + getVisualKick(weapon))
          if (weapon.fireMode !== 'auto') this.triggerConsumed = true
          if (this.burstRemaining > 0) this.burstRemaining -= 1
          const rate = weapon.fireRate * (input.fireRateMultiplier ?? 1)
          // Il resto del frame si accumula: la cadenza reale non dipende dal frame rate.
          const interval = this.burstRemaining > 0 ? 1 / rate : weapon.fireMode === 'burst' ? BURST_PAUSE : 1 / rate
          this.fireTimer = Math.max(this.fireTimer, -delta) + interval
        }
      }
    }
    this.updateVisibility()
    const sounds = this.pendingSounds
    this.pendingSounds = []
    return { shots, recovery, sounds }
  }

  /** Arma assegnata a uno slot (anche se non è quella impugnata). */
  currentOf(slot: 'primary' | 'secondary'): ResolvedWeapon | null {
    return this.slots?.[slot].weapon ?? null
  }

  /** Ricetta audio dello sparo dell'arma impugnata. */
  soundProfile(): GunSoundProfile | null {
    const weapon = this.current
    return weapon ? getGunSoundProfile(weapon.category, weapon.fireMode, weapon.suppressed) : null
  }

  /** Spinta di rinculo per il colpo appena sparato. */
  kick(input: FrameInput): RecoilKick {
    const weapon = this.current
    if (!weapon) return { pitch: 0, yaw: 0 }
    return this.recoilState.shot(weapon.recoil, { aiming: input.aiming, crouched: input.crouched, vertical: 1, horizontal: 1 })
  }

  muzzlePosition(target = new THREE.Vector3()): THREE.Vector3 {
    const model = this.model
    return model ? model.muzzle.getWorldPosition(target) : this.parent.getWorldPosition(target)
  }

  applyPose(delta: number, pose: Omit<WeaponPoseInput, 'recoil' | 'reloadProgress'>): void {
    const current = this.slots && this.activeSlot !== 'melee' ? this.slots[this.activeSlot] : null
    const reloadProgress = current && this.reloadTimer > 0 ? 1 - this.reloadTimer / this.reloadTotal : -1
    const swing = this.meleeTimer > 0 ? 1 - this.meleeTimer / MELEE_SWING : -1
    const group = this.meleeTimer > 0 || this.activeSlot === 'melee' ? this.meleeModel : current?.model.group
    if (!group) return
    this.animator.apply(group, delta, { ...pose, recoil: this.visualRecoil, reloadProgress, swing, reloadStyle: current?.model.reloadStyle })
    if (current) this.animator.applyParts(current.model, reloadProgress)
  }

  dispose(): void {
    this.disposeModels()
  }
}

/** Spinta visiva per colpo: cresce con il rinculo verticale dell'arma, più forte per otturatore e pompa. */
export function getVisualKick(weapon: { recoil: { vertical: number }; fireMode: string; pellets: number }): number {
  const base = 0.03 + weapon.recoil.vertical * 4
  const heavy = weapon.fireMode === 'bolt' || weapon.pellets > 1 ? 0.07 : 0
  return Math.min(0.22, base + heavy)
}

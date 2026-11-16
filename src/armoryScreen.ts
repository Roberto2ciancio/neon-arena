import { ArmoryPreview } from './game/ArmoryPreview'
import type { PreviewSubject } from './game/ArmoryPreview'
import { isUnlocked, xpForLevel, MAX_LEVEL } from './game/armory'
import type { ArmoryState, Loadout } from './game/armory'
import { ATTACHMENT_SLOT_LABELS, ATTACHMENTS, getCompatibleAttachments, resolveWeapon } from './game/attachments'
import type { AttachmentId } from './game/attachments'
import { CAMOS, COSMETIC_CATALOG, COSMETIC_LABELS } from './game/cosmetics'
import type { CosmeticOption, Cosmetics } from './game/cosmetics'
import { EQUIPMENT, GADGET_ORDER, LETHAL_ORDER, TACTICAL_ORDER } from './game/equipment'
import type { EquipmentId, EquipmentSlot } from './game/equipment'
import { CATEGORY_LABELS, MELEE_ORDER, MELEE_WEAPONS, PRIMARY_WEAPONS, SECONDARY_WEAPONS, WEAPONS } from './game/weapons'
import type { AttachmentSlot, WeaponId } from './game/weapons'

export type ArmoryTab = 'primary' | 'secondary' | 'melee' | 'equipment' | 'appearance'

interface ArmoryScreenOptions {
  root: HTMLElement
  getState: () => ArmoryState
  setState: (state: ArmoryState) => void
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function lockLabel(level: number): string {
  return `LIV ${level}`
}

/** Barre delle statistiche normalizzate 0–1 per confrontare le armi. */
function weaponStats(id: WeaponId, loadout: Loadout): { label: string; value: number }[] {
  const weapon = resolveWeapon(WEAPONS[id], loadout.attachments[id])
  const burst = weapon.fireMode === 'burst' ? weapon.burstCount : 1
  return [
    { label: 'DANNO', value: Math.min(1, (weapon.damage * weapon.pellets) / 120) },
    { label: 'CADENZA', value: Math.min(1, (weapon.fireMode === 'burst' ? weapon.fireRate * 0.55 : weapon.fireRate) / 16) * (burst > 1 ? 1 : 1) },
    { label: 'GITTATA', value: Math.min(1, weapon.range / 140) },
    { label: 'CONTROLLO', value: Math.max(0.05, 1 - (weapon.recoil.vertical + weapon.recoil.horizontal * 0.6) / 0.04) },
    { label: 'MOBILITÀ', value: Math.min(1, weapon.moveMultiplier / 1.18) },
  ]
}

/**
 * Schermata dell'armeria: armi primarie e secondarie con accessori e mimetiche, armi bianche,
 * equipaggiamenti e aspetto del personaggio. Ogni scelta sbloccata viene equipaggiata e salvata subito.
 */
export class ArmoryScreen {
  private tab: ArmoryTab = 'primary'
  private readonly preview: ArmoryPreview
  private readonly list: HTMLElement
  private readonly info: HTMLElement

  constructor(private readonly options: ArmoryScreenOptions) {
    this.list = options.root.querySelector<HTMLElement>('#armory-list')!
    this.info = options.root.querySelector<HTMLElement>('#armory-info')!
    this.preview = new ArmoryPreview(options.root.querySelector<HTMLCanvasElement>('#armory-preview')!)
    options.root.querySelectorAll<HTMLButtonElement>('[data-armory-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.tab = button.dataset.armoryTab as ArmoryTab
        this.render()
      })
    })
  }

  open(): void {
    this.options.root.classList.remove('hidden')
    this.render()
    this.preview.start()
  }

  close(): void {
    this.options.root.classList.add('hidden')
    this.preview.stop()
  }

  get isOpen(): boolean {
    return !this.options.root.classList.contains('hidden')
  }

  private get state(): ArmoryState {
    return this.options.getState()
  }

  private update(patch: Partial<Loadout>): void {
    const state = this.state
    this.options.setState({ ...state, loadout: { ...state.loadout, ...patch } })
    this.render()
  }

  private updateCosmetics(patch: Partial<Cosmetics>): void {
    const state = this.state
    this.options.setState({ ...state, cosmetics: { ...state.cosmetics, ...patch } })
    this.render()
  }

  render(): void {
    const state = this.state
    const root = this.options.root
    root.querySelector('#armory-level')!.textContent = String(state.level)
    const xpText = state.level >= MAX_LEVEL ? 'LIVELLO MASSIMO' : `${state.xp} / ${xpForLevel(state.level)} XP`
    root.querySelector('#armory-xp')!.textContent = xpText
    root.querySelectorAll<HTMLButtonElement>('[data-armory-tab]').forEach((button) => {
      const selected = button.dataset.armoryTab === this.tab
      button.classList.toggle('selected', selected)
      button.setAttribute('aria-selected', String(selected))
    })
    this.list.replaceChildren()
    this.info.replaceChildren()
    if (this.tab === 'primary' || this.tab === 'secondary') this.renderWeapons(this.tab)
    else if (this.tab === 'melee') this.renderMelee()
    else if (this.tab === 'equipment') this.renderEquipment()
    else this.renderAppearance()
  }

  private item(name: string, detail: string, unlockLevel: number, selected: boolean, onSelect: () => void): HTMLButtonElement {
    const unlocked = isUnlocked(this.state, unlockLevel)
    const button = element('button', 'armory-item')
    button.type = 'button'
    button.classList.toggle('selected', selected)
    button.classList.toggle('locked', !unlocked)
    button.disabled = !unlocked
    button.setAttribute('aria-pressed', String(selected))
    button.append(element('strong', undefined, name), element('small', undefined, unlocked ? detail : `BLOCCATO // ${lockLabel(unlockLevel)}`))
    if (selected) button.append(element('span', 'armory-badge', 'EQUIPAGGIATO'))
    button.addEventListener('click', onSelect)
    return button
  }

  private chips<T extends string>(label: string, options: { id: T; name: string; unlockLevel: number; color?: number }[], selected: T | undefined, onSelect: (id: T) => void): HTMLElement {
    const group = element('div', 'armory-chips')
    group.append(element('span', 'hud-label', label))
    const row = element('div', 'armory-chip-row')
    for (const option of options) {
      const unlocked = isUnlocked(this.state, option.unlockLevel)
      const chip = element('button', 'armory-chip')
      chip.type = 'button'
      chip.disabled = !unlocked
      chip.classList.toggle('selected', option.id === selected)
      chip.setAttribute('aria-pressed', String(option.id === selected))
      chip.title = unlocked ? option.name : `${option.name} // ${lockLabel(option.unlockLevel)}`
      if (option.color !== undefined) {
        const swatch = element('i', 'armory-swatch')
        swatch.style.background = `#${option.color.toString(16).padStart(6, '0')}`
        chip.append(swatch)
      }
      chip.append(document.createTextNode(unlocked ? option.name : `${option.name} 🔒${option.unlockLevel}`))
      chip.addEventListener('click', () => onSelect(option.id))
      row.append(chip)
    }
    group.append(row)
    return group
  }

  private stats(values: { label: string; value: number }[]): HTMLElement {
    const container = element('div', 'armory-stats')
    for (const stat of values) {
      const row = element('div', 'armory-stat')
      row.append(element('span', undefined, stat.label))
      const bar = element('span', 'armory-bar')
      const fill = element('i')
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, stat.value)) * 100)}%`
      bar.append(fill)
      row.append(bar)
      container.append(row)
    }
    return container
  }

  private showPreview(subject: PreviewSubject): void {
    this.preview.show(subject)
  }

  private renderWeapons(slot: 'primary' | 'secondary'): void {
    const loadout = this.state.loadout
    const ids = slot === 'primary' ? PRIMARY_WEAPONS : SECONDARY_WEAPONS
    const equipped = loadout[slot]
    let category = ''
    for (const id of ids) {
      const weapon = WEAPONS[id]
      if (weapon.category !== category) {
        category = weapon.category
        this.list.append(element('span', 'armory-group', CATEGORY_LABELS[weapon.category]))
      }
      this.list.append(this.item(weapon.shortName, weapon.description, weapon.unlockLevel, id === equipped, () => this.update({ [slot]: id } as Partial<Loadout>)))
    }
    const weapon = WEAPONS[equipped]
    const selection = loadout.attachments[equipped] ?? {}
    const camo = loadout.camos[equipped] ?? 'standard'
    this.showPreview({ kind: 'weapon', weapon, attachments: selection, camo })
    this.info.append(element('h3', undefined, weapon.name), element('p', 'armory-description', weapon.description))
    const mode = weapon.fireMode === 'auto' ? 'AUTOMATICA' : weapon.fireMode === 'burst' ? `RAFFICA DA ${weapon.burstCount}` : weapon.fireMode === 'bolt' ? 'OTTURATORE' : 'SEMIAUTOMATICA'
    const resolved = resolveWeapon(weapon, selection)
    this.info.append(element('p', 'armory-meta', `${mode} // ${resolved.magazineSize} COLPI // RICARICA ${resolved.reloadDuration.toFixed(1).replace('.', ',')}s`))
    this.info.append(this.stats(weaponStats(equipped, loadout)))
    for (const attachmentSlot of weapon.attachmentSlots) {
      const options = getCompatibleAttachments(weapon, attachmentSlot)
      if (options.length === 0) continue
      const choices: { id: AttachmentId | 'none'; name: string; unlockLevel: number }[] = [
        { id: 'none', name: 'NESSUNO', unlockLevel: 1 },
        ...options.map((attachment) => ({ id: attachment.id, name: attachment.name, unlockLevel: attachment.unlockLevel })),
      ]
      const chips = this.chips(ATTACHMENT_SLOT_LABELS[attachmentSlot], choices, selection[attachmentSlot] ?? 'none', (id) => {
        const next = { ...selection }
        if (id === 'none') delete next[attachmentSlot as AttachmentSlot]
        else next[attachmentSlot] = id
        this.update({ attachments: { ...loadout.attachments, [equipped]: next } })
      })
      const current = selection[attachmentSlot]
      if (current) chips.append(element('small', 'armory-hint', ATTACHMENTS[current].description))
      this.info.append(chips)
    }
    this.info.append(this.chips('MIMETICA', CAMOS.map((option) => ({ ...option })), camo, (id) => {
      this.update({ camos: { ...loadout.camos, [equipped]: id } })
    }))
  }

  private renderMelee(): void {
    const loadout = this.state.loadout
    for (const id of MELEE_ORDER) {
      const melee = MELEE_WEAPONS[id]
      this.list.append(this.item(melee.name, melee.description, melee.unlockLevel, id === loadout.melee, () => this.update({ melee: id })))
    }
    const melee = MELEE_WEAPONS[loadout.melee]
    this.showPreview({ kind: 'melee', id: melee.id })
    this.info.append(element('h3', undefined, melee.name), element('p', 'armory-description', melee.description))
    this.info.append(element('p', 'armory-meta', 'TASTO 3 PER IMPUGNARLA // F PER UN ATTACCO RAPIDO'))
    this.info.append(this.stats([
      { label: 'DANNO', value: melee.damage / 150 },
      { label: 'PORTATA', value: melee.range / 2.6 },
      { label: 'AMPIEZZA', value: melee.arc / 1.6 },
      { label: 'RAPIDITÀ', value: 0.4 / melee.cooldown },
    ]))
  }

  private renderEquipment(): void {
    const loadout = this.state.loadout
    const sections: { slot: EquipmentSlot; label: string; key: string; ids: readonly EquipmentId[] }[] = [
      { slot: 'lethal', label: 'LETALE', key: 'G', ids: LETHAL_ORDER },
      { slot: 'tactical', label: 'TATTICO', key: 'Q', ids: TACTICAL_ORDER },
      { slot: 'gadget', label: 'GADGET', key: 'T', ids: GADGET_ORDER },
    ]
    for (const section of sections) {
      this.list.append(element('span', 'armory-group', `${section.label} // TASTO ${section.key}`))
      for (const id of section.ids) {
        const definition = EQUIPMENT[id]
        this.list.append(this.item(definition.name, `${definition.description} Ricarica ${definition.cooldown}s.`, definition.unlockLevel, loadout[section.slot] === id, () => this.update({ [section.slot]: id } as Partial<Loadout>)))
      }
    }
    this.showPreview({ kind: 'character', cosmetics: this.state.cosmetics })
    this.info.append(element('h3', undefined, 'EQUIPAGGIAMENTO'))
    for (const section of sections) {
      const definition = EQUIPMENT[loadout[section.slot]]
      const row = element('div', 'armory-equipped')
      row.append(element('kbd', undefined, section.key), element('strong', undefined, definition.name), element('small', undefined, definition.description))
      this.info.append(row)
    }
  }

  private renderAppearance(): void {
    const cosmetics = this.state.cosmetics
    this.showPreview({ kind: 'character', cosmetics })
    this.list.append(element('span', 'armory-group', 'PERSONAGGIO'))
    for (const key of Object.keys(COSMETIC_CATALOG) as (keyof Cosmetics)[]) {
      const options = COSMETIC_CATALOG[key] as readonly (CosmeticOption<string> & { color?: number })[]
      this.list.append(this.chips(COSMETIC_LABELS[key], options.map((option) => ({ ...option })), cosmetics[key], (id) => this.updateCosmetics({ [key]: id } as Partial<Cosmetics>)))
    }
    this.info.append(element('h3', undefined, 'ASPETTO'))
    this.info.append(element('p', 'armory-description', 'Gli altri giocatori vedono il tuo aspetto nel TCT online. Le strisce sulle braccia restano nel colore della squadra.'))
    this.info.append(element('p', 'armory-meta', 'Le mimetiche delle armi si scelgono nelle schede Primaria e Secondaria.'))
  }
}

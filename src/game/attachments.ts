import type { AttachmentSlot, WeaponCategory, WeaponDefinition } from './weapons'

export type AttachmentId =
  | 'red-dot' | 'holo' | 'scope-4x'
  | 'suppressor' | 'compensator' | 'flash-hider'
  | 'long-barrel' | 'short-barrel'
  | 'vertical-grip' | 'laser'
  | 'extended-mag' | 'fast-mag'

/** Moltiplicatori applicati alle statistiche dell'arma (1 = invariato). */
export interface AttachmentModifiers {
  range: number
  hipSpread: number
  adsSpread: number
  recoilVertical: number
  recoilHorizontal: number
  magazine: number
  reload: number
  mobility: number
  damage: number
}

export interface AttachmentDefinition {
  id: AttachmentId
  slot: AttachmentSlot
  name: string
  description: string
  modifiers: Partial<AttachmentModifiers>
  /** Campo visivo in mira imposto dall'ottica. */
  adsFov?: number
  /** Categorie che possono montarlo; assente = tutte quelle con lo slot. */
  categories?: readonly WeaponCategory[]
  unlockLevel: number
}

export type AttachmentSelection = Partial<Record<AttachmentSlot, AttachmentId>>

export const ATTACHMENTS: Record<AttachmentId, AttachmentDefinition> = {
  'red-dot': { id: 'red-dot', slot: 'optic', name: 'PUNTO ROSSO', description: 'Mira più rapida e pulita.', modifiers: { adsSpread: 0.85 }, unlockLevel: 2 },
  holo: { id: 'holo', slot: 'optic', name: 'OLOGRAFICO', description: 'Reticolo ampio, leggero ingrandimento.', modifiers: { adsSpread: 0.8 }, adsFov: 46, categories: ['assault', 'smg', 'shotgun', 'lmg', 'sniper'], unlockLevel: 7 },
  'scope-4x': { id: 'scope-4x', slot: 'optic', name: 'OTTICA 4×', description: 'Ingrandimento per la lunga distanza.', modifiers: { adsSpread: 0.6, mobility: 0.95 }, adsFov: 24, categories: ['assault', 'sniper', 'lmg'], unlockLevel: 11 },
  suppressor: { id: 'suppressor', slot: 'muzzle', name: 'SILENZIATORE', description: 'Colpi attenuati, gittata −10%.', modifiers: { range: 0.9 }, unlockLevel: 5 },
  compensator: { id: 'compensator', slot: 'muzzle', name: 'COMPENSATORE', description: 'Rinculo verticale −25%.', modifiers: { recoilVertical: 0.75 }, unlockLevel: 3 },
  'flash-hider': { id: 'flash-hider', slot: 'muzzle', name: 'SPEGNIFIAMMA', description: 'Deriva orizzontale −20%.', modifiers: { recoilHorizontal: 0.8 }, unlockLevel: 4 },
  'long-barrel': { id: 'long-barrel', slot: 'barrel', name: 'CANNA LUNGA', description: 'Gittata +25%, mobilità −5%.', modifiers: { range: 1.25, mobility: 0.95, damage: 1.05 }, unlockLevel: 6 },
  'short-barrel': { id: 'short-barrel', slot: 'barrel', name: 'CANNA CORTA', description: 'Mobilità +5%, dispersione +15%.', modifiers: { mobility: 1.05, hipSpread: 1.15, adsSpread: 1.15 }, unlockLevel: 8 },
  'vertical-grip': { id: 'vertical-grip', slot: 'underbarrel', name: 'IMPUGNATURA VERTICALE', description: 'Rinculo −15%.', modifiers: { recoilVertical: 0.85, recoilHorizontal: 0.85 }, unlockLevel: 3 },
  laser: { id: 'laser', slot: 'underbarrel', name: 'PUNTATORE LASER', description: 'Dispersione dal fianco −30%.', modifiers: { hipSpread: 0.7 }, unlockLevel: 9 },
  'extended-mag': { id: 'extended-mag', slot: 'magazine', name: 'CARICATORE ESTESO', description: '+50% colpi, ricarica +15% tempo.', modifiers: { magazine: 1.5, reload: 1.15 }, unlockLevel: 4 },
  'fast-mag': { id: 'fast-mag', slot: 'magazine', name: 'CARICATORE RAPIDO', description: 'Ricarica −25%.', modifiers: { reload: 0.75 }, unlockLevel: 10 },
}

export const ATTACHMENT_SLOT_LABELS: Record<AttachmentSlot, string> = {
  optic: 'OTTICA',
  muzzle: 'BOCCA',
  barrel: 'CANNA',
  underbarrel: 'SOTTOCANNA',
  magazine: 'CARICATORE',
}

export function isAttachmentCompatible(weapon: WeaponDefinition, attachment: AttachmentDefinition): boolean {
  return weapon.attachmentSlots.includes(attachment.slot) && (!attachment.categories || attachment.categories.includes(weapon.category))
}

export function getCompatibleAttachments(weapon: WeaponDefinition, slot: AttachmentSlot): AttachmentDefinition[] {
  return Object.values(ATTACHMENTS).filter((attachment) => attachment.slot === slot && isAttachmentCompatible(weapon, attachment))
}

/** Arma con le statistiche finali dopo gli accessori montati. */
export interface ResolvedWeapon extends WeaponDefinition {
  attachments: AttachmentSelection
  suppressed: boolean
  /** Livello di potenziamento acquistato nell'armeria (solo modalità Zombie). */
  weaponLevel: number
  /** Variante da campo trovata sulle mappe Zombie. */
  fieldVariant: boolean
}

export const MAX_WEAPON_LEVEL = 5
/** Costo in frammenti per passare al livello successivo (indice = livello attuale). */
export const WEAPON_LEVEL_COSTS = [6, 12, 20, 32, 48] as const
export const FIELD_VARIANT_DAMAGE = 1.35
export const FIELD_VARIANT_MAGAZINE = 1.2

export interface WeaponBonus {
  level?: number
  fieldVariant?: boolean
}

/** Moltiplicatori di un livello d'arma: più danno, meno rinculo, ricarica più rapida. */
export function getWeaponLevelBonus(level: number): { damage: number; recoil: number; reload: number } {
  const clamped = Math.min(MAX_WEAPON_LEVEL, Math.max(0, Math.floor(level)))
  return { damage: 1 + clamped * 0.08, recoil: 1 - clamped * 0.05, reload: 1 - clamped * 0.04 }
}

/** Applica accessori, livello e variante: accessori incompatibili o nello slot sbagliato sono ignorati. */
export function resolveWeapon(weapon: WeaponDefinition, selection: AttachmentSelection = {}, bonus: WeaponBonus = {}): ResolvedWeapon {
  const totals: AttachmentModifiers = { range: 1, hipSpread: 1, adsSpread: 1, recoilVertical: 1, recoilHorizontal: 1, magazine: 1, reload: 1, mobility: 1, damage: 1 }
  const applied: AttachmentSelection = {}
  let adsFov = weapon.adsFov
  for (const [slot, id] of Object.entries(selection) as [AttachmentSlot, AttachmentId | undefined][]) {
    const attachment = id ? ATTACHMENTS[id] : undefined
    if (!attachment || attachment.slot !== slot || !isAttachmentCompatible(weapon, attachment)) continue
    applied[slot] = attachment.id
    for (const [key, value] of Object.entries(attachment.modifiers) as [keyof AttachmentModifiers, number][]) totals[key] *= value
    if (attachment.adsFov !== undefined) adsFov = Math.min(adsFov, attachment.adsFov)
  }
  const level = getWeaponLevelBonus(bonus.level ?? 0)
  const field = bonus.fieldVariant === true
  const fieldDamage = field ? FIELD_VARIANT_DAMAGE : 1
  const fieldMagazine = field ? FIELD_VARIANT_MAGAZINE : 1
  const suffix = field ? ' MK II' : ''
  return {
    ...weapon,
    name: field ? weapon.name.replace(' //', `${suffix} //`) : weapon.name,
    shortName: `${weapon.shortName}${suffix}`,
    attachments: applied,
    suppressed: applied.muzzle === 'suppressor',
    weaponLevel: Math.min(MAX_WEAPON_LEVEL, Math.max(0, Math.floor(bonus.level ?? 0))),
    fieldVariant: field,
    damage: weapon.damage * totals.damage * level.damage * fieldDamage,
    range: weapon.range * totals.range,
    hipSpread: weapon.hipSpread * totals.hipSpread,
    adsSpread: weapon.adsSpread * totals.adsSpread,
    recoil: { ...weapon.recoil, vertical: weapon.recoil.vertical * totals.recoilVertical * level.recoil, horizontal: weapon.recoil.horizontal * totals.recoilHorizontal * level.recoil },
    magazineSize: Math.round(weapon.magazineSize * totals.magazine * fieldMagazine),
    reserveAmmo: weapon.reserveAmmo === null ? null : Math.round(weapon.reserveAmmo * fieldMagazine),
    reloadDuration: weapon.reloadDuration * totals.reload * level.reload,
    moveMultiplier: weapon.moveMultiplier * totals.mobility,
    adsFov,
  }
}

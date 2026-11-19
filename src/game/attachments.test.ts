import { describe, expect, it } from 'vitest'
import { getCompatibleAttachments, MAX_WEAPON_LEVEL, resolveWeapon } from './attachments'
import type { AttachmentSelection } from './attachments'
import { WEAPONS } from './weapons'

describe('accessori', () => {
  it('il compensatore riduce il rinculo verticale del 25%', () => {
    const resolved = resolveWeapon(WEAPONS['ar-07'], { muzzle: 'compensator' })
    expect(resolved.recoil.vertical).toBeCloseTo(WEAPONS['ar-07'].recoil.vertical * 0.75)
    expect(resolved.recoil.horizontal).toBe(WEAPONS['ar-07'].recoil.horizontal)
  })

  it('il caricatore esteso aggiunge il 50% dei colpi e rallenta la ricarica', () => {
    const resolved = resolveWeapon(WEAPONS['ar-07'], { magazine: 'extended-mag' })
    expect(resolved.magazineSize).toBe(45)
    expect(resolved.reloadDuration).toBeCloseTo(WEAPONS['ar-07'].reloadDuration * 1.15)
  })

  it('l’ottica imposta il campo visivo in mira e il silenziatore viene segnalato', () => {
    const resolved = resolveWeapon(WEAPONS['dmr-3'], { optic: 'scope-4x', muzzle: 'suppressor' })
    expect(resolved.adsFov).toBe(24)
    expect(resolved.suppressed).toBe(true)
    expect(resolved.range).toBeCloseTo(WEAPONS['dmr-3'].range * 0.9)
  })

  it('ignora accessori incompatibili o nello slot sbagliato', () => {
    const scopeOnPistol = resolveWeapon(WEAPONS['p-12'], { optic: 'scope-4x' })
    expect(scopeOnPistol.attachments).toEqual({})
    expect(scopeOnPistol.adsFov).toBe(WEAPONS['p-12'].adsFov)
    const wrongSlot = resolveWeapon(WEAPONS['ar-07'], { optic: 'compensator' } as AttachmentSelection)
    expect(wrongSlot.recoil.vertical).toBe(WEAPONS['ar-07'].recoil.vertical)
    const noUnderbarrel = resolveWeapon(WEAPONS['r-44'], { underbarrel: 'laser' })
    expect(noUnderbarrel.hipSpread).toBe(WEAPONS['r-44'].hipSpread)
  })

  it('elenca solo gli accessori montabili sull’arma', () => {
    expect(getCompatibleAttachments(WEAPONS['p-12'], 'optic').map((attachment) => attachment.id)).toEqual(['red-dot'])
    expect(getCompatibleAttachments(WEAPONS['sr-50'], 'optic')).toEqual([])
    expect(getCompatibleAttachments(WEAPONS['ar-07'], 'muzzle')).toHaveLength(3)
  })
})

describe('livelli e varianti delle armi', () => {
  it('ogni livello aumenta il danno e riduce rinculo e ricarica, fino al massimo', () => {
    const base = WEAPONS['smg-9']
    const level3 = resolveWeapon(base, {}, { level: 3 })
    expect(level3.damage).toBeCloseTo(base.damage * 1.105)
    expect(level3.recoil.vertical).toBeCloseTo(base.recoil.vertical * 0.91)
    expect(level3.reloadDuration).toBeCloseTo(base.reloadDuration * 0.94)
    expect(resolveWeapon(base, {}, { level: 99 }).weaponLevel).toBe(MAX_WEAPON_LEVEL)
  })

  it('la variante MK II delle postazioni è più forte e riconoscibile', () => {
    const mk2 = resolveWeapon(WEAPONS['ak-74r'], { optic: 'holo' }, { fieldVariant: true })
    expect(mk2.shortName).toBe('AK-74R MK II')
    expect(mk2.name).toBe('AK-74R MK II // PESANTE')
    expect(mk2.damage).toBeCloseTo(WEAPONS['ak-74r'].damage * 1.2)
    expect(mk2.magazineSize).toBe(36)
    expect(mk2.attachments.optic).toBe('holo')
  })
})

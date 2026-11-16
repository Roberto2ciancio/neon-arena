import { describe, expect, it } from 'vitest'
import { getCompatibleAttachments, resolveWeapon } from './attachments'
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

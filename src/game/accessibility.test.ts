import { describe, expect, it } from 'vitest'
import { ACCESSIBILITY_STORAGE_KEY, DEFAULT_ACCESSIBILITY, loadAccessibility, normalizeAccessibility, saveAccessibility } from './accessibility'
import type { KeyValueStorage } from './progression'

describe('accessibilità', () => {
  it('normalizza valori non validi e sensibilità fuori limite', () => {
    expect(normalizeAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY)
    expect(normalizeAccessibility({ reducedMotion: true, highContrast: true, sensitivity: 20 })).toEqual({ reducedMotion: true, highContrast: true, sensitivity: 2 })
    expect(normalizeAccessibility({ sensitivity: -1 }).sensitivity).toBe(0.5)
  })

  it('salva e ricarica le preferenze', () => {
    const storage: KeyValueStorage & { value: string | null } = {
      value: null,
      getItem(key) { return key === ACCESSIBILITY_STORAGE_KEY ? this.value : null },
      setItem(key, value) { if (key === ACCESSIBILITY_STORAGE_KEY) this.value = value },
    }
    const settings = { reducedMotion: true, highContrast: true, sensitivity: 1.4 }
    saveAccessibility(storage, settings)
    expect(loadAccessibility(storage)).toEqual(settings)
  })
})

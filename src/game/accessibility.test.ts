import { describe, expect, it } from 'vitest'
import { ACCESSIBILITY_STORAGE_KEY, DEFAULT_ACCESSIBILITY, getAimSensitivityScale, loadAccessibility, normalizeAccessibility, saveAccessibility } from './accessibility'
import type { KeyValueStorage } from './progression'

describe('accessibilità', () => {
  it('normalizza valori non validi e sensibilità fuori limite', () => {
    expect(normalizeAccessibility(null)).toEqual(DEFAULT_ACCESSIBILITY)
    expect(normalizeAccessibility({ reducedMotion: true, highContrast: true, sensitivity: 20 })).toEqual({ reducedMotion: true, highContrast: true, sensitivity: 2, adsSensitivity: 1, gore: 'full', damageNumbers: false })
    expect(normalizeAccessibility({ sensitivity: -1 }).sensitivity).toBe(0.5)
  })

  it('salva e ricarica le preferenze', () => {
    const storage: KeyValueStorage & { value: string | null } = {
      value: null,
      getItem(key) { return key === ACCESSIBILITY_STORAGE_KEY ? this.value : null },
      setItem(key, value) { if (key === ACCESSIBILITY_STORAGE_KEY) this.value = value },
    }
    const settings = { reducedMotion: true, highContrast: true, sensitivity: 1.4, adsSensitivity: 0.8, gore: 'reduced' as const, damageNumbers: true }
    saveAccessibility(storage, settings)
    expect(loadAccessibility(storage)).toEqual(settings)
  })

  it('in mira riduce la sensibilità in proporzione all’ingrandimento dell’ottica', () => {
    expect(getAimSensitivityScale(75, 75, 1)).toBeCloseTo(1)
    const redDot = getAimSensitivityScale(52, 75, 1)
    const scope = getAimSensitivityScale(20, 75, 1)
    expect(redDot).toBeLessThan(1)
    expect(scope).toBeLessThan(redDot / 2)
    expect(getAimSensitivityScale(52, 75, 0.5)).toBeCloseTo(redDot / 2)
    expect(normalizeAccessibility({ adsSensitivity: 9 }).adsSensitivity).toBe(1.5)
    expect(normalizeAccessibility({ gore: 'troppo' }).gore).toBe('full')
    expect(normalizeAccessibility({}).damageNumbers).toBe(false)
  })
})

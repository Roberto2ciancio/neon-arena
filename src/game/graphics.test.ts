import { describe, expect, it } from 'vitest'
import { getGraphicsSettings, normalizeGraphicsQuality } from './graphics'

describe('impostazioni grafiche', () => {
  it('recupera il preset medio per valori non validi', () => {
    expect(normalizeGraphicsQuality('low')).toBe('low')
    expect(normalizeGraphicsQuality('high')).toBe('high')
    expect(normalizeGraphicsQuality('invalid')).toBe('medium')
    expect(normalizeGraphicsQuality(null)).toBe('medium')
  })

  it('riduce risoluzione e disattiva ombre al preset basso', () => {
    expect(getGraphicsSettings('low')).toEqual({ pixelRatioCap: 0.6, shadows: false, staticLights: 0 })
    expect(getGraphicsSettings('medium')).toEqual({ pixelRatioCap: 0.85, shadows: false, staticLights: 2 })
    expect(getGraphicsSettings('high')).toEqual({ pixelRatioCap: 1.5, shadows: true, staticLights: 4 })
  })
})

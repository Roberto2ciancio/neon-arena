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
    expect(getGraphicsSettings('low')).toEqual({ pixelRatioCap: 0.65, shadows: false })
    expect(getGraphicsSettings('medium')).toEqual({ pixelRatioCap: 1.5, shadows: false })
    expect(getGraphicsSettings('high')).toEqual({ pixelRatioCap: 2, shadows: true })
  })
})

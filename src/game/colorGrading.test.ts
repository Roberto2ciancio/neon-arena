import { describe, expect, it } from 'vitest'
import { getColorGrade, getHurtAberration, getPostEffects, NEUTRAL_GRADE } from './colorGrading'
import { MAPS } from './maps'

describe('correzione colore e post-elaborazione', () => {
  it('ogni mappa ha un tono proprio e i valori restano moderati', () => {
    const grades = MAPS.map((map) => JSON.stringify(getColorGrade(map.id)))
    expect(new Set(grades).size).toBe(MAPS.length)
    expect(getColorGrade('sconosciuta')).toBe(NEUTRAL_GRADE)
    for (const map of MAPS) {
      const grade = getColorGrade(map.id)
      expect(Math.max(...grade.lift)).toBeLessThan(0.05)
      for (const gain of grade.gain) expect(Math.abs(gain - 1)).toBeLessThan(0.15)
      expect(Math.abs(grade.saturation - 1)).toBeLessThan(0.2)
    }
  })

  it('il basso non aggiunge passaggi, il medio solo il colore, l’alto tutto', () => {
    expect(getPostEffects('low').enabled).toBe(false)
    expect(getPostEffects('medium')).toMatchObject({ enabled: true, grade: true, ambientOcclusion: false, bloom: false, grain: 0 })
    expect(getPostEffects('high')).toMatchObject({ enabled: true, ambientOcclusion: true, bloom: true })
    // Il medio conserva l'MSAA che aveva disegnando diretto; l'alto non aggiunge costi.
    expect(getPostEffects('medium').samples).toBeGreaterThan(0)
    expect(getPostEffects('high').samples).toBe(0)
  })

  it('l’aberrazione compare solo da feriti e mai con Riduci movimento', () => {
    expect(getHurtAberration(1, 0, false)).toBe(0)
    expect(getHurtAberration(0.1, 0, false)).toBeGreaterThan(0.4)
    expect(getHurtAberration(1, 1, false)).toBeGreaterThan(0)
    expect(getHurtAberration(0.1, 1, true)).toBe(0)
    expect(getHurtAberration(0, 1, false)).toBeLessThanOrEqual(1)
  })
})

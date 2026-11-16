import { describe, expect, it } from 'vitest'
import { AUTO_QUALITY_DELAY_MS, AutomaticQuality } from './automaticQuality'

describe('preset grafico automatico', () => {
  it('scende di un livello solo dopo una riduzione prolungata degli FPS', () => {
    const automatic = new AutomaticQuality()
    expect(automatic.sample('high', 40, 0)).toBeNull()
    expect(automatic.sample('high', 25, 0)).toBeNull()
    expect(automatic.sample('high', 25, AUTO_QUALITY_DELAY_MS - 1)).toBeNull()
    expect(automatic.sample('high', 25, AUTO_QUALITY_DELAY_MS)).toBe('medium')
    expect(automatic.sample('medium', 25, AUTO_QUALITY_DELAY_MS + 100)).toBeNull()
    expect(automatic.sample('low', 15, AUTO_QUALITY_DELAY_MS * 3)).toBeNull()
  })

  it('riparte il conteggio se gli FPS recuperano o il valore non è valido', () => {
    const automatic = new AutomaticQuality()
    automatic.sample('medium', 20, 0)
    expect(automatic.sample('medium', 55, 1000)).toBeNull()
    expect(automatic.sample('medium', 20, 2000)).toBeNull()
    expect(automatic.sample('medium', 20, 2000 + AUTO_QUALITY_DELAY_MS)).toBe('low')
    automatic.sample('high', Number.NaN, 9000)
    expect(automatic.sample('high', 20, 9001)).toBeNull()
  })
})

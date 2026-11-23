import { describe, expect, it } from 'vitest'
import { canStartGenerator, createGenerator, EVACUATION, GENERATOR, getPoweredCost, isInsideExtraction, startGenerator, tickEvacuation, tickGenerator } from './objectives'

describe('obiettivi', () => {
  it('il generatore si avvia dalla terza ondata e va difeso per 30 secondi', () => {
    const off = createGenerator()
    expect(canStartGenerator(off, 2)).toBe(false)
    let status = startGenerator(off, 3)
    expect(status.state).toBe('starting')
    const events: (string | null)[] = []
    for (let time = 0; time < GENERATOR.defendSeconds + 0.5; time += 0.5) {
      const result = tickGenerator(status, 0.5, 0, 3)
      status = result.status
      events.push(result.event)
    }
    expect(status.state).toBe('on')
    expect(events.filter(Boolean)).toEqual(['started'])
  })

  it('se viene distrutto si spegne e si riprova all’ondata successiva', () => {
    const status = startGenerator(createGenerator(), 4)
    const result = tickGenerator(status, 0.1, GENERATOR.health, 4)
    expect(result.event).toBe('failed')
    expect(result.status.state).toBe('off')
    expect(canStartGenerator(result.status, 4)).toBe(false)
    expect(canStartGenerator(result.status, 5)).toBe(true)
  })

  it('con la corrente le postazioni costano il 25% in meno', () => {
    expect(getPoweredCost(20, false)).toBe(20)
    expect(getPoweredCost(20, true)).toBe(15)
    expect(getPoweredCost(1, true)).toBe(1)
  })

  it('l’evacuazione avanza solo con qualcuno nella zona', () => {
    expect(tickEvacuation(0.5, 4, false)).toBe(0.5)
    expect(tickEvacuation(0, EVACUATION.holdSeconds, true)).toBe(1)
    expect(isInsideExtraction(3, 0, { x: 0, z: 0 })).toBe(true)
    expect(isInsideExtraction(6, 0, { x: 0, z: 0 })).toBe(false)
  })
})

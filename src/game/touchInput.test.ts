import { describe, expect, it } from 'vitest'
import { joystickVector, normalizeTouchPreference, shouldSprint, shouldUseTouch, TOUCH_ACTION_KEYS } from './touchInput'

describe('levetta virtuale', () => {
  it('resta ferma nella zona morta', () => {
    expect(joystickVector(5, 0, 60)).toEqual({ x: 0, y: 0 })
    expect(joystickVector(0, 0, 60)).toEqual({ x: 0, y: 0 })
  })

  it('spingere in su significa avanzare e il bordo satura a 1', () => {
    const forward = joystickVector(0, -200, 60)
    expect(forward.x).toBeCloseTo(0)
    expect(forward.y).toBeCloseTo(1)
    const right = joystickVector(60, 0, 60)
    expect(right.x).toBeCloseTo(1)
  })

  it('è analogica fra zona morta e bordo', () => {
    const half = joystickVector(0, -35, 60)
    expect(half.y).toBeGreaterThan(0.3)
    expect(half.y).toBeLessThan(0.8)
  })

  it('scatta solo spingendo in avanti fino al bordo', () => {
    expect(shouldSprint(0, 1)).toBe(true)
    expect(shouldSprint(0, 0.6)).toBe(false)
    expect(shouldSprint(1, 0)).toBe(false)
  })
})

describe('scelta della modalità touch', () => {
  it('in automatico segue il tipo di puntatore', () => {
    expect(shouldUseTouch('auto', true, true)).toBe(true)
    expect(shouldUseTouch('auto', false, true)).toBe(false)
    expect(shouldUseTouch('on', false, false)).toBe(true)
    expect(shouldUseTouch('off', true, true)).toBe(false)
  })

  it('normalizza valori sconosciuti', () => {
    expect(normalizeTouchPreference('on')).toBe('on')
    expect(normalizeTouchPreference('boh')).toBe('auto')
    expect(normalizeTouchPreference(null)).toBe('auto')
  })

  it('i pulsanti riusano i tasti della tastiera', () => {
    expect(TOUCH_ACTION_KEYS.jump).toBe('Space')
    expect(TOUCH_ACTION_KEYS.interact).toBe('KeyE')
  })
})

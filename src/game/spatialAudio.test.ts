import { describe, expect, it } from 'vitest'
import { getSpatialSound } from './spatialAudio'

describe('audio posizionale', () => {
  it('posiziona i suoni a sinistra e destra rispetto alla visuale', () => {
    expect(getSpatialSound({ x: 5, z: 0 }, { x: 0, z: 0 }, 0).pan).toBe(1)
    expect(getSpatialSound({ x: -5, z: 0 }, { x: 0, z: 0 }, 0).pan).toBe(-1)
    expect(getSpatialSound({ x: 0, z: -5 }, { x: 0, z: 0 }, 0).pan).toBe(0)
  })

  it('attenua i suoni lontani senza azzerarli completamente', () => {
    const near = getSpatialSound({ x: 2, z: 0 }, { x: 0, z: 0 }, 0)
    const far = getSpatialSound({ x: 30, z: 0 }, { x: 0, z: 0 }, 0)
    expect(far.volume).toBeLessThan(near.volume)
    expect(far.volume).toBeGreaterThan(0)
  })
})

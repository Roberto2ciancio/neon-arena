import { describe, expect, it } from 'vitest'
import { getHeightFogFactor, installHeightFog } from './heightFog'
import * as THREE from 'three'

describe('nebbia con altezza', () => {
  it('più fitta al suolo che in alto, mai oltre la nebbia normale a terra', () => {
    expect(getHeightFogFactor(0.5, 0, 0)).toBeCloseTo(0.5)
    expect(getHeightFogFactor(0.5, 20, 40)).toBeLessThan(getHeightFogFactor(0.5, 0, 40))
    expect(getHeightFogFactor(0.5, 50, 40)).toBeGreaterThan(0.5 * 0.4 - 0.01)
  })

  it('la foschia bassa compare solo in lontananza', () => {
    expect(getHeightFogFactor(0, 0.2, 2)).toBe(0)
    expect(getHeightFogFactor(0, 0.2, 40)).toBeGreaterThan(0.15)
    expect(getHeightFogFactor(0, 5, 40)).toBe(0)
  })

  it('installa i pezzi di shader una volta sola', () => {
    installHeightFog()
    installHeightFog()
    expect(THREE.ShaderChunk.fog_fragment).toContain('vFogHeight')
    expect(THREE.ShaderChunk.fog_vertex).toContain('transpose')
    expect(THREE.ShaderChunk.fog_fragment.match(/fogFade/g)?.length).toBe(2)
  })
})

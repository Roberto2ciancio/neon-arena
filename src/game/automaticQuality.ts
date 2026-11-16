import type { GraphicsQuality } from './graphics'

export const AUTO_QUALITY_MIN_FPS = 30
export const AUTO_QUALITY_DELAY_MS = 4000
const AUTO_QUALITY_COOLDOWN_MS = 10000

export class AutomaticQuality {
  private lowSince: number | null = null
  private cooldownUntil = 0

  reset(): void {
    this.lowSince = null
  }

  sample(quality: GraphicsQuality, fps: number, now: number): GraphicsQuality | null {
    if (quality === 'low' || !Number.isFinite(fps) || fps <= 0 || fps >= AUTO_QUALITY_MIN_FPS) {
      this.reset()
      return null
    }
    if (this.lowSince === null) this.lowSince = now
    if (now < this.cooldownUntil || now - this.lowSince < AUTO_QUALITY_DELAY_MS) return null
    this.reset()
    this.cooldownUntil = now + AUTO_QUALITY_COOLDOWN_MS
    return quality === 'high' ? 'medium' : 'low'
  }
}

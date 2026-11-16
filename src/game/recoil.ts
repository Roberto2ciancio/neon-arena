import type { RecoilProfile } from './weapons'

export interface RecoilModifiers {
  aiming: boolean
  crouched: boolean
  /** Moltiplicatori degli accessori (1 = nessun effetto). */
  vertical: number
  horizontal: number
}

export interface RecoilKick {
  pitch: number
  yaw: number
}

const BURST_RESET = 0.35
const RECOVERY_DELAY = 0.09
/** Quota dello spostamento accumulato che torna da sola: il resto va compensato col mouse. */
const RECOVERABLE = 0.75
const MAX_GROWTH_SHOTS = 12

/**
 * Rinculo della visuale: ogni colpo spinge in alto e lateralmente seguendo un andamento
 * ripetibile che cresce durante la raffica; a fuoco cessato la visuale recupera in parte.
 */
export class RecoilState {
  private shots = 0
  private sinceShot = Number.POSITIVE_INFINITY
  private pendingPitch = 0
  private pendingYaw = 0
  private recovery = 6

  get burstShots(): number {
    return this.shots
  }

  shot(profile: RecoilProfile, modifiers: RecoilModifiers): RecoilKick {
    if (this.sinceShot > BURST_RESET) this.shots = 0
    const stance = (modifiers.aiming ? 0.65 : 1) * (modifiers.crouched ? 0.8 : 1)
    const growth = 1 + Math.min(this.shots, MAX_GROWTH_SHOTS) * profile.growth
    const pattern = Math.sin(this.shots * 1.7 + 0.6) * 0.7 + Math.sin(this.shots * 0.45 + 1.1) * 0.3
    const kick = {
      pitch: profile.vertical * growth * stance * modifiers.vertical,
      yaw: profile.horizontal * pattern * stance * modifiers.horizontal,
    }
    this.shots += 1
    this.sinceShot = 0
    this.recovery = profile.recovery
    this.pendingPitch += kick.pitch * RECOVERABLE
    this.pendingYaw += kick.yaw * RECOVERABLE
    return kick
  }

  /** Correzione da sottrarre alla visuale in questo frame. */
  update(delta: number): RecoilKick {
    this.sinceShot += delta
    if (this.sinceShot < RECOVERY_DELAY) return { pitch: 0, yaw: 0 }
    const factor = 1 - Math.exp(-delta * this.recovery)
    const pitch = this.pendingPitch * factor
    const yaw = this.pendingYaw * factor
    this.pendingPitch -= pitch
    this.pendingYaw -= yaw
    return { pitch, yaw }
  }

  reset(): void {
    this.shots = 0
    this.sinceShot = Number.POSITIVE_INFINITY
    this.pendingPitch = 0
    this.pendingYaw = 0
  }
}

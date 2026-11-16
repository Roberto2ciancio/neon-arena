import { getSpatialSound } from './spatialAudio'
import type { AudioPosition, SpatialSound } from './spatialAudio'

type SoundName = 'shoot' | 'enemyShoot' | 'hit' | 'kill' | 'damage' | 'dash' | 'pickup' | 'upgrade'

export class GameAudio {
  private context: AudioContext | null = null
  private muted = false

  get isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  resume(): void {
    if (this.muted) return
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
  }

  playAt(name: SoundName, source: AudioPosition, listener: AudioPosition, yaw: number): void {
    this.play(name, getSpatialSound(source, listener, yaw))
  }

  play(name: SoundName, spatial?: SpatialSound): void {
    if (this.muted) return
    this.resume()
    if (!this.context) return

    switch (name) {
      case 'shoot': this.tone(240, 85, 0.045, 'square', 0.025, spatial); break
      case 'enemyShoot': this.tone(130, 70, 0.1, 'sawtooth', 0.025, spatial); break
      case 'hit': this.tone(100, 65, 0.04, 'square', 0.018, spatial); break
      case 'kill': this.tone(180, 360, 0.1, 'triangle', 0.035, spatial); break
      case 'damage': this.tone(90, 45, 0.18, 'sawtooth', 0.06, spatial); break
      case 'dash': this.tone(150, 520, 0.13, 'sine', 0.035, spatial); break
      case 'pickup': this.tone(620, 980, 0.11, 'sine', 0.035, spatial); break
      case 'upgrade':
        this.tone(330, 660, 0.22, 'triangle', 0.04, spatial)
        this.tone(495, 990, 0.25, 'sine', 0.025, spatial)
        break
    }
  }

  private tone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, spatial?: SpatialSound): void {
    if (!this.context) return
    const now = this.context.currentTime
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const panner = spatial ? this.context.createStereoPanner() : null
    oscillator.type = type
    oscillator.frequency.setValueAtTime(startFrequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
    gain.gain.setValueAtTime(volume * (spatial?.volume ?? 1), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain)
    if (panner) {
      panner.pan.setValueAtTime(spatial?.pan ?? 0, now)
      gain.connect(panner)
      panner.connect(this.context.destination)
    } else {
      gain.connect(this.context.destination)
    }
    oscillator.start(now)
    oscillator.stop(now + duration)
  }
}

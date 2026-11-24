/**
 * Musica dinamica della modalità Zombie, sintetizzata come il resto dell'audio. Quattro strati
 * entrano ed escono con l'intensità della partita: tappeto (sempre), basso (orda in arrivo),
 * arpeggio (zombie vicini o poca vita), percussioni (pressione alta); il boss aggiunge uno
 * strato di tensione. Nella pausa fra le ondate resta solo il tappeto, più cupo.
 */

export interface MusicSituation {
  /** Zombie entro una ventina di metri. */
  nearbyEnemies: number
  /** Vita / vita massima. */
  healthRatio: number
  wave: number
  waveBreak: boolean
  boss: boolean
}

/** Intensità desiderata 0–1. */
export function getMusicIntensity(situation: MusicSituation): number {
  if (situation.waveBreak) return 0.08
  const crowd = Math.min(1, situation.nearbyEnemies / 10) * 0.5
  const danger = Math.max(0, 0.6 - situation.healthRatio) * 0.6
  const progression = Math.min(situation.wave, 15) / 15 * 0.2
  const boss = situation.boss ? 0.35 : 0
  return Math.min(1, 0.12 + crowd + danger + progression + boss)
}

/** L'intensità sale in fretta (l'orda arriva) e scende lentamente (niente salti nella musica). */
export function smoothIntensity(current: number, target: number, delta: number): number {
  const rate = target > current ? 1.6 : 0.22
  const step = rate * delta
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step
}

export type MusicLayer = 'pad' | 'bass' | 'arp' | 'drums' | 'tension'

/** Volume relativo di ogni strato (0–1) per una data intensità. */
export function getLayerLevels(intensity: number, boss: boolean, calm: boolean): Record<MusicLayer, number> {
  const ramp = (from: number, to: number) => Math.min(1, Math.max(0, (intensity - from) / (to - from)))
  return {
    pad: calm ? 0.8 : 1 - ramp(0.75, 1) * 0.4,
    bass: calm ? 0 : ramp(0.2, 0.4),
    arp: calm ? 0 : ramp(0.45, 0.65),
    drums: calm ? 0 : ramp(0.62, 0.8),
    tension: boss && !calm ? 1 : 0,
  }
}

// --- Armonia: re minore, i – VI – iv – V ----------------------------------------------------
export const BPM = 100
const STEPS_PER_BAR = 16
/** Semitoni dal re per ogni accordo (fondamentale, terza, quinta). */
export const PROGRESSION: readonly (readonly [number, number, number])[] = [
  [0, 3, 7], // re minore
  [-4, 0, 3], // si bemolle
  [5, 8, 12], // sol minore
  [7, 11, 14], // la maggiore (dominante)
]
const D3 = 146.83

export function noteFrequency(semitonesFromD3: number): number {
  return D3 * 2 ** (semitonesFromD3 / 12)
}

/** Accordo della battuta (la progressione dura quattro battute e si ripete). */
export function getChord(bar: number): readonly [number, number, number] {
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length]!
}

const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2] as const

interface MusicOutput {
  context: AudioContext
  destination: AudioNode
  noise: AudioBuffer
}

/**
 * Motore che programma le note poco in anticipo sull'orologio audio (pianificazione con
 * margine, così la musica non dipende dai frame del gioco).
 */
export class MusicEngine {
  private output: MusicOutput | null = null
  private bus: GainNode | null = null
  private layers: Partial<Record<MusicLayer, GainNode>> = {}
  private levels: Record<MusicLayer, number> = { pad: 0, bass: 0, arp: 0, drums: 0, tension: 0 }
  private timer = 0
  private nextStepTime = 0
  private step = 0
  private playing = false
  private calm = false

  constructor(private readonly getOutput: () => MusicOutput | null) {}

  get isPlaying(): boolean {
    return this.playing
  }

  start(): void {
    if (this.playing) return
    const output = this.getOutput()
    if (!output) return
    if (this.output !== output) this.connect(output)
    const { context } = output
    this.playing = true
    this.step = 0
    this.nextStepTime = context.currentTime + 0.1
    this.bus!.gain.cancelScheduledValues(context.currentTime)
    this.bus!.gain.setTargetAtTime(1, context.currentTime, 0.8)
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.schedule(), 50)
  }

  /** Dissolvenza e stop (pausa, menu, fine run). */
  stop(): void {
    if (!this.playing) return
    this.playing = false
    window.clearInterval(this.timer)
    if (this.output && this.bus) this.bus.gain.setTargetAtTime(0, this.output.context.currentTime, 0.4)
  }

  setIntensity(intensity: number, boss: boolean, calm: boolean): void {
    this.calm = calm
    this.levels = getLayerLevels(intensity, boss, calm)
    if (!this.output) return
    const now = this.output.context.currentTime
    for (const [layer, node] of Object.entries(this.layers) as [MusicLayer, GainNode][]) node.gain.setTargetAtTime(this.levels[layer], now, 1.2)
  }

  private connect(output: MusicOutput): void {
    this.output = output
    const { context, destination } = output
    this.bus = context.createGain()
    this.bus.gain.value = 0
    this.bus.connect(destination)
    for (const layer of ['pad', 'bass', 'arp', 'drums', 'tension'] as const) {
      const gain = context.createGain()
      gain.gain.value = this.levels[layer]
      gain.connect(this.bus)
      this.layers[layer] = gain
    }
  }

  private schedule(): void {
    if (!this.output || !this.playing) return
    const { context } = this.output
    const stepDuration = 60 / BPM / 4
    // Scheda in secondo piano: si riparte dal presente invece di recuperare le note perse.
    if (this.nextStepTime < context.currentTime - 0.5) this.nextStepTime = context.currentTime + 0.05
    while (this.nextStepTime < context.currentTime + 0.25) {
      this.playStep(this.step, this.nextStepTime, stepDuration)
      this.nextStepTime += stepDuration
      this.step += 1
    }
  }

  private playStep(step: number, time: number, stepDuration: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR)
    const inBar = step % STEPS_PER_BAR
    const chord = getChord(bar)
    const active = (layer: MusicLayer) => this.levels[layer] > 0.01
    if (inBar === 0 && active('pad')) {
      for (const note of chord) this.voice('pad', noteFrequency(note), time, stepDuration * STEPS_PER_BAR, 'sawtooth', 0.035, this.calm ? 380 : 650, 0.5)
    }
    if (inBar % 2 === 0 && active('bass')) {
      const octave = inBar % 8 === 6 ? 0 : -12
      this.voice('bass', noteFrequency(chord[0] + octave), time, stepDuration * 1.6, 'square', 0.06, 320, 0.01)
    }
    if (active('arp')) {
      const index = ARP_PATTERN[inBar % ARP_PATTERN.length]!
      const note = chord[index]! + 12 + (inBar >= 8 ? 12 : 0)
      this.voice('arp', noteFrequency(note), time, stepDuration * 0.9, 'triangle', 0.035, 3200, 0.005)
    }
    if (active('drums')) {
      if (inBar % 8 === 0 || inBar === 10) this.kick(time)
      if (inBar % 8 === 4) this.hit('drums', time, 'bandpass', 1800, 0.16, 0.14)
      if (inBar % 2 === 0) this.hit('drums', time, 'highpass', 7000, 0.05, 0.04)
    }
    if (active('tension') && inBar % 4 === 0) {
      // Bicordo di tritono basso, ripetuto: suona come un allarme.
      this.voice('tension', noteFrequency(chord[0] - 12), time, stepDuration * 3, 'sawtooth', 0.05, 900, 0.01)
      this.voice('tension', noteFrequency(chord[0] - 6), time, stepDuration * 3, 'sawtooth', 0.035, 900, 0.01)
    }
  }

  private voice(layer: MusicLayer, frequency: number, time: number, duration: number, type: OscillatorType, volume: number, lowpass: number, attack: number): void {
    const target = this.layers[layer]
    if (!this.output || !target) return
    const { context } = this.output
    const oscillator = context.createOscillator()
    oscillator.type = type
    oscillator.frequency.value = frequency
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = lowpass
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(volume, time + Math.max(0.005, attack))
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(target)
    oscillator.start(time)
    oscillator.stop(time + duration + 0.05)
  }

  private kick(time: number): void {
    const target = this.layers.drums
    if (!this.output || !target) return
    const { context } = this.output
    const oscillator = context.createOscillator()
    oscillator.frequency.setValueAtTime(130, time)
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.18)
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.32, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22)
    oscillator.connect(gain)
    gain.connect(target)
    oscillator.start(time)
    oscillator.stop(time + 0.25)
  }

  private hit(layer: MusicLayer, time: number, type: BiquadFilterType, frequency: number, volume: number, decay: number): void {
    const target = this.layers[layer]
    if (!this.output || !target) return
    const { context, noise } = this.output
    const source = context.createBufferSource()
    source.buffer = noise
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    const gain = context.createGain()
    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(target)
    source.start(time, Math.random() * 0.5)
    source.stop(time + decay + 0.02)
  }
}

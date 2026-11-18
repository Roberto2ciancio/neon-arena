import { getGunSoundProfile, jitterPitch } from './gunSounds'
import type { GunSoundProfile } from './gunSounds'
import { getSpatialSound } from './spatialAudio'
import type { AudioPosition, SpatialSound } from './spatialAudio'

export type SoundName =
  | 'shoot' | 'enemyShoot' | 'hit' | 'headshot' | 'kill' | 'damage' | 'dash' | 'pickup' | 'upgrade'
  | 'dry' | 'reloadOut' | 'reloadIn' | 'shell' | 'melee' | 'meleeHit' | 'switch' | 'explosion'
  | 'groan' | 'groanBig' | 'powerUp' | 'reloadRack' | 'shellLoad' | 'heartbeat' | 'heal'

/** Voci contemporanee massime: oltre, i suoni nuovi vengono saltati per non saturare CPU e mix. */
const MAX_VOICES = 48
const VOLUME_KEY = 'neon-arena:volume:v1'

interface AudioGraph {
  context: AudioContext
  master: GainNode
  reverb: GainNode
  noise: AudioBuffer
}

/** Un solo AudioContext condiviso da Zombie e TCT, con compressore e riverbero comuni. */
let graph: AudioGraph | null = null
let masterVolume = readVolume()
let activeVoices = 0

function readVolume(): number {
  try {
    const value = Number(window.localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(value) && window.localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, value)) : 0.8
  } catch {
    return 0.8
  }
}

function createGraph(): AudioGraph {
  const context = new AudioContext()
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -16
  compressor.knee.value = 8
  compressor.ratio.value = 5
  compressor.attack.value = 0.002
  compressor.release.value = 0.18
  compressor.connect(context.destination)
  const master = context.createGain()
  master.gain.value = masterVolume
  master.connect(compressor)

  // Riverbero sintetico: rumore che decade, simile a uno spazio urbano aperto.
  const length = Math.floor(context.sampleRate * 1.4)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3
  }
  const convolver = context.createConvolver()
  convolver.buffer = impulse
  const reverb = context.createGain()
  reverb.gain.value = 0.55
  reverb.connect(convolver)
  convolver.connect(master)

  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = noise.getChannelData(0)
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1
  return { context, master, reverb, noise }
}

interface VoiceOptions {
  spatial?: SpatialSound
  delay?: number
  reverb?: number
}

export class GameAudio {
  private muted = false

  get isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  /** Volume generale 0–1, condiviso da tutte le modalità e salvato sul dispositivo. */
  static setMasterVolume(volume: number): void {
    masterVolume = Math.min(1, Math.max(0, volume))
    try {
      window.localStorage.setItem(VOLUME_KEY, String(masterVolume))
    } catch {
      // Archivio non disponibile: il volume vale solo per questa sessione.
    }
    if (graph) graph.master.gain.setTargetAtTime(masterVolume, graph.context.currentTime, 0.02)
  }

  static get masterVolume(): number {
    return masterVolume
  }

  resume(): void {
    if (this.muted) return
    graph ??= createGraph()
    if (graph.context.state === 'suspended') void graph.context.resume()
  }

  playAt(name: SoundName, source: AudioPosition, listener: AudioPosition, yaw: number): void {
    this.play(name, getSpatialSound(source, listener, yaw))
  }

  /** Sparo procedurale a strati per l'arma indicata. */
  gunshot(profile: GunSoundProfile, spatial?: SpatialSound): void {
    if (!this.ready()) return
    const pitch = jitterPitch(profile.pitchJitter)
    const options = { spatial, reverb: profile.reverb }
    this.noise({ type: 'highpass', frequency: profile.crackFrequency * pitch, gain: profile.crackGain, decay: profile.crackDecay }, options)
    this.noise({ type: 'lowpass', frequency: profile.bodyFrequency * pitch, gain: profile.bodyGain, decay: profile.bodyDecay, q: 0.8 }, options)
    this.tone(profile.thumpStart * pitch, profile.thumpEnd, profile.thumpDecay, 'sine', profile.thumpGain, options)
    if (profile.actionDelay !== null) {
      // Otturatore o pompa: due scatti metallici.
      this.click(1700, 0.05, { spatial, delay: profile.actionDelay })
      this.click(1100, 0.06, { spatial, delay: profile.actionDelay + 0.12 })
    }
  }

  play(name: SoundName, spatial?: SpatialSound): void {
    if (!this.ready()) return
    const options = { spatial }
    switch (name) {
      case 'shoot':
        this.gunshot(getGunSoundProfile('assault', 'auto', false), spatial)
        break
      case 'enemyShoot':
        // Sputo acido: getto umido filtrato.
        this.noise({ type: 'bandpass', frequency: 700, gain: 0.35, decay: 0.22, q: 1.4, sweepTo: 300 }, { ...options, reverb: 0.15 })
        this.tone(220, 90, 0.16, 'sawtooth', 0.06, options)
        break
      case 'hit':
        // Impatto sordo sul corpo più un "tic" di conferma.
        this.noise({ type: 'lowpass', frequency: 600, gain: 0.32, decay: 0.07 }, options)
        this.click(2400, 0.022, options)
        break
      case 'headshot':
        this.noise({ type: 'lowpass', frequency: 900, gain: 0.3, decay: 0.06 }, options)
        this.tone(1850, 1800, 0.18, 'sine', 0.13, options)
        this.tone(2780, 2700, 0.12, 'sine', 0.07, options)
        break
      case 'kill':
        this.noise({ type: 'lowpass', frequency: 450, gain: 0.4, decay: 0.16 }, options)
        this.tone(520, 1040, 0.09, 'triangle', 0.09, { ...options, delay: 0.02 })
        break
      case 'damage':
        this.noise({ type: 'lowpass', frequency: 380, gain: 0.55, decay: 0.2 }, options)
        this.tone(95, 45, 0.22, 'sawtooth', 0.12, options)
        break
      case 'dash':
        this.noise({ type: 'bandpass', frequency: 500, gain: 0.22, decay: 0.22, q: 0.9, sweepTo: 1800 }, options)
        break
      case 'melee':
        this.noise({ type: 'bandpass', frequency: 2400, gain: 0.3, decay: 0.2, q: 1.1, sweepTo: 600 }, options)
        break
      case 'meleeHit':
        this.noise({ type: 'lowpass', frequency: 500, gain: 0.55, decay: 0.12 }, options)
        this.tone(140, 60, 0.12, 'sine', 0.35, options)
        break
      case 'pickup':
        this.tone(620, 980, 0.11, 'sine', 0.08, options)
        this.tone(930, 1470, 0.1, 'sine', 0.04, { ...options, delay: 0.05 })
        break
      case 'switch':
        this.click(1300, 0.03, options)
        this.click(900, 0.04, { ...options, delay: 0.09 })
        break
      case 'dry':
        this.click(3200, 0.02, options)
        break
      case 'reloadOut':
        this.click(1500, 0.035, options)
        this.noise({ type: 'bandpass', frequency: 1200, gain: 0.12, decay: 0.08, q: 2 }, { ...options, delay: 0.05 })
        break
      case 'reloadIn':
        this.click(1100, 0.04, options)
        this.click(1800, 0.03, { ...options, delay: 0.14 })
        this.click(1300, 0.04, { ...options, delay: 0.22 })
        break
      case 'reloadRack':
        // Leva di armamento o carrello: indietro e avanti.
        this.click(900, 0.04, options)
        this.noise({ type: 'bandpass', frequency: 1600, gain: 0.1, decay: 0.05, q: 3 }, { ...options, delay: 0.02 })
        this.click(1400, 0.05, { ...options, delay: 0.11 })
        break
      case 'heartbeat':
        // Doppio battito sordo.
        this.tone(62, 48, 0.12, 'sine', 0.35, options)
        this.tone(58, 44, 0.12, 'sine', 0.25, { ...options, delay: 0.16 })
        break
      case 'heal':
        this.tone(440, 880, 0.18, 'sine', 0.08, options)
        this.tone(660, 1320, 0.22, 'triangle', 0.05, { ...options, delay: 0.08 })
        break
      case 'shellLoad':
        this.click(1250, 0.035, options)
        this.tone(2600, 2400, 0.03, 'triangle', 0.025, { ...options, delay: 0.015 })
        break
      case 'shell':
        // Bossolo che rimbalza a terra.
        this.tone(5200, 5000, 0.05, 'sine', 0.025, { ...options, delay: 0.22 + Math.random() * 0.1 })
        this.tone(4700, 4600, 0.04, 'sine', 0.018, { ...options, delay: 0.34 + Math.random() * 0.1 })
        break
      case 'explosion':
        this.noise({ type: 'lowpass', frequency: 900, gain: 1, decay: 0.7, sweepTo: 120 }, { ...options, reverb: 0.7 })
        this.tone(80, 30, 0.6, 'sine', 0.9, options)
        break
      case 'groan':
      case 'groanBig': {
        const big = name === 'groanBig'
        const base = (big ? 70 : 110) * jitterPitch(0.15)
        this.tone(base * 1.3, base, big ? 1.1 : 0.7, 'sawtooth', big ? 0.12 : 0.07, { ...options, reverb: 0.3 }, big ? 260 : 520)
        break
      }
      case 'powerUp':
        ;[523, 659, 784, 1047].forEach((frequency, index) => this.tone(frequency, frequency, 0.16, 'triangle', 0.07, { ...options, delay: index * 0.06 }))
        break
      case 'upgrade':
        this.tone(330, 660, 0.22, 'triangle', 0.09, options)
        this.tone(495, 990, 0.25, 'sine', 0.05, options)
        break
    }
  }

  private ready(): boolean {
    if (this.muted) return false
    this.resume()
    return graph !== null && activeVoices < MAX_VOICES
  }

  /** Collega una voce al mix: panoramica, volume spaziale, filtro di distanza e mandata al riverbero. */
  private output(source: AudioNode, options: VoiceOptions, start: number): void {
    if (!graph) return
    const { context, master, reverb } = graph
    let node = source
    const spatial = options.spatial
    if (spatial) {
      // I suoni lontani perdono le alte frequenze.
      const distance = context.createBiquadFilter()
      distance.type = 'lowpass'
      distance.frequency.value = 1200 + spatial.volume * 16000
      node.connect(distance)
      const panner = context.createStereoPanner()
      panner.pan.setValueAtTime(spatial.pan, start)
      distance.connect(panner)
      node = panner
    }
    node.connect(master)
    if (options.reverb) {
      const send = context.createGain()
      send.gain.value = options.reverb
      node.connect(send)
      send.connect(reverb)
    }
  }

  private track(source: AudioScheduledSourceNode): void {
    activeVoices += 1
    source.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1)
    }
  }

  private tone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, options: VoiceOptions = {}, lowpass?: number): void {
    if (!graph) return
    const { context } = graph
    const now = context.currentTime + (options.delay ?? 0)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(startFrequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration)
    const level = volume * (options.spatial?.volume ?? 1)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    if (lowpass) {
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = lowpass
      oscillator.connect(filter)
      filter.connect(gain)
    } else {
      oscillator.connect(gain)
    }
    this.output(gain, options, now)
    this.track(oscillator)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  private noise(filterOptions: { type: BiquadFilterType; frequency: number; gain: number; decay: number; q?: number; sweepTo?: number }, options: VoiceOptions = {}): void {
    if (!graph) return
    const { context, noise } = graph
    const now = context.currentTime + (options.delay ?? 0)
    const source = context.createBufferSource()
    source.buffer = noise
    source.playbackRate.value = 0.9 + Math.random() * 0.2
    const filter = context.createBiquadFilter()
    filter.type = filterOptions.type
    filter.frequency.setValueAtTime(filterOptions.frequency, now)
    if (filterOptions.sweepTo) filter.frequency.exponentialRampToValueAtTime(filterOptions.sweepTo, now + filterOptions.decay)
    filter.Q.value = filterOptions.q ?? 0.7
    const gain = context.createGain()
    const level = filterOptions.gain * (options.spatial?.volume ?? 1)
    gain.gain.setValueAtTime(Math.max(0.0002, level), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + filterOptions.decay)
    source.connect(filter)
    filter.connect(gain)
    this.output(gain, options, now)
    this.track(source)
    source.start(now, Math.random() * 0.5)
    source.stop(now + filterOptions.decay + 0.02)
  }

  private click(frequency: number, duration: number, options: VoiceOptions = {}): void {
    this.tone(frequency, frequency * 0.7, duration, 'square', 0.05, options)
  }
}

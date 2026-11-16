import type { FireMode, WeaponCategory } from './weapons'

/**
 * Ricetta procedurale di uno sparo, composta da strati sovrapposti:
 * schiocco ad alta frequenza, corpo filtrato, colpo basso, coda nel riverbero e meccanica dell'arma.
 */
export interface GunSoundProfile {
  /** Frequenza del passa-alto dello schiocco iniziale (Hz). */
  crackFrequency: number
  crackGain: number
  crackDecay: number
  /** Frequenza del passa-basso del corpo dello sparo (Hz). */
  bodyFrequency: number
  bodyGain: number
  bodyDecay: number
  /** Colpo basso: frequenza iniziale e finale del sinusoide (Hz). */
  thumpStart: number
  thumpEnd: number
  thumpGain: number
  thumpDecay: number
  /** Quota inviata al riverbero. */
  reverb: number
  /** Suono meccanico dopo lo sparo (otturatore o pompa), in secondi; null se assente. */
  actionDelay: number | null
  /** Variazione casuale dell'intonazione fra un colpo e l'altro (±). */
  pitchJitter: number
}

const BASE: Record<WeaponCategory, GunSoundProfile> = {
  pistol: { crackFrequency: 2600, crackGain: 0.5, crackDecay: 0.035, bodyFrequency: 2200, bodyGain: 0.5, bodyDecay: 0.09, thumpStart: 170, thumpEnd: 70, thumpGain: 0.45, thumpDecay: 0.08, reverb: 0.25, actionDelay: null, pitchJitter: 0.06 },
  'machine-pistol': { crackFrequency: 3000, crackGain: 0.42, crackDecay: 0.025, bodyFrequency: 2600, bodyGain: 0.4, bodyDecay: 0.06, thumpStart: 180, thumpEnd: 80, thumpGain: 0.3, thumpDecay: 0.06, reverb: 0.2, actionDelay: null, pitchJitter: 0.07 },
  smg: { crackFrequency: 2800, crackGain: 0.42, crackDecay: 0.025, bodyFrequency: 2400, bodyGain: 0.45, bodyDecay: 0.065, thumpStart: 160, thumpEnd: 70, thumpGain: 0.35, thumpDecay: 0.06, reverb: 0.2, actionDelay: null, pitchJitter: 0.07 },
  assault: { crackFrequency: 2200, crackGain: 0.55, crackDecay: 0.035, bodyFrequency: 1700, bodyGain: 0.6, bodyDecay: 0.11, thumpStart: 150, thumpEnd: 55, thumpGain: 0.55, thumpDecay: 0.1, reverb: 0.3, actionDelay: null, pitchJitter: 0.05 },
  lmg: { crackFrequency: 1900, crackGain: 0.55, crackDecay: 0.04, bodyFrequency: 1400, bodyGain: 0.65, bodyDecay: 0.13, thumpStart: 130, thumpEnd: 48, thumpGain: 0.65, thumpDecay: 0.12, reverb: 0.32, actionDelay: null, pitchJitter: 0.05 },
  shotgun: { crackFrequency: 1500, crackGain: 0.6, crackDecay: 0.05, bodyFrequency: 1100, bodyGain: 0.8, bodyDecay: 0.2, thumpStart: 110, thumpEnd: 40, thumpGain: 0.85, thumpDecay: 0.18, reverb: 0.4, actionDelay: 0.32, pitchJitter: 0.04 },
  sniper: { crackFrequency: 1800, crackGain: 0.75, crackDecay: 0.05, bodyFrequency: 1200, bodyGain: 0.75, bodyDecay: 0.24, thumpStart: 120, thumpEnd: 38, thumpGain: 0.9, thumpDecay: 0.22, reverb: 0.5, actionDelay: 0.45, pitchJitter: 0.03 },
}

/** Ricetta dello sparo per categoria, modalità di fuoco e silenziatore. */
export function getGunSoundProfile(category: WeaponCategory, fireMode: FireMode, suppressed: boolean): GunSoundProfile {
  const profile = { ...BASE[category] }
  if (fireMode === 'bolt') profile.actionDelay = profile.actionDelay ?? 0.4
  if (fireMode !== 'bolt' && category !== 'shotgun') profile.actionDelay = null
  if (suppressed) {
    // Il silenziatore toglie quasi tutto lo schiocco, abbassa il corpo e accorcia la coda.
    profile.crackGain *= 0.15
    profile.bodyFrequency = Math.min(profile.bodyFrequency, 900)
    profile.bodyGain *= 0.55
    profile.thumpGain *= 0.6
    profile.reverb *= 0.4
  }
  return profile
}

/** Intonazione casuale entro ±jitter, così una raffica non suona come un unico campione ripetuto. */
export function jitterPitch(jitter: number, random: () => number = Math.random): number {
  return 1 + (random() * 2 - 1) * jitter
}

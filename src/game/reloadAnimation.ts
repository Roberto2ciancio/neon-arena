import type { ReloadStyle } from './models'

/** Transizione morbida 0→1 fra `start` e `end` dell'avanzamento. */
export function ease(progress: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (progress - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

/** Impulso 0→1→0 fra `start` e `end`. */
export function pulse(progress: number, start: number, end: number): number {
  if (progress <= start || progress >= end) return 0
  return Math.sin(((progress - start) / (end - start)) * Math.PI)
}

export const SHELLS_PER_RELOAD = 4

/** Posa dell'arma durante la ricarica, da sommare a quella normale. */
export interface ReloadPose {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
}

/** Spostamento del caricatore e della mano di supporto (coordinate locali dell'arma). */
export interface ReloadParts {
  magazineY: number
  magazineRotX: number
  magazineVisible: boolean
  handX: number
  handY: number
  handZ: number
}

const ZERO_POSE: ReloadPose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }

/** Posa dell'arma: si inclina per esporre il pozzetto, sobbalza all'inserimento e torna dritta. */
export function getReloadPose(style: ReloadStyle, progress: number): ReloadPose {
  if (progress < 0) return ZERO_POSE
  const hold = ease(progress, 0, 0.14) * (1 - ease(progress, 0.84, 1))
  if (style === 'shells') {
    const insert = shellInsertPulse(progress)
    const pump = pulse(progress, 0.86, 0.98)
    return { x: -0.04 * hold, y: -0.02 * hold + insert * 0.012, z: pump * 0.03, rotX: 0.18 * hold - insert * 0.05, rotY: 0.12 * hold, rotZ: -0.5 * hold }
  }
  if (style === 'cylinder') {
    const flick = pulse(progress, 0.7, 0.82)
    return { x: -0.05 * hold, y: 0.02 * hold, z: 0, rotX: 0.3 * hold, rotY: 0, rotZ: -0.75 * hold + flick * 0.4 }
  }
  const seat = pulse(progress, 0.6, 0.7)
  const rack = pulse(progress, 0.82, 0.94)
  const pistol = style === 'pistol'
  // Il fondo dell'arma ruota verso il centro dello schermo (rotZ negativa), così si vedono
  // pozzetto, caricatore e mano; l'arma scende e si avvicina al centro.
  return {
    x: -0.07 * hold,
    y: -0.06 * hold + seat * 0.015,
    z: 0.05 * hold + rack * (pistol ? 0.035 : 0.025),
    rotX: (pistol ? 0.3 : 0.18) * hold - seat * 0.14 - rack * 0.06,
    rotY: 0.12 * hold,
    rotZ: -(pistol ? 0.45 : 0.7) * hold - rack * 0.12,
  }
}

function shellInsertPulse(progress: number): number {
  const local = (progress - 0.16) / 0.66
  if (local < 0 || local >= 1) return 0
  const cycle = (local * SHELLS_PER_RELOAD) % 1
  return pulse(cycle, 0.45, 0.9)
}

/** Caricatore che cade, sparisce, ricompare sotto l'arma e viene inserito; la mano lo accompagna. */
export function getReloadParts(style: ReloadStyle, progress: number, magazineZ: number, handZ: number): ReloadParts {
  const rest: ReloadParts = { magazineY: 0, magazineRotX: 0, magazineVisible: true, handX: 0, handY: 0, handZ: 0 }
  if (progress < 0) return rest
  if (style === 'shells') {
    // La mano va dalla finestra di espulsione alla tasca e ritorno per ogni cartuccia, poi pompa.
    const local = (progress - 0.16) / 0.66
    const cycle = local >= 0 && local < 1 ? (local * SHELLS_PER_RELOAD) % 1 : 0
    const reach = local >= 0 && local < 1 ? Math.sin(cycle * Math.PI) : 0
    const pump = pulse(progress, 0.86, 0.98)
    return { ...rest, handX: 0.05 * reach, handY: -0.16 * reach, handZ: (magazineZ - handZ) * 0.3 * reach + pump * 0.12 }
  }
  if (style === 'cylinder') {
    const reach = ease(progress, 0.12, 0.3) * (1 - ease(progress, 0.55, 0.72))
    return { ...rest, handY: -0.28 * reach, handZ: 0.12 * reach }
  }
  const drop = ease(progress, 0.16, 0.34)
  const insert = ease(progress, 0.42, 0.62)
  let magazineY = 0
  let magazineRotX = 0
  let magazineVisible = true
  if (progress < 0.36) {
    magazineY = -0.6 * drop * drop
    magazineRotX = 0.5 * drop
    magazineVisible = drop < 0.97
  } else if (progress < 0.42) {
    magazineVisible = false
  } else {
    magazineY = -0.42 * (1 - insert)
    magazineRotX = -0.25 * (1 - insert)
  }
  // La mano scende a prendere il caricatore nuovo, lo porta su e infine arma l'otturatore.
  const grab = ease(progress, 0.12, 0.3) * (1 - ease(progress, 0.6, 0.72))
  const toMagazine = (magazineZ - handZ) * grab
  const rack = pulse(progress, 0.8, 0.95)
  const pistol = style === 'pistol'
  const handY = progress >= 0.42 && progress < 0.62 ? magazineY - 0.08 * grab : -0.34 * grab
  return {
    magazineY,
    magazineRotX,
    magazineVisible,
    handX: 0.03 * grab,
    handY: handY + rack * (pistol ? 0.16 : 0.12),
    handZ: toMagazine + rack * (pistol ? 0.1 : 0.22),
  }
}

export type ReloadCue = 'reloadOut' | 'reloadIn' | 'reloadRack' | 'shellLoad'

/** Momenti della ricarica in cui suonano i rumori meccanici. */
export function getReloadCues(style: ReloadStyle): { at: number; sound: ReloadCue }[] {
  if (style === 'shells') {
    return [
      ...Array.from({ length: SHELLS_PER_RELOAD }, (_, index) => ({ at: 0.16 + 0.66 * ((index + 0.7) / SHELLS_PER_RELOAD), sound: 'shellLoad' as const })),
      { at: 0.9, sound: 'reloadRack' },
    ]
  }
  if (style === 'cylinder') return [{ at: 0.14, sound: 'reloadOut' }, { at: 0.6, sound: 'reloadIn' }, { at: 0.76, sound: 'reloadRack' }]
  return [{ at: 0.2, sound: 'reloadOut' }, { at: 0.62, sound: 'reloadIn' }, { at: 0.88, sound: 'reloadRack' }]
}

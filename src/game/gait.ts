/**
 * Camminate degli zombie per tipo (Fase D): curve diverse invece di un'unica sinusoide.
 * Regole pure: dato il tipo e la fase del passo restituiscono le rotazioni di arti, busto e
 * testa. Gli attacchi e le pose speciali (carica, urlo, lancio) si sovrappongono in `Game.ts`.
 */
import type { EnemyKind } from './types'

export interface GaitProfile {
  /** Passi al secondo (radianti di fase al secondo). */
  stride: number
  legSwing: number
  /** Braccia: posizione di riposo (negativa = in avanti) e oscillazione. */
  armBase: number
  armSwing: number
  /** Le braccia oscillano con le gambe opposte (camminata umana) o insieme (zombie rigido). */
  armsTogether: boolean
  /** Dondolio laterale del corpo e inclinazione in avanti a ogni passo. */
  roll: number
  pitch: number
  /** 0–1: una gamba trascina (passo più corto e più lento da un lato). */
  limp: number
  /** Testa che ciondola. */
  headBob: number
}

export const GAITS: Record<EnemyKind, GaitProfile> = {
  // Errante: braccia tese, zoppica e ciondola.
  walker: { stride: 5, legSwing: 0.5, armBase: -1.05, armSwing: 0.18, armsTogether: false, roll: 0.07, pitch: 0.04, limp: 0.45, headBob: 0.12 },
  // Corridore: falcata ampia e braccia che pompano.
  runner: { stride: 12, legSwing: 0.85, armBase: -0.2, armSwing: 0.95, armsTogether: false, roll: 0.03, pitch: 0.08, limp: 0, headBob: 0.05 },
  armored: { stride: 4, legSwing: 0.34, armBase: -0.25, armSwing: 0.3, armsTogether: false, roll: 0.05, pitch: 0.03, limp: 0, headBob: 0.03 },
  // Bruto e Tiranno: passi pesanti, il busto ruota sul passo.
  brute: { stride: 3.4, legSwing: 0.36, armBase: -0.35, armSwing: 0.35, armsTogether: false, roll: 0.09, pitch: 0.05, limp: 0, headBob: 0.04 },
  tyrant: { stride: 3, legSwing: 0.34, armBase: -0.4, armSwing: 0.3, armsTogether: false, roll: 0.1, pitch: 0.06, limp: 0.15, headBob: 0.05 },
  // Strisciante: le braccia trascinano il corpo.
  crawler: { stride: 10, legSwing: 0.3, armBase: -1.25, armSwing: 1, armsTogether: false, roll: 0.05, pitch: 0, limp: 0, headBob: 0.08 },
  spitter: { stride: 4.5, legSwing: 0.36, armBase: -0.3, armSwing: 0.4, armsTogether: false, roll: 0.06, pitch: 0.03, limp: 0.2, headBob: 0.1 },
  screamer: { stride: 4.2, legSwing: 0.34, armBase: -0.5, armSwing: 0.25, armsTogether: true, roll: 0.05, pitch: 0.03, limp: 0.25, headBob: 0.15 },
  leaper: { stride: 6, legSwing: 0.5, armBase: -0.6, armSwing: 0.5, armsTogether: true, roll: 0.04, pitch: 0.06, limp: 0, headBob: 0.06 },
  // Gonfio: dondola da un lato all'altro.
  bloater: { stride: 3.2, legSwing: 0.28, armBase: -0.15, armSwing: 0.2, armsTogether: false, roll: 0.16, pitch: 0.02, limp: 0, headBob: 0.06 },
  // Ombra: fluida, quasi senza dondolio.
  stalker: { stride: 7, legSwing: 0.55, armBase: -0.3, armSwing: 0.6, armsTogether: false, roll: 0.015, pitch: 0.05, limp: 0, headBob: 0.02 },
  shielder: { stride: 4, legSwing: 0.32, armBase: -0.9, armSwing: 0.1, armsTogether: true, roll: 0.05, pitch: 0.03, limp: 0, headBob: 0.03 },
}

export interface GaitPose {
  leftLeg: number
  rightLeg: number
  leftArm: number
  rightArm: number
  /** Rotazioni del corpo intero (z) e del busto (x, da sommare alla postura del tipo). */
  bodyRoll: number
  torsoPitch: number
  headRoll: number
  headPitch: number
}

/**
 * Posa del passo. `phase` è il tempo moltiplicato per la cadenza più la fase del singolo
 * zombie; `intensity` 0–1 riduce i movimenti quando lo zombie è fermo.
 */
export function getGaitPose(kind: EnemyKind, time: number, offset: number, intensity = 1): GaitPose {
  const gait = GAITS[kind]
  const phase = time * gait.stride + offset
  const amount = Math.max(0, Math.min(1, intensity))
  // Zoppia: metà del ciclo più rapida e più corta, l'altra trascinata.
  const shaped = phase + gait.limp * 0.6 * Math.sin(phase)
  const swing = Math.sin(shaped)
  // La gamba destra è quella che trascina: passo più corto.
  const left = swing * gait.legSwing
  const right = -swing * gait.legSwing * (1 - gait.limp * 0.55)
  const arms = swing * gait.armSwing
  // Due appoggi per ciclo: il busto scende e si inclina a ogni passo.
  const step = Math.abs(Math.sin(shaped))
  return {
    leftLeg: left * amount,
    rightLeg: right * amount,
    leftArm: gait.armBase + (gait.armsTogether ? arms : -arms) * amount,
    rightArm: gait.armBase + arms * amount,
    bodyRoll: Math.sin(shaped) * gait.roll * amount,
    torsoPitch: -step * gait.pitch * amount,
    headRoll: Math.sin(shaped * 0.5 + offset) * gait.headBob * amount,
    headPitch: step * gait.headBob * 0.5 * amount,
  }
}

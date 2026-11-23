/**
 * Correzione colore per mappa (Fase D): ogni mappa ha un tono riconoscibile senza LUT, con
 * pochi parametri applicati in un solo passaggio a schermo intero. Regole pure.
 */
import type { GraphicsQuality } from './graphics'

export interface ColorGrade {
  /** Colore aggiunto alle ombre (0–1 per canale, piccolo). */
  lift: [number, number, number]
  /** Moltiplicatore delle luci (1 = invariato). */
  gain: [number, number, number]
  saturation: number
  contrast: number
  vignette: number
}

export const NEUTRAL_GRADE: ColorGrade = { lift: [0, 0, 0], gain: [1, 1, 1], saturation: 1, contrast: 1, vignette: 0.25 }

const GRADES: Record<string, ColorGrade> = {
  // Notte alla stazione: ombre fredde, luci calde dei lampioni.
  'station-13': { lift: [0.0, 0.012, 0.03], gain: [1.05, 1.0, 0.94], saturation: 1.06, contrast: 1.06, vignette: 0.32 },
  // Deposito polveroso: tutto più caldo e un po' sbiadito.
  'depot-06': { lift: [0.03, 0.018, 0.0], gain: [1.06, 1.0, 0.88], saturation: 0.92, contrast: 1.04, vignette: 0.3 },
  // Distretto al neon: magenta nelle ombre, saturazione alta.
  'district-zero': { lift: [0.015, 0.0, 0.02], gain: [1.02, 0.98, 1.03], saturation: 1.06, contrast: 1.05, vignette: 0.3 },
  // Porto sotto la pioviggine: blu-verde, contrasto morbido.
  'port-09': { lift: [0.0, 0.012, 0.018], gain: [0.98, 1.0, 1.03], saturation: 0.98, contrast: 1.03, vignette: 0.28 },
  // Laboratorio infestato: verde malato.
  'lab-21': { lift: [0.005, 0.025, 0.0], gain: [0.95, 1.05, 0.92], saturation: 1.02, contrast: 1.07, vignette: 0.36 },
}

export function getColorGrade(mapId: string): ColorGrade {
  return GRADES[mapId] ?? NEUTRAL_GRADE
}

export interface PostEffects {
  /** Passaggio di composizione attivo (sul basso si disegna diretto, come prima). */
  enabled: boolean
  grade: boolean
  grain: number
  /** Campioni MSAA del buffer di composizione (0 = nessuno). */
  samples: number
  ambientOcclusion: boolean
  bloom: boolean
  /** Profondità di campo in mira (serve la profondità della scena: solo alto). */
  depthOfField: boolean
}

/** Effetti per preset: il basso resta identico a prima, il medio aggiunge solo il colore. */
export function getPostEffects(quality: GraphicsQuality): PostEffects {
  switch (quality) {
    case 'low': return { enabled: false, grade: false, grain: 0, samples: 0, ambientOcclusion: false, bloom: false, depthOfField: false }
    // Il medio prima disegnava diretto con l'MSAA del canvas: nel buffer di composizione lo si mantiene.
    case 'medium': return { enabled: true, grade: true, grain: 0, samples: 4, ambientOcclusion: false, bloom: false, depthOfField: false }
    // L'alto componeva già senza antialias (SSAO e bloom): stessi passaggi di prima, nessun MSAA in più.
    case 'high': return { enabled: true, grade: true, grain: 0.03, samples: 0, ambientOcclusion: true, bloom: true, depthOfField: true }
  }
}

/**
 * Aberrazione cromatica ai bordi quando si è feriti: cresce sotto il 35% della vita e con il
 * colpo appena subito. Spenta con Riduci movimento o Alto contrasto.
 */
export function getHurtAberration(healthShare: number, recentHit: number, reduced: boolean): number {
  if (reduced) return 0
  const low = healthShare < 0.35 ? (0.35 - Math.max(0, healthShare)) / 0.35 : 0
  return Math.min(1, low * 0.8 + Math.max(0, recentHit) * 0.6)
}

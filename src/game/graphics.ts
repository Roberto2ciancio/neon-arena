export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface GraphicsSettings {
  pixelRatioCap: number
  shadows: boolean
}

export function normalizeGraphicsQuality(value: unknown): GraphicsQuality {
  return value === 'low' || value === 'high' ? value : 'medium'
}

export function getGraphicsSettings(quality: GraphicsQuality): GraphicsSettings {
  switch (quality) {
    case 'low': return { pixelRatioCap: 0.65, shadows: false }
    case 'high': return { pixelRatioCap: 2, shadows: true }
    default: return { pixelRatioCap: 1.5, shadows: false }
  }
}

export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface GraphicsSettings {
  pixelRatioCap: number
  shadows: boolean
  staticLights: number
}

export function normalizeGraphicsQuality(value: unknown): GraphicsQuality {
  return value === 'low' || value === 'high' ? value : 'medium'
}

export function getGraphicsSettings(quality: GraphicsQuality): GraphicsSettings {
  switch (quality) {
    case 'low': return { pixelRatioCap: 0.6, shadows: false, staticLights: 0 }
    case 'high': return { pixelRatioCap: 1.5, shadows: true, staticLights: 4 }
    default: return { pixelRatioCap: 0.85, shadows: false, staticLights: 2 }
  }
}

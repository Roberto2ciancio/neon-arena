import type { KeyValueStorage } from './progression'

export interface AccessibilitySettings {
  reducedMotion: boolean
  highContrast: boolean
  sensitivity: number
}

export const ACCESSIBILITY_STORAGE_KEY = 'neon-arena:accessibility:v1'
export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = { reducedMotion: false, highContrast: false, sensitivity: 1 }

export function normalizeAccessibility(value: unknown): AccessibilitySettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_ACCESSIBILITY }
  const settings = value as Partial<AccessibilitySettings>
  return {
    reducedMotion: settings.reducedMotion === true,
    highContrast: settings.highContrast === true,
    sensitivity: typeof settings.sensitivity === 'number' && Number.isFinite(settings.sensitivity)
      ? Math.max(0.5, Math.min(2, settings.sensitivity))
      : 1,
  }
}

export function loadAccessibility(storage: KeyValueStorage): AccessibilitySettings {
  try {
    return normalizeAccessibility(JSON.parse(storage.getItem(ACCESSIBILITY_STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_ACCESSIBILITY }
  }
}

export function saveAccessibility(storage: KeyValueStorage, settings: AccessibilitySettings): void {
  try {
    storage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(normalizeAccessibility(settings)))
  } catch {}
}

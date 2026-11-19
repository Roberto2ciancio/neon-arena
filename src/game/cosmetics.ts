export interface CosmeticOption<T extends string> {
  id: T
  name: string
  unlockLevel: number
  /** Prestigio del giocatore richiesto (oggetti esclusivi). */
  prestige?: number
  /** Solo mimetiche: prestigio dell'arma richiesto. */
  weaponPrestige?: number
}

export interface ColorOption<T extends string> extends CosmeticOption<T> {
  color: number
}

export type SuitColorId = 'graphite' | 'olive' | 'desert' | 'navy' | 'crimson' | 'arctic' | 'neon' | 'gold' | 'aurora' | 'obsidian'
export type HeadgearId = 'none' | 'helmet' | 'hood' | 'beret' | 'cyber' | 'halo'
export type MaskId = 'none' | 'balaclava' | 'gas' | 'visor'
export type VisorColorId = 'cyan' | 'magenta' | 'amber' | 'lime'
export type BackpackId = 'none' | 'tactical' | 'radio' | 'tank'
export type PatchId = 'none' | 'skull' | 'bolt' | 'star' | 'prestige'
export type GloveColorId = 'black' | 'tan' | 'olive' | 'red'
export type CamoId = 'standard' | 'urban' | 'digital' | 'tiger' | 'carbon' | 'neon' | 'gold' | 'prestige-violet' | 'prestige-crimson' | 'diamond' | 'mastery-bronze' | 'mastery-silver' | 'mastery-platinum'

export const SUIT_COLORS: readonly ColorOption<SuitColorId>[] = [
  { id: 'graphite', name: 'GRAFITE', color: 0x2a3138, unlockLevel: 1 },
  { id: 'olive', name: 'OLIVA', color: 0x4b5638, unlockLevel: 1 },
  { id: 'desert', name: 'DESERTO', color: 0x8a7454, unlockLevel: 2 },
  { id: 'navy', name: 'NOTTE', color: 0x1f2d4a, unlockLevel: 4 },
  { id: 'crimson', name: 'CREMISI', color: 0x6e1f2a, unlockLevel: 6 },
  { id: 'arctic', name: 'ARTICO', color: 0xc4ced6, unlockLevel: 10 },
  { id: 'neon', name: 'NEON', color: 0x16a89a, unlockLevel: 16 },
  { id: 'gold', name: 'ORO', color: 0xb8902f, unlockLevel: 25 },
  { id: 'aurora', name: 'AURORA', color: 0x7a4dff, unlockLevel: 1, prestige: 1 },
  { id: 'obsidian', name: 'OSSIDIANA', color: 0x0d0d14, unlockLevel: 1, prestige: 4 },
]

export const HEADGEAR: readonly CosmeticOption<HeadgearId>[] = [
  { id: 'none', name: 'NESSUNO', unlockLevel: 1 },
  { id: 'helmet', name: 'CASCO TATTICO', unlockLevel: 1 },
  { id: 'hood', name: 'CAPPUCCIO', unlockLevel: 3 },
  { id: 'beret', name: 'BASCO', unlockLevel: 8 },
  { id: 'cyber', name: 'CASCO CYBER', unlockLevel: 17 },
  { id: 'halo', name: 'ALONE DEL PRESTIGIO', unlockLevel: 1, prestige: 5 },
]

export const MASKS: readonly CosmeticOption<MaskId>[] = [
  { id: 'none', name: 'NESSUNA', unlockLevel: 1 },
  { id: 'balaclava', name: 'PASSAMONTAGNA', unlockLevel: 2 },
  { id: 'gas', name: 'MASCHERA ANTIGAS', unlockLevel: 6 },
  { id: 'visor', name: 'VISORE', unlockLevel: 12 },
]

export const VISOR_COLORS: readonly ColorOption<VisorColorId>[] = [
  { id: 'cyan', name: 'CIANO', color: 0x58f5e5, unlockLevel: 1 },
  { id: 'magenta', name: 'MAGENTA', color: 0xff4f87, unlockLevel: 5 },
  { id: 'amber', name: 'AMBRA', color: 0xffb657, unlockLevel: 9 },
  { id: 'lime', name: 'LIME', color: 0x9dff5a, unlockLevel: 14 },
]

export const BACKPACKS: readonly CosmeticOption<BackpackId>[] = [
  { id: 'none', name: 'NESSUNO', unlockLevel: 1 },
  { id: 'tactical', name: 'ZAINO TATTICO', unlockLevel: 4 },
  { id: 'radio', name: 'RADIO DA CAMPO', unlockLevel: 9 },
  { id: 'tank', name: 'SERBATOIO', unlockLevel: 20 },
]

export const PATCHES: readonly CosmeticOption<PatchId>[] = [
  { id: 'none', name: 'NESSUNA', unlockLevel: 1 },
  { id: 'bolt', name: 'FULMINE', unlockLevel: 2 },
  { id: 'star', name: 'STELLA', unlockLevel: 5 },
  { id: 'skull', name: 'TESCHIO', unlockLevel: 13 },
  { id: 'prestige', name: 'STELLA DEL PRESTIGIO', unlockLevel: 1, prestige: 1 },
]

export const GLOVE_COLORS: readonly ColorOption<GloveColorId>[] = [
  { id: 'black', name: 'NERI', color: 0x181a1d, unlockLevel: 1 },
  { id: 'tan', name: 'SABBIA', color: 0x8a7556, unlockLevel: 2 },
  { id: 'olive', name: 'OLIVA', color: 0x48523a, unlockLevel: 4 },
  { id: 'red', name: 'ROSSI', color: 0x7a1e22, unlockLevel: 11 },
]

export const CAMOS: readonly CosmeticOption<CamoId>[] = [
  { id: 'standard', name: 'STANDARD', unlockLevel: 1 },
  { id: 'urban', name: 'URBANA', unlockLevel: 3 },
  { id: 'digital', name: 'DIGITALE', unlockLevel: 7 },
  { id: 'tiger', name: 'TIGRE', unlockLevel: 11 },
  { id: 'carbon', name: 'CARBONIO', unlockLevel: 15 },
  { id: 'neon', name: 'NEON', unlockLevel: 20 },
  { id: 'gold', name: 'ORO', unlockLevel: 28 },
  { id: 'prestige-violet', name: 'PRESTIGIO VIOLA', unlockLevel: 1, prestige: 1 },
  { id: 'prestige-crimson', name: 'PRESTIGIO CREMISI', unlockLevel: 1, prestige: 3 },
  { id: 'diamond', name: 'DIAMANTE', unlockLevel: 1, prestige: 6 },
  { id: 'mastery-bronze', name: 'MAESTRIA BRONZO', unlockLevel: 1, weaponPrestige: 1 },
  { id: 'mastery-silver', name: 'MAESTRIA ARGENTO', unlockLevel: 1, weaponPrestige: 2 },
  { id: 'mastery-platinum', name: 'MAESTRIA PLATINO', unlockLevel: 1, weaponPrestige: 3 },
]

export interface Cosmetics {
  /** Prestigio del giocatore (0–10): stella accanto al nome, visibile anche agli altri. */
  prestige: number
  suit: SuitColorId
  accent: SuitColorId
  headgear: HeadgearId
  mask: MaskId
  visor: VisorColorId
  backpack: BackpackId
  patch: PatchId
  gloves: GloveColorId
}

export const DEFAULT_COSMETICS: Cosmetics = {
  prestige: 0,
  suit: 'graphite',
  accent: 'olive',
  headgear: 'helmet',
  mask: 'none',
  visor: 'cyan',
  backpack: 'none',
  patch: 'none',
  gloves: 'black',
}

export const COSMETIC_CATALOG = {
  suit: SUIT_COLORS,
  accent: SUIT_COLORS,
  headgear: HEADGEAR,
  mask: MASKS,
  visor: VISOR_COLORS,
  backpack: BACKPACKS,
  patch: PATCHES,
  gloves: GLOVE_COLORS,
} as const satisfies Record<CosmeticSlot, readonly CosmeticOption<string>[]>

export type CosmeticSlot = Exclude<keyof Cosmetics, 'prestige'>

export const COSMETIC_LABELS: Record<CosmeticSlot, string> = {
  suit: 'TUTA',
  accent: 'DETTAGLI',
  headgear: 'COPRICAPO',
  mask: 'MASCHERA',
  visor: 'COLORE VISORE',
  backpack: 'ZAINO',
  patch: 'TOPPA',
  gloves: 'GUANTI',
}

export function colorOf<T extends string>(options: readonly ColorOption<T>[], id: T): number {
  return options.find((option) => option.id === id)?.color ?? options[0]!.color
}

/** Cosmetici validi e sbloccati; tutto il resto ricade sui valori predefiniti. */
export function normalizeCosmetics(value: unknown, level = Number.POSITIVE_INFINITY, prestige = MAX_PRESTIGE_BADGE): Cosmetics {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const result = { ...DEFAULT_COSMETICS }
  for (const key of Object.keys(COSMETIC_CATALOG) as CosmeticSlot[]) {
    const options = COSMETIC_CATALOG[key] as readonly CosmeticOption<string>[]
    const option = options.find((candidate) => candidate.id === source[key])
    if (option && isCosmeticUnlocked(option, level, prestige)) (result as unknown as Record<string, string>)[key] = option.id
  }
  const badge = typeof source.prestige === 'number' && Number.isFinite(source.prestige) ? Math.floor(source.prestige) : 0
  result.prestige = Math.min(prestige, MAX_PRESTIGE_BADGE, Math.max(0, badge))
  return result
}

export const MAX_PRESTIGE_BADGE = 10

export function isCosmeticUnlocked(option: CosmeticOption<string>, level: number, prestige: number, weaponPrestige = 0): boolean {
  return option.unlockLevel <= level && (option.prestige ?? 0) <= prestige && (option.weaponPrestige ?? 0) <= weaponPrestige
}

/** Stella del prestigio da mostrare accanto al nome ("" senza prestigio). */
export function prestigeBadge(prestige: number): string {
  return prestige > 0 ? `✦${prestige}` : ''
}

import { describe, expect, it } from 'vitest'
import { addXp, ARMORY_STORAGE_KEY, createDefaultArmory, DEFAULT_LOADOUT, loadArmory, MAX_LEVEL, normalizeArmory, resolveLoadout, saveArmory, xpForLevel } from './armory'
import { DEFAULT_COSMETICS, normalizeCosmetics } from './cosmetics'
import { getFlashIntensity } from './equipment'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value } }
}

describe('progressione del giocatore', () => {
  it('sale di livello con l’XP e si ferma al livello massimo', () => {
    const start = createDefaultArmory()
    const one = addXp(start, xpForLevel(1) + 10)
    expect(one.levelsGained).toBe(1)
    expect(one.state.level).toBe(2)
    expect(one.state.xp).toBe(10)
    const capped = addXp(start, 10_000_000)
    expect(capped.state.level).toBe(MAX_LEVEL)
    expect(capped.state.xp).toBe(0)
    expect(addXp(capped.state, 500).levelsGained).toBe(0)
    expect(addXp(start, Number.NaN).state).toBe(start)
  })

  it('carica il default da un salvataggio corrotto o assente', () => {
    expect(loadArmory(memoryStorage())).toEqual(createDefaultArmory())
    expect(loadArmory(memoryStorage({ [ARMORY_STORAGE_KEY]: '{non json' }))).toEqual(createDefaultArmory())
    const weird = normalizeArmory({ level: 'tanti', xp: -5, loadout: { primary: 'laser-gun', lethal: 42 }, cosmetics: { mask: 'drago' } })
    expect(weird.level).toBe(1)
    expect(weird.loadout).toEqual(DEFAULT_LOADOUT)
    expect(weird.cosmetics).toEqual(DEFAULT_COSMETICS)
  })

  it('rimpiazza gli oggetti bloccati e gli accessori non validi', () => {
    const locked = normalizeArmory({
      level: 3,
      loadout: { primary: 'sr-50', secondary: 'ar-07', gadget: 'radar', attachments: { 'ar-07': { muzzle: 'compensator', optic: 'scope-4x', magazine: 'compensator' } }, camos: { 'ar-07': 'gold' } },
      cosmetics: { headgear: 'cyber', suit: 'desert' },
    })
    expect(locked.loadout.primary).toBe('ar-07')
    expect(locked.loadout.secondary).toBe('p-12')
    expect(locked.loadout.gadget).toBe('turret')
    expect(locked.loadout.attachments).toEqual({ 'ar-07': { muzzle: 'compensator' } })
    expect(locked.loadout.camos).toEqual({})
    expect(locked.cosmetics.headgear).toBe('helmet')
    expect(locked.cosmetics.suit).toBe('desert')
  })

  it('salva e ricarica lo stato e risolve le statistiche del loadout', () => {
    const storage = memoryStorage()
    const state = normalizeArmory({ level: 20, loadout: { primary: 'ak-74r', secondary: 'r-44', melee: 'machete', attachments: { 'ak-74r': { magazine: 'extended-mag' } } } })
    saveArmory(storage, state)
    expect(loadArmory(storage)).toEqual(state)
    const resolved = resolveLoadout(state.loadout, state.cosmetics)
    expect(resolved.primary.magazineSize).toBe(45)
    expect(resolved.secondary.id).toBe('r-44')
    expect(resolved.melee.id).toBe('machete')
    expect(normalizeCosmetics({ suit: 'gold' }, 5).suit).toBe('graphite')
  })
})

describe('flashbang', () => {
  it('non acceca dietro un muro, alle spalle o fuori raggio', () => {
    expect(getFlashIntensity(4, 1, true)).toBe(0)
    expect(getFlashIntensity(6, -1, false)).toBe(0)
    expect(getFlashIntensity(20, 1, false)).toBe(0)
  })

  it('acceca di più da vicino e guardando l’esplosione', () => {
    const close = getFlashIntensity(2, 1, false)
    const far = getFlashIntensity(10, 1, false)
    const side = getFlashIntensity(2, 0, false)
    expect(close).toBeGreaterThan(0.8)
    expect(far).toBeLessThan(close)
    expect(side).toBeLessThan(close)
    expect(side).toBeGreaterThan(0)
  })
})

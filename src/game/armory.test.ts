import { describe, expect, it } from 'vitest'
import { addWeaponXp, addXp, ARMORY_STORAGE_KEY, canPrestige, canPrestigeWeapon, createDefaultArmory, DEFAULT_LOADOUT, getMastery, isAttachmentUnlocked, loadArmory, MAX_LEVEL, MAX_WEAPON_MASTERY, normalizeArmory, prestigeUp, prestigeWeapon, renameClass, resolveLoadout, saveArmory, selectClass, xpForLevel } from './armory'
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
      mastery: { 'ar-07': { level: 3, xp: 0, prestige: 0 } },
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
    const state = normalizeArmory({ level: 20, mastery: { 'ak-74r': { level: 6, xp: 0, prestige: 0 } }, loadout: { primary: 'ak-74r', secondary: 'r-44', melee: 'machete', attachments: { 'ak-74r': { magazine: 'extended-mag' } } } })
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

describe('livello delle armi e accessori', () => {
  it('l’arma sale di livello con la sua esperienza, indipendentemente dal livello del giocatore', () => {
    const start = createDefaultArmory()
    expect(getMastery(start, 'ak-74r').level).toBe(1)
    const leveled = addWeaponXp(start, 'ak-74r', 5000).state
    expect(getMastery(leveled, 'ak-74r').level).toBeGreaterThan(5)
    expect(leveled.level).toBe(1)
    expect(getMastery(leveled, 'ar-07').level).toBe(1)
    // Arrivare al livello 20 richiede molta esperienza (oltre 1.500 uccisioni normali).
    let total = 0
    for (let level = 1; level < MAX_WEAPON_MASTERY; level += 1) total += 100 + (level - 1) * 60 + (level - 1) ** 2 * 4
    expect(total / 12).toBeGreaterThan(1500)
  })

  it('gli accessori si sbloccano con il livello dell’arma e sono al massimo 3', () => {
    const state = addWeaponXp(createDefaultArmory(), 'ar-07', 100_000).state
    expect(isAttachmentUnlocked(createDefaultArmory(), 'ar-07', 'scope-4x')).toBe(false)
    expect(isAttachmentUnlocked(state, 'ar-07', 'scope-4x')).toBe(true)
    expect(isAttachmentUnlocked(state, 'ak-74r', 'scope-4x')).toBe(false)
    const loaded = normalizeArmory({ ...state, loadout: { ...state.loadout, attachments: { 'ar-07': { optic: 'red-dot', muzzle: 'compensator', underbarrel: 'laser', magazine: 'fast-mag', barrel: 'long-barrel' } } } })
    expect(Object.keys(loaded.loadout.attachments['ar-07'] ?? {})).toHaveLength(3)
  })

  it('al livello 20 l’arma può fare prestigio e tiene gli accessori', () => {
    let state = addWeaponXp(createDefaultArmory(), 'smg-9', 1_000_000).state
    expect(canPrestigeWeapon(state, 'smg-9')).toBe(true)
    state = prestigeWeapon(state, 'smg-9')
    expect(getMastery(state, 'smg-9')).toEqual({ level: 1, xp: 0, prestige: 1 })
    expect(isAttachmentUnlocked(state, 'smg-9', 'fast-mag')).toBe(true)
  })
})

describe('prestigio e classi', () => {
  it('al livello 50 si fa prestigio: livello 1, stella e oggetti già sbloccati restano', () => {
    const max = addXp(createDefaultArmory(), 100_000_000).state
    expect(max.level).toBe(50)
    expect(canPrestige(max)).toBe(true)
    const prestiged = prestigeUp(max)
    expect(prestiged.level).toBe(1)
    expect(prestiged.prestige).toBe(1)
    expect(prestiged.cosmetics.prestige).toBe(1)
    const reloaded = normalizeArmory({ ...prestiged, loadout: { ...prestiged.loadout, primary: 'sr-50' }, cosmetics: { ...prestiged.cosmetics, suit: 'aurora' } })
    expect(reloaded.loadout.primary).toBe('sr-50')
    expect(reloaded.cosmetics.suit).toBe('aurora')
    expect(normalizeArmory({ level: 50, cosmetics: { suit: 'aurora' } }).cosmetics.suit).toBe('graphite')
  })

  it('le classi salvano loadout diversi e si rinominano', () => {
    let state = normalizeArmory({ level: 20 })
    expect(state.classes).toHaveLength(5)
    state = { ...state, loadout: { ...state.loadout, primary: 'ak-74r' } }
    state = selectClass(state, 2)
    expect(state.loadout.primary).toBe('ar-07')
    state = { ...state, loadout: { ...state.loadout, primary: 'smg-9' } }
    state = selectClass(state, 0)
    expect(state.loadout.primary).toBe('ak-74r')
    expect(state.classes[2]!.loadout.primary).toBe('smg-9')
    state = renameClass(state, 0, 'assalto!!')
    expect(state.classes[0]!.name).toBe('ASSALTO')
    const storage = memoryStorage()
    saveArmory(storage, state)
    expect(loadArmory(storage).classes.map((entry) => entry.loadout.primary)).toEqual(['ak-74r', 'ar-07', 'smg-9', 'ar-07', 'ar-07'])
  })
})

describe('modulo di mobilità nel loadout', () => {
  it('parte dal doppio salto, rifiuta moduli bloccati o sconosciuti e resta spento nel TCT', () => {
    expect(DEFAULT_LOADOUT.mobility).toBe('double-jump')
    const locked = normalizeArmory({ level: 5, loadout: { mobility: 'jetpack' } })
    expect(locked.loadout.mobility).toBe('double-jump')
    const unknown = normalizeArmory({ level: 50, loadout: { mobility: 'teletrasporto' } })
    expect(unknown.loadout.mobility).toBe('double-jump')
    const unlocked = normalizeArmory({ level: 30, loadout: { mobility: 'jetpack' } })
    expect(unlocked.loadout.mobility).toBe('jetpack')
    expect(resolveLoadout(unlocked.loadout, DEFAULT_COSMETICS).mobility).toBe('jetpack')
    expect(resolveLoadout(unlocked.loadout, DEFAULT_COSMETICS, {}, false).mobility).toBeNull()
  })
})

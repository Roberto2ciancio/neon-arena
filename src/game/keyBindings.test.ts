import { describe, expect, it } from 'vitest'
import {
  assignKey, buildKeyTranslation, createDefaultBindings, getKeyLabel, isAssignableCode, isDefaultBindings,
  KEY_ACTIONS, KEY_BINDINGS_STORAGE_KEY, loadBindings, normalizeBindings, remapKeyEvent, saveBindings, setActiveBindings, translateCode,
} from './keyBindings'

function memoryStorage() {
  const data: Record<string, string> = {}
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value } }
}

describe('rimappatura dei tasti', () => {
  it('ha un tasto diverso per ogni azione', () => {
    const codes = KEY_ACTIONS.map((action) => action.defaultCode)
    expect(new Set(codes).size).toBe(codes.length)
    expect(isDefaultBindings(createDefaultBindings())).toBe(true)
  })

  it('scambia i tasti quando quello scelto è già usato', () => {
    const next = assignKey(createDefaultBindings(), 'interact', 'KeyF')!
    expect(next.interact).toBe('KeyF')
    expect(next.melee).toBe('KeyE')
    expect(new Set(Object.values(next)).size).toBe(KEY_ACTIONS.length)
  })

  it('rifiuta i tasti riservati', () => {
    expect(assignKey(createDefaultBindings(), 'jump', 'Escape')).toBeNull()
    expect(assignKey(createDefaultBindings(), 'jump', 'Tab')).toBeNull()
    expect(isAssignableCode('KeyK')).toBe(true)
    expect(isAssignableCode('')).toBe(false)
  })

  it('traduce il tasto premuto nel codice predefinito dell’azione', () => {
    const bindings = assignKey(createDefaultBindings(), 'interact', 'KeyH')!
    const table = buildKeyTranslation(bindings)
    expect(translateCode(table, 'KeyH')).toBe('KeyE')
    // Il vecchio tasto dell'azione non fa più nulla.
    expect(translateCode(table, 'KeyE')).toBe('')
    // Tasti non assegnati, Escape e frecce passano invariati.
    expect(translateCode(table, 'KeyW')).toBe('KeyW')
    expect(translateCode(table, 'Escape')).toBe('Escape')
    expect(translateCode(table, 'ArrowUp')).toBe('ArrowUp')
  })

  it('con lo scambio entrambi i tasti funzionano al contrario', () => {
    const table = buildKeyTranslation(assignKey(createDefaultBindings(), 'forward', 'KeyS')!)
    expect(translateCode(table, 'KeyS')).toBe('KeyW')
    expect(translateCode(table, 'KeyW')).toBe('KeyS')
  })

  it('l’evento tradotto conserva ripetizione e preventDefault', () => {
    setActiveBindings(assignKey(createDefaultBindings(), 'jump', 'KeyJ')!)
    let prevented = false
    const event = { code: 'KeyJ', repeat: true, preventDefault: () => { prevented = true } } as unknown as KeyboardEvent
    const mapped = remapKeyEvent(event)
    expect(mapped.code).toBe('Space')
    expect(mapped.repeat).toBe(true)
    mapped.preventDefault()
    expect(prevented).toBe(true)
    setActiveBindings(createDefaultBindings())
  })

  it('ripara salvataggi rovinati e conserva quelli validi', () => {
    expect(normalizeBindings(null)).toEqual(createDefaultBindings())
    expect(normalizeBindings({ jump: 'Escape' }).jump).toBe('Space')
    expect(normalizeBindings({ jump: 'KeyJ' }).jump).toBe('KeyJ')
    // Doppione: si torna ai predefiniti invece di lasciare un'azione senza tasto.
    expect(normalizeBindings({ jump: 'KeyW' })).toEqual(createDefaultBindings())
    const storage = memoryStorage()
    const custom = assignKey(createDefaultBindings(), 'reload', 'KeyK')!
    saveBindings(storage, custom)
    expect(JSON.parse(storage.data[KEY_BINDINGS_STORAGE_KEY]!).reload).toBe('KeyK')
    expect(loadBindings(storage)).toEqual(custom)
    storage.data[KEY_BINDINGS_STORAGE_KEY] = '{rotto'
    expect(loadBindings(storage)).toEqual(createDefaultBindings())
  })

  it('mostra nomi leggibili dei tasti', () => {
    expect(getKeyLabel('KeyE')).toBe('E')
    expect(getKeyLabel('Digit3')).toBe('3')
    expect(getKeyLabel('Space')).toBe('SPAZIO')
    expect(getKeyLabel('ShiftLeft')).toBe('SHIFT')
    expect(getKeyLabel('Numpad4')).toBe('TN 4')
    expect(getKeyLabel('MouseFoo')).toBe('MOUSEFOO')
  })
})

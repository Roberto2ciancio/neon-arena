/**
 * Rimappatura dei tasti. Il gioco continua a ragionare con i codici predefiniti (es. `KeyE` =
 * interagisci): questo modulo traduce il tasto fisico premuto nel codice predefinito dell'azione
 * a cui l'utente l'ha assegnato. Così i controlli touch, che inviano i codici predefiniti, e
 * tutta la logica esistente non cambiano.
 */
import type { KeyValueStorage } from './progression'

export type KeyAction =
  | 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'crouch'
  | 'reload' | 'interact' | 'melee' | 'lethal' | 'tactical' | 'gadget' | 'mobility'
  | 'primary' | 'secondary' | 'meleeSlot' | 'upgrade1' | 'upgrade2' | 'upgrade3'

export interface KeyActionInfo {
  id: KeyAction
  label: string
  /** Codice predefinito (`KeyboardEvent.code`), usato internamente dal gioco. */
  defaultCode: string
  group: 'movimento' | 'combattimento' | 'armi'
}

export const KEY_ACTIONS: readonly KeyActionInfo[] = [
  { id: 'forward', label: 'Avanti', defaultCode: 'KeyW', group: 'movimento' },
  { id: 'back', label: 'Indietro', defaultCode: 'KeyS', group: 'movimento' },
  { id: 'left', label: 'Sinistra', defaultCode: 'KeyA', group: 'movimento' },
  { id: 'right', label: 'Destra', defaultCode: 'KeyD', group: 'movimento' },
  { id: 'sprint', label: 'Scatto', defaultCode: 'ShiftLeft', group: 'movimento' },
  { id: 'jump', label: 'Salto', defaultCode: 'Space', group: 'movimento' },
  { id: 'crouch', label: 'Accovacciati / scivolata', defaultCode: 'KeyC', group: 'movimento' },
  { id: 'mobility', label: 'Modulo di mobilità (Zombie)', defaultCode: 'KeyB', group: 'movimento' },
  { id: 'reload', label: 'Ricarica', defaultCode: 'KeyR', group: 'combattimento' },
  { id: 'interact', label: 'Porte, postazioni, rianimare', defaultCode: 'KeyE', group: 'combattimento' },
  { id: 'melee', label: 'Corpo a corpo / esecuzione', defaultCode: 'KeyF', group: 'combattimento' },
  { id: 'lethal', label: 'Equipaggiamento letale', defaultCode: 'KeyG', group: 'combattimento' },
  { id: 'tactical', label: 'Equipaggiamento tattico', defaultCode: 'KeyQ', group: 'combattimento' },
  { id: 'gadget', label: 'Gadget', defaultCode: 'KeyT', group: 'combattimento' },
  { id: 'primary', label: 'Arma primaria', defaultCode: 'Digit1', group: 'armi' },
  { id: 'secondary', label: 'Arma secondaria', defaultCode: 'Digit2', group: 'armi' },
  { id: 'meleeSlot', label: 'Arma bianca', defaultCode: 'Digit3', group: 'armi' },
  { id: 'upgrade1', label: 'Potenziamento 1', defaultCode: 'KeyZ', group: 'armi' },
  { id: 'upgrade2', label: 'Potenziamento 2', defaultCode: 'KeyX', group: 'armi' },
  { id: 'upgrade3', label: 'Potenziamento 3', defaultCode: 'KeyV', group: 'armi' },
]

export type KeyBindings = Record<KeyAction, string>

export const KEY_BINDINGS_STORAGE_KEY = 'neon-arena:key-bindings:v1'

/** Tasti che non si possono assegnare: pausa e tasti che il browser usa per sé. */
export const RESERVED_CODES: readonly string[] = ['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12']

/** Tasti sempre validi come alternativa (frecce per muoversi, Shift destro per lo scatto). */
const ALWAYS_PASS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftRight'])

const ACTION_IDS = new Set<string>(KEY_ACTIONS.map((action) => action.id))
const CODE_PATTERN = /^[A-Za-z0-9]{2,24}$/

export function createDefaultBindings(): KeyBindings {
  return Object.fromEntries(KEY_ACTIONS.map((action) => [action.id, action.defaultCode])) as KeyBindings
}

export function isAssignableCode(code: string): boolean {
  return CODE_PATTERN.test(code) && !RESERVED_CODES.includes(code)
}

/** Ripara un salvataggio: valori mancanti o non validi tornano al predefinito, niente doppioni. */
export function normalizeBindings(raw: unknown): KeyBindings {
  const bindings = createDefaultBindings()
  if (typeof raw !== 'object' || raw === null) return bindings
  const used = new Set<string>()
  const source = raw as Record<string, unknown>
  for (const action of KEY_ACTIONS) {
    const value = source[action.id]
    if (typeof value === 'string' && isAssignableCode(value) && !used.has(value)) bindings[action.id] = value
    used.add(bindings[action.id])
  }
  // Un predefinito può essere stato preso da un'azione precedente: in quel caso si torna ai predefiniti.
  return new Set(Object.values(bindings)).size === KEY_ACTIONS.length ? bindings : createDefaultBindings()
}

/**
 * Assegna un tasto a un'azione. Se il tasto era già di un'altra azione, le due si scambiano
 * il tasto (nessuna azione resta senza tasto). Null se il tasto non è assegnabile.
 */
export function assignKey(bindings: KeyBindings, action: KeyAction, code: string): KeyBindings | null {
  if (!ACTION_IDS.has(action) || !isAssignableCode(code)) return null
  const next = { ...bindings }
  const previous = next[action]
  const owner = KEY_ACTIONS.find((entry) => next[entry.id] === code)
  if (owner && owner.id !== action) next[owner.id] = previous
  next[action] = code
  return next
}

export function isDefaultBindings(bindings: KeyBindings): boolean {
  return KEY_ACTIONS.every((action) => bindings[action.id] === action.defaultCode)
}

/**
 * Tabella tasto fisico → codice predefinito. I tasti predefiniti rimasti liberi (perché la loro
 * azione ora usa un altro tasto) non fanno più nulla.
 */
export function buildKeyTranslation(bindings: KeyBindings): Map<string, string> {
  const table = new Map<string, string>()
  for (const action of KEY_ACTIONS) table.set(action.defaultCode, '')
  for (const action of KEY_ACTIONS) table.set(bindings[action.id], action.defaultCode)
  return table
}

/** Codice predefinito corrispondente al tasto premuto ('' se il tasto non fa nulla). */
export function translateCode(table: ReadonlyMap<string, string>, physical: string): string {
  if (ALWAYS_PASS.has(physical)) return physical
  return table.get(physical) ?? physical
}

const NAMED_KEYS: Record<string, string> = {
  Space: 'SPAZIO', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT DX', ControlLeft: 'CTRL', ControlRight: 'CTRL DX',
  AltLeft: 'ALT', AltRight: 'ALT GR', Enter: 'INVIO', Backspace: '⌫', CapsLock: 'BLOC MAIUSC',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '\\', Minus: '\'', Equal: 'Ì',
  BracketLeft: 'È', BracketRight: '+', Semicolon: 'Ò', Quote: 'À', Backslash: 'Ù', Comma: ',', Period: '.', Slash: '-',
  IntlBackslash: '<', Insert: 'INS', Delete: 'CANC', Home: 'HOME', End: 'FINE', PageUp: 'PAG ↑', PageDown: 'PAG ↓',
}

/** Nome leggibile di un tasto (tastiera italiana per i simboli). */
export function getKeyLabel(code: string): string {
  if (NAMED_KEYS[code]) return NAMED_KEYS[code]!
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `TN ${code.slice(6)}`
  if (/^F[0-9]{1,2}$/.test(code)) return code
  return code.replace(/(Left|Right)$/, '').toUpperCase()
}

// --- Stato attivo condiviso da Zombie, TCT e interfaccia ------------------------------------
let activeBindings = createDefaultBindings()
let activeTable = buildKeyTranslation(activeBindings)

export function getActiveBindings(): KeyBindings {
  return activeBindings
}

export function setActiveBindings(bindings: KeyBindings): void {
  activeBindings = { ...bindings }
  activeTable = buildKeyTranslation(activeBindings)
}

/** Etichetta del tasto attualmente assegnato a un'azione. */
export function getActionKeyLabel(action: KeyAction): string {
  return getKeyLabel(activeBindings[action])
}

/** Evento da passare al gioco: stesso evento, ma con il codice predefinito dell'azione. */
export interface GameKeyEvent {
  readonly code: string
  readonly repeat: boolean
  preventDefault(): void
}

export function remapKeyEvent(event: KeyboardEvent): GameKeyEvent {
  return { code: translateCode(activeTable, event.code), repeat: event.repeat, preventDefault: () => event.preventDefault() }
}

export function loadBindings(storage: KeyValueStorage): KeyBindings {
  try {
    return normalizeBindings(JSON.parse(storage.getItem(KEY_BINDINGS_STORAGE_KEY) ?? 'null'))
  } catch {
    return createDefaultBindings()
  }
}

export function saveBindings(storage: KeyValueStorage, bindings: KeyBindings): void {
  try {
    storage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // Storage non disponibile: la configurazione resta valida fino alla chiusura della pagina.
  }
}

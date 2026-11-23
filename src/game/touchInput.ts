/**
 * Regole pure dei controlli touch condivise da Zombie e TCT: levetta virtuale, scatto,
 * mappatura dei pulsanti sui tasti e scelta automatica della modalità.
 */
export type TouchAction =
  | 'fire'
  | 'aim'
  | 'jump'
  | 'crouch'
  | 'reload'
  | 'interact'
  | 'melee'
  | 'lethal'
  | 'tactical'
  | 'gadget'
  | 'mobility'
  | 'swap'
  | 'pause'

/** Bersaglio dei controlli touch: implementato da Game e TctGame. */
export interface TouchTarget {
  setTouchMode(enabled: boolean): void
  setTouchMove(x: number, y: number): void
  touchLook(dx: number, dy: number): void
  touchAction(action: TouchAction, down: boolean): void
}

/** I pulsanti che equivalgono a un tasto riusano la stessa logica della tastiera. */
export const TOUCH_ACTION_KEYS: Partial<Record<TouchAction, string>> = {
  jump: 'Space',
  crouch: 'KeyC',
  reload: 'KeyR',
  interact: 'KeyE',
  melee: 'KeyF',
  lethal: 'KeyG',
  tactical: 'KeyQ',
  gadget: 'KeyT',
  mobility: 'KeyB',
}

/** Il pollice si muove meno del mouse: un pixel di trascinamento vale un po' di più. */
export const TOUCH_LOOK_SCALE = 1.6
export const JOYSTICK_DEADZONE = 0.16

/**
 * Converte lo spostamento del pollice dal centro della levetta in un vettore −1…1
 * (x a destra, y in avanti). Sotto la zona morta resta fermo; oltre il raggio satura.
 */
export function joystickVector(dx: number, dy: number, radius: number, deadzone = JOYSTICK_DEADZONE): { x: number; y: number } {
  const length = Math.hypot(dx, dy)
  if (radius <= 0 || length === 0) return { x: 0, y: 0 }
  const raw = Math.min(1, length / radius)
  if (raw <= deadzone) return { x: 0, y: 0 }
  const magnitude = (raw - deadzone) / (1 - deadzone)
  // Lo schermo ha la y verso il basso: spingere in su significa avanzare.
  return { x: (dx / length) * magnitude, y: (-dy / length) * magnitude }
}

/** Levetta spinta quasi fino al bordo e in avanti: scatto automatico. */
export function shouldSprint(x: number, y: number): boolean {
  return y > 0.75 && Math.hypot(x, y) > 0.9
}

export type TouchPreference = 'auto' | 'on' | 'off'

export function normalizeTouchPreference(value: unknown): TouchPreference {
  return value === 'on' || value === 'off' ? value : 'auto'
}

/** In automatico si attivano sui dispositivi il cui puntatore principale è il dito. */
export function shouldUseTouch(preference: TouchPreference, coarsePointer: boolean, hasTouch: boolean): boolean {
  if (preference === 'on') return true
  if (preference === 'off') return false
  return coarsePointer && hasTouch
}

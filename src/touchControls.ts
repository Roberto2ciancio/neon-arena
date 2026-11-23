import { joystickVector, normalizeTouchPreference, shouldUseTouch } from './game/touchInput'
import type { TouchAction, TouchPreference, TouchTarget } from './game/touchInput'
import type { HudData } from './game/types'

export const TOUCH_STORAGE_KEY = 'neon-arena:touch:v1'
const STICK_RADIUS = 56

/** Preferenza salvata; `?touch=on|off` nell'indirizzo la sostituisce (prove e test). */
export function loadTouchPreference(): TouchPreference {
  const fromUrl = new URLSearchParams(window.location.search).get('touch')
  if (fromUrl) return normalizeTouchPreference(fromUrl)
  try {
    return normalizeTouchPreference(window.localStorage.getItem(TOUCH_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

export function saveTouchPreference(preference: TouchPreference): void {
  try {
    window.localStorage.setItem(TOUCH_STORAGE_KEY, preference)
  } catch {}
}

export function resolveTouchEnabled(preference: TouchPreference): boolean {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  return shouldUseTouch(preference, coarse, hasTouch)
}

interface ButtonSpec {
  action: TouchAction
  label: string
  className: string
  aria: string
}

const BUTTONS: ButtonSpec[] = [
  { action: 'fire', label: 'FUOCO', className: 'touch-fire', aria: 'Spara' },
  { action: 'aim', label: 'MIRA', className: 'touch-aim', aria: 'Mira' },
  { action: 'jump', label: '▲', className: 'touch-jump', aria: 'Salta' },
  { action: 'crouch', label: '▼', className: 'touch-crouch', aria: 'Accovacciati o scivola' },
  { action: 'reload', label: 'R', className: 'touch-reload', aria: 'Ricarica' },
  { action: 'swap', label: '⇄', className: 'touch-swap', aria: 'Cambia arma' },
  { action: 'melee', label: '⚔', className: 'touch-melee', aria: 'Corpo a corpo' },
  { action: 'interact', label: 'USA', className: 'touch-interact', aria: 'Usa, compra o rianima' },
  { action: 'lethal', label: 'G', className: 'touch-lethal', aria: 'Letale' },
  { action: 'tactical', label: 'Q', className: 'touch-tactical', aria: 'Tattico' },
  { action: 'gadget', label: 'T', className: 'touch-gadget', aria: 'Gadget' },
  { action: 'mobility', label: '⇈', className: 'touch-mobility', aria: 'Modulo di mobilità' },
  { action: 'pause', label: 'II', className: 'touch-pause', aria: 'Pausa' },
]

/**
 * Livello dei controlli touch sopra il gioco: levetta dinamica a sinistra, trascinamento per
 * la visuale a destra (anche tenendo premuto FUOCO) e pulsanti d'azione. Usa i Pointer Events:
 * ogni dito ha il suo identificativo, quindi si può camminare, guardare e sparare insieme.
 */
export class TouchControls {
  readonly root: HTMLElement
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement
  private readonly buttons = new Map<TouchAction, HTMLButtonElement>()
  private movePointer: number | null = null
  private moveOrigin = { x: 0, y: 0 }
  /** Dita che ruotano la visuale (zona destra o pulsante FUOCO) con l'ultima posizione. */
  private readonly lookPointers = new Map<number, { x: number; y: number }>()
  private readonly heldButtons = new Map<number, TouchAction>()
  private enabled = false
  private visible = false

  constructor(container: HTMLElement, private readonly getTarget: () => TouchTarget | null) {
    this.root = document.createElement('div')
    this.root.id = 'touch-controls'
    this.root.className = 'touch-controls hidden'
    const moveZone = document.createElement('div')
    moveZone.className = 'touch-zone touch-move-zone'
    const lookZone = document.createElement('div')
    lookZone.className = 'touch-zone touch-look-zone'
    this.stick = document.createElement('div')
    this.stick.className = 'touch-stick'
    this.knob = document.createElement('i')
    this.stick.append(this.knob)
    this.root.append(moveZone, lookZone, this.stick)
    for (const spec of BUTTONS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `touch-btn ${spec.className}`
      button.dataset.action = spec.action
      button.setAttribute('aria-label', spec.aria)
      button.innerHTML = `<span>${spec.label}</span><small></small>`
      this.buttons.set(spec.action, button)
      this.root.append(button)
      button.addEventListener('pointerdown', (event) => this.pressButton(event, spec.action))
    }
    container.append(this.root)

    moveZone.addEventListener('pointerdown', this.startMove)
    lookZone.addEventListener('pointerdown', this.startLook)
    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('pointerup', this.onPointerEnd)
    window.addEventListener('pointercancel', this.onPointerEnd)
    this.root.addEventListener('contextmenu', (event) => event.preventDefault())
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    document.body.classList.toggle('touch-mode', enabled)
    if (!enabled) this.setVisible(false)
  }

  /** Visibile solo durante il combattimento; nascondendolo si rilasciano tutti i comandi. */
  setVisible(visible: boolean): void {
    const next = visible && this.enabled
    if (next === this.visible) return
    this.visible = next
    this.root.classList.toggle('hidden', !next)
    if (!next) this.releaseAll()
  }

  /** Etichette che dipendono dalla partita: interazione disponibile, ricariche, mira. */
  update(data: HudData): void {
    if (!this.visible) return
    const interact = this.buttons.get('interact')!
    const canInteract = data.interaction !== null || data.coop?.status === 'alive' && (data.coop.revive > 0 || data.coop.team.some((member) => member.status === 'down'))
    interact.classList.toggle('available', canInteract)
    setSmall(interact, data.interaction ? (data.interaction.cost > 0 ? `⬢${data.interaction.cost}` : '') : '')
    const slots = ['lethal', 'tactical', 'gadget'] as const
    data.equipment.forEach((entry, index) => {
      const button = this.buttons.get(slots[index]!)
      if (!button) return
      button.classList.toggle('cooldown', entry.cooldown > 0)
      setSmall(button, entry.cooldown > 0 ? `${Math.ceil(entry.cooldown)}` : '')
    })
    const mobility = this.buttons.get('mobility')!
    mobility.classList.toggle('hidden', !data.mobility?.usesKey)
    if (data.mobility) {
      mobility.classList.toggle('cooldown', data.mobility.charges === 0)
      setSmall(mobility, data.mobility.maxCharges > 1 ? String(data.mobility.charges) : data.mobility.charges === 0 && data.mobility.cooldown > 0 ? `${Math.ceil(data.mobility.cooldown)}` : '')
    }
    this.buttons.get('aim')!.classList.toggle('active', data.aiming)
    this.buttons.get('melee')!.classList.toggle('available', data.execution === true)
    this.buttons.get('reload')!.classList.toggle('alert', !data.melee && data.ammo === 0)
    const tct = data.tct !== undefined
    this.buttons.get('interact')!.classList.toggle('hidden', tct)
  }

  private readonly startMove = (event: PointerEvent): void => {
    if (this.movePointer !== null) return
    event.preventDefault()
    this.movePointer = event.pointerId
    this.moveOrigin = { x: event.clientX, y: event.clientY }
    this.stick.style.left = `${event.clientX}px`
    this.stick.style.top = `${event.clientY}px`
    this.knob.style.transform = 'translate(-50%, -50%)'
    this.stick.classList.add('active')
  }

  private readonly startLook = (event: PointerEvent): void => {
    event.preventDefault()
    this.lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  private pressButton(event: PointerEvent, action: TouchAction): void {
    event.preventDefault()
    event.stopPropagation()
    if (this.heldButtons.has(event.pointerId)) return
    this.heldButtons.set(event.pointerId, action)
    this.buttons.get(action)?.classList.add('pressed')
    // Tenendo premuto FUOCO si può anche trascinare per mirare.
    if (action === 'fire') this.lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    this.getTarget()?.touchAction(action, true)
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.visible) return
    if (event.pointerId === this.movePointer) {
      event.preventDefault()
      const dx = event.clientX - this.moveOrigin.x
      const dy = event.clientY - this.moveOrigin.y
      const vector = joystickVector(dx, dy, STICK_RADIUS)
      const length = Math.hypot(dx, dy)
      const clamp = length > STICK_RADIUS ? STICK_RADIUS / length : 1
      this.knob.style.transform = `translate(calc(-50% + ${dx * clamp}px), calc(-50% + ${dy * clamp}px))`
      this.getTarget()?.setTouchMove(vector.x, vector.y)
      return
    }
    const last = this.lookPointers.get(event.pointerId)
    if (!last) return
    event.preventDefault()
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    last.x = event.clientX
    last.y = event.clientY
    if (dx !== 0 || dy !== 0) this.getTarget()?.touchLook(dx, dy)
  }

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointer) {
      this.movePointer = null
      this.stick.classList.remove('active')
      this.getTarget()?.setTouchMove(0, 0)
    }
    this.lookPointers.delete(event.pointerId)
    const action = this.heldButtons.get(event.pointerId)
    if (action) {
      this.heldButtons.delete(event.pointerId)
      this.buttons.get(action)?.classList.remove('pressed')
      this.getTarget()?.touchAction(action, false)
    }
  }

  private releaseAll(): void {
    const target = this.getTarget()
    if (this.movePointer !== null) target?.setTouchMove(0, 0)
    this.movePointer = null
    this.stick.classList.remove('active')
    this.lookPointers.clear()
    for (const action of this.heldButtons.values()) {
      this.buttons.get(action)?.classList.remove('pressed')
      if (action !== 'pause') target?.touchAction(action, false)
    }
    this.heldButtons.clear()
  }
}

function setSmall(button: HTMLElement, text: string): void {
  const small = button.querySelector('small')
  if (small && small.textContent !== text) small.textContent = text
}

/** Schermo intero e orientamento orizzontale: richiesti durante un tocco dell'utente. */
export function enterImmersive(): void {
  const root = document.documentElement
  if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
    root.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> }
      return orientation.lock?.('landscape')
    }).catch(() => undefined)
  }
}

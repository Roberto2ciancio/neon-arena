import * as THREE from 'three'
import type { CollisionObstacle } from './collision'
import { CROUCH_HEIGHT, findMantleLedge, hasHeadroom, MANTLE_MAX_HEIGHT, moveBody, STAND_HEIGHT } from './world'
import type { Body } from './world'

export const PLAYER_RADIUS = 0.42
const STAND_EYE = 1.65
const CROUCH_EYE = 1.02
const SLIDE_EYE = 0.85
const JUMP_SPEED = 6.6
const SLIDE_DURATION = 0.75
const SLIDE_COOLDOWN = 0.9
const SLIDE_BOOST = 1.95
const SPRINT_MULTIPLIER = 1.45
const CROUCH_MULTIPLIER = 0.5

export { MANTLE_MAX_HEIGHT }
/** Dopo aver lasciato un bordo si può ancora saltare per questo tempo. */
export const COYOTE_TIME = 0.1
/** Un salto premuto in aria poco prima di atterrare parte all'atterraggio. */
export const JUMP_BUFFER = 0.12
/** Tetto della velocità orizzontale di un salto dalla scivolata (multiplo della velocità base). */
export const SLIDE_HOP_CAP = 1.7
/** Velocità di caduta oltre la quale l'atterraggio rallenta (circa 3 m di caduta). */
export const HARD_LANDING_SPEED = 10.5
const HARD_LANDING_SLOW = 0.4
const HARD_LANDING_MULTIPLIER = 0.55
const ROLL_DURATION = 0.45
/** Il bordo deve trovarsi al massimo così sopra i piedi nel momento in cui ci si aggrappa. */
const MANTLE_REACH = 1.6
/** Durata della salita: più lunga per i bordi alti. */
const MANTLE_BASE_DURATION = 0.3
const MANTLE_DURATION_PER_METER = 0.1
const MANTLE_PROBE = 0.3
/** In aria: accelerazione per cambiare direzione e decelerazione quando si va più veloci del normale. */
const AIR_CONTROL = 5.5
const AIR_MOMENTUM_DRAG = 1.2

export interface ControllerInput {
  forward: number
  right: number
  sprint: boolean
  crouch: boolean
  /** Mira, fuoco e ricarica impediscono lo scatto. */
  busy: boolean
}

export interface ControllerEnvironment {
  speed: number
  solids: readonly CollisionObstacle[]
  arenaLimit: number
}

/**
 * Movimento in prima persona condiviso fra modalità zombie e TCT: accelerazione, scatto,
 * salto, accovacciamento con controllo del soffitto, scivolata e feedback di camera
 * (oscillazione del passo, atterraggio, inclinazione laterale, gradini ammorbiditi).
 */
export class PlayerController {
  readonly body: Body = { position: new THREE.Vector3(), velocityY: 0, grounded: true }
  readonly velocity = new THREE.Vector3()
  crouched = false
  sprinting = false
  moving = false
  slideTimer = 0
  bobPhase = 0
  landingKick = 0
  roll = 0
  /** Rallentamento dopo un atterraggio pesante (secondi). */
  landingSlow = 0
  private slideCooldown = 0
  private coyoteTimer = 0
  private jumpBuffer = 0
  private rollTimer = 0
  private mantleTimer = 0
  private mantleDuration = MANTLE_BASE_DURATION
  private lastGroundY = 0
  private baseSpeed = 6
  private readonly mantleFrom = new THREE.Vector3()
  private readonly mantleTo = new THREE.Vector3()
  private readonly slideDirection = new THREE.Vector3()
  private eyeOffset = STAND_EYE
  private smoothY = 0
  private strafe = 0

  get position(): THREE.Vector3 {
    return this.body.position
  }

  get sliding(): boolean {
    return this.slideTimer > 0
  }

  /** Tirandosi su un bordo: niente controllo né armi per un attimo. */
  get mantling(): boolean {
    return this.mantleTimer > 0
  }

  /** Rotolamento dopo un atterraggio pesante da accovacciati. */
  get rolling(): boolean {
    return this.rollTimer > 0
  }

  /** Avanzamento 0–1 del rotolamento, per la rotazione della visuale. */
  get rollProgress(): number {
    return this.rollTimer > 0 ? 1 - this.rollTimer / ROLL_DURATION : 0
  }

  get height(): number {
    return this.crouched ? CROUCH_HEIGHT : STAND_HEIGHT
  }

  /** Fattore 0–1 di accovacciamento per pose e animazioni. */
  get crouchAmount(): number {
    return THREE.MathUtils.clamp((STAND_EYE - this.eyeOffset) / (STAND_EYE - CROUCH_EYE), 0, 1.3)
  }

  get strafeAmount(): number {
    return this.strafe
  }

  reset(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z)
    this.body.velocityY = 0
    this.body.grounded = true
    this.velocity.set(0, 0, 0)
    this.crouched = false
    this.sprinting = false
    this.moving = false
    this.slideTimer = 0
    this.slideCooldown = 0
    this.landingKick = 0
    this.roll = 0
    this.landingSlow = 0
    this.coyoteTimer = 0
    this.jumpBuffer = 0
    this.rollTimer = 0
    this.mantleTimer = 0
    this.lastGroundY = y
    this.eyeOffset = STAND_EYE
    this.smoothY = y
  }

  jump(solids: readonly CollisionObstacle[]): boolean {
    if (this.mantling) return false
    if (!this.body.grounded && this.coyoteTimer <= 0) {
      // In aria: il salto resta memorizzato per un attimo e parte all'atterraggio.
      this.jumpBuffer = JUMP_BUFFER
      return false
    }
    if (this.crouched && !this.sliding) {
      if (!hasHeadroom(this.body.position, PLAYER_RADIUS, STAND_HEIGHT, solids)) return false
      this.crouched = false
    }
    // Il salto dalla scivolata conserva lo slancio, fino a un tetto (equilibrio del TCT).
    if (this.sliding) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z)
      const cap = this.baseSpeed * SLIDE_HOP_CAP
      if (speed > cap) this.velocity.multiplyScalar(cap / speed)
      this.crouched = false
    }
    this.slideTimer = 0
    this.body.velocityY = JUMP_SPEED
    this.body.grounded = false
    this.coyoteTimer = 0
    this.jumpBuffer = 0
    return true
  }

  /** Cerca un bordo davanti e, se raggiungibile, avvia la salita. */
  private tryMantle(yaw: number, solids: readonly CollisionObstacle[]): boolean {
    const direction = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const ledge = findMantleLedge(this.body.position, direction, PLAYER_RADIUS, this.lastGroundY, solids)
    if (ledge === null || ledge <= this.body.position.y || ledge - this.body.position.y > MANTLE_REACH) return false
    this.mantleFrom.copy(this.body.position)
    this.mantleTo.copy(this.body.position).addScaledVector(direction, PLAYER_RADIUS + MANTLE_PROBE).setY(ledge)
    this.mantleDuration = MANTLE_BASE_DURATION + MANTLE_DURATION_PER_METER * (ledge - this.body.position.y)
    this.mantleTimer = this.mantleDuration
    this.velocity.set(0, 0, 0)
    this.body.velocityY = 0
    this.slideTimer = 0
    this.jumpBuffer = 0
    return true
  }

  /** Salita sul bordo: prima su, poi avanti. */
  private updateMantle(delta: number, solids: readonly CollisionObstacle[]): void {
    this.mantleTimer = Math.max(0, this.mantleTimer - delta)
    const t = 1 - this.mantleTimer / this.mantleDuration
    const up = 1 - (1 - Math.min(1, t / 0.6)) ** 2
    const across = Math.max(0, Math.min(1, (t - 0.35) / 0.65))
    const position = this.body.position
    position.y = THREE.MathUtils.lerp(this.mantleFrom.y, this.mantleTo.y, up)
    position.x = THREE.MathUtils.lerp(this.mantleFrom.x, this.mantleTo.x, across)
    position.z = THREE.MathUtils.lerp(this.mantleFrom.z, this.mantleTo.z, across)
    this.body.velocityY = 0
    this.body.grounded = false
    if (this.mantleTimer <= 0) {
      position.copy(this.mantleTo)
      this.body.grounded = true
      this.lastGroundY = position.y
      this.crouched = !hasHeadroom(position, PLAYER_RADIUS, STAND_HEIGHT, solids)
    }
  }

  /** Pressione del tasto accovacciati: durante lo scatto avvia la scivolata. */
  pressCrouch(): boolean {
    if (!this.sprinting || !this.body.grounded || this.slideCooldown > 0 || this.velocity.lengthSq() < 4) return false
    this.slideTimer = SLIDE_DURATION
    this.slideCooldown = SLIDE_COOLDOWN + SLIDE_DURATION
    this.slideDirection.copy(this.velocity).setY(0).normalize()
    this.crouched = true
    this.sprinting = false
    return true
  }

  update(delta: number, input: ControllerInput, yaw: number, environment: ControllerEnvironment): { landingSpeed: number } {
    this.baseSpeed = environment.speed
    this.slideCooldown = Math.max(0, this.slideCooldown - delta)
    this.landingSlow = Math.max(0, this.landingSlow - delta)
    this.rollTimer = Math.max(0, this.rollTimer - delta)
    this.jumpBuffer = Math.max(0, this.jumpBuffer - delta)
    if (this.body.grounded) {
      this.coyoteTimer = COYOTE_TIME
      this.lastGroundY = this.body.position.y
      if (this.jumpBuffer > 0) this.jump(environment.solids)
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - delta)
    }
    if (this.mantling) {
      this.updateMantle(delta, environment.solids)
      this.updateCamera(delta, input, 0)
      return { landingSpeed: 0 }
    }
    const wish = new THREE.Vector3(
      input.right * Math.cos(yaw) - input.forward * Math.sin(yaw),
      0,
      -input.right * Math.sin(yaw) - input.forward * Math.cos(yaw),
    )
    // Tastiera: diagonali normalizzate. Levetta touch: la spinta parziale cammina più piano.
    if (wish.lengthSq() > 1) wish.normalize()
    this.moving = wish.lengthSq() > 0

    if (this.sliding) {
      this.slideTimer = Math.max(0, this.slideTimer - delta)
      const progress = 1 - this.slideTimer / SLIDE_DURATION
      const speed = environment.speed * THREE.MathUtils.lerp(SLIDE_BOOST, CROUCH_MULTIPLIER + 0.3, progress * progress)
      // Leggera sterzata durante la scivolata.
      if (this.moving) this.slideDirection.lerp(wish, 1 - Math.exp(-delta * 1.5)).normalize()
      this.velocity.copy(this.slideDirection).multiplyScalar(speed)
    } else {
      const wantsCrouch = input.crouch
      if (wantsCrouch) this.crouched = true
      else if (this.crouched && hasHeadroom(this.body.position, PLAYER_RADIUS, STAND_HEIGHT, environment.solids)) this.crouched = false
      this.sprinting = input.sprint && this.moving && !input.busy && !this.crouched && input.forward > 0
      let multiplier = this.rolling ? 1 : this.crouched ? CROUCH_MULTIPLIER : this.sprinting ? SPRINT_MULTIPLIER : 1
      if (this.landingSlow > 0) multiplier *= HARD_LANDING_MULTIPLIER
      const target = wish.multiplyScalar(environment.speed * multiplier)
      let acceleration = 14
      if (!this.body.grounded) {
        // In aria: buon controllo, ma lo slancio di un salto dalla scivolata si perde piano.
        const faster = this.velocity.lengthSq() > target.lengthSq() + 0.01
        acceleration = faster && this.velocity.dot(target) >= 0 ? AIR_MOMENTUM_DRAG : AIR_CONTROL
      }
      this.velocity.lerp(target, 1 - Math.exp(-delta * acceleration))
    }

    const result = moveBody(this.body, this.velocity.clone().multiplyScalar(delta), delta, PLAYER_RADIUS, this.height, environment.solids, environment.arenaLimit)
    if (!this.body.grounded && this.sliding) this.slideTimer = 0
    // Saltando contro un bordo raggiungibile ci si tira su.
    if (!this.body.grounded && input.forward > 0 && this.body.velocityY < 4) this.tryMantle(yaw, environment.solids)
    if (result.landingSpeed > HARD_LANDING_SPEED) {
      if (input.crouch || this.sliding) {
        this.rollTimer = ROLL_DURATION
        this.landingSlow = 0
      } else {
        this.landingSlow = HARD_LANDING_SLOW
      }
    }
    this.updateCamera(delta, input, result.landingSpeed)
    return result
  }

  private updateCamera(delta: number, input: ControllerInput, landingSpeed: number): void {

    // Feedback di camera.
    const targetEye = this.sliding || this.rolling || this.mantling ? SLIDE_EYE : this.crouched ? CROUCH_EYE : STAND_EYE
    this.eyeOffset = THREE.MathUtils.lerp(this.eyeOffset, targetEye, 1 - Math.exp(-delta * 14))
    if (this.body.grounded && Math.abs(this.body.position.y - this.smoothY) < 0.8) {
      this.smoothY = THREE.MathUtils.lerp(this.smoothY, this.body.position.y, 1 - Math.exp(-delta * 16))
    } else {
      this.smoothY = this.body.position.y
    }
    if (landingSpeed > 4) this.landingKick = Math.min(0.32, (landingSpeed - 3) * 0.045)
    this.landingKick = Math.max(0, this.landingKick - delta * 1.1)
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.body.grounded && !this.sliding && horizontalSpeed > 0.5) this.bobPhase += delta * horizontalSpeed * 1.45
    this.strafe = THREE.MathUtils.lerp(this.strafe, input.right, 1 - Math.exp(-delta * 8))
    const targetRoll = -this.strafe * 0.014 + (this.sliding ? 0.075 : 0)
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-delta * 9))
  }

  /** Posizione dell'occhio con oscillazione del passo e affondo all'atterraggio. */
  getEyePosition(out: THREE.Vector3, reducedMotion: boolean): THREE.Vector3 {
    const bobScale = this.sprinting ? 0.05 : this.crouched ? 0.015 : 0.026
    const bob = reducedMotion ? 0 : Math.abs(Math.sin(this.bobPhase)) * bobScale
    const landing = reducedMotion ? 0 : this.landingKick
    return out.set(this.body.position.x, this.smoothY + this.eyeOffset + bob - landing, this.body.position.z)
  }

  getBob(reducedMotion: boolean): number {
    return reducedMotion ? 0 : Math.sin(this.bobPhase)
  }
}

/** Legge l'input di movimento dai tasti premuti. */
export function readMovementInput(keys: ReadonlySet<string>, busy: boolean): ControllerInput {
  return {
    forward: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
    right: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    crouch: keys.has('KeyC'),
    busy,
  }
}

/** Abbassamento della visuale durante il rotolamento (radianti, 0 quando non si rotola). */
export function getRollDip(progress: number): number {
  return progress > 0 && progress < 1 ? -Math.sin(progress * Math.PI) * 0.55 : 0
}

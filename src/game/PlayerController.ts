import * as THREE from 'three'
import type { CollisionObstacle } from './collision'
import { CROUCH_HEIGHT, hasHeadroom, moveBody, STAND_HEIGHT } from './world'
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
  private slideCooldown = 0
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
    this.eyeOffset = STAND_EYE
    this.smoothY = y
  }

  jump(solids: readonly CollisionObstacle[]): boolean {
    if (!this.body.grounded) return false
    if (this.crouched && !this.sliding) {
      if (!hasHeadroom(this.body.position, PLAYER_RADIUS, STAND_HEIGHT, solids)) return false
      this.crouched = false
    }
    // Il salto dalla scivolata conserva lo slancio.
    this.slideTimer = 0
    this.body.velocityY = JUMP_SPEED
    this.body.grounded = false
    return true
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
    this.slideCooldown = Math.max(0, this.slideCooldown - delta)
    const wish = new THREE.Vector3(
      input.right * Math.cos(yaw) - input.forward * Math.sin(yaw),
      0,
      -input.right * Math.sin(yaw) - input.forward * Math.cos(yaw),
    )
    if (wish.lengthSq() > 0) wish.normalize()
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
      const multiplier = this.crouched ? CROUCH_MULTIPLIER : this.sprinting ? SPRINT_MULTIPLIER : 1
      const target = wish.multiplyScalar(environment.speed * multiplier)
      const acceleration = this.body.grounded ? 14 : 4
      this.velocity.lerp(target, 1 - Math.exp(-delta * acceleration))
    }

    const result = moveBody(this.body, this.velocity.clone().multiplyScalar(delta), delta, PLAYER_RADIUS, this.height, environment.solids, environment.arenaLimit)
    if (!this.body.grounded && this.sliding) this.slideTimer = 0

    // Feedback di camera.
    const targetEye = this.sliding ? SLIDE_EYE : this.crouched ? CROUCH_EYE : STAND_EYE
    this.eyeOffset = THREE.MathUtils.lerp(this.eyeOffset, targetEye, 1 - Math.exp(-delta * 14))
    if (this.body.grounded && Math.abs(this.body.position.y - this.smoothY) < 0.8) {
      this.smoothY = THREE.MathUtils.lerp(this.smoothY, this.body.position.y, 1 - Math.exp(-delta * 16))
    } else {
      this.smoothY = this.body.position.y
    }
    if (result.landingSpeed > 4) this.landingKick = Math.min(0.32, (result.landingSpeed - 3) * 0.045)
    this.landingKick = Math.max(0, this.landingKick - delta * 1.1)
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.body.grounded && !this.sliding && horizontalSpeed > 0.5) this.bobPhase += delta * horizontalSpeed * 1.45
    this.strafe = THREE.MathUtils.lerp(this.strafe, input.right, 1 - Math.exp(-delta * 8))
    const targetRoll = -this.strafe * 0.014 + (this.sliding ? 0.075 : 0)
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 1 - Math.exp(-delta * 9))
    return result
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

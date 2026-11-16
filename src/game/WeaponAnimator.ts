import * as THREE from 'three'

export interface WeaponPoseInput {
  aiming: boolean
  sprinting: boolean
  sliding: boolean
  crouchAmount: number
  bob: number
  strafe: number
  /** Avanzamento della ricarica 0–1, oppure -1 se non si sta ricaricando. */
  reloadProgress: number
  recoil: number
  landingKick: number
  airborne: boolean
  reducedMotion: boolean
}

const HIP = new THREE.Vector3(0.32, -0.29, -0.8)
const ADS = new THREE.Vector3(0, -0.17, -0.85)
const SPRINT = new THREE.Vector3(0.36, -0.42, -0.72)
const SLIDE = new THREE.Vector3(0.3, -0.36, -0.76)
const SWITCH_DURATION = 0.32

/**
 * Animazione dell'arma in prima persona: posizione di anca, mira, scatto e scivolata,
 * oscillazione del passo, inerzia del mouse, ricarica, rinculo, cambio arma e atterraggi.
 */
export class WeaponAnimator {
  private readonly position = HIP.clone()
  private readonly rotation = new THREE.Euler()
  private swayX = 0
  private swayY = 0
  private targetSwayX = 0
  private targetSwayY = 0
  private switchTimer = 0
  private time = 0

  addLook(movementX: number, movementY: number): void {
    this.targetSwayX = THREE.MathUtils.clamp(this.targetSwayX + movementX * 0.0009, -0.08, 0.08)
    this.targetSwayY = THREE.MathUtils.clamp(this.targetSwayY + movementY * 0.0009, -0.08, 0.08)
  }

  startSwitch(): void {
    this.switchTimer = SWITCH_DURATION
  }

  get switching(): boolean {
    return this.switchTimer > SWITCH_DURATION * 0.45
  }

  reset(): void {
    this.position.copy(HIP)
    this.rotation.set(0, 0, 0)
    this.swayX = this.swayY = this.targetSwayX = this.targetSwayY = 0
    this.switchTimer = 0
  }

  apply(group: THREE.Object3D, delta: number, input: WeaponPoseInput): void {
    this.time += delta
    this.switchTimer = Math.max(0, this.switchTimer - delta)
    const motion = input.reducedMotion ? 0.25 : 1
    const base = input.sliding ? SLIDE : input.aiming ? ADS : input.sprinting ? SPRINT : HIP
    const target = base.clone()
    // Respiro da fermi e oscillazione del passo.
    const breathe = Math.sin(this.time * 1.6) * 0.004
    if (!input.aiming) {
      target.x += Math.cos(input.bob) * 0.012 * motion * (input.sprinting ? 2 : 1)
      target.y += (Math.abs(Math.sin(input.bob)) * -0.018 * (input.sprinting ? 2.2 : 1) + breathe) * motion
    } else {
      target.y += breathe * 0.3
    }
    target.y -= input.crouchAmount * 0.03 + input.landingKick * 0.35 * motion
    if (input.airborne) target.y += 0.025 * motion
    target.z += input.recoil * 0.09
    // Cambio arma: l'arma scende e risale.
    const switchPhase = this.switchTimer > 0 ? Math.sin((this.switchTimer / SWITCH_DURATION) * Math.PI) : 0
    target.y -= switchPhase * 0.38

    this.swayX = THREE.MathUtils.lerp(this.swayX, this.targetSwayX, 1 - Math.exp(-delta * 10))
    this.swayY = THREE.MathUtils.lerp(this.swayY, this.targetSwayY, 1 - Math.exp(-delta * 10))
    this.targetSwayX = THREE.MathUtils.lerp(this.targetSwayX, 0, 1 - Math.exp(-delta * 7))
    this.targetSwayY = THREE.MathUtils.lerp(this.targetSwayY, 0, 1 - Math.exp(-delta * 7))
    const swayScale = (input.aiming ? 0.25 : 1) * motion
    target.x -= this.swayX * 0.5 * swayScale
    target.y += this.swayY * 0.4 * swayScale

    this.position.lerp(target, 1 - Math.exp(-delta * (input.aiming ? 20 : 14)))
    group.position.copy(this.position)

    const reload = input.reloadProgress >= 0 ? Math.sin(input.reloadProgress * Math.PI) * motion : 0
    const rotX = -input.recoil * 0.7 + reload * 0.75 + switchPhase * 0.7 + this.swayY * 1.2 * swayScale + (input.sprinting ? -0.12 : 0)
    const rotY = this.swayX * 1.4 * swayScale + (input.sprinting ? 0.45 : 0)
    const rotZ = reload * 0.5 - input.strafe * 0.06 * motion + (input.sliding ? 0.28 : 0) + (input.sprinting ? 0.15 : 0)
    this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, rotX, 1 - Math.exp(-delta * 16))
    this.rotation.y = THREE.MathUtils.lerp(this.rotation.y, rotY, 1 - Math.exp(-delta * 12))
    this.rotation.z = THREE.MathUtils.lerp(this.rotation.z, rotZ, 1 - Math.exp(-delta * 12))
    group.rotation.copy(this.rotation)
  }
}

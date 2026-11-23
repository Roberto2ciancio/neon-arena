import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { CollisionObstacle } from './collision'
import { COYOTE_TIME, HARD_LANDING_SPEED, JUMP_BUFFER, MANTLE_MAX_HEIGHT, PlayerController, SLIDE_HOP_CAP } from './PlayerController'
import type { ControllerInput } from './PlayerController'
import { findMantleLedge } from './world'
import { DASH_DURATION, DASH_SPEED, DOUBLE_JUMP_SPEED, GLIDE_FALL_SPEED, GRAPPLE_MAX_TIME, JETPACK_CEILING, JETPACK_FUEL, WALL_JUMP_OUT, WALL_JUMP_UP, WALL_RUN_DURATION } from './mobility'

const solid = (id: string, min: [number, number, number], max: [number, number, number]): CollisionObstacle => ({
  id,
  box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
})

const idle: ControllerInput = { forward: 0, right: 0, sprint: false, crouch: false, busy: false }
const forward: ControllerInput = { ...idle, forward: 1 }
const sprint: ControllerInput = { ...forward, sprint: true }
const STEP = 1 / 60
// yaw 0: "avanti" è -z.
const environment = (solids: CollisionObstacle[] = []) => ({ speed: 6, solids, arenaLimit: 60 })

function run(controller: PlayerController, seconds: number, input: ControllerInput, solids: CollisionObstacle[] = [], onFrame?: () => void): void {
  for (let time = 0; time < seconds; time += STEP) {
    controller.update(STEP, input, 0, environment(solids))
    onFrame?.()
  }
}

/** Cassa davanti al giocatore (verso -z) alta `height`. */
const crate = (height: number) => solid('crate', [-1, 0, -3], [1, height, -1.6])

describe('aggrapparsi ai bordi', () => {
  it('trova il bordo raggiungibile solo fino all’altezza massima e con spazio sopra', () => {
    const origin = new THREE.Vector3(0, 0, -1)
    const direction = new THREE.Vector3(0, 0, -1)
    expect(findMantleLedge(origin, direction, 0.42, 0, [crate(1.4)])).toBeCloseTo(1.4)
    expect(findMantleLedge(origin, direction, 0.42, 0, [crate(MANTLE_MAX_HEIGHT + 0.3)])).toBeNull()
    // Gradino basso: si sale camminando, non serve aggrapparsi.
    expect(findMantleLedge(origin, direction, 0.42, 0, [crate(0.3)])).toBeNull()
    // Soffitto basso sopra la cassa: niente spazio per salirci.
    expect(findMantleLedge(origin, direction, 0.42, 0, [crate(1.4), solid('roof', [-1, 2, -3], [1, 3.4, -1.6])])).toBeNull()
  })

  it('saltando contro una cassa di 1,5 m ci si tira su in automatico', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, -1)
    const solids = [crate(1.5)]
    controller.jump(solids)
    let mantled = false
    // Avanti finché la salita non è finita, poi fermo (altrimenti scende dall'altro lato).
    for (let time = 0; time < 1.2 && !(mantled && !controller.mantling); time += STEP) {
      controller.update(STEP, forward, 0, environment(solids))
      mantled ||= controller.mantling
    }
    run(controller, 0.3, idle, solids)
    expect(mantled).toBe(true)
    expect(controller.position.y).toBeCloseTo(1.5)
    expect(controller.body.grounded).toBe(true)
    expect(controller.position.z).toBeLessThan(-1.6)
  })

  it('si tira su anche sulle casse alte, i furgoni e i container delle mappe (2,2–2,6 m)', () => {
    for (const height of [2.2, 2.4, 2.6]) {
      const controller = new PlayerController()
      controller.reset(0, 0, -1)
      const solids = [crate(height)]
      controller.jump(solids)
      let mantled = false
      for (let time = 0; time < 1.5 && !(mantled && !controller.mantling); time += STEP) {
        controller.update(STEP, forward, 0, environment(solids))
        mantled ||= controller.mantling
      }
      run(controller, 0.2, idle, solids)
      expect(controller.position.y, `cassa da ${height} m`).toBeCloseTo(height)
    }
  })

  it('non si aggrappa a un muro troppo alto né senza spingere in avanti', () => {
    const tall = new PlayerController()
    tall.reset(0, 0, -1)
    const wall = [crate(MANTLE_MAX_HEIGHT + 0.4)]
    tall.jump(wall)
    run(tall, 1.2, forward, wall)
    expect(tall.position.y).toBe(0)

    const still = new PlayerController()
    still.reset(0, 0, -1)
    const box = [crate(1.5)]
    still.jump(box)
    run(still, 1.2, idle, box)
    expect(still.position.y).toBe(0)
  })
})

describe('tolleranze del salto', () => {
  it('si può ancora saltare per un attimo dopo aver lasciato il bordo (coyote time)', () => {
    const ledge = [solid('ledge', [-2, 0, -2], [2, 1, 2])]
    const controller = new PlayerController()
    controller.reset(0, 1, 1.9)
    // Cammina oltre il bordo verso +z.
    const back: ControllerInput = { ...idle, forward: -1 }
    let airborneFrames = 0
    for (let time = 0; time < 1 && airborneFrames < 3; time += STEP) {
      controller.update(STEP, back, 0, environment(ledge))
      if (!controller.body.grounded) airborneFrames += 1
    }
    expect(controller.body.grounded).toBe(false)
    expect(airborneFrames * STEP).toBeLessThan(COYOTE_TIME)
    expect(controller.jump(ledge)).toBe(true)
    expect(controller.body.velocityY).toBeGreaterThan(0)

    // Troppo tardi: niente salto.
    const late = new PlayerController()
    late.reset(0, 1, 1.9)
    for (let time = 0; time < 1 && late.body.grounded; time += STEP) late.update(STEP, back, 0, environment(ledge))
    run(late, COYOTE_TIME + 0.05, back, ledge)
    expect(late.jump(ledge)).toBe(false)
  })

  it('il salto premuto poco prima di atterrare parte all’atterraggio (jump buffer)', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, 0)
    controller.jump([])
    // Scende fino a pochi centimetri da terra, poi preme salto.
    for (let time = 0; time < 2 && !(controller.body.velocityY < 0 && controller.position.y < 0.25); time += STEP) controller.update(STEP, idle, 0, environment())
    expect(controller.jump([])).toBe(false)
    let jumpedAgain = false
    for (let time = 0; time < JUMP_BUFFER; time += STEP) {
      controller.update(STEP, idle, 0, environment())
      if (controller.body.velocityY > 3) jumpedAgain = true
    }
    expect(jumpedAgain).toBe(true)

    // Premuto troppo presto: il salto memorizzato scade.
    const early = new PlayerController()
    early.reset(0, 0, 0)
    early.jump([])
    run(early, 0.15, idle)
    expect(early.jump([])).toBe(false)
    for (let time = 0; time < 2 && !early.body.grounded; time += STEP) early.update(STEP, idle, 0, environment())
    run(early, 0.1, idle)
    expect(early.body.grounded).toBe(true)
  })
})

describe('scivolata e atterraggi', () => {
  it('saltare dalla scivolata conserva lo slancio ma con un tetto', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, 0)
    run(controller, 0.6, sprint)
    expect(controller.pressCrouch()).toBe(true)
    run(controller, 0.05, sprint)
    expect(controller.jump([])).toBe(true)
    const speed = Math.hypot(controller.velocity.x, controller.velocity.z)
    expect(speed).toBeGreaterThan(6 * 1.45)
    expect(speed).toBeLessThanOrEqual(6 * SLIDE_HOP_CAP + 1e-6)
  })

  it('un atterraggio pesante rallenta, accovacciati si rotola senza rallentare', () => {
    const tower = [solid('tower', [-2, 0, -2], [2, 4, 2])]
    const land = (crouch: boolean) => {
      const controller = new PlayerController()
      controller.reset(0, 4, 1.9)
      const input: ControllerInput = { ...idle, forward: -1, crouch }
      let landing = 0
      for (let time = 0; time < 2 && landing === 0; time += STEP) {
        const result = controller.update(STEP, input, 0, environment(tower))
        if (controller.position.y < 3.9) landing = result.landingSpeed
      }
      return { controller, landing }
    }
    const hard = land(false)
    expect(hard.landing).toBeGreaterThan(HARD_LANDING_SPEED)
    expect(hard.controller.landingSlow).toBeGreaterThan(0)
    expect(hard.controller.rolling).toBe(false)
    const roll = land(true)
    expect(roll.controller.landingSlow).toBe(0)
    expect(roll.controller.rolling).toBe(true)
  })
})

describe('moduli di mobilità (fisica)', () => {
  it('doppio salto: solo in aria', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, 0)
    expect(controller.airJump(DOUBLE_JUMP_SPEED)).toBe(false)
    controller.jump([])
    run(controller, 0.4, idle)
    expect(controller.airJump(DOUBLE_JUMP_SPEED)).toBe(true)
    expect(controller.body.velocityY).toBeCloseTo(DOUBLE_JUMP_SPEED)
  })

  it('scatto: copre circa 3,8 m in un istante senza cadere', () => {
    const controller = new PlayerController()
    controller.reset(0, 2, 0)
    controller.body.grounded = false
    controller.startDash(new THREE.Vector3(1, 0, 0))
    expect(controller.dashing).toBe(true)
    run(controller, DASH_DURATION, idle)
    expect(controller.position.x).toBeGreaterThan(3.2)
    expect(controller.position.y).toBeGreaterThan(1.95)
    run(controller, 0.05, idle)
    expect(controller.dashing).toBe(false)
    expect(Math.hypot(controller.velocity.x, controller.velocity.z)).toBeLessThan(DASH_SPEED * 0.6)
  })

  it('corsa sui muri: resta in quota accanto al muro, finisce dopo 1,5 s, il salto stacca dal muro', () => {
    // Muro lungo alla sinistra (x < -0.6), si corre verso -z.
    const wall = [solid('wall', [-2, 0, -40], [-0.6, 6, 10])]
    const make = (enabled: boolean) => {
      const controller = new PlayerController()
      controller.wallRunEnabled = enabled
      controller.reset(0, 0, 0)
      run(controller, 0.5, sprint, wall)
      controller.jump(wall)
      return controller
    }
    const runner = make(true)
    const faller = make(false)
    run(runner, 0.9, sprint, wall)
    run(faller, 0.9, sprint, wall)
    expect(runner.wallRunning).toBe(true)
    expect(runner.position.y).toBeGreaterThan(faller.position.y + 0.5)
    run(runner, WALL_RUN_DURATION, sprint, wall)
    expect(runner.wallRunning).toBe(false)

    const jumper = make(true)
    run(jumper, 0.4, sprint, wall)
    expect(jumper.wallRunning).toBe(true)
    expect(jumper.jump(wall)).toBe(true)
    expect(jumper.velocity.x).toBeGreaterThan(WALL_JUMP_OUT * 0.8)
    expect(jumper.body.velocityY).toBeCloseTo(WALL_JUMP_UP)
  })

  it('schianto: picchiata verso il basso che segnala l’impatto', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, 0)
    expect(controller.startSlam()).toBe(false)
    controller.jump([])
    run(controller, 0.2, idle)
    expect(controller.startSlam()).toBe(true)
    let landed = false
    for (let time = 0; time < 1 && !landed; time += STEP) landed = controller.update(STEP, idle, 0, environment()).slamLanded === true
    expect(landed).toBe(true)
    expect(controller.body.grounded).toBe(true)
  })

  it('rampino: tira verso il punto agganciato', () => {
    const controller = new PlayerController()
    controller.reset(0, 0, 0)
    controller.startGrapple(new THREE.Vector3(0, 6, -15))
    expect(controller.grappling).toBe(true)
    run(controller, GRAPPLE_MAX_TIME, idle)
    expect(controller.grappling).toBe(false)
    expect(controller.position.z).toBeLessThan(-12)
    expect(controller.position.y).toBeGreaterThan(3)
  })

  it('propulsore: sale tenendo premuto il salto fino a un tetto, poi plana; il serbatoio torna a terra', () => {
    const controller = new PlayerController()
    controller.jetpackEnabled = true
    controller.reset(0, 0, 0)
    controller.jump([])
    const hold: ControllerInput = { ...idle, jumpHeld: true }
    let highest = 0
    run(controller, 2, hold, [], () => { highest = Math.max(highest, controller.position.y) })
    expect(highest).toBeGreaterThan(2.5)
    expect(highest).toBeLessThan(JETPACK_CEILING + 1.4)
    expect(controller.jetpackFuel).toBe(0)
    // Planata: la caduta resta lenta finché si tiene il salto.
    expect(controller.body.velocityY).toBeGreaterThanOrEqual(-GLIDE_FALL_SPEED - 0.5)
    run(controller, 4, idle)
    expect(controller.body.grounded).toBe(true)
    run(controller, 0.05, idle)
    expect(controller.jetpackFuel).toBe(JETPACK_FUEL)
  })
})

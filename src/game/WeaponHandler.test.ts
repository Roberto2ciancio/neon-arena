import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { normalizeArmory, resolveLoadout } from './armory'
import { WeaponHandler } from './WeaponHandler'

const input = { aiming: false, crouched: false, blocked: false }

function createHandler(loadout: Record<string, unknown> = {}) {
  const state = normalizeArmory({ level: 30, loadout })
  const handler = new WeaponHandler(new THREE.Group())
  handler.configure(resolveLoadout(state.loadout, state.cosmetics))
  handler.setVisible(true)
  return handler
}

/** Avanza il tempo e conta i colpi sparati. */
function run(handler: WeaponHandler, seconds: number, step = 1 / 60): number {
  let shots = 0
  for (let time = 0; time < seconds; time += step) shots += handler.update(step, input).shots
  return shots
}

describe('gestione delle armi del loadout', () => {
  it('l’arma semiautomatica spara un colpo per pressione anche subito dopo il cambio', () => {
    const handler = createHandler()
    expect(handler.switchTo('secondary')).toBe(true)
    run(handler, 0.5)
    handler.setTrigger(true)
    expect(run(handler, 1)).toBe(1)
    handler.setTrigger(false)
    handler.setTrigger(true)
    expect(run(handler, 0.5)).toBe(1)
    expect(handler.ammo).toBe(10)
  })

  it('l’arma automatica spara finché il grilletto è premuto', () => {
    const handler = createHandler({ primary: 'smg-9' })
    handler.setTrigger(true)
    const shots = run(handler, 1)
    expect(shots).toBeGreaterThanOrEqual(11)
    expect(shots).toBeLessThanOrEqual(13)
  })

  it('l’ultimo colpo del caricatore ha un clic dedicato, solo quello', () => {
    const handler = createHandler({ primary: 'br-3' })
    const sounds: string[] = []
    handler.setTrigger(true)
    for (let time = 0; time < 12; time += 1 / 60) {
      const frame = handler.update(1 / 60, input)
      sounds.push(...frame.sounds)
      if (handler.ammo === 0) break
      if (frame.shots > 0) { handler.setTrigger(false); handler.update(1 / 60, input); handler.setTrigger(true) }
    }
    expect(handler.ammo).toBe(0)
    expect(sounds.filter((sound) => sound === 'lastRound')).toHaveLength(1)
  })

  it('la raffica spara esattamente tre colpi per pressione', () => {
    const handler = createHandler({ primary: 'br-3' })
    handler.setTrigger(true)
    expect(run(handler, 1)).toBe(3)
    expect(handler.ammo).toBe(27)
  })

  it('ricarica dalla riserva e non spara durante la ricarica', () => {
    const handler = createHandler({ primary: 'smg-9' })
    handler.setTrigger(true)
    run(handler, 1)
    handler.setTrigger(false)
    expect(handler.startReload()).toBe(true)
    handler.setTrigger(true)
    expect(handler.update(0.1, input).shots).toBe(0)
    handler.setTrigger(false)
    run(handler, 1.3)
    expect(handler.ammo).toBe(36)
    expect(handler.reserve).toBeLessThan(216)
  })

  it('l’arma bianca ha un tempo di recupero e nasconde l’arma da fuoco durante il fendente', () => {
    const handler = createHandler({ melee: 'machete' })
    expect(handler.startMelee(true)?.id).toBe('machete')
    expect(handler.startMelee(true)).toBeNull()
    expect(handler.model?.group.visible).toBe(false)
    run(handler, 0.9)
    expect(handler.startMelee(true)?.id).toBe('machete')
  })

  it('un’arma acquistata sostituisce lo slot della sua classe', () => {
    const handler = createHandler()
    const state = normalizeArmory({ level: 30, loadout: { primary: 'lmg-75', secondary: 'r-44' } })
    const resolved = resolveLoadout(state.loadout, state.cosmetics)
    handler.replace(resolved.secondary)
    expect(handler.has('r-44')).toBe(true)
    expect(handler.has('p-12')).toBe(false)
    expect(handler.has('ar-07')).toBe(true)
    expect(handler.slot).toBe('secondary')
  })

  it('la rotella scorre gli slot in ciclo nei due sensi', () => {
    const handler = createHandler()
    expect(handler.nextSlot(1)).toBe('secondary')
    expect(handler.nextSlot(-1)).toBe('melee')
    handler.switchTo('melee')
    expect(handler.nextSlot(1)).toBe('primary')
  })
})

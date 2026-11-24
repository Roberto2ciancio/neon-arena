import { describe, expect, it } from 'vitest'
import type { KeyAction } from './keyBindings'
import { createTutorialSave, loadTutorial, saveTutorial, TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY, TutorialTracker } from './tutorial'
import type { TutorialObservation, TutorialStepId } from './tutorial'

function observation(overrides: Partial<TutorialObservation> = {}): TutorialObservation {
  return {
    pressed: new Set<KeyAction>(), fired: false, ammoRatio: 1, reloading: false, interaction: false, upgradeOpen: false,
    mobility: false, equipment: true, wave: 1, waveBreak: false, miniboss: false, boss: false, objective: false,
    waveEvent: false, execution: false, coop: false, ...overrides,
  }
}

const label = (action: KeyAction) => ({ forward: 'W', reload: 'K', interact: 'E' } as Record<string, string>)[action] ?? '?'

function memoryStorage() {
  const data: Record<string, string> = {}
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value } }
}

describe('tutorial della prima partita', () => {
  it('guida in ordine: muoversi, sparare, ricaricare', () => {
    const saved: TutorialStepId[][] = []
    const tracker = new TutorialTracker([], label, (seen) => saved.push(seen))
    expect(tracker.update(observation(), 0.1)?.id).toBe('move')
    // Un minimo di lettura prima di chiudersi anche se l'azione è già fatta.
    expect(tracker.update(observation({ pressed: new Set(['forward']) }), 0.5)?.id).toBe('move')
    // Il tasto premuto una volta sola basta: "fatto" resta valido fino alla chiusura.
    expect(tracker.update(observation(), 1)).toBeNull()
    expect(saved.at(-1)).toEqual(['move'])
    // Pausa fra un suggerimento e l'altro.
    expect(tracker.update(observation(), 0.5)).toBeNull()
    expect(tracker.update(observation(), 1)?.id).toBe('shoot')
    tracker.update(observation({ fired: true }), 1.5)
    tracker.update(observation(), 2)
    // La ricarica aspetta il caricatore a metà e mostra il tasto assegnato.
    expect(tracker.update(observation({ ammoRatio: 0.8 }), 0.1)).toBeNull()
    const reload = tracker.update(observation({ ammoRatio: 0.4 }), 0.1)
    expect(reload?.id).toBe('reload')
    expect(reload?.text).toContain('premi K')
  })

  it('i suggerimenti urgenti passano davanti e quelli non fatti scadono', () => {
    const tracker = new TutorialTracker([], label)
    expect(tracker.update(observation(), 0.1)?.id).toBe('move')
    expect(tracker.update(observation({ upgradeOpen: true }), 0.1)?.id).toBe('upgrade')
    expect(tracker.update(observation({ upgradeOpen: false }), 1.5)).toBeNull()
    expect(tracker.update(observation(), 2)?.id).toBe('move')
    expect(tracker.update(observation(), 20)).toBeNull()
    expect(tracker.seenIds).toContain('move')
  })

  it('ogni suggerimento compare una volta sola e alla fine si ferma', () => {
    const tracker = new TutorialTracker(TUTORIAL_STEPS.map((step) => step.id).filter((id) => id !== 'boss'), label)
    expect(tracker.finished).toBe(false)
    expect(tracker.update(observation({ boss: true }), 0.1)?.id).toBe('boss')
    tracker.update(observation({ boss: true }), 30)
    expect(tracker.finished).toBe(true)
    expect(tracker.update(observation({ boss: true, upgradeOpen: true }), 5)).toBeNull()
  })

  it('i nuovi giocatori partono da zero, chi ha già giocato con tutto visto', () => {
    expect(createTutorialSave(null, false)).toEqual({ seen: [], enabled: true })
    expect(createTutorialSave(null, true).seen).toHaveLength(TUTORIAL_STEPS.length)
    const custom = { seen: ['move' as const], enabled: false }
    expect(createTutorialSave(custom, true)).toBe(custom)
  })

  it('salva e ripara lo stato', () => {
    const storage = memoryStorage()
    saveTutorial(storage, { seen: ['move', 'shoot'], enabled: false })
    expect(loadTutorial(storage)).toEqual({ seen: ['move', 'shoot'], enabled: false })
    storage.data[TUTORIAL_STORAGE_KEY] = JSON.stringify({ seen: ['move', 'inventato', 3] })
    expect(loadTutorial(storage)).toEqual({ seen: ['move'], enabled: true })
    storage.data[TUTORIAL_STORAGE_KEY] = '{rotto'
    expect(loadTutorial(storage)).toBeNull()
  })
})

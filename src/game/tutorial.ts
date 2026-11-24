/**
 * Tutorial della prima partita: suggerimenti a schermo che compaiono quando servono (muoversi,
 * sparare, ricaricare, porte, potenziamenti, modulo di mobilità, miniboss, obiettivi...) e
 * spariscono quando il giocatore fa la cosa richiesta o dopo qualche secondo. Ogni suggerimento
 * si vede una volta sola; chi ha già giocato parte con tutto visto. Logica pura, guidata dai
 * dati dell'HUD: il gioco non ne sa nulla.
 */
import type { KeyAction } from './keyBindings'
import type { KeyValueStorage } from './progression'

/** Quello che il tutorial osserva a ogni aggiornamento dell'HUD. */
export interface TutorialObservation {
  /** Azioni premute dall'ultimo aggiornamento. */
  pressed: ReadonlySet<KeyAction>
  fired: boolean
  /** Munizioni nel caricatore / capienza (1 = pieno). */
  ammoRatio: number
  reloading: boolean
  interaction: boolean
  upgradeOpen: boolean
  mobility: boolean
  equipment: boolean
  wave: number
  waveBreak: boolean
  miniboss: boolean
  boss: boolean
  objective: boolean
  waveEvent: boolean
  execution: boolean
  coop: boolean
}

export type TutorialStepId =
  | 'move' | 'shoot' | 'reload' | 'door' | 'upgrade' | 'equipment' | 'mobility' | 'waveBreak'
  | 'execution' | 'miniboss' | 'boss' | 'objective' | 'waveEvent' | 'coop'

export interface TutorialHint {
  id: TutorialStepId
  title: string
  text: string
  /** Avanzamento del tutorial: suggerimenti visti / totale. */
  step: number
  total: number
}

type KeyLabel = (action: KeyAction) => string

interface TutorialStep {
  id: TutorialStepId
  title: string
  text: (key: KeyLabel) => string
  /** Quando può comparire (i passi base aspettano quelli precedenti). */
  when: (obs: TutorialObservation, seen: ReadonlySet<TutorialStepId>) => boolean
  /** Fatto: il suggerimento si chiude subito (dopo un minimo di lettura). */
  done?: (obs: TutorialObservation) => boolean
  /** Secondi dopo cui si chiude comunque. */
  timeout: number
  /** I suggerimenti urgenti (potenziamento, boss) passano davanti agli altri. */
  urgent?: boolean
}

const MIN_VISIBLE = 1.2
const GAP_BETWEEN = 1.4

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move', title: 'MUOVITI',
    text: (key) => `${key('forward')} ${key('left')} ${key('back')} ${key('right')} per muoverti, il mouse per guardare. ${key('sprint')} per correre, ${key('jump')} per saltare.`,
    when: () => true,
    done: (obs) => obs.pressed.has('forward') || obs.pressed.has('back') || obs.pressed.has('left') || obs.pressed.has('right'),
    timeout: 14,
  },
  {
    id: 'shoot', title: 'SPARA',
    text: () => 'Clic sinistro per sparare, clic destro per mirare. Mira alla testa: fa più danni.',
    when: (_obs, seen) => seen.has('move'),
    done: (obs) => obs.fired,
    timeout: 16,
  },
  {
    id: 'reload', title: 'RICARICA',
    text: (key) => `Caricatore a metà: premi ${key('reload')} per ricaricare quando sei al sicuro.`,
    when: (obs, seen) => seen.has('shoot') && obs.ammoRatio <= 0.5,
    done: (obs) => obs.reloading,
    timeout: 12,
  },
  {
    id: 'door', title: 'PORTE E POSTAZIONI',
    text: (key) => `Premi ${key('interact')} per aprire porte e comprare armi con i crediti delle uccisioni. Nuove zone = più spazio per scappare.`,
    when: (obs) => obs.interaction,
    done: (obs) => obs.pressed.has('interact'),
    timeout: 10,
  },
  {
    id: 'upgrade', title: 'POTENZIAMENTO',
    text: (key) => `Sei salito di livello: scegli un potenziamento con ${key('upgrade1')}, ${key('upgrade2')} o ${key('upgrade3')}. Alcuni hanno un prezzo, certe coppie si combinano.`,
    when: (obs) => obs.upgradeOpen,
    done: (obs) => !obs.upgradeOpen,
    timeout: 14,
    urgent: true,
  },
  {
    id: 'equipment', title: 'EQUIPAGGIAMENTO',
    text: (key) => `${key('lethal')} granata, ${key('tactical')} tattico, ${key('gadget')} gadget. Si ricaricano col tempo: usali quando l'orda ti stringe.`,
    when: (obs, seen) => obs.equipment && obs.wave >= 2 && seen.has('shoot'),
    done: (obs) => obs.pressed.has('lethal') || obs.pressed.has('tactical') || obs.pressed.has('gadget'),
    timeout: 12,
  },
  {
    id: 'mobility', title: 'MODULO DI MOBILITÀ',
    text: (key) => `Hai un modulo di mobilità: premi ${key('mobility')} per usarlo. Le cariche si ricaricano, l'indicatore è in basso.`,
    when: (obs, seen) => obs.mobility && seen.has('move'),
    done: (obs) => obs.pressed.has('mobility'),
    timeout: 12,
  },
  {
    id: 'waveBreak', title: 'PAUSA FRA LE ONDATE',
    text: () => 'Pochi secondi di respiro: ricarica, compra e cerca la cassa di rifornimenti segnata in alto.',
    when: (obs) => obs.waveBreak,
    timeout: 8,
  },
  {
    id: 'execution', title: 'ESECUZIONE',
    text: (key) => `Zombie stordito a portata: premi ${key('melee')} per giustiziarlo e recuperare vita.`,
    when: (obs) => obs.execution,
    done: (obs) => obs.pressed.has('melee'),
    timeout: 6,
    urgent: true,
  },
  {
    id: 'miniboss', title: 'MINIBOSS',
    text: () => 'Un miniboss ha un nome e un potere: guarda la barra in alto e tienilo a distanza.',
    when: (obs) => obs.miniboss,
    timeout: 8,
    urgent: true,
  },
  {
    id: 'boss', title: 'BOSS',
    text: () => 'Il boss cambia fase sotto le soglie della barra. Quando il nucleo è esposto, colpiscilo: prende molti più danni.',
    when: (obs) => obs.boss,
    timeout: 10,
    urgent: true,
  },
  {
    id: 'objective', title: 'OBIETTIVO',
    text: () => 'C\'è un obiettivo in corso: lo trovi in alto con l\'avanzamento. Completarlo dà premi.',
    when: (obs) => obs.objective,
    timeout: 9,
  },
  {
    id: 'waveEvent', title: 'ONDATA SPECIALE',
    text: () => 'Questa ondata ha un evento o un tema: le regole cambiano finché non finisce.',
    when: (obs) => obs.waveEvent,
    timeout: 8,
  },
  {
    id: 'coop', title: 'IN SQUADRA',
    text: (key) => `Se un compagno è a terra, avvicinati e tieni premuto ${key('interact')} per rianimarlo prima che finisca il tempo.`,
    when: (obs) => obs.coop,
    timeout: 10,
  },
]

export const TUTORIAL_STORAGE_KEY = 'neon-arena:tutorial:v1'

interface TutorialSave {
  seen: TutorialStepId[]
  enabled: boolean
}

const STEP_IDS = new Set<string>(TUTORIAL_STEPS.map((step) => step.id))

export function loadTutorial(storage: KeyValueStorage): TutorialSave | null {
  try {
    const raw = JSON.parse(storage.getItem(TUTORIAL_STORAGE_KEY) ?? 'null') as Partial<TutorialSave> | null
    if (!raw || typeof raw !== 'object') return null
    return {
      seen: Array.isArray(raw.seen) ? raw.seen.filter((id): id is TutorialStepId => typeof id === 'string' && STEP_IDS.has(id)) : [],
      enabled: raw.enabled !== false,
    }
  } catch {
    return null
  }
}

export function saveTutorial(storage: KeyValueStorage, save: TutorialSave): void {
  try {
    storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(save))
  } catch {
    // Storage non disponibile: i suggerimenti potrebbero ricomparire alla prossima visita.
  }
}

/**
 * Stato iniziale: senza salvataggio, chi ha già giocato (`returningPlayer`) parte con tutto
 * visto, un nuovo giocatore con niente.
 */
export function createTutorialSave(saved: TutorialSave | null, returningPlayer: boolean): TutorialSave {
  if (saved) return saved
  return { seen: returningPlayer ? TUTORIAL_STEPS.map((step) => step.id) : [], enabled: true }
}

export class TutorialTracker {
  private readonly seen: Set<TutorialStepId>
  /** `done`: l'azione richiesta è già stata fatta (resta vero fino alla chiusura). */
  private current: { step: TutorialStep; elapsed: number; done: boolean } | null = null
  private gap = 0

  constructor(seen: readonly TutorialStepId[], private readonly keyLabel: KeyLabel, private readonly onSeen: (seen: TutorialStepId[]) => void = () => undefined) {
    this.seen = new Set(seen)
  }

  get finished(): boolean {
    return this.seen.size >= TUTORIAL_STEPS.length
  }

  get seenIds(): TutorialStepId[] {
    return [...this.seen]
  }

  /** Nuova partita: un suggerimento rimasto a metà ricompare quando serve. */
  reset(): void {
    this.current = null
    this.gap = 0
  }

  update(obs: TutorialObservation, dt: number): TutorialHint | null {
    if (this.current) {
      const { step } = this.current
      this.current.elapsed += dt
      if (step.done?.(obs)) this.current.done = true
      if ((this.current.done && this.current.elapsed >= MIN_VISIBLE) || this.current.elapsed >= step.timeout) this.complete(step.id)
      else if (!step.urgent) {
        // Un suggerimento urgente (potenziamento, boss) prende il posto di uno normale.
        const urgent = this.findNext(obs, true)
        if (urgent) this.current = { step: urgent, elapsed: 0, done: false }
      }
    } else {
      this.gap = Math.max(0, this.gap - dt)
      const next = this.findNext(obs, this.gap > 0)
      if (next) this.current = { step: next, elapsed: 0, done: false }
    }
    if (!this.current) return null
    const { step } = this.current
    return { id: step.id, title: step.title, text: step.text(this.keyLabel), step: this.seen.size + 1, total: TUTORIAL_STEPS.length }
  }

  private findNext(obs: TutorialObservation, urgentOnly: boolean): TutorialStep | null {
    const candidates = TUTORIAL_STEPS.filter((step) => !this.seen.has(step.id) && (!urgentOnly || step.urgent) && step.when(obs, this.seen))
    return candidates.find((step) => step.urgent) ?? candidates[0] ?? null
  }

  private complete(id: TutorialStepId): void {
    this.seen.add(id)
    this.current = null
    this.gap = GAP_BETWEEN
    this.onSeen(this.seenIds)
  }
}

/**
 * Novità del gioco: chi torna dopo un po' vede nel menu cosa è cambiato dall'ultima visita,
 * con una spiegazione e dove trovare ogni cosa. I nuovi giocatori non la vedono (per loro è
 * tutto nuovo). Le voci vanno dalla più recente alla più vecchia; si aggiunge in cima.
 */
import type { KeyValueStorage } from './progression'

export interface ChangelogItem {
  name: string
  text: string
  /** Dove trovarlo nel gioco. */
  where: string
}

export interface ChangelogEntry {
  id: string
  date: string
  title: string
  items: readonly ChangelogItem[]
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: '2026-11-24-metro',
    date: '24 novembre 2026',
    title: 'Metro 7, tutorial e audio nuovo',
    items: [
      { name: 'Nuova mappa: Metro 7', text: 'Una piazza di notte con un mezzanino della metropolitana sotto la strada: tre scale per scendere (una dietro un cancello) e armi al piano di sotto.', where: 'Menu > 2 // SCEGLI L’ARENA > METRO 7' },
      { name: 'Passi e musica', text: 'I passi cambiano con la superficie (asfalto bagnato, ghiaia, metallo, legno) e la musica cresce con l’orda, la vita bassa e i boss.', where: 'Impostazioni > MUSICA per il volume' },
      { name: 'Tasti personalizzabili', text: 'Ogni azione può avere il tasto che preferisci; se è già usato, le due azioni si scambiano.', where: 'Menu > COMANDI' },
      { name: 'Tutorial', text: 'Alla prima partita compaiono suggerimenti quando servono. Puoi rivederlo da capo.', where: 'Impostazioni > RIVEDI IL TUTORIAL' },
      { name: 'Account', text: 'Recupero della password, cambio di email e password, eliminazione dell’account con tutti i dati online.', where: 'Account > PASSWORD DIMENTICATA? oppure GESTISCI ACCOUNT' },
    ],
  },
  {
    id: '2026-11-23-gameplay',
    date: '23 novembre 2026',
    title: 'Partite mai uguali',
    items: [
      { name: 'Ondate a tema e miniboss', text: 'Le ondate 4, 8 e 13 hanno un tema (Corridori nella nebbia, Ombre al buio...). Alle ondate 3, 7 e 12 arriva un miniboss con un nome e un potere: Rigenerante, Spettro, Corrosivo.', where: 'Modalità Zombie, durante la partita' },
      { name: 'Cassa nella pausa', text: 'Fra un\'ondata e l\'altra cade una cassa di rifornimenti in una zona pericolosa: raggiungila prima che riparta l\'orda.', where: 'Pausa fra le ondate (indicatore in alto)' },
      { name: 'Potenziamenti con un prezzo e sinergie', text: 'Alcuni potenziamenti danno molto ma tolgono qualcosa (Cannone di vetro, Avidità...). Certe coppie di potenziamenti si combinano in un effetto in più.', where: 'Scelta dei potenziamenti al passaggio di livello' },
      { name: 'Mappa che cambia', text: 'Una nube tossica avanza verso di te, alcune porte si bloccano per un\'ondata e la cassa misteriosa può essere maledetta: arma leggendaria, ma arriva un\'élite.', where: 'Modalità Zombie, dalle ondate centrali' },
      { name: 'Zombie più furbi', text: 'Gli zombie abbattono le coperture basse, lo Scudiero protegge lo Sputatore, l\'Urlatore rianima i caduti. Una run ogni cinque circa capita un evento raro.', where: 'Modalità Zombie' },
      { name: 'Carte della run', text: 'Fino a tre carte che cambiano le regole (Solo pistole, Zombie giganti...) e moltiplicano frammenti ed esperienza.', where: 'Menu > modalità Zombie > CARTE DELLA RUN' },
      { name: 'Run del giorno', text: 'Stessa mappa, stesse carte e stessi eventi per tutti nello stesso giorno, con una classifica dedicata.', where: 'Menu > riquadro giallo RUN DEL GIORNO; classifica > scheda OGGI' },
      { name: 'Storia a frammenti', text: 'Tre registrazioni nascoste in ogni mappa raccontano come è nato il contagio.', where: 'Tablet luminosi nelle mappe; menu > ARCHIVIO' },
      { name: 'Nuove modalità', text: 'Sopravvivi 5 minuti, Difendi il generatore e, in squadra, Ultimo in piedi.', where: 'Menu > pulsanti sopra le carte; in squadra lo sceglie l\'host' },
    ],
  },
  {
    id: '2026-11-23-grafica',
    date: '23 novembre 2026',
    title: 'Grafica rinnovata',
    items: [
      { name: 'Atmosfera', text: 'Ogni mappa ha un suo colore, la nebbia è più fitta al suolo, ci sono braci nell\'aria, coni di luce sotto i lampioni e asfalto bagnato sotto la pioggia.', where: 'Preset grafico medio o alto' },
      { name: 'Zombie più vivi', text: 'Ferite, vestiti strappati, camminate diverse per tipo e meno peso sul computer.', where: 'Tutte le partite' },
      { name: 'Sfocatura in mira', text: 'Mirando, l\'arma in primo piano si sfoca e il bersaglio resta nitido.', where: 'Preset grafico alto' },
    ],
  },
  {
    id: '2026-11-23-boss-armi',
    date: '23 novembre 2026',
    title: 'Boss, armi e obiettivi',
    items: [
      { name: 'Boss più duri', text: 'Il Bruto ha tre fasi e un colpo a terra da saltare. A Distretto Zero arriva il Tiranno, che lancia macigni acidi.', where: 'Ondate dei boss (5, 10, 15)' },
      { name: 'Generatore ed evacuazione', text: 'A Stazione 13 puoi riattivare il generatore per avere sconti. Dopo l\'ultima ondata resisti nella zona di estrazione fino all\'arrivo dell\'elicottero.', where: 'Modalità Zombie' },
      { name: 'Balestra e lanciagranate', text: 'Due armi nuove, solo in modalità Zombie, più il mirino laterale e il calcio tattico.', where: 'Armeria (livelli 22 e 32)' },
      { name: 'Sfide', text: 'Tre sfide al giorno e due alla settimana con esperienza e frammenti in premio.', where: 'Menu > SFIDE' },
    ],
  },
  {
    id: '2026-11-23-mobilita',
    date: '23 novembre 2026',
    title: 'Moduli di mobilità',
    items: [
      { name: 'Tasto B', text: 'Doppio salto, scatto, corsa sui muri, schianto, rampino o propulsore: uno per classe, solo in modalità Zombie.', where: 'Armeria > EQUIPAGGIAMENTO > MODULO DI MOBILITÀ' },
    ],
  },
]

export const CHANGELOG_STORAGE_KEY = 'neon-arena:changelog-seen:v1'
/** Quante voci al massimo mostrare a chi torna senza un riferimento (salvataggi vecchi). */
export const MAX_UNSEEN_ENTRIES = 4

/**
 * Voci da mostrare. `seenId` è l'ultima voce vista; senza riferimento si mostra tutto (fino a
 * un massimo) solo a chi ha già giocato, mai ai nuovi giocatori.
 */
export function getUnseenEntries(seenId: string | null, returningPlayer: boolean): ChangelogEntry[] {
  if (seenId === null) return returningPlayer ? CHANGELOG.slice(0, MAX_UNSEEN_ENTRIES) : []
  const index = CHANGELOG.findIndex((entry) => entry.id === seenId)
  // Riferimento sconosciuto (voce rimossa): meglio mostrare la più recente che niente.
  if (index < 0) return CHANGELOG.slice(0, 1)
  return CHANGELOG.slice(0, index)
}

export function getLatestChangelogId(): string {
  return CHANGELOG[0]!.id
}

export function loadSeenChangelog(storage: KeyValueStorage): string | null {
  try {
    return storage.getItem(CHANGELOG_STORAGE_KEY)
  } catch {
    return null
  }
}

export function markChangelogSeen(storage: KeyValueStorage): void {
  try {
    storage.setItem(CHANGELOG_STORAGE_KEY, getLatestChangelogId())
  } catch {
    // Storage non disponibile: le novità ricompariranno alla prossima visita.
  }
}

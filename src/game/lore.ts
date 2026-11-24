/**
 * Storia a frammenti (piano gameplay G6): registrazioni da trovare nelle mappe che raccontano
 * come è nato e come si è diffuso il contagio. Tre per mappa, in ordine cronologico; quelle
 * trovate restano nell'archivio del menu.
 */
import type { KeyValueStorage } from './progression'

export interface LoreEntry {
  id: string
  map: string
  title: string
  author: string
  text: string
}

export const LORE: readonly LoreEntry[] = [
  { id: 'station-13-1', map: 'station-13', title: 'RITARDI SULLA LINEA NORD', author: 'Marta Ferri, capostazione', text: 'Il treno merci proveniente dai laboratori centrali è fermo al binario quattro per un’avaria ai sistemi di raffreddamento. Alcuni passeggeri nella biglietteria lamentano un forte odore chimico e malesseri improvvisi. Ho chiesto una verifica immediata alla squadra di manutenzione.' },
  { id: 'station-13-2', map: 'station-13', title: 'CHIUSURA DELLA BIGLIETTERIA', author: 'Luca Moreno, agente di sicurezza', text: 'La folla sta aumentando e la gente spinge per salire sugli ultimi convogli in partenza. Diversi individui mostrano vene luminescenti e comportamenti aggressivi. Ho ordinato l’evacuazione della biglietteria e il blocco delle porte automatiche.' },
  { id: 'station-13-3', map: 'station-13', title: 'ULTIMO SEGNALE DALLA TORRE', author: 'Marta Ferri, capostazione', text: 'Dalla torre di controllo vedo le luci della stazione spegnersi una a una nella nebbia. I binari sono bloccati e non arrivano più treni di soccorso. Chiunque ascolti questo messaggio, non si avventuri verso il centro della città.' },
  { id: 'depot-06-1', map: 'depot-06', title: 'CARICO INSOLITO AL MAGAZZINO', author: 'Matteo Rinaldi, caposquadra movimentazione', text: 'Abbiamo ricevuto tre container sigillati senza codici dal Porto 09. I sensori indicano un surriscaldamento all’interno dell’unità sette. Nessuno deve avvicinarsi finché non arriva il protocollo di sicurezza.' },
  { id: 'depot-06-2', map: 'depot-06', title: 'GUASTO ALLA GRU CENTRALE', author: 'Elena Bianchi, operatrice gru', text: 'La gru automatica ha lasciato cadere uno dei moduli pressurizzati nel magazzino. Un gas fluorescente si è diffuso in pochi secondi fra gli operai a terra. Gli allarmi non rispondono più ai comandi.' },
  { id: 'depot-06-3', map: 'depot-06', title: 'ABBANDONO DEL DEPOSITO', author: 'Matteo Rinaldi, caposquadra movimentazione', text: 'I sopravvissuti si sono barricati nell’ufficio logistico al piano di sopra. Fra i container vediamo figure contaminate che vagano sotto i riflettori. Dobbiamo staccare la rete elettrica prima di tentare la fuga.' },
  { id: 'district-zero-1', map: 'district-zero', title: 'ALLARME NEL QUARTIERE', author: 'Giulia Serra, residente', text: 'I megafoni del Distretto Zero ripetono l’avviso di emergenza biologica senza sosta. Dai balconi si vedono luci violacee e ambulanze bloccate nel traffico. Dicono che il contagio arrivi con i camion del porto.' },
  { id: 'district-zero-2', map: 'district-zero', title: 'PUNTO DI RACCOLTA AL PARCHEGGIO', author: 'Sergente Dario Valli, forze locali', text: 'Abbiamo allestito una zona sicura al terzo piano del parcheggio multipiano. La rampa d’accesso però è stata sfondata da una folla di infetti. Restino in posizione solo i civili armati.' },
  { id: 'district-zero-3', map: 'district-zero', title: 'EVACUAZIONE FALLITA', author: 'Giulia Serra, residente', text: 'Le navette di evacuazione non sono mai arrivate sul tetto del palazzo. Le insegne dei grattacieli illuminano solo strade deserte e ombre che si muovono. Proviamo a raggiungere la zona di estrazione a piedi.' },
  { id: 'port-09-1', map: 'port-09', title: 'ISPEZIONE ALLA BANCHINA OVEST', author: 'Capitano Stefano Conti, guardia costiera', text: 'Un mercantile partito dal settore industriale ha attraccato senza rispondere alla radio. Dalla stiva cola una sostanza verde fluorescente che reagisce con l’acqua di mare. Ho mandato una pattuglia a controllare.' },
  { id: 'port-09-2', map: 'port-09', title: 'CONTAMINAZIONE DEI MAGAZZINI', author: 'Sara Pellegrini, responsabile doganale', text: 'Il ceppo si è propagato fra i container della banchina quattro. I lavoratori esposti hanno la pelle segnata e reagiscono con violenza alla luce. Ho chiuso i cancelli d’accesso al porto.' },
  { id: 'port-09-3', map: 'port-09', title: 'NAVIGAZIONE INTERROTTA', author: 'Capitano Stefano Conti, guardia costiera', text: 'Nessuna imbarcazione è autorizzata a lasciare il molo nove. Gli infetti hanno circondato i magazzini e tagliato le comunicazioni. Questa è l’ultima registrazione prima di distruggere i registri doganali.' },
  { id: 'lab-21-1', map: 'lab-21', title: 'ANOMALIA NEL REATTORE', author: 'Dott. Arnaldi, direttore della ricerca', text: 'Il reattore biologico del Laboratorio 21 ha avuto un picco di pressione durante la sintesi del ceppo Neon. I filtri del settore tre hanno ceduto e il patogeno è entrato nei condotti d’aria. Avvio subito la quarantena.' },
  { id: 'lab-21-2', map: 'lab-21', title: 'BRECCIA NELLA SALA DI CONTROLLO', author: 'Silvia Neri, tecnica di laboratorio', text: 'Il ceppo altera i tessuti dei soggetti in pochi minuti. Le cavie infette hanno sfondato i vetri di sicurezza e invaso la sala di controllo. La decontaminazione automatica non riesce a fermarlo.' },
  { id: 'metro-07-1', map: 'metro-07', title: 'ULTIMA CORSA', author: 'Luca Ferrante, capotreno della linea 7', text: 'Il treno delle 23:40 è arrivato dal porto con tre vagoni pieni di gente che tossiva. Abbiamo chiuso le porte del mezzanino, ma i tornelli non reggono. Sento graffiare dalle scale.' },
  { id: 'metro-07-2', map: 'metro-07', title: 'RIFUGIO SOTTO LA PIAZZA', author: 'Comunicato della Protezione civile', text: 'Il mezzanino della Metro 7 è designato come rifugio temporaneo. Portare acqua e coperte. Le scale est saranno chiuse con un cancello: aprirlo solo su ordine del personale.' },
  { id: 'metro-07-3', map: 'metro-07', title: 'IL RIFUGIO È CADUTO', author: 'Anonimo, scritto su un biglietto', text: 'Ci avevano detto che sotto eravamo al sicuro. Invece il buio li attira. Se leggi questo, non scendere senza una via d’uscita: le scale sono tre, ricordale tutte.' },
  { id: 'lab-21-3', map: 'lab-21', title: 'ORIGINE DELLA CATASTROFE', author: 'Dott. Arnaldi, direttore della ricerca', text: 'Prima che il contenimento cedesse, per un errore del sistema alcuni moduli con il ceppo Neon sono stati spediti al porto e alla stazione. Ormai il contagio ha raggiunto tutta la città. Che ci perdonino per ciò che abbiamo creato.' },
]

export const LORE_STORAGE_KEY = 'neon-arena:lore:v1'
export const LORE_PICKUP_RANGE = 1.4

export function getLoreForMap(mapId: string): LoreEntry[] {
  return LORE.filter((entry) => entry.map === mapId)
}

export function loadFoundLore(storage: KeyValueStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(LORE_STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && LORE.some((entry) => entry.id === id)) : []
  } catch {
    return []
  }
}

export function saveFoundLore(storage: KeyValueStorage, found: readonly string[]): void {
  try {
    storage.setItem(LORE_STORAGE_KEY, JSON.stringify([...new Set(found)]))
  } catch {
    // Storage non disponibile: l'archivio vale per la sessione.
  }
}

/**
 * Punto della registrazione: sempre lo stesso per ogni giocatore (seme dall'id), cercato in
 * spazio libero a distanza media dal centro. `isFree` dice se un punto è calpestabile.
 */
export function findLorePoint(id: string, arenaLimit: number, isFree: (x: number, z: number) => boolean): { x: number; z: number } | null {
  let seed = 0
  for (let index = 0; index < id.length; index += 1) seed = (seed * 31 + id.charCodeAt(index)) >>> 0
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const angle = random() * Math.PI * 2
    const distance = arenaLimit * (0.3 + random() * 0.55)
    const x = Math.round(Math.cos(angle) * distance * 10) / 10
    const z = Math.round(Math.sin(angle) * distance * 10) / 10
    if (isFree(x, z)) return { x, z }
  }
  return null
}

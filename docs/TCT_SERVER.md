# Server autorevole TCT — valutazione tecnica

## Decisione

Per il multiplayer TCT usare un servizio Node.js separato dal client e da Supabase, con connessione WebSocket iniziale. Il server possiede stato della partita, movimento, salute, colpi, punteggio e respawn. I client inviano input e intenzioni di fuoco, mai posizioni o risultati da accettare senza validazione.

## Simulazione

- Tick autoritativo a 30 Hz e snapshot ai client a 15–20 Hz.
- Una stanza per match 4v4, con durata, punteggio limite e respawn già definiti in `src/game/tctRules.ts`.
- Mappe e collisioni devono essere condivise come dati; `src/game/maps.ts` e `src/game/collision.ts` sono la base prevista.
- Validazione di accelerazione, velocità, salto, confini, cadenza, munizioni, ricarica, gittata e linea di tiro.
- Hit registration server-side con piccolo storico delle posizioni per compensare la latenza, limitato a una finestra massima di 200 ms.
- Client prediction per il movimento locale, interpolazione per gli altri giocatori e riconciliazione tramite numero di sequenza degli input.

## Protocollo iniziale

Messaggi client: `join`, `input` con sequenza e timestamp, `fire`, `reload`, `switchWeapon`, `deployEquipment`, `ping`.

Messaggi server: `welcome` con player e tick rate, `snapshot` con tick e stato, `playerDied`, `respawn`, `matchEnded`, `pong`, `error` con codice stabile.

Ogni messaggio deve avere un tipo, una versione di protocollo e limiti di dimensione. Validare lo schema prima di modificare la simulazione.

## Sicurezza e anti-cheat

- Autenticazione con token a scadenza; nessuna service role key nel client.
- Rate limit separati per input, fuoco, equipaggiamenti e connessioni.
- Server e database con ruoli distinti; solo il server può scrivere risultati TCT certificati.
- Controlli sui punteggi, teletrasporti, cadenza e sequenze duplicate.
- Metriche per tick duration, latenza, pacchetti scartati e disconnessioni.

## Supabase

Supabase resta adatto a identità, profili e classifiche persistenti. Non deve eseguire la simulazione in tempo reale. Al termine del match il server firma o autentica il risultato verso una funzione backend dedicata.

## Introduzione incrementale

1. Estrarre le regole condivise in un pacchetto senza dipendenze DOM.
2. Implementare una stanza locale e testare movimento e hit registration con due client.
3. Aggiungere snapshot, prediction e riconciliazione.
4. Aggiungere autenticazione, persistenza del risultato e rate limit.
5. Eseguire soak test e test di latenza prima della pubblicazione online.

Stato attuale: la TCT usa una stanza P2P (PeerJS/WebRTC) con il browser dell'host autorevole (`src/game/net/MatchHost.ts`). Protocollo e validazione in `src/game/net/protocol.ts` sono già senza dipendenze DOM e riutilizzabili da un futuro server Node dedicato, che resta necessario per anti-cheat e partite pubbliche.

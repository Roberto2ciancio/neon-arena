# Neon Arena

FPS 3D per browser con modalità Zombie a ondate e TCT online fino a 4 contro 4 tra giocatori reali. Il progetto usa TypeScript, Three.js, Vite, Vitest e Playwright.

## Avvio

```bash
npm install
npm run dev
```

## Verifiche

```bash
npm run build
npm test
npm run test:e2e
```

Per i test end-to-end è necessario un browser supportato da Playwright. Il server Vite viene avviato automaticamente dalla configurazione dei test. Per esecuzioni parallele si possono impostare `PLAYWRIGHT_PORT` e `PLAYWRIGHT_OUTPUT_DIR`; i test disattivano deliberatamente Supabase per verificare il fallback locale in modo deterministico.

## Controlli

- `WASD`: movimento; mouse: visuale; click sinistro: fuoco; click destro: mira.
- `Shift`: scatto; `Spazio`: salto; `C`: accovacciati (tieni premuto), durante lo scatto avvia la scivolata; `R`: ricarica; `Esc`: pausa.
- Zombie: `1–6` armi possedute, `G` granata, `T` torretta, `E` interagisci (porte e postazioni d'acquisto), `Z`/`X`/`V` scelta del potenziamento al level-up (il gioco non si ferma).

## Mappe ed edifici

Le mappe sono definite come dati in `src/game/maps.ts`: ostacoli, porte acquistabili, postazioni e edifici. Gli edifici (`kind: 'building'`) e le torri aperte (`kind: 'tower'`) sono generati da `src/game/structures.ts` con piani, scale, finestre, tetti calpestabili e i collegamenti per la navigazione degli zombie (`src/game/navigation.ts`). La fisica verticale condivisa (gradini, cadute, soffitti) è in `src/game/world.ts`. I test in `src/game/structures.test.ts` verificano che ogni piano e tetto sia raggiungibile a piedi dallo spawn.

## Frammenti

Nella modalità zombie i frammenti raccolti servono a: aprire porte e palazzi chiusi, comprare le armi alle postazioni sparse per la mappa (anche ai piani alti e sui tetti), ricaricare un'arma posseduta a metà prezzo, rifornire tutte le munizioni e curarsi con il kit medico. I frammenti spesi non riducono quelli assegnati all'officina a fine run.
- TCT: `1` primaria, `2` secondaria, `G` granata, `T` torretta.

## Supabase opzionale

Senza configurazione il gioco usa profilo, progressione e classifica locali. Per attivare il cloud:

1. Creare un progetto Supabase.
2. Eseguire `supabase/schema.sql` nell'editor SQL.
3. Copiare `.env.example` in `.env.local` e impostare `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Riavviare Vite.

Usare esclusivamente la chiave pubblica anonima nel client. Non inserire la service role key nelle variabili Vite o nel repository. Le policy fornite sono adatte a un prototipo pubblico, non garantiscono risultati resistenti a manipolazioni.

## Pubblicazione statica

`npm run build` produce `dist/`, pubblicabile su un hosting statico con HTTPS. Configurare le variabili Supabase nel servizio di hosting prima della build. Non è richiesto un backend per le modalità locali e con bot.

Controlli consigliati prima del rilascio: build, test unitari, test end-to-end, verifica pointer lock e audio su Chrome/Firefox/Edge, controllo delle policy Supabase e prova dei preset grafici.

## TCT online

La TCT si gioca tra persone reali, senza bot. Un giocatore crea una stanza e condivide il codice di 5 caratteri; gli altri entrano con **ENTRA**. Servono almeno un giocatore per squadra, fino a 4 contro 4. L'host sceglie la mappa e avvia la partita; ogni giocatore sceglie la propria arma primaria.

- Connessione P2P WebRTC tramite [PeerJS](https://peerjs.com/): nessun server da gestire, funziona anche su GitHub Pages. La segnalazione iniziale usa il broker pubblico PeerJS.
- Il browser dell'host è autorevole su vita, uccisioni, punteggio, timer e respawn, e valida i colpi dichiarati dai client (danno massimo, gittata, cadenza, squadra, protezione allo spawn).
- Limiti: senza server TURN alcune reti molto restrittive (NAT simmetrici, reti aziendali) possono impedire la connessione; se l'host esce la partita termina; non c'è anti-cheat robusto.
- Per sviluppo e test, `?net=local` sostituisce PeerJS con `BroadcastChannel`, così due schede dello stesso browser giocano tra loro senza rete.

Il server autorevole dedicato descritto in `docs/TCT_SERVER.md` resta l'evoluzione prevista per partite pubbliche competitive. Supabase viene usato solo per profili, progressione e classifiche.

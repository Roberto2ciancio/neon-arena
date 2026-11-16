# Neon Arena — roadmap dei miglioramenti futuri

Documento condiviso fra Claude, Kimi e l'utente. Continua la numerazione di `ROADMAP.md` (Fasi 1–8). Le priorità nascono dai problemi emersi durante lo sviluppo; ogni fase indica chi la guida e quando considerarla conclusa. Chi avvia o chiude un punto lo segnala nel "Diario di integrazione" di `CLAUDE.md`.

**Legenda priorità:** P0 da fare subito · P1 prossimo ciclo · P2 quando le basi sono solide.
**Responsabile proposto:** C = Claude, K = Kimi, U = utente (decisioni o azioni fuori dal codice).

---

## Fase 9 — Sicurezza, dati e account (P0)

Obiettivo: nessun giocatore può alterare dati altrui e gli account sono completi.

| Punto | Resp. | Note |
|---|---|---|
| Chiudere le policy anonime di `profiles` e `leaderboard`: oggi chiunque abbia la chiave pubblica può aggiornare qualsiasi profilo e inviare punteggi arbitrari | C | Spostare profilo e classifica sugli account (`auth.uid()`), lasciare agli ospiti solo la classifica locale |
| Validare i risultati di classifica lato server (Edge Function con limiti di plausibilità: punteggio per ondata, durata minima della run) | C | I punteggi online non sono certificati finché manca il server autorevole |
| Recupero password e cambio email nella schermata account | C | Endpoint `recover` di Supabase Auth; Site URL già configurato |
| Accesso con Google o GitHub (OAuth) | C + U | L'utente crea le app OAuth e inserisce le chiavi nella dashboard Supabase |
| Eliminazione account e dati (GDPR) | C | Il `cascade` su `player_saves` è già presente |
| SMTP esterno per le email di conferma | U | Il servizio integrato di Supabase invia poche email all'ora |

**Conclusa quando:** l'advisor di sicurezza Supabase non segnala nulla, i test RLS (lettura e scrittura di dati altrui rifiutate) sono automatizzati e la registrazione è provata con un'email reale.

## Fase 10 — Prestazioni e stabilità (P0)

Obiettivo: 60 FPS sul preset medio con una GPU integrata recente, CI senza test intermittenti.

| Punto | Resp. | Note |
|---|---|---|
| Misure con GPU reale (non SwiftShader) su tre profili hardware, con valori salvati nel repository | K + U | Le misure di Kimi in headless non bastano per dichiarare risolto il lag |
| Ridurre le draw call (oggi circa 90–230): fondere le parti fisse delle postazioni, LOD per palazzi e skyline, culling per piano | K | Accordarsi con Claude se si toccano `structureRendering.ts` e `equipmentModels.ts` |
| Budget di prestazioni per preset (draw call, triangoli, luci) verificato da un test | K | Evita regressioni silenziose quando si aggiungono contenuti |
| Eliminare l'instabilità E2E in CI (run 43887534452: due test falliti e poi passati senza modifiche al codice) | K | Usare un passo temporale fisso nei test invece del tempo reale |
| Screenshot di riferimento per menu, armeria e HUD (test visivi) | K | Intercettano rotture dell'interfaccia che i test funzionali non vedono |
| Divisione del bundle (oggi circa 720 KB): caricare PeerJS, armeria e postprocessing solo quando servono | C | Import dinamici già usati per PeerJS: estendere |

**Conclusa quando:** le misure su GPU reale sono nel repository e rispettano l'obiettivo, e dieci run CI consecutive passano.

## Fase 11 — Architettura del codice (P1)

Obiettivo: aggiungere contenuti senza toccare file da 1.800 righe.

| Punto | Resp. | Note |
|---|---|---|
| Scomporre `Game.ts` (≈1.820 righe) in sistemi: nemici, ondate, postazioni, effetti, HUD | C | Seguire il modello di `WeaponHandler` ed `EquipmentSystem`, già condivisi |
| Scomporre `TctGame.ts` (≈1.090 righe) e `main.ts` (≈890 righe; menu, lobby e HUD in moduli separati) | C | `armoryScreen.ts` e `accountPanel.ts` sono il modello |
| Passo di simulazione fisso (es. 60 Hz) separato dal rendering | C + K | Rende identici comportamento e test su hardware lenti e veloci |
| Estrarre le regole condivise in un pacchetto senza DOM, primo passo verso il server TCT (`docs/TCT_SERVER.md`) | C | `protocol.ts`, `MatchHost.ts`, `world.ts` e `structures.ts` sono già puri |

**Conclusa quando:** nessun file di gioco supera le 600 righe e la copertura dei test resta almeno quella attuale.

## Fase 12 — TCT competitivo (P1)

| Punto | Resp. | Note |
|---|---|---|
| Server autorevole Node + WebSocket (anti-cheat, nessuna dipendenza dall'host) | C | Piano in `docs/TCT_SERVER.md`; richiede hosting (decisione U) |
| Server TURN per le reti che bloccano il P2P | U + C | Oggi alcune reti aziendali o mobili non riescono a connettersi |
| Riconnessione e migrazione dell'host | C | Oggi, se l'host esce, la partita finisce |
| Elenco delle stanze pubbliche e matchmaking semplice | C | Si appoggia a Supabase Realtime o al server autorevole |
| Nuove modalità: Dominio (tre punti da conquistare) e Cattura la bandiera | C | Riusano mappe multipiano e scale |
| Chat testuale rapida, killfeed, schermata dei punteggi con il tasto Tab | C | |

**Conclusa quando:** una partita 4v4 su reti diverse regge 15 minuti senza desincronizzazioni, con test di carico documentati.

## Fase 13 — Contenuti e gameplay (P1–P2)

| Punto | Resp. | Note |
|---|---|---|
| Bilanciamento di armi, prezzi e livelli di sblocco con dati di partita (telemetria anonima facoltativa) | C + U | I valori attuali sono un punto di partenza |
| Obiettivi in modalità Zombie: riattivare il generatore di Stazione 13, evacuazione finale | C | Già previsti nella visione originale di `ROADMAP.md` |
| Fasi del Bruto (carica, colpo a terra, nucleo esposto) e un nuovo boss per Distretto Zero | C | |
| Zombie che si arrampicano su coperture basse e sfondano porte acquistate | C | Si appoggia a `navigation.ts` |
| Quarta mappa con interni estesi e un livello sotterraneo | C | Il generatore di strutture va esteso ai livelli negativi |
| Sfide giornaliere e settimanali con ricompense estetiche | C | Richiedono la validazione server della Fase 9 |
| Nuove armi: lanciagranate e balestra; accessori: mirino laterale e calcio | C | |

## Fase 14 — Audio, accessibilità e piattaforme (P2)

| Punto | Resp. | Note |
|---|---|---|
| Effetti sonori campionati, musica dinamica e passi diversi per superficie | C | Oggi l'audio è sintetizzato con WebAudio |
| Rimappatura dei tasti e sensibilità separata in mira | C | |
| Supporto gamepad | C | API Gamepad del browser |
| Tutorial interattivo alla prima partita | C | Il benvenuto del menu ne è il punto d'ingresso |
| Traduzione inglese dell'interfaccia | C | Raccogliere i testi in un file di traduzioni |
| PWA installabile con gioco offline in modalità ospite | K | Il manifest esiste già |

---

## Come usare questo documento

1. Prima di iniziare un punto, scrivi nel diario di `CLAUDE.md` chi lo prende e su quale branch o worktree.
2. Le aree di Kimi (prestazioni, configurazione Playwright, benchmark) e quelle di Claude (gameplay, armeria, menu, account, rete) restano quelle già concordate; per i punti a cavallo si concorda il perimetro prima di toccare i file.
3. A punto concluso aggiorna la tabella (aggiungi "✔ commit `abc1234`") e lo stato della fase. A fase conclusa riportala in `ROADMAP.md`.
4. Le decisioni dell'utente (hosting, costi, account esterni) vanno chieste prima di iniziare i punti che le richiedono.

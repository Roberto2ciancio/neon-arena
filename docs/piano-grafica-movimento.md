# Piano — grafica più realistica, movimento e soddisfazione delle uccisioni

Data: 2026-11-20. Autore: Claude. Revisione richiesta a Kimi per le parti di prestazioni (vincoli e misure).

## Da dove si parte

- **Grafica**: tutto è generato dal codice. Gli zombie sono composti da forme semplici (box, cilindri, sfere: 47 primitive in `models.ts`), le mappe da blocchi con texture create su canvas (`textures.ts`). Nessun modello 3D o texture fotografica scaricata. Rendering: `RenderPass` → SSAO → bloom → `OutputPass`, ambiente `RoomEnvironment`, ombre solo sul preset alto, mappa d'ombra a 10 Hz.
- **Prestazioni**: su Iris Xe 60 FPS su tutti i preset all'ondata 10, ma il preset alto arriva a 950–1.390 draw call. I cali di frame passati erano ricompilazioni di shader: il numero di luci e le varianti di materiale **non devono cambiare durante la partita**. Il telefono ora è un obiettivo (controlli touch), quindi ogni novità deve avere una versione leggera sul preset basso.
- **Uccisioni**: lo zombie colpito sobbalza e arretra; alla morte ruota su un fianco per 0,65 s e sparisce, con una spruzzata di particelle e un suono. Niente arti che si staccano, niente corpi che cadono in modo fisico, niente ricompensa per serie di uccisioni.
- **Movimento**: scatto, salto, accovacciata, scivolata con slancio, inclinazione e oscillazione della visuale (`PlayerController.ts`). Non ci si aggrappa ai bordi e non esistono abilità di movimento.

## Ordine consigliato

| Fase | Contenuto | Perché in questo ordine | Stima |
|---|---|---|---|
| A | Soddisfazione delle uccisioni | Massimo effetto percepito, costo grafico basso, nessun asset nuovo | 1–2 sessioni |
| B | Movimento di base più fluido | Serve come base per le abilità; migliora anche il TCT | 1 sessione |
| C | Moduli di mobilità nella build (corsa sui muri ecc.) | Dipende da B; cambia il modo di giocare le ondate | 2–3 sessioni |
| D | Grafica "realismo stilizzato" | Molto visibile ma tocca prestazioni: va misurata con Kimi | 2–3 sessioni |
| E | Asset veri (zombie animati glTF) — **facoltativa** | Il salto di realismo più grande, ma il più costoso e rischioso | da decidere |
| F | Classifica globale e statistiche di tutti i giocatori | Indipendente dalle altre fasi (database e menu): si può fare in parallelo | 1–2 sessioni |

Ogni fase si chiude con: test unitari per le regole pure, E2E esistenti verdi, test dei picchi di frame verde, misura su GPU reale (preset basso e alto) confrontata con la misura precedente, e il run di pubblicazione verde.

---

## Fase A — Soddisfazione nell'uccidere gli zombie

Obiettivo: ogni colpo e ogni uccisione si devono "sentire", con differenze chiare fra un colpo al corpo, un colpo alla testa e un'esplosione.

1. **Smembramento procedurale.** Gli zombie sono già fatti di pezzi separati (testa, braccia, gambe): un colpo letale alla testa la fa saltare, un fucile a pompa da vicino o un'esplosione staccano un braccio o una gamba. I pezzi diventano detriti con traiettoria e rimbalzo semplice (gravità e attrito, senza libreria fisica), poi sfumano. Gli arti staccati si prendono da un pool: nessuna mesh o materiale nuovo durante la partita.
2. **Cadute credibili ("ragdoll leggero").** Al posto della rotazione fissa: direzione e forza della caduta dipendono dal colpo (arma, distanza, zona). Il corpo cade all'indietro, si accascia sulle ginocchia o vola via con un'esplosione; braccia e testa seguono con un ritardo (molle semplici sulle giunture). Niente motore fisico: costo trascurabile.
3. **Sangue e impatti.** Schizzi direzionali dal punto colpito, macchie su pavimento e muri vicini con `decals.ts` (numero massimo fisso, le più vecchie sfumano), colore diverso per i tipi speciali (acido del Gonfio, scintille dello Scudiero). Opzione "Violenza ridotta" nelle impostazioni che sostituisce sangue e smembramento con scintille.
4. **Pausa d'impatto (hit-stop) e reazioni della visuale.** Solo in solitaria: rallentamento di 40–60 ms sui colpi alla testa letali, sulle uccisioni del Bruto e sulle uccisioni multiple. In co-op il mondo non si ferma: resta solo l'effetto sulla visuale (piccolo scossone e FOV). Rispetta "Riduci movimento".
5. **Suoni stratificati.** Colpo al corpo, colpo alla testa e uccisione hanno suoni distinti; "crack" secco per la testa che salta, tonfo del corpo a terra, ultimo colpo del caricatore con un clic diverso.
6. **Serie di uccisioni e combo.** Contatore combo nell'HUD (uccisioni entro 2,5 s l'una dall'altra) con moltiplicatore dei crediti fino a ×2; annunci "DOPPIA", "TRIPLA", "MASSACRO"; medaglie a fine run (più lunga combo, colpi alla testa di fila, uccisioni con esplosivi). In co-op ogni giocatore ha la sua combo.
7. **Esecuzioni corpo a corpo.** Gli zombie storditi (flashbang, gambe colpite, scudo rotto) mostrano un indicatore: il corpo a corpo li finisce con un'animazione breve della visuale, una piccola cura e crediti extra.
8. **Colpi più leggibili.** Hitmarker diverso per corpo, testa e uccisione; numeri di danno facoltativi (impostazione); i punti deboli si illuminano un istante quando vengono colpiti.

Vincoli di prestazioni: numero massimo di detriti (24 sul basso, 64 sull'alto) e di macchie (40/120), tutto da pool creati all'avvio e preriscaldati in `prewarmEnemies`; nessuna luce aggiunta. Il test dei picchi di frame va ripetuto con smembramenti ed esplosioni a catena.

Criteri di chiusura: in un'ondata piena gli effetti non aumentano la mediana del frame oltre il 5% e non producono picchi; le uccisioni in co-op si vedono uguali per tutti (lo smembramento lo decide l'host e lo manda nel messaggio `kill`).

---

## Fase B — Movimento di base più fluido (per tutti, Zombie e TCT)

1. **Aggrapparsi ai bordi (mantling).** Saltando contro un bordo fino a circa 1,6 m ci si tira su in automatico. Oggi le casse e i muretti bloccano o vanno saltati con precisione.
2. **Tolleranze sul salto.** Si può ancora saltare per 0,1 s dopo aver lasciato il bordo (coyote time) e il salto premuto poco prima di atterrare viene memorizzato (jump buffer).
3. **Scivolata migliore.** Saltare a fine scivolata conserva lo slancio (slide-hop, con un limite per non rompere il TCT); in discesa la scivolata dura di più.
4. **Controllo in aria e atterraggi.** Un po' più di controllo in volo, atterraggio da altezza con rotolamento che evita il rallentamento.
5. **Sensazione in prima persona.** Inclinazione della visuale e dell'arma che segue meglio la velocità, ombra del giocatore sul preset alto, suoni dei passi diversi per superficie.

Criteri di chiusura: test unitari su `PlayerController` (altezze massime del mantling, finestre di coyote time e buffer, limite dello slide-hop); nel TCT velocità massima invariata rispetto a oggi.

---

## Fase C — Moduli di mobilità nella build

Proposta: un nuovo spazio nell'armeria, **MODULO DI MOBILITÀ**, uno per classe, accanto a letale, tattico e gadget. Ogni modulo ha un tasto (sul telefono un pulsante in più) e una ricarica; alcuni potenziamenti della run lo migliorano. Si sbloccano con il livello come le armi.

| Modulo | Cosa fa | Uso nelle ondate | Note |
|---|---|---|---|
| **Corsa sui muri** | Correndo in parallelo a un muro ci si resta attaccati fino a 1,5 s; salto dal muro verso l'esterno | Scappare dagli accerchiamenti, raggiungere i tetti | Richiede di sapere quali superfici sono muri (dalle collisioni esistenti) |
| **Doppio salto** | Secondo salto in aria | Salire su torri e container | Il più semplice da fare per primo |
| **Scatto** | Spinta rapida in qualsiasi direzione, 2 cariche | Schivare il balzo del Saltatore o la carica del Bruto | Breve invulnerabilità solo in Zombie |
| **Rampino** | Si aggancia a un punto e tira verso di esso | Cambiare posizione al volo | Serve una mira assistita sui punti agganciabili |
| **Schianto** | In aria, colpo verso il basso che scaglia via gli zombie vicini | Liberarsi quando si è circondati | Danno ad area: unisce movimento e uccisioni |
| **Propulsore** | Breve volo verticale e planata | Giocare dall'alto | Il più rischioso per l'equilibrio delle mappe |

Potenziamenti della run collegati (in `upgrades.ts`): "Doppia carica", "Ricarica cinetica" (le uccisioni accorciano la ricarica del modulo), "Atterraggio esplosivo", "Corsa infinita sui muri per 10 s dopo un'uccisione multipla".

Decisioni aperte:
- **TCT**: consiglio di lasciare fuori i moduli all'inizio (equilibrio competitivo e protocollo di rete) e valutarli dopo con una modalità dedicata.
- **Zombie**: si arrampicano già fino a 3,2 m; con moduli forti serve verificare che tetti e torri non diventino posti dove nessuno zombie arriva (eventuali zombie che saltano o sputano più in alto).
- **Co-op**: i compagni devono vedere corsa sui muri e scatti; la posizione è già replicata, va aggiunta solo la posa.

Criteri di chiusura: regole pure dei moduli con test (ricariche, cariche, durata); E2E con un modulo equipaggiato in partita; nessuna mappa con un punto irraggiungibile per tutti gli zombie (test automatico sui punti calpestabili).

---

## Fase D — Grafica "realismo stilizzato"

Una precisazione onesta: con modelli fatti di forme semplici, "realistico" ha un limite. Questa fase rende tutto molto più credibile senza scaricare asset: luce, materiali, atmosfera e post-processing. Il salto da "gioco fatto di blocchi" a "gioco realistico" arriva solo con la Fase E.

1. **Illuminazione**: mappa d'ambiente HDR per mappa (cielo notturno, capannone, laboratorio) invece di `RoomEnvironment`; luci a riempimento cotte nelle mappe (lightmap generate all'avvio o precalcolate) al posto di luci in tempo reale; ombre più morbide sul preset alto.
2. **Materiali**: texture procedurali più ricche (sporco, ruggine, crepe, bagnato sotto la pioggia) con mappe di rilievo e rugosità; pelle degli zombie con variazioni, ferite e vestiti strappati; pozzanghere che riflettono sulle mappe piovose.
3. **Atmosfera**: nebbia con altezza e raggi di luce finti (piani additivi, non volumetria vera), polvere e braci che fluttuano, fumo che resta dopo le esplosioni.
4. **Post-processing**: anti-aliasing (SMAA), correzione colore per mappa (LUT), grana leggera, aberrazione cromatica ai bordi solo quando si è feriti, sfocatura della profondità in mira. Ogni effetto ha un interruttore per preset.
5. **Modelli migliori senza asset**: zombie con più segmenti e forme arrotondate (geometrie unite in una sola mesh per zombie per ridurre le draw call), animazioni di camminata più naturali con curve diverse per ogni tipo.

Vincoli (area di Kimi, da concordare prima di iniziare): budget di draw call per preset; nessuna variazione del numero di luci in partita; preset basso uguale a oggi o più leggero; misura su telefono reale prima di chiudere.

Criteri di chiusura: confronto di screenshot prima/dopo sulle 5 mappe; mediana e 1% low di ogni preset non peggiori del 10% rispetto alla misura di partenza; nessun picco nel test dell'ondata piena.

---

## Fase E (facoltativa) — Asset veri

- Zombie come modelli glTF con scheletro e animazioni (camminata, corsa, attacco, morti diverse), texture compresse KTX2 e livelli di dettaglio. Servono asset con licenza adatta (acquistati o gratuiti con licenza aperta) o creati apposta.
- Impatti: dimensione del download (da qualche MB a decine di MB), tempo di caricamento, animazione scheletrica che costa CPU con 30–40 zombie (si gestisce con animazioni condivise e meno aggiornamenti per gli zombie lontani), tutta la logica di hitbox e smembramento da adattare.
- Consiglio: decidere dopo le Fasi A–D, partendo da un solo tipo di zombie come prova e misurando prestazioni e peso prima di estendere.

## Fase F — Classifica globale e statistiche di tutti i giocatori

Obiettivo: una sezione CLASSIFICA nel menu dove chiunque (anche da ospite, in sola lettura) vede le statistiche dei giocatori con account e può aprire il profilo pubblico di ognuno.

### Da dove si parte

- `leaderboard` su Supabase salva le singole run (punteggio, ondata, eliminazioni, durata, vittoria) solo per gli account, con il trigger `validate_leaderboard_run` che scarta le run non plausibili.
- Le statistiche complete (`stats` e `history` in `progression.ts`: tempo di gioco, vittorie, colpi di precisione, partite/uccisioni/morti TCT) esistono solo nel salvataggio privato (`player_saves`), non visibili agli altri.
- La combo migliore della run (`RunResult.bestCombo`) arriva con la Fase A; l'uso delle armi per run esiste come XP (`weaponXp`), non come uccisioni per arma.

### Cosa si vede

| Scheda | Classifiche (top 100 + la propria posizione) |
|---|---|
| **Zombie** | punteggio migliore, ondata più alta, run completate (vittorie all'ondata 15), media dell'ondata di fine run, eliminazioni totali, combo più lunga, precisione (colpi alla testa / colpi a segno), tempo di gioco |
| **TCT** | K/D, uccisioni totali, partite giocate e vinte, percentuale di vittoria (con un minimo di partite per entrare, es. 10) |
| **Armi** | armi più usate da tutta la comunità (uccisioni per arma) e, per ogni arma, i migliori giocatori per uccisioni e livello di maestria |
| **Settimanale** | le stesse classifiche Zombie limitate agli ultimi 7 giorni, così i nuovi giocatori hanno una possibilità |

Filtri: mappa, solitaria/co-op (numero di giocatori), periodo (sempre / settimana). **Profilo pubblico** cliccando un nome: livello e prestigio, statistiche principali, ultime 10 run, 3 armi preferite, medaglie della Fase A.

### Come si costruisce

1. **Dati per run più ricchi**: `leaderboard` riceve anche `best_combo`, `precision_hits`, `hits`, `map`, `players` (co-op) e `weapon_kills` (jsonb arma → uccisioni, solo armi del catalogo, al massimo 12 voci). Il trigger di validazione si estende ai campi nuovi (combo ≤ eliminazioni, colpi alla testa ≤ colpi, somma delle uccisioni per arma ≤ eliminazioni).
2. **Partite TCT registrate**: nuova tabella `tct_matches` (giocatore, uccisioni, morti, esito, durata, mappa) con trigger di plausibilità (uccisioni e morti limitate dalla durata, massimo di partite in 10 minuti).
3. **Aggregati calcolati dal database, non dal client**: tabella `player_stats` aggiornata da trigger a ogni inserimento (somme, massimi, medie come somma/conteggio), più una vista `weapon_usage` per le armi della comunità. Il client non scrive mai gli aggregati: niente statistiche gonfiate a mano.
4. **Lettura pubblica limitata**: funzioni RPC `get_leaderboard(categoria, periodo, filtri)` e `get_public_profile(nome)` che restituiscono solo nome utente, prestigio e statistiche (mai email o id dell'account); paginazione a 100 righe; indici sulle colonne ordinate.
5. **Interfaccia**: pannello CLASSIFICA nel menu (sostituisce/estende la classifica attuale) con schede, filtri, propria posizione evidenziata e profilo pubblico; dati in cache per 60 s per non interrogare il database a ogni apertura.
6. **Privacy**: entrano in classifica solo gli account con nome utente; opzione "Nascondi il mio profilo dalla classifica" nella schermata account; l'eliminazione dell'account (Fase 9) cancella anche run e statistiche.

### Limiti da dichiarare

- **TCT e co-op non sono verificabili lato server**: le partite girano fra i browser (PeerJS) e ogni giocatore invia le proprie cifre. I trigger scartano i valori impossibili, ma un K/D alterato con cura non si può escludere finché non esiste un server autorevole (Fase 12 della roadmap futura). Per questo il K/D va mostrato con il numero di partite accanto e con una soglia minima.
- Le run giocate prima di questa fase non hanno combo né armi: le classifiche nuove partono vuote (si può importare solo ciò che `leaderboard` già contiene).

Criteri di chiusura: test RLS estesi in `supabase/tests/rls.sql` (lettura pubblica solo tramite RPC, nessuna scrittura sugli aggregati, run non plausibili rifiutate); test unitari sul calcolo delle statistiche lato client e sulla preparazione dei dati da inviare; E2E con classifica caricata da un server finto (offline nei test, come oggi); advisor di Supabase senza avvisi nuovi.

## Rischi principali

- **Prestazioni sul telefono**: ogni fase ha una versione per il preset basso; la prova su un telefono reale va fatta prima di chiudere la Fase D.
- **Ricompilazioni di shader**: tutti i materiali nuovi (detriti, sangue, post-processing) vanno creati e preriscaldati all'avvio.
- **Equilibrio**: moduli di mobilità e combo rendono il giocatore più forte; probabilmente vanno compensati con zombie più aggressivi dalle ondate medie.
- **Co-op**: smembramenti, moduli e combo vanno sincronizzati senza aumentare troppo i messaggi (lo stato del mondo è a 15 Hz).

## Decisioni da prendere con l'utente

1. Da quale fase partire (consiglio: A).
2. Quanto sangue: realistico, ridotto o configurabile (consiglio: configurabile).
3. Moduli di mobilità solo in Zombie o anche nel TCT (consiglio: solo Zombie per ora).
4. Se e quando passare ad asset veri (Fase E).
5. Classifica: quali statistiche mostrare a tutti e se il K/D del TCT va mostrato pur non essendo verificabile lato server (consiglio: sì, con il numero di partite e una soglia minima).

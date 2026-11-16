# Neon Arena — Roadmap

## Visione

Neon Arena è un FPS 3D per browser con ambientazione industrial-horror stilizzata. Il gioco avrà due modalità: una modalità zombie a ondate con progressione roguelite e una modalità tattica a squadre chiamata TCT. Mappe, armi, intelligenza artificiale e sistemi di danno saranno condivisi tra le modalità.

La priorità è costruire prima una modalità zombie completa e divertente. La TCT verrà realizzata successivamente sulle stesse fondamenta. Il multiplayer online non verrà affrontato prima di aver validato il combattimento con i bot.

## Modalità

### Zombie a ondate

- Run della durata prevista di 20–30 minuti.
- Arma iniziale e potenziamento casuale.
- Nemici provenienti da più ingressi, con comportamenti coordinati.
- Esperienza e frammenti ottenuti tramite uccisioni e colpi ai punti deboli.
- Scelta fra tre potenziamenti casuali a ogni livello.
- Boss o ondata speciale ogni cinque ondate.
- Porte, torrette e nuove zone della mappa sbloccabili con i frammenti.
- Breve intervallo fra le ondate per prepararsi.
- Classifica basata su ondata, punteggio e tempo.

La difficoltà aumenterà tramite numero e varietà dei nemici, ingressi attivi, frequenza degli attacchi e coordinazione. HP e danno cresceranno in modo controllato; la velocità avrà un limite. Gli HP non saranno l’unico strumento di difficoltà.

### TCT — scontro tattico a squadre

- Squadre 4 contro 4, inizialmente giocatore e tre bot contro quattro avversari.
- Respawn dopo pochi secondi.
- Vittoria al raggiungimento del punteggio previsto o allo scadere del tempo.
- Loadout con arma primaria, secondaria e due equipaggiamenti.
- Minimappa, indicatori degli alleati e punteggio di squadra.
- Bot con ruoli di assalto, copertura, supporto e cecchino.
- Progressione e bilanciamento separati dalla modalità zombie.

Il multiplayer online richiederà un server autorevole, sincronizzazione di rete e misure anti-cheat. Supabase potrà gestire profili, salvataggi e classifiche, ma non la simulazione in tempo reale.

## Nemici zombie

### Errante

- HP medi, movimento lento e irregolare, attacco con artigli.
- Punto debole: testa.

### Corridore

- HP bassi, scatti e cambi di direzione.
- Punto debole: gambe per rallentarlo, testa per ucciderlo rapidamente.

### Strisciante

- Movimento basso e balzo da distanza ravvicinata.
- Punto debole: spina dorsale esposta.

### Corazzato

- HP elevati, movimento lento e protezioni frontali distruttibili.
- Punto debole: generatore sulla schiena.

### Sputatore

- Mantiene le distanze e crea zone di acido.
- Punto debole: sacco luminoso sul collo.

### Urlatore

- Potenzia temporaneamente i nemici vicini.
- Animazione riconoscibile prima dell’urlo.
- Punto debole: gola.

### Bruto

- Boss con carica, colpo a terra e martello improvvisato.
- Dopo gli attacchi espone temporaneamente il nucleo sul petto.

Ogni nemico avrà velocità, HP, danno, portata, animazioni e reazioni ai colpi propri. I punti deboli avranno feedback differenti: scintille, perdita di fluidi, rallentamento o stagger.

## Armi ed equipaggiamenti

- Pistola: precisa e veloce da estrarre.
- SMG: cadenza elevata, alta mobilità e danno calante sulla distanza.
- Fucile d’assalto: versatile.
- Fucile a pompa: alto danno ravvicinato e ricarica lenta.
- DMR: semiautomatico con bonus elevato sui punti deboli.
- LMG: caricatore grande, rinculo importante e ricarica lenta.
- Granate e torrette con tempi di recupero.

Ogni arma sarà definita da danno, cadenza, caricatore, riserva, ricarica, rinculo, dispersione, mobilità, gittata e moltiplicatori sui punti deboli.

## Potenziamenti zombie

- Combattimento: danno, cadenza, penetrazione, caricatore e danno ai punti deboli.
- Sopravvivenza: armatura, rigenerazione, resistenza all’acido e seconda possibilità.
- Movimento e controllo: scatto, salto, ricarica rapida e rallentamento tramite colpi alle gambe.
- Effetti speciali: incendiari, esplosioni sulle headshot, catena elettrica e torretta automatica.

Gli effetti avranno livelli massimi, prerequisiti e rarità. Le combinazioni dovranno produrre configurazioni diverse fra le run.

## Mappe

### Stazione 13

Prima mappa zombie. Binari, sala centrale, biglietteria e tunnel. Porte apribili, percorsi circolari e generatore da riattivare.

### Deposito 06

Mappa condivisa fra zombie e TCT. Corridoi industriali, container, passerelle e tre linee di combattimento.

### Distretto Zero

Mappa urbana più ampia, pensata soprattutto per TCT. Edifici attraversabili, vicoli laterali e piazza centrale.

Le prime versioni useranno geometrie procedurali. Successivamente i modelli glTF potranno essere importati senza cambiare il motore delle mappe.

## Fasi di sviluppo

### Fase 1 — Fondamenta FPS

**Stato: completata.**

- Definizione delle mappe separata dal rendering e dal motore di gioco.
- Prima sezione di Stazione 13.
- Collisioni del giocatore e dei nemici con muri e coperture.
- Blocco dei proiettili e dei colpi hitscan da parte degli ostacoli.
- Navigazione locale dei nemici intorno agli ostacoli.
- Armi basate su definizioni di dati.
- Ricarica con trasferimento dei colpi dalla riserva al caricatore.
- Test per collisioni, mappe, armi e ricarica.

### Fase 2 — Prima modalità zombie completa

**Stato: completata.** Verificata con build, 27 test unitari e test end-to-end.

- Stazione 13 giocabile.
- Errante, Corridore e Corazzato.
- Prime 15 ondate bilanciate.
- Potenziamenti e intervalli fra ondate.
- Primo boss e statistiche finali.

### Fase 3 — Contenuti e identità

**Stato: completata.** Verificata con build, 36 test unitari e test end-to-end. Include tutti gli zombie, sei armi, granata e torretta, effetti speciali con livelli e prerequisiti, porta apribile con frammenti e classifica locale Top 5.

- Tutte le tipologie di zombie.
- Sei armi ed equipaggiamenti.
- Effetti speciali e combinazioni di potenziamenti.
- Porte apribili, torrette e classifiche locali.

### Fase 4 — TCT con bot

**Stato: completata.** Verificata con build, 42 test unitari e 3 test end-to-end. Include Deposito 06, TCT 4v4, bot con quattro ruoli e supporto curativo, respawn, minimappa, indicatori alleati, loadout con primaria/secondaria, granata e torretta.

- Deposito 06.
- Squadre, respawn, minimappa e loadout.
- Navigazione e comportamenti tattici dei bot.

### Fase 5 — Grafica e audio

**Stato: completata.** Verificata con build, 48 test unitari e 4 test end-to-end. Include texture e materiali PBR, ombre, preset grafici, decal, animazioni di morte, pulviscolo ambientale e audio stereo posizionale con attenuazione.

- Modelli più dettagliati e materiali PBR.
- Texture, illuminazione e ombre ottimizzate.
- Decal dei proiettili, animazioni di morte ed effetti ambientali.
- Audio posizionale e impostazioni grafiche.

### Fase 6 — Distretto Zero e ottimizzazione

**Stato: completata.** Verificata con build, 49 test unitari e 5 test end-to-end. Include Distretto Zero, instancing delle geometrie statiche, LOD, pooling dei modelli zombie, contatore FPS/draw call e test sopra 25 FPS sul preset basso con rendering software.

- Terza mappa.
- Livelli di dettaglio, object pooling e riduzione dei draw call.
- Verifica delle prestazioni su hardware meno potente.

### Fase 7 — Online e pubblicazione

**Stato: completata per l’ambito applicabile.** Verificata con build, 57 test unitari e 7 test end-to-end. Include profilo con callsign, Supabase REST con fallback offline, classifica online, salvataggi cloud, schema SQL, accessibilità persistente, guida di pubblicazione e valutazione del server autorevole in `docs/TCT_SERVER.md`. Deploy pubblico, verifica Supabase live e multiplayer online restano attività esterne/non incluse in questa deliverable locale.

- Classifiche Supabase, profili e salvataggi cloud.
- Valutazione tecnica separata del server autorevole per TCT.
- Bilanciamento, accessibilità e preparazione della pubblicazione.

## Primo risultato verificabile

La Fase 1 sarà completa quando il giocatore e i nemici non potranno attraversare gli ostacoli, i colpi rispetteranno le coperture, i nemici sapranno aggirarli e le statistiche delle armi arriveranno da definizioni esterne coperte da test automatici.

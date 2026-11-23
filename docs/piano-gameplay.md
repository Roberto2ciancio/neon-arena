# Piano: gameplay meno ripetitivo

Richiesto dall'utente il 2026-11-23. Ordine di lavoro deciso dall'utente: prima i blocchi G1–G3, poi G4–G7. Ogni blocco ha regole pure con test, collegamento in `Game.ts`, voce nel diario e commit separato.

## G1 — Ritmo delle ondate
- **Ondate a tema** (`waveEvents.ts`): alle ondate 4, 8 e 13 un evento speciale che sceglie i tipi di zombie anche prima della loro ondata d'esordio (Corridori nella nebbia, Gonfi e Sputatori, Ombre al buio, Corazzati e Scudieri, Striscianti e Saltatori).
- **Miniboss** (`minibosses.ts`) alle ondate 3, 7 e 12: élite con nome e abilità (rigenerazione, teletrasporto, scia d'acido), barra in alto come i boss, ricompensa garantita.
- **Pausa fra le ondate con un obiettivo**: una cassa di rifornimenti in una zona con pozze acide, da raggiungere prima della ripartenza (crediti, munizioni o cura).

## G2 — Decisioni durante la run
- **Mappe che cambiano**: nube tossica che si sposta lentamente (dall'ondata 6) e porte che si bloccano per un'ondata.
- **Potenziamenti con un costo** (`upgrades.ts`): vantaggio forte e svantaggio chiaro.
- **Sinergie** (`synergies.ts`): coppie di potenziamenti che sbloccano un effetto in più, annunciato alla scoperta.
- **Cassa maledetta**: a volte la cassa misteriosa è maledetta (rossa): arma leggendaria garantita ma arriva subito un'élite.

## G3 — Varietà di nemici e situazioni
- **Coperture distruttibili**: gli zombie bloccati contro una copertura bassa la abbattono.
- **Nemici che si combinano**: lo Scudiero scorta lo Sputatore più vicino; l'Urlatore rianima gli zombie appena caduti.
- **Eventi rari** (1 run su 5): orda di Corridori, Tiranno fuori programma, ondata nel buio totale.

## G4 — Modificatori della run
Carte scelte prima di iniziare ("solo pistole", "un colpo e sei a terra", "zombie giganti"...) che moltiplicano frammenti ed esperienza.

## G5 — Run del giorno
Mappa, carte, eventi e armi delle postazioni uguali per tutti in un giorno, con classifica del giorno.

## G6 — Storia a frammenti
Registrazioni da trovare nelle mappe, raccolte in un archivio nel menu.

## G7 — Modalità alternative brevi
"Sopravvivi 5 minuti", "Scorta il generatore", "Ultimo in piedi" (co-op).

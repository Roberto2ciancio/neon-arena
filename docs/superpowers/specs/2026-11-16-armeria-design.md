# Armeria, arsenale, equipaggiamenti e personalizzazione — design

## Intento

Dare profondità al combattimento e un motivo per continuare a giocare: armi con rinculo e personalità, un loadout configurabile, granate e gadget tattici, e un aspetto del personaggio da sbloccare e mostrare agli altri nel TCT online.

## Decisioni dell'utente

- L'armeria vale per **TCT e Zombie**. In Zombie si parte con il loadout scelto; le postazioni sulla mappa continuano a vendere armi e munizioni.
- Gli oggetti si sbloccano con un **livello giocatore** unico, che sale giocando in entrambe le modalità.
- Slot dell'equipaggiamento: **letale (G) + tattico (Q) + gadget (T)**.
- Skin del **personaggio** (visibile agli altri nel TCT e nell'anteprima 3D dell'armeria) e **mimetiche** per le armi (visibili in prima persona).

## Approcci considerati

1. **Catalogo dati + builder procedurali (scelto).** Armi, accessori, equipaggiamenti e cosmetici sono definizioni in TypeScript; modelli 3D e statistiche finali sono calcolati da funzioni pure. Coerente con il resto del progetto (mappe ed edifici sono già procedurali), testabile, senza asset esterni.
2. Modelli glTF per ogni arma. Aspetto migliore ma richiede asset, licenze e un caricatore; fuori portata ora.
3. Armi codificate a mano nei due motori. Duplicazione e nessuna validazione condivisa con l'host TCT: scartato.

## Arsenale

Ogni arma ha una classe, statistiche, un profilo di rinculo, slot accessori ammessi e un livello di sblocco.

| Slot | Classe | Armi |
|---|---|---|
| Primaria | Fucile d'assalto | AR-07 (automatico), AK-74R (più danno, più rinculo), BR-3 (raffica da 3) |
| Primaria | Mitraglietta | SMG-9, VX-45 (cadenza altissima, corto raggio) |
| Primaria | Fucile a pompa | SG-6 (pompa), AS-12 (automatico) |
| Primaria | Precisione | DMR-3 (semiautomatico), SR-50 (bolt-action, ottica 4×) |
| Primaria | Mitragliatrice | LMG-75 |
| Secondaria | Pistola | P-12, R-44 (revolver) |
| Secondaria | Pistola automatica | AP-18 (raffica continua) |
| Corpo a corpo | Lama | Coltello da combattimento, Machete, Lama al plasma |

Tasti: `1` primaria, `2` secondaria, `3` arma bianca, `F` attacco rapido con l'arma bianca.
In Zombie, comprando un'arma a una postazione, questa sostituisce l'arma dello stesso slot (primaria o secondaria).

### Rinculo

Profilo per arma: spinta verticale, deriva orizzontale con andamento ripetibile, crescita durante la raffica, recupero. Si applica alla visuale (pitch/yaw) e all'arma in prima persona. Mira, accovacciamento e accessori lo riducono. Implementato in un modulo puro (`recoil.ts`) testato.

### Accessori

Slot: ottica, bocca, canna, sottocanna, caricatore. Ognuno modifica le statistiche (moltiplicatori) e appare sul modello:

- Ottica: punto rosso, olografico, ottica 4× (zoom in mira, solo armi di precisione e fucili).
- Bocca: silenziatore (suono attenuato, gittata −10%), compensatore (rinculo verticale −25%), spegnifiamma (deriva orizzontale −20%).
- Canna: lunga (gittata +25%, mobilità −5%), corta (mobilità +5%, dispersione +15%).
- Sottocanna: impugnatura verticale (rinculo −15%), puntatore laser (dispersione da fianco −30%).
- Caricatore: esteso (+50% colpi, ricarica +15% tempo), rapido (ricarica −25%).

## Equipaggiamenti

| Slot | Oggetto | Effetto |
|---|---|---|
| Letale (G) | Granata a frammentazione | Esistente |
| Letale | Semtex | Si attacca a superfici e nemici, esplode dopo 1,2 s |
| Letale | Molotov | Area di fuoco 5 s con danno continuo |
| Letale | Claymore | Posizionata, esplode quando un nemico entra nel cono frontale |
| Tattico (Q) | Flashbang | Acceca: zombie storditi; nel TCT schermo bianco in base a distanza e direzione dello sguardo |
| Tattico | Fumogeno | Nube densa 9 s che blocca la vista; gli zombie perdono il bersaglio |
| Tattico | Stordente | Rallenta e confonde nell'area |
| Tattico | Esca | Attira gli zombie; nel TCT segnale falso sulla minimappa avversaria |
| Gadget (T) | Torretta | Esistente |
| Gadget | Scudo dispiegabile | Copertura solida per 20 s |
| Gadget | Cassa munizioni | Ricarica munizioni ed equipaggiamenti di chi è vicino |
| Gadget | Drone radar | Rivela i nemici sulla minimappa per 10 s |

Nel TCT gli effetti visivi si simulano su ogni client dal messaggio di lancio; i danni passano dall'host con nuove fonti validate (molotov, claymore, corpo a corpo).

## Progressione

- Livello giocatore con XP da uccisioni, ondate, partite e vittorie, in entrambe le modalità; curva crescente fino al livello 30.
- Ogni oggetto ha un livello di sblocco; a inizio gioco sono disponibili un'arma per classe base, la granata, il flashbang e la torretta.
- Salvataggio locale (`neon-arena:armory:v1`): livello, XP, loadout, cosmetici. Valori normalizzati al caricamento.

## Personalizzazione

- Personaggio: colore tuta (primario/secondario), copricapo (nessuno, casco tattico, cappuccio, berretto), maschera/visore (nessuna, maschera antigas, visore con colore), zaino (nessuno, tattico, radio), toppa sulla spalla, colore guanti (visibili in prima persona).
- Mimetiche armi: standard, urbana, digitale, tigre, neon, carbonio, oro (sblocco a livello).
- Nel TCT i cosmetici viaggiano nel messaggio `hello` e nel `lobby`; ogni client costruisce i modelli degli altri con il loro aspetto.

## Armeria (interfaccia)

Pulsante **ARMERIA** nel menu. Schermata con schede: Primaria, Secondaria, Corpo a corpo, Equipaggiamento, Aspetto. Elenco oggetti con barre delle statistiche (danno, cadenza, gittata, controllo, mobilità), lucchetto e livello per gli oggetti bloccati, selettori degli accessori per slot, mimetica, anteprima 3D rotante del personaggio con l'arma scelta.

## Non obiettivi

- Nessun negozio a pagamento né valuta premium.
- Nessun modello esterno o animazione scheletrica: tutto procedurale.
- Sincronizzazione cloud dell'armeria rimandata (resta locale).

## Lasciato al costruttore

Valori esatti di bilanciamento, livelli di sblocco, forme dei modelli procedurali, palette dei colori.

# Neon Arena

FPS 3D per browser con modalità Zombie a ondate e TCT 4v4 con bot. Il progetto usa TypeScript, Three.js, Vite, Vitest e Playwright.

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

Per i test end-to-end è necessario un browser supportato da Playwright. Il server Vite viene avviato automaticamente dalla configurazione dei test.

## Controlli

- `WASD`: movimento; mouse: visuale; click sinistro: fuoco; click destro: mira.
- `Shift`: scatto; `Spazio`: salto; `R`: ricarica; `Esc`: pausa.
- Zombie: `1–6` armi, `G` granata, `T` torretta, `E` porta.
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

## Limiti online

La TCT attuale è locale con bot. Il multiplayer online richiede il server autorevole descritto in `docs/TCT_SERVER.md`; Supabase viene usato solo per profili, progressione e classifiche.

# Neon Arena

FPS browser in Three.js + TypeScript (Vite): modalità Zombie (anche co-op 2–4 giocatori), TCT online, armeria e progressione, account e classifica su Supabase. Pubblicato su GitHub Pages dal workflow `.github/workflows/deploy.yml`.

## Stato attuale

- Ultime attività: Fase C (moduli di mobilità, tasto B, solo Zombie), Fase B (movimento e aggancio ai bordi a 2,7 m), Fase F (classifica globale). Ultima verifica: 271 unit e 19/19 E2E verdi.
- Piani: `docs/roadmap-futura.md` (Fasi 9–14) e `docs/piano-grafica-movimento.md` (fasi D ed E ancora da fare).
- Storico completo delle attività: `docs/diario-integrazione.md`. Leggilo solo quando serve il contesto di una scelta passata.
- Dal 2026-11-23 il progetto è sviluppato solo da Claude: Kimi non ci lavora più. Le assegnazioni a Kimi nei documenti di roadmap vanno considerate di Claude.

## Regole

1. Prima di modificare o committare, leggi `git status --short` e controlla che le modifiche siano quelle attese.
2. Niente `git reset --hard`, `git clean`, checkout distruttivi o commit indiscriminati con `git add -A`/`git commit -a`: aggiungi i file per nome.
3. Non aumentare timeout, disabilitare test o rimuovere soglie FPS per ottenere una verifica verde senza risolverne la causa.
4. Prima della pubblicazione devono passare build, test unitari ed end-to-end. Dopo il push controlla l'esito del run in CI (`gh run list`/`gh run watch`) prima di dire che una modifica è online: il deploy è rimasto bloccato per giorni quando si verificava solo in locale.
5. E2E: `CI=1 npx playwright test` sulla porta 5174 (configurabile con `PLAYWRIGHT_PORT` e `PLAYWRIGHT_OUTPUT_DIR`). Il cloud è disattivato nei test. In headless Chromium usa il rendering software: le misure FPS locali non rappresentano una GPU reale.
6. Prestazioni: non cambiare il numero di luci durante la partita (provoca ricompilazioni di shader); nuovi tipi di nemici o effetti vanno preriscaldati in `prewarmEnemies`.
7. Supabase: progetto dedicato `neon-arena` (`tyslcndahqvixabddlfe`, eu-west-1). Le migrazioni vanno in `supabase/migrations/` e riportate in `supabase/schema.sql`, con casi in `supabase/tests/rls.sql`. L'altro progetto Supabase dell'account appartiene a un'altra app e non va usato. `.env.local` contiene URL e chiave anonima e non va committato.
8. Al termine di un'attività aggiungi una voce breve in fondo a `docs/diario-integrazione.md`: data, file interessati, esito delle verifiche, punti aperti.

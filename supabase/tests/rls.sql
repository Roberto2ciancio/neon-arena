-- Test delle regole di sicurezza (Fase 9). Si esegue con l'editor SQL di Supabase o con
-- `psql`: crea due utenti di prova, verifica cosa possono fare ospite e account e li elimina.
-- Il risultato atteso è "rifiutato" o "0 righe" ovunque; "account legge i nomi altrui" = 0 righe
-- (nessun nome ancora creato da quell'account); "account run valida" = accettata come NOVA.
create temp table rls_results (test text, outcome text) on commit drop;
grant insert, select on rls_results to anon, authenticated;
do $$
declare
  me uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  n integer;
  account_name text;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (me, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-me@test.invalid'),
    (other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-other@test.invalid');

  set local role anon;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (me, 'HACK', 10, 1, 1, 30);
    insert into rls_results values ('anon inserisce run', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('anon inserisce run', 'rifiutato: ' || sqlerrm); end;
  begin
    update public.profiles set cores = 999999;
    get diagnostics n = row_count;
    insert into rls_results values ('anon modifica profili', n || ' righe modificate');
  exception when others then insert into rls_results values ('anon modifica profili', 'rifiutato: ' || sqlerrm); end;
  select count(*) into n from public.profiles;
  insert into rls_results values ('anon legge profili', n || ' righe visibili');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (other, 'FAKE', 10, 1, 1, 30);
    insert into rls_results values ('account inserisce run altrui', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account inserisce run altrui', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (me, 'ME', 9999999, 2, 5, 60);
    insert into rls_results values ('account punteggio assurdo', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account punteggio assurdo', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds, won) values (me, 'ME', 100, 3, 5, 60, true);
    insert into rls_results values ('account vittoria all''ondata 3', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account vittoria all''ondata 3', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (me, 'ME', 4200, 3, 30, 140);
    insert into rls_results values ('account senza nome utente in classifica', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account senza nome utente in classifica', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.accounts (user_id, username) values (other, 'Rubato');
    insert into rls_results values ('account crea il nome di un altro', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account crea il nome di un altro', 'rifiutato: ' || sqlerrm); end;
  reset role;
  insert into public.accounts (user_id, username) values (other, 'Ombra_7');
  set local role authenticated;
  begin
    insert into public.accounts (user_id, username) values (me, 'OMBRA_7');
    insert into rls_results values ('nome già preso (maiuscole diverse)', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('nome già preso (maiuscole diverse)', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.accounts (user_id, username) values (me, 'no spazi!');
    insert into rls_results values ('nome con caratteri non validi', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('nome con caratteri non validi', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (other, 'X', 4200, 3, 30, 140);
    insert into rls_results values ('account invia run a nome di chi ha un nome utente', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account invia run a nome di chi ha un nome utente', 'rifiutato: ' || sqlerrm); end;
  begin
    update public.accounts set username = 'Preso' where user_id = other;
    get diagnostics n = row_count;
    insert into rls_results values ('account rinomina un altro', n || ' righe modificate');
  exception when others then insert into rls_results values ('account rinomina un altro', 'rifiutato: ' || sqlerrm); end;
  select count(*) into n from public.accounts;
  insert into rls_results values ('account legge i nomi altrui', n || ' righe visibili');
  insert into public.accounts (user_id, username) values (me, 'Nova');
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds) values (me, 'OMBRA_7', 4200, 3, 30, 140);
    select callsign into account_name from public.leaderboard where player_id = me;
    insert into rls_results values ('account run valida', 'accettata come ' || account_name);
  exception when others then insert into rls_results values ('account run valida', 'RIFIUTATA (male): ' || sqlerrm); end;
  begin
    insert into public.player_saves (user_id, callsign) values (other, 'X');
    insert into rls_results values ('account scrive salvataggio altrui', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account scrive salvataggio altrui', 'rifiutato: ' || sqlerrm); end;
  -- Fase F: statistiche per run, partite TCT, privacy e funzioni pubbliche.
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds, best_combo) values (me, 'ME', 100, 3, 5, 60, 9);
    insert into rls_results values ('F: combo più lunga delle eliminazioni', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: combo più lunga delle eliminazioni', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds, weapon_kills) values (me, 'ME', 100, 3, 5, 60, '{"ar-07": 9}');
    insert into rls_results values ('F: uccisioni per arma oltre il totale', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: uccisioni per arma oltre il totale', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.leaderboard (player_id, callsign, score, wave, kills, time_seconds, best_combo, precision_hits, players, map, weapon_kills)
      values (me, 'ME', 3000, 3, 20, 120, 6, 12, 1, 'district-zero', '{"ar-07": 15, "p-9": 5}');
    insert into rls_results values ('F: run completa valida', 'accettata');
  exception when others then insert into rls_results values ('F: run completa valida', 'RIFIUTATA (male): ' || sqlerrm); end;
  begin
    insert into public.tct_matches (player_id, kills, deaths, outcome, duration_seconds) values (other, 5, 2, 'win', 180);
    insert into rls_results values ('F: account inserisce partita TCT altrui', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: account inserisce partita TCT altrui', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.tct_matches (player_id, kills, deaths, outcome, duration_seconds) values (me, 25, 0, 'win', 30);
    insert into rls_results values ('F: partita TCT impossibile', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: partita TCT impossibile', 'rifiutato: ' || sqlerrm); end;
  begin
    insert into public.tct_matches (player_id, kills, deaths, outcome, duration_seconds, map, weapon_kills) values (me, 9, 4, 'win', 180, 'depot-06', '{"smg-9": 9}');
    insert into rls_results values ('F: partita TCT valida', 'accettata');
  exception when others then insert into rls_results values ('F: partita TCT valida', 'RIFIUTATA (male): ' || sqlerrm); end;
  begin
    update public.leaderboard_privacy set hidden = true where user_id = other;
    get diagnostics n = row_count;
    insert into rls_results values ('F: account cambia la privacy altrui', n || ' righe modificate');
  exception when others then insert into rls_results values ('F: account cambia la privacy altrui', 'rifiutato: ' || sqlerrm); end;
  select count(*) into n from public.get_leaderboard('score') where username = 'Nova' and is_me;
  insert into rls_results values ('F: classifica mostra la propria riga', n || ' righe (atteso 1)');
  select count(*) into n from public.get_leaderboard('kd');
  insert into rls_results values ('F: K/D sotto le 10 partite escluso', n || ' righe (atteso 0)');
  insert into public.leaderboard_privacy (user_id, hidden) values (me, true);
  reset role;

  -- Da qui in poi nessun utente autenticato: auth.uid() è null.
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    insert into public.tct_matches (player_id, kills, deaths, outcome, duration_seconds) values (me, 1, 1, 'loss', 180);
    insert into rls_results values ('F: anon inserisce partita TCT', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: anon inserisce partita TCT', 'rifiutato: ' || sqlerrm); end;
  select count(*) into n from public.tct_matches;
  insert into rls_results values ('F: anon legge le partite TCT', n || ' righe visibili');
  select count(*) into n from public.leaderboard_privacy;
  insert into rls_results values ('F: anon legge la privacy', n || ' righe visibili');
  begin
    perform * from public.leaderboard_values('score', '-infinity', null, null, null);
    insert into rls_results values ('F: anon chiama la funzione interna con gli id', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('F: anon chiama la funzione interna con gli id', 'rifiutato: ' || sqlerrm); end;
  select count(*) into n from public.get_leaderboard('score') where username = 'Nova';
  insert into rls_results values ('F: profilo nascosto fuori dalla classifica', n || ' righe (atteso 0)');
  insert into rls_results values ('F: profilo nascosto non leggibile', coalesce(public.get_public_profile('Nova')::text, 'null (atteso)'));
  select count(*) into n from public.get_weapon_usage() where weapon_id = 'ar-07';
  insert into rls_results values ('F: armi della comunità (aggregate)', n || ' righe (atteso 1)');
  select count(*) into n from public.leaderboard;
  insert into rls_results values ('F: anon legge le run direttamente', n || ' righe visibili (atteso 0 dopo global_stats_close_reads)');
  reset role;

  delete from auth.users where id in (me, other);
end $$;
select * from rls_results;

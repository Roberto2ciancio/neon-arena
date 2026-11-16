-- Test delle regole di sicurezza (Fase 9). Si esegue con l'editor SQL di Supabase o con
-- `psql`: crea due utenti di prova, verifica cosa possono fare ospite e account e li elimina.
-- Il risultato atteso è "rifiutato" o "0 righe" ovunque, tranne "account run valida" = accettata.
create temp table rls_results (test text, outcome text) on commit drop;
grant insert, select on rls_results to anon, authenticated;
do $$
declare
  me uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  n integer;
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
    insert into rls_results values ('account run valida', 'accettata');
  exception when others then insert into rls_results values ('account run valida', 'RIFIUTATA (male): ' || sqlerrm); end;
  begin
    insert into public.player_saves (user_id, callsign) values (other, 'X');
    insert into rls_results values ('account scrive salvataggio altrui', 'ACCETTATO (male)');
  exception when others then insert into rls_results values ('account scrive salvataggio altrui', 'rifiutato: ' || sqlerrm); end;
  reset role;

  delete from auth.users where id in (me, other);
end $$;
select * from rls_results;

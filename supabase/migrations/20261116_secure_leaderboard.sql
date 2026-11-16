-- Fase 9: niente più scritture anonime. Gli ospiti giocano in locale; profilo e classifica
-- online appartengono agli account di Supabase Auth.

-- profiles: tabella del vecchio salvataggio anonimo, sostituita da player_saves.
-- Le righe esistenti restano, ma nessuno può più leggerle o modificarle con la chiave pubblica.
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "players create profiles" on public.profiles;
drop policy if exists "players update profiles" on public.profiles;

-- leaderboard: ogni run appartiene a un account; lettura pubblica.
alter table public.leaderboard drop constraint if exists leaderboard_player_id_fkey;
alter table public.leaderboard
  add constraint leaderboard_player_id_fkey foreign key (player_id) references auth.users(id) on delete cascade;
create index if not exists leaderboard_player_created_idx on public.leaderboard (player_id, created_at desc);

drop policy if exists "runs can be submitted" on public.leaderboard;
drop policy if exists "leaderboard is readable" on public.leaderboard;
create policy "leaderboard is readable" on public.leaderboard for select to anon, authenticated using (true);
create policy "players submit own runs" on public.leaderboard
  for insert to authenticated with check ((select auth.uid()) = player_id);

-- Validazione lato server: limiti di plausibilità e frequenza. I valori seguono le regole di
-- src/game/zombies.ts (getWaveSpawnCount) con margine; vanno aggiornati se cambiano le ondate.
create or replace function public.validate_leaderboard_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_kills integer;
  recent integer;
begin
  select coalesce(sum(8 + round(3.5 * w) + floor(w / 3.0) * 2 + 2), 0)::integer
    into max_kills
    from generate_series(1, new.wave) as w;
  if new.kills > max_kills then
    raise exception 'run non plausibile: troppe eliminazioni';
  end if;
  if new.score > new.kills * 100000 + 200000 then
    raise exception 'run non plausibile: punteggio troppo alto';
  end if;
  if new.time_seconds < greatest(new.wave - 1, 0) * 8 or new.time_seconds > 6 * 3600 then
    raise exception 'run non plausibile: durata';
  end if;
  if new.won and new.wave < 15 then
    raise exception 'run non plausibile: vittoria prima dell''ultima ondata';
  end if;
  select count(*) into recent
    from public.leaderboard
    where player_id = new.player_id and created_at > now() - interval '10 minutes';
  if recent >= 10 then
    raise exception 'troppe run inviate: riprova fra qualche minuto';
  end if;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.validate_leaderboard_run() from public, anon, authenticated;

drop trigger if exists validate_leaderboard_run on public.leaderboard;
create trigger validate_leaderboard_run
  before insert on public.leaderboard
  for each row execute function public.validate_leaderboard_run();

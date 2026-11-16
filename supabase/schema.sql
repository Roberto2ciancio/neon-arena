create table if not exists public.profiles (
  id uuid primary key,
  callsign text not null check (char_length(callsign) between 1 and 12),
  cores integer not null default 0 check (cores >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  best_wave integer not null default 0 check (best_wave between 0 and 15),
  total_kills integer not null default 0 check (total_kills >= 0),
  runs integer not null default 0 check (runs >= 0),
  upgrades jsonb not null default '{"vitality":0,"power":0,"mobility":0}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  callsign text not null check (char_length(callsign) between 1 and 12),
  score integer not null check (score >= 0),
  wave integer not null check (wave between 0 and 15),
  kills integer not null check (kills >= 0),
  time_seconds integer not null check (time_seconds >= 0),
  won boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_ranking_idx on public.leaderboard (wave desc, score desc, time_seconds asc);

alter table public.profiles enable row level security;
alter table public.leaderboard enable row level security;

-- Policy e validazione della classifica: vedi migrations/20261116_secure_leaderboard.sql (incluso sotto).

-- Salvataggi degli account (Supabase Auth): ogni utente legge e scrive solo la propria riga.
create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null check (char_length(callsign) between 1 and 12),
  progress jsonb not null default '{}'::jsonb,
  armory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- Limite di dimensione contro abusi: un salvataggio normale pesa pochi KB.
  constraint player_saves_size check (pg_column_size(progress) + pg_column_size(armory) < 65536)
);

alter table public.player_saves enable row level security;

create policy "players read own save" on public.player_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "players create own save" on public.player_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "players update own save" on public.player_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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

-- Nome utente degli account: unico senza distinguere maiuscole e minuscole, 3–12 caratteri
-- (lettere, numeri, trattino basso), stesso limite del callsign mostrato in classifica.
create table if not exists public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,12}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounts_username_lower_idx on public.accounts (lower(username));

alter table public.accounts enable row level security;

create policy "players read own account" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "players create own account" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "players update own account" on public.accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- La disponibilità di un nome non si interroga: il nome si rivendica dopo l'accesso e l'indice
-- unico rifiuta quelli già presi (409). Così nessuno può elencare i nomi utente esistenti.

-- In classifica compare sempre il nome utente dell'account: nessuno può firmarsi con quello di un altro.
create or replace function public.validate_leaderboard_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_kills integer;
  recent integer;
  account_name text;
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
  select upper(username) into account_name from public.accounts where user_id = new.player_id;
  if account_name is null then
    raise exception 'scegli un nome utente prima di entrare in classifica';
  end if;
  new.callsign := account_name;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.validate_leaderboard_run() from public, anon, authenticated;

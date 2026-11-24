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

-- Fase F (2026-11-20): vedi supabase/migrations/20261120_global_stats.sql e 20261120_global_stats_close_reads.sql
-- Fase F: classifica globale e statistiche pubbliche dei giocatori.
-- Le run Zombie e le partite TCT restano righe validate dal database; le classifiche e i
-- profili pubblici si leggono solo tramite funzioni che espongono nome utente e statistiche
-- (mai email o id dell'account) e rispettano la scelta "nascondi il mio profilo".

-- Run Zombie più ricche.
alter table public.leaderboard
  add column if not exists best_combo integer not null default 0 check (best_combo >= 0),
  add column if not exists precision_hits integer not null default 0 check (precision_hits >= 0),
  add column if not exists map text check (map is null or map ~ '^[a-z0-9-]{1,24}$'),
  add column if not exists players smallint not null default 1 check (players between 1 and 4),
  add column if not exists weapon_kills jsonb not null default '{}'::jsonb;

create index if not exists leaderboard_created_idx on public.leaderboard (created_at desc);

-- Uccisioni per arma: oggetto con al massimo 12 armi del catalogo (id brevi) e valori interi.
create or replace function public.valid_weapon_kills(data jsonb, max_total integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(data) = 'object'
    and (select count(*) from jsonb_object_keys(data)) <= 12
    and not exists (
      select 1 from jsonb_each(data) as entry(key, value)
      where entry.key !~ '^[a-z0-9-]{1,24}$'
        or jsonb_typeof(entry.value) <> 'number'
        or (entry.value)::text !~ '^[0-9]{1,6}$'
    )
    and coalesce((select sum((entry.value)::text::integer) from jsonb_each(data) as entry(key, value)), 0) <= max_total;
$$;

revoke all on function public.valid_weapon_kills(jsonb, integer) from public, anon, authenticated;

-- Validazione delle run: come prima, con i campi nuovi. In co-op gli zombie aumentano del 50%
-- per ogni giocatore in più, quindi il tetto delle eliminazioni cresce allo stesso modo.
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
  max_kills := ceil(max_kills * (1 + 0.5 * (new.players - 1)))::integer;
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
  if new.best_combo > new.kills then
    raise exception 'run non plausibile: combo più lunga delle eliminazioni';
  end if;
  if new.precision_hits > new.kills * 40 + 200 then
    raise exception 'run non plausibile: colpi di precisione';
  end if;
  if not public.valid_weapon_kills(new.weapon_kills, new.kills) then
    raise exception 'run non plausibile: uccisioni per arma';
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

-- Partite TCT. Le giocano i browser fra loro (PeerJS): il database non può verificarle,
-- scarta solo i valori impossibili (limite punti 20 a squadra, partite da 3 minuti).
create table if not exists public.tct_matches (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  kills integer not null check (kills between 0 and 30),
  deaths integer not null check (deaths between 0 and 40),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  duration_seconds integer not null check (duration_seconds between 0 and 300),
  map text check (map is null or map ~ '^[a-z0-9-]{1,24}$'),
  weapon_kills jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tct_matches_player_created_idx on public.tct_matches (player_id, created_at desc);
create index if not exists tct_matches_created_idx on public.tct_matches (created_at desc);

alter table public.tct_matches enable row level security;

drop policy if exists "players submit own matches" on public.tct_matches;
create policy "players submit own matches" on public.tct_matches
  for insert to authenticated with check ((select auth.uid()) = player_id);

create or replace function public.validate_tct_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if new.kills > floor(new.duration_seconds / 3.0) + 3 then
    raise exception 'partita non plausibile: troppe eliminazioni per la durata';
  end if;
  if not public.valid_weapon_kills(new.weapon_kills, new.kills) then
    raise exception 'partita non plausibile: uccisioni per arma';
  end if;
  select count(*) into recent
    from public.tct_matches
    where player_id = new.player_id and created_at > now() - interval '10 minutes';
  if recent >= 6 then
    raise exception 'troppe partite inviate: riprova fra qualche minuto';
  end if;
  if not exists (select 1 from public.accounts where user_id = new.player_id) then
    raise exception 'scegli un nome utente prima di entrare in classifica';
  end if;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.validate_tct_match() from public, anon, authenticated;

drop trigger if exists validate_tct_match on public.tct_matches;
create trigger validate_tct_match
  before insert on public.tct_matches
  for each row execute function public.validate_tct_match();

-- Scelta di non comparire nelle classifiche e nei profili pubblici.
create table if not exists public.leaderboard_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_privacy enable row level security;

drop policy if exists "players read own privacy" on public.leaderboard_privacy;
drop policy if exists "players create own privacy" on public.leaderboard_privacy;
drop policy if exists "players update own privacy" on public.leaderboard_privacy;
create policy "players read own privacy" on public.leaderboard_privacy
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "players create own privacy" on public.leaderboard_privacy
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "players update own privacy" on public.leaderboard_privacy
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Prestigio e livello dal salvataggio (scritti dal client: solo estetici, con limiti).
create or replace function public.save_number(data jsonb, field text, lowest integer, highest integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(data -> field) = 'number' and (data ->> field) ~ '^[0-9]{1,6}$'
      then least(highest, greatest(lowest, (data ->> field)::integer))
    else lowest
  end;
$$;

revoke all on function public.save_number(jsonb, text, integer, integer) from public, anon, authenticated;

-- Valori per giocatore di una categoria (uso interno: restituisce gli id, non è pubblica).
create or replace function public.leaderboard_values(
  p_category text,
  p_since timestamptz,
  p_map text,
  p_mode text,
  p_weapon text
)
returns table (player_id uuid, value numeric, games integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_category in ('score', 'wave', 'wins', 'avg_wave', 'kills', 'combo', 'precision', 'playtime') then
    return query
      select r.player_id,
        (case p_category
          when 'score' then max(r.score)
          when 'wave' then max(r.wave)
          when 'wins' then count(*) filter (where r.won)
          when 'avg_wave' then round(avg(r.wave), 2)
          when 'kills' then sum(r.kills)
          when 'combo' then max(r.best_combo)
          when 'precision' then sum(r.precision_hits)
          else sum(r.time_seconds)
        end)::numeric,
        count(*)::integer
      from public.leaderboard r
      where r.created_at >= p_since
        and (p_map is null or r.map = p_map)
        and (p_mode is null or (p_mode = 'solo' and r.players = 1) or (p_mode = 'coop' and r.players > 1))
      group by r.player_id
      having p_category <> 'avg_wave' or count(*) >= 5;
  elsif p_category in ('kd', 'tct_kills', 'tct_wins', 'win_rate') then
    return query
      select m.player_id,
        (case p_category
          when 'kd' then round(sum(m.kills)::numeric / greatest(sum(m.deaths), 1), 2)
          when 'tct_kills' then sum(m.kills)
          when 'tct_wins' then count(*) filter (where m.outcome = 'win')
          else round(100.0 * count(*) filter (where m.outcome = 'win') / count(*), 1)
        end)::numeric,
        count(*)::integer
      from public.tct_matches m
      where m.created_at >= p_since
        and (p_map is null or m.map = p_map)
      group by m.player_id
      -- K/D e percentuale di vittoria solo con almeno 10 partite.
      having p_category not in ('kd', 'win_rate') or count(*) >= 10;
  elsif p_category = 'weapon' and p_weapon is not null then
    return query
      select source.player_id, sum(source.kills)::numeric, count(*)::integer
      from (
        select r.player_id, (r.weapon_kills ->> p_weapon)::integer as kills
          from public.leaderboard r
          where r.created_at >= p_since and r.weapon_kills ? p_weapon
        union all
        select m.player_id, (m.weapon_kills ->> p_weapon)::integer
          from public.tct_matches m
          where m.created_at >= p_since and m.weapon_kills ? p_weapon
      ) as source
      group by source.player_id;
  end if;
end;
$$;

revoke all on function public.leaderboard_values(text, timestamptz, text, text, text) from public, anon, authenticated;

-- Classifica pubblica: prime posizioni più la riga di chi la chiede (is_me).
create or replace function public.get_leaderboard(
  p_category text,
  p_period text default 'all',
  p_map text default null,
  p_mode text default null,
  p_weapon text default null,
  p_limit integer default 100
)
returns table (rank bigint, username text, prestige integer, value numeric, games integer, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      rank() over (order by v.value desc, v.games desc) as rank,
      a.username,
      public.save_number(coalesce(s.armory, '{}'::jsonb), 'prestige', 0, 10) as prestige,
      v.value,
      v.games,
      v.player_id = (select auth.uid()) as is_me
    from public.leaderboard_values(
      p_category,
      case when p_period = 'week' then now() - interval '7 days' else '-infinity'::timestamptz end,
      p_map, p_mode, p_weapon
    ) as v
    join public.accounts a on a.user_id = v.player_id
    left join public.leaderboard_privacy p on p.user_id = v.player_id
    left join public.player_saves s on s.user_id = v.player_id
    where v.value > 0 and coalesce(p.hidden, false) = false
  )
  select * from ranked
  where ranked.rank <= least(greatest(p_limit, 1), 100) or ranked.is_me
  order by ranked.rank, ranked.username;
$$;

-- Armi più usate da tutta la comunità (dati aggregati, anche dei profili nascosti).
create or replace function public.get_weapon_usage(p_period text default 'all')
returns table (weapon_id text, kills bigint, players bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select case when p_period = 'week' then now() - interval '7 days' else '-infinity'::timestamptz end as t
  ), source as (
    select r.player_id, entry.key, (entry.value)::text::integer as kills
      from public.leaderboard r, jsonb_each(r.weapon_kills) as entry(key, value), since
      where r.created_at >= since.t
    union all
    select m.player_id, entry.key, (entry.value)::text::integer
      from public.tct_matches m, jsonb_each(m.weapon_kills) as entry(key, value), since
      where m.created_at >= since.t
  )
  select source.key, sum(source.kills)::bigint, count(distinct source.player_id)::bigint
  from source
  group by source.key
  order by 2 desc
  limit 30;
$$;

-- Profilo pubblico per nome utente; null se non esiste o è nascosto (tranne per sé stessi).
create or replace function public.get_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
  name text;
  armory jsonb;
  result jsonb;
begin
  select a.user_id, a.username into target, name
    from public.accounts a where lower(a.username) = lower(p_username);
  if target is null then
    return null;
  end if;
  if target is distinct from (select auth.uid())
    and exists (select 1 from public.leaderboard_privacy p where p.user_id = target and p.hidden) then
    return null;
  end if;
  select coalesce(s.armory, '{}'::jsonb) into armory from public.player_saves s where s.user_id = target;
  armory := coalesce(armory, '{}'::jsonb);
  select jsonb_build_object(
    'username', name,
    'prestige', public.save_number(armory, 'prestige', 0, 10),
    'level', public.save_number(armory, 'level', 1, 50),
    'zombie', (
      select jsonb_build_object(
        'runs', count(*),
        'wins', count(*) filter (where r.won),
        'bestScore', coalesce(max(r.score), 0),
        'bestWave', coalesce(max(r.wave), 0),
        'averageWave', coalesce(round(avg(r.wave), 2), 0),
        'kills', coalesce(sum(r.kills), 0),
        'bestCombo', coalesce(max(r.best_combo), 0),
        'precisionHits', coalesce(sum(r.precision_hits), 0),
        'playTime', coalesce(sum(r.time_seconds), 0)
      ) from public.leaderboard r where r.player_id = target
    ),
    'tct', (
      select jsonb_build_object(
        'matches', count(*),
        'wins', count(*) filter (where m.outcome = 'win'),
        'kills', coalesce(sum(m.kills), 0),
        'deaths', coalesce(sum(m.deaths), 0)
      ) from public.tct_matches m where m.player_id = target
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('score', x.score, 'wave', x.wave, 'kills', x.kills, 'time', x.time_seconds, 'won', x.won, 'map', x.map, 'combo', x.best_combo, 'at', x.created_at) order by x.created_at desc)
      from (select * from public.leaderboard r where r.player_id = target order by r.created_at desc limit 10) as x
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.key, 'kills', w.kills) order by w.kills desc)
      from (
        select entry.key, sum((entry.value)::text::integer) as kills
        from (
          select weapon_kills from public.leaderboard where player_id = target
          union all
          select weapon_kills from public.tct_matches where player_id = target
        ) as rows, jsonb_each(rows.weapon_kills) as entry(key, value)
        group by entry.key
        order by kills desc
        limit 3
      ) as w
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_leaderboard(text, text, text, text, text, integer) from public;
revoke all on function public.get_weapon_usage(text) from public;
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_leaderboard(text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.get_weapon_usage(text) to anon, authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- Fase F, secondo passo (dopo il deploy del client che usa get_leaderboard): le run non si
-- leggono più direttamente dalla tabella, che esponeva player_id e i profili nascosti.
drop policy if exists "leaderboard is readable" on public.leaderboard;

-- ----------------------------------------------------------------------------
-- Piano gameplay G5 (migrations/20261123_daily_run.sql): run del giorno.
-- Le run del giorno sono run normali (stessi controlli di plausibilità) con in più la data
-- della sfida: solo in solitaria e solo per oggi o ieri (UTC), così una run iniziata prima di
-- mezzanotte resta valida. La classifica del giorno è la categoria 'daily' di
-- leaderboard_values: miglior punteggio delle run con la data di oggi (UTC).

alter table public.leaderboard
  add column if not exists daily_key date;

create index if not exists leaderboard_daily_idx on public.leaderboard (daily_key) where daily_key is not null;

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
  today date := (now() at time zone 'utc')::date;
begin
  select coalesce(sum(8 + round(3.5 * w) + floor(w / 3.0) * 2 + 2), 0)::integer
    into max_kills
    from generate_series(1, new.wave) as w;
  max_kills := ceil(max_kills * (1 + 0.5 * (new.players - 1)))::integer;
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
  if new.best_combo > new.kills then
    raise exception 'run non plausibile: combo più lunga delle eliminazioni';
  end if;
  if new.precision_hits > new.kills * 40 + 200 then
    raise exception 'run non plausibile: colpi di precisione';
  end if;
  if not public.valid_weapon_kills(new.weapon_kills, new.kills) then
    raise exception 'run non plausibile: uccisioni per arma';
  end if;
  if new.daily_key is not null then
    if new.players <> 1 then
      raise exception 'run del giorno: solo in solitaria';
    end if;
    if new.daily_key <> today and new.daily_key <> today - 1 then
      raise exception 'run del giorno: data non valida';
    end if;
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

create or replace function public.leaderboard_values(
  p_category text,
  p_since timestamptz,
  p_map text,
  p_mode text,
  p_weapon text
)
returns table (player_id uuid, value numeric, games integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_category in ('score', 'wave', 'wins', 'avg_wave', 'kills', 'combo', 'precision', 'playtime', 'daily') then
    return query
      select r.player_id,
        (case p_category
          when 'score' then max(r.score)
          when 'daily' then max(r.score)
          when 'wave' then max(r.wave)
          when 'wins' then count(*) filter (where r.won)
          when 'avg_wave' then round(avg(r.wave), 2)
          when 'kills' then sum(r.kills)
          when 'combo' then max(r.best_combo)
          when 'precision' then sum(r.precision_hits)
          else sum(r.time_seconds)
        end)::numeric,
        count(*)::integer
      from public.leaderboard r
      where r.created_at >= p_since
        and (p_map is null or r.map = p_map)
        and (p_mode is null or (p_mode = 'solo' and r.players = 1) or (p_mode = 'coop' and r.players > 1))
        and (p_category <> 'daily' or r.daily_key = (now() at time zone 'utc')::date)
      group by r.player_id
      having p_category <> 'avg_wave' or count(*) >= 5;
  elsif p_category in ('kd', 'tct_kills', 'tct_wins', 'win_rate') then
    return query
      select m.player_id,
        (case p_category
          when 'kd' then round(sum(m.kills)::numeric / greatest(sum(m.deaths), 1), 2)
          when 'tct_kills' then sum(m.kills)
          when 'tct_wins' then count(*) filter (where m.outcome = 'win')
          else round(100.0 * count(*) filter (where m.outcome = 'win') / count(*), 1)
        end)::numeric,
        count(*)::integer
      from public.tct_matches m
      where m.created_at >= p_since
        and (p_map is null or m.map = p_map)
      group by m.player_id
      -- K/D e percentuale di vittoria solo con almeno 10 partite.
      having p_category not in ('kd', 'win_rate') or count(*) >= 10;
  elsif p_category = 'weapon' and p_weapon is not null then
    return query
      select source.player_id, sum(source.kills)::numeric, count(*)::integer
      from (
        select r.player_id, (r.weapon_kills ->> p_weapon)::integer as kills
          from public.leaderboard r
          where r.created_at >= p_since and r.weapon_kills ? p_weapon
        union all
        select m.player_id, (m.weapon_kills ->> p_weapon)::integer
          from public.tct_matches m
          where m.created_at >= p_since and m.weapon_kills ? p_weapon
      ) as source
      group by source.player_id;
  end if;
end;
$$;

revoke all on function public.leaderboard_values(text, timestamptz, text, text, text) from public, anon, authenticated;

-- Eliminazione dell'account da parte del giocatore (GDPR). Il client non può cancellare righe di
-- auth.users: lo fa questa funzione, solo per l'utente che la chiama. Le tabelle collegate
-- (player_saves, accounts, leaderboard, tct_matches, leaderboard_privacy) hanno già
-- `on delete cascade`, quindi spariscono anche salvataggio, nome utente, run e statistiche.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'accesso richiesto';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

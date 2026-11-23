-- Piano gameplay G5: run del giorno con classifica del giorno.
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

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

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

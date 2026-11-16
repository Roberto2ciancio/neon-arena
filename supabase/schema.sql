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
  player_id uuid not null references public.profiles(id) on delete cascade,
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

create policy "profiles are readable" on public.profiles for select to anon using (true);
create policy "players create profiles" on public.profiles for insert to anon with check (true);
create policy "players update profiles" on public.profiles for update to anon using (true) with check (true);
create policy "leaderboard is readable" on public.leaderboard for select to anon using (true);
create policy "runs can be submitted" on public.leaderboard for insert to anon with check (true);

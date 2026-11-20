-- Fase F, secondo passo (dopo il deploy del client che usa get_leaderboard): le run non si
-- leggono più direttamente dalla tabella, che esponeva player_id e i profili nascosti.
drop policy if exists "leaderboard is readable" on public.leaderboard;

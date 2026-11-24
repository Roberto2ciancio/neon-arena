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

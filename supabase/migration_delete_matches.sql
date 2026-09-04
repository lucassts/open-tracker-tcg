-- Migração: apagar partida passa a apagar também no servidor.
--
-- Sem isto, apagar só saía do aparelho: a leitura seguinte encontrava a linha
-- ainda no servidor e recriava a partida. Pode rodar mais de uma vez.

-- ─── Exclusão ───────────────────────────────────────────────

/**
 * Apaga partidas da conta de quem chamou.
 *
 * Só as próprias: a linha do oponente descreve a mesma partida, mas é o
 * registro DELE. Apagar a minha não apaga a memória do outro.
 *
 * Existe porque apagar só no aparelho não apagava nada: a leitura seguinte
 * recria a linha que ainda estava no servidor, e a partida voltava do nada.
 * O aparelho guarda o id até esta chamada dar certo, então apagar sem rede
 * também funciona — a exclusão sai na próxima sincronização.
 */
create or replace function public.delete_matches(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n  integer := 0;
begin
  if me is null then raise exception 'precisa estar autenticado'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;

  delete from public.player_matches
  where owner_id = me and id = any(p_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.delete_matches(uuid[]) from public, anon;
grant execute on function public.delete_matches(uuid[]) to authenticated;

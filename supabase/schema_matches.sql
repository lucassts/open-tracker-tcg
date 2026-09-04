-- MTG Tracker — partidas atreladas à conta
--
-- Rode DEPOIS de schema.sql, schema_social.sql e schema_accounts.sql.
--
-- O que este arquivo resolve, e por que é uma peça só:
--
--   · a pessoa entra numa conta existente e o histórico volta;
--   · a partida que o oponente registrou e você aceitou vira SUA partida;
--   · se o oponente corrigir o deck dele depois, o seu "deck do oponente"
--     acompanha;
--   · dá para perguntar se já existe partida contra aquela pessoa naquele dia
--     antes de gravar a segunda.
--
-- A ideia que sustenta os quatro é a mesma: **duas linhas irmãs**. Uma partida
-- entre duas contas vira uma linha para cada lado, ligadas por `pair_id`, e
-- cada lado é dono só da metade dele — o deck que ELE jogou, o resultado do
-- ponto de vista DELE. O "deck do oponente" não é copiado: é lido da linha do
-- outro na hora da leitura. É isso que faz a correção do oponente aparecer
-- aqui sem nenhum trabalho de sincronização.

-- ─── Tabela ─────────────────────────────────────────────────

create table if not exists public.player_matches (
  -- O id vem do aparelho. Reusar o id local é o que torna o envio idempotente:
  -- reenviar a mesma partida atualiza, nunca duplica.
  id            uuid primary key,
  owner_id      uuid not null references public.players(id) on delete cascade,

  played_on     date not null,
  format        text not null default 'Other',
  my_deck       text not null default '',
  -- Guardado para a partida sem par. Com par, a leitura ignora esta coluna e
  -- usa o `my_deck` do irmão.
  opp_deck      text not null default '',
  archetype     text,
  on_play       boolean,
  won           boolean not null default false,
  drew          boolean not null default false,
  /**
   * Quem levou cada game, na ordem, do ponto de vista do DONO da linha:
   * true = o dono ganhou aquele game, false = o oponente, null = não jogado.
   *
   * Guardado por perspectiva, e não como "eu/ele", pelo mesmo motivo de `won`
   * já ser assim: as duas linhas da mesma partida são espelhos, e inverter um
   * booleano é uma negação. Guardar "me"/"opp" obrigaria a traduzir de um lado
   * para o outro toda vez, e um dia alguém esqueceria.
   */
  games         boolean[],
  notes         text not null default '',
  deck_version  text,

  opponent_id   uuid references public.players(id) on delete set null,
  opponent_name text not null default '',
  venue_id      uuid references public.venues(id) on delete set null,
  venue_name    text not null default '',

  /** As duas linhas da mesma partida real compartilham este valor. */
  pair_id       uuid,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint player_matches_notes_len check (char_length(notes) <= 2000),
  constraint player_matches_deck_len  check (char_length(my_deck) <= 80
                                         and char_length(opp_deck) <= 80),
  constraint player_matches_games_len check (games is null
                                         or coalesce(array_length(games, 1), 0) <= 3)
);

-- A coluna nasce depois da tabela: quem já tinha o banco de pé não passa pelo
-- `create table` acima.
alter table public.player_matches
  add column if not exists games boolean[];

do $$
begin
  alter table public.player_matches
    add constraint player_matches_games_len check (games is null
      or coalesce(array_length(games, 1), 0) <= 3);
exception when duplicate_object then null;
end $$;

create index if not exists player_matches_owner_idx
  on public.player_matches (owner_id, played_on desc);
create index if not exists player_matches_pair_idx
  on public.player_matches (pair_id) where pair_id is not null;
-- Sustenta a checagem de partida repetida no mesmo dia contra a mesma pessoa.
create index if not exists player_matches_same_day_idx
  on public.player_matches (owner_id, opponent_id, played_on)
  where opponent_id is not null;

alter table public.player_matches enable row level security;

-- Só o dono lê e escreve a própria linha. A linha do irmão NÃO é legível
-- direto: o que atravessa é só o `my_deck` dele, e por função, que é o mínimo
-- para espelhar a correção sem abrir o histórico de ninguém.
drop policy if exists "le as proprias partidas" on public.player_matches;
create policy "le as proprias partidas" on public.player_matches
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "escreve as proprias partidas" on public.player_matches;
create policy "escreve as proprias partidas" on public.player_matches
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─── Games ──────────────────────────────────────────────────

/**
 * Converte o array JSON que vem do aparelho em `boolean[]`.
 *
 * A ordem importa e por isso o `with ordinality`: sem ele, `array_agg` não
 * promete ordem, e um 2x1 poderia virar 1x2 na volta.
 */
create or replace function public.games_do_json(p jsonb)
returns boolean[]
language sql
immutable
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then null
    else (
      select array_agg(
        case when jsonb_typeof(g) = 'boolean' then g::text::boolean else null end
        order by ord
      )
      from jsonb_array_elements(p) with ordinality t(g, ord)
    )
  end;
$$;

/** O mesmo placar visto do outro lado da mesa. */
create or replace function public.games_invertidos(p boolean[])
returns boolean[]
language sql
immutable
as $$
  select case
    when p is null then null
    else (
      select array_agg(case when g is null then null else not g end order by ord)
      from unnest(p) with ordinality t(g, ord)
    )
  end;
$$;

-- ─── Envio ──────────────────────────────────────────────────

/**
 * Sobe um lote de partidas do aparelho.
 *
 * Idempotente pelo id local: reenviar atualiza em vez de duplicar, que é o que
 * permite a fila do app reenviar sem medo depois de uma falha de rede.
 *
 * Não apaga nada. Sumir do aparelho não some do servidor — apagar em um
 * aparelho não pode esvaziar a conta inteira por acidente.
 */
create or replace function public.push_matches(p_matches jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  n   integer := 0;
begin
  if me is null then raise exception 'precisa estar autenticado'; end if;

  insert into public.player_matches (
    id, owner_id, played_on, format, my_deck, opp_deck, archetype,
    on_play, won, drew, games, notes, deck_version,
    opponent_id, opponent_name, venue_id, venue_name, pair_id, updated_at
  )
  select
    (m ->> 'id')::uuid,
    me,
    (m ->> 'played_on')::date,
    coalesce(m ->> 'format', 'Other'),
    left(coalesce(m ->> 'my_deck', ''), 80),
    left(coalesce(m ->> 'opp_deck', ''), 80),
    m ->> 'archetype',
    (m ->> 'on_play')::boolean,
    coalesce((m ->> 'won')::boolean, false),
    coalesce((m ->> 'drew')::boolean, false),
    public.games_do_json(m -> 'games'),
    left(coalesce(m ->> 'notes', ''), 2000),
    m ->> 'deck_version',
    nullif(m ->> 'opponent_id', '')::uuid,
    coalesce(m ->> 'opponent_name', ''),
    nullif(m ->> 'venue_id', '')::uuid,
    coalesce(m ->> 'venue_name', ''),
    nullif(m ->> 'pair_id', '')::uuid,
    now()
  from jsonb_array_elements(p_matches) as m
  on conflict (id) do update set
    played_on = excluded.played_on,
    format = excluded.format,
    my_deck = excluded.my_deck,
    opp_deck = excluded.opp_deck,
    archetype = excluded.archetype,
    on_play = excluded.on_play,
    won = excluded.won,
    drew = excluded.drew,
    games = excluded.games,
    notes = excluded.notes,
    deck_version = excluded.deck_version,
    opponent_id = excluded.opponent_id,
    opponent_name = excluded.opponent_name,
    venue_id = excluded.venue_id,
    venue_name = excluded.venue_name,
    pair_id = coalesce(public.player_matches.pair_id, excluded.pair_id),
    updated_at = now()
  -- Só o dono sobrescreve a própria linha. Sem isto, mandar o id de outro
  -- reescreveria a partida dele.
  where public.player_matches.owner_id = me;

  get diagnostics n = row_count;
  return n;
end;
$$;

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

-- ─── Leitura ────────────────────────────────────────────────

/**
 * Devolve as partidas da conta, com o deck do oponente já espelhado.
 *
 * `opp_deck` sai da linha irmã quando ela existe. É por isso que o oponente
 * corrigir o deck dele aparece aqui: não há cópia para ficar velha.
 */
-- `create or replace` não muda o tipo de retorno de uma função que já
-- existe: o placar é uma coluna nova na tabela devolvida, então a antiga
-- precisa sair antes. O `drop` derruba as permissões junto, e por isso elas
-- são refeitas logo abaixo.
drop function if exists public.pull_matches();

create or replace function public.pull_matches()
returns table (
  id uuid, played_on date, format text, my_deck text, opp_deck text,
  archetype text, on_play boolean, won boolean, drew boolean,
  games boolean[], notes text,
  deck_version text, opponent_id uuid, opponent_name text,
  venue_id uuid, venue_name text, pair_id uuid, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.played_on, m.format, m.my_deck,
    coalesce(nullif(irmao.my_deck, ''), m.opp_deck) as opp_deck,
    m.archetype, m.on_play, m.won, m.drew,
    -- O placar do irmão só entra quando esta linha não tem nenhum: assim a
    -- partida que o oponente registrou com placar chega inteira, e o placar
    -- que este lado marcou nunca é sobrescrito pelo do outro.
    coalesce(m.games, public.games_invertidos(irmao.games)) as games,
    m.notes, m.deck_version,
    m.opponent_id, m.opponent_name, m.venue_id, m.venue_name,
    m.pair_id, greatest(m.updated_at, coalesce(irmao.updated_at, m.updated_at))
  from public.player_matches m
  left join lateral (
    select o.my_deck, o.games, o.updated_at
    from public.player_matches o
    where o.pair_id = m.pair_id
      and m.pair_id is not null
      and o.owner_id <> m.owner_id
    limit 1
  ) irmao on true
  where m.owner_id = auth.uid()
  order by m.played_on desc, m.created_at desc;
$$;

/**
 * Quantas partidas já existem contra aquela pessoa naquele dia.
 *
 * O app pergunta ANTES de gravar. Dois jogadores registrando a mesma partida
 * é o caso normal, não a exceção: cada um abre o app e anota. Sem isto a base
 * fica com a mesma partida duas vezes e o win rate de ambos mente.
 */
create or replace function public.matches_same_day(p_opponent uuid, p_day date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.player_matches m
  where m.owner_id = auth.uid()
    and m.opponent_id = p_opponent
    and m.played_on = p_day;
$$;

-- ─── Aceitar reivindicação cria a partida deste lado ────────

/**
 * Confirma ou contesta, e — ao confirmar — cria a partida na conta de quem
 * aceitou, irmanada com a de quem registrou.
 *
 * Antes, aceitar só promovia o evento para a base de meta: quem aceitava
 * confirmava uma partida que nunca aparecia no próprio histórico. O ponto de
 * confirmar é justamente reconhecer que aquela partida foi sua.
 *
 * O resultado é invertido de propósito: quem registrou disse que venceu, então
 * quem aceita perdeu. Empate continua empate para os dois.
 */
create or replace function public.resolve_claim(p_claim uuid, p_accept boolean)
returns public.claim_status
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.match_claims;
  me       uuid := auth.uid();
  novo_par uuid;
  minha    uuid;
  dia      date;
begin
  select * into c from public.match_claims where id = p_claim for update;

  if c.id is null then raise exception 'reivindicação não encontrada'; end if;
  if c.opponent_id <> me then raise exception 'só o oponente resolve'; end if;
  if c.status <> 'pending' then raise exception 'já resolvida'; end if;

  update public.match_claims
    set status = case when p_accept then 'confirmed' else 'disputed' end::public.claim_status,
        resolved_at = now()
  where id = p_claim;

  if p_accept then
    -- Repare no que não é copiado para a base de meta: reporter_id e
    -- opponent_id ficam para trás. Ela registra que a partida foi verificada,
    -- nunca por quem.
    insert into public.matches_anon (
      event_id, install_id, format, archetype, my_deck, opp_deck,
      on_play, won, drew, played_week, app_version, verified, venue_id
    )
    select
      (c.payload ->> 'event_id')::uuid,
      (c.payload ->> 'install_id')::uuid,
      c.payload ->> 'format',
      c.payload ->> 'archetype',
      left(coalesce(c.payload ->> 'my_deck', ''), 80),
      left(coalesce(c.payload ->> 'opp_deck', ''), 80),
      (c.payload ->> 'on_play')::boolean,
      (c.payload ->> 'won')::boolean,
      coalesce((c.payload ->> 'drew')::boolean, false),
      c.payload ->> 'played_week',
      left(coalesce(c.payload ->> 'app_version', ''), 20),
      true,
      nullif(c.payload ->> 'venue_id', '')::uuid
    on conflict (event_id) do update set verified = true;

    -- A partida de quem registrou, se ela já subiu, é quem define o par.
    select pm.id, pm.pair_id, pm.played_on into minha, novo_par, dia
    from public.player_matches pm
    where pm.owner_id = c.reporter_id
      and pm.opponent_id = me
      and pm.id = nullif(c.payload ->> 'match_id', '')::uuid
    limit 1;

    if novo_par is null then novo_par := gen_random_uuid(); end if;
    if dia is null then dia := current_date; end if;

    -- Marca o par na linha de quem registrou, para os dois apontarem para o
    -- mesmo lugar.
    if minha is not null then
      update public.player_matches set pair_id = novo_par, updated_at = now()
      where id = minha and pair_id is null;
    end if;

    -- E cria a linha deste lado, com o resultado invertido.
    insert into public.player_matches (
      id, owner_id, played_on, format, my_deck, opp_deck, archetype,
      on_play, won, drew, games, notes, opponent_id, opponent_name,
      venue_id, pair_id
    )
    select
      gen_random_uuid(), me, dia,
      coalesce(c.payload ->> 'format', 'Other'),
      left(coalesce(c.payload ->> 'opp_deck', ''), 80),  -- o meu é o "opp" dele
      left(coalesce(c.payload ->> 'my_deck', ''), 80),
      c.payload ->> 'archetype',
      case when (c.payload ->> 'on_play')::boolean is null then null
           else not (c.payload ->> 'on_play')::boolean end,
      case when coalesce((c.payload ->> 'drew')::boolean, false) then false
           else not coalesce((c.payload ->> 'won')::boolean, false) end,
      coalesce((c.payload ->> 'drew')::boolean, false),
      public.games_invertidos(public.games_do_json(c.payload -> 'games')),
      '',
      c.reporter_id,
      coalesce((select p.handle from public.players p where p.id = c.reporter_id), ''),
      nullif(c.payload ->> 'venue_id', '')::uuid,
      novo_par
    -- Se este lado já tinha registrado a mesma partida, não cria a segunda.
    where not exists (
      select 1 from public.player_matches x
      where x.owner_id = me and x.pair_id = novo_par
    );
  end if;

  return (select status from public.match_claims where id = p_claim);
end;
$$;

-- ─── Permissões ─────────────────────────────────────────────

revoke all on function public.games_do_json(jsonb)         from public, anon;
revoke all on function public.games_invertidos(boolean[])  from public, anon;
revoke all on function public.delete_matches(uuid[])       from public, anon;
revoke all on function public.push_matches(jsonb)          from public, anon;
revoke all on function public.pull_matches()               from public, anon;
revoke all on function public.matches_same_day(uuid, date) from public, anon;
revoke all on function public.resolve_claim(uuid, boolean) from public, anon;

grant execute on function public.games_do_json(jsonb)         to authenticated;
grant execute on function public.games_invertidos(boolean[])  to authenticated;
grant execute on function public.delete_matches(uuid[])       to authenticated;
grant execute on function public.push_matches(jsonb)          to authenticated;
grant execute on function public.pull_matches()               to authenticated;
grant execute on function public.matches_same_day(uuid, date) to authenticated;
grant execute on function public.resolve_claim(uuid, boolean) to authenticated;

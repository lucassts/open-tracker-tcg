-- Migração: o placar dos games passa a subir para o servidor.
--
-- É o recorte de `schema_matches.sql` com o que mudou. Pode rodar mais de uma
-- vez sem efeito colateral: a coluna só nasce se não existir, a constraint
-- ignora a duplicata e as funções são `create or replace`.
--
-- O app já pode ir para o ar antes disto: `push_matches` ignora chave que não
-- conhece, e `pull_matches` simplesmente não devolve o placar. Quem instalar
-- antes da migração fica com o placar só no aparelho, e ele começa a subir
-- sozinho assim que isto rodar.

alter table public.player_matches
  add column if not exists games boolean[];

do $$
begin
  alter table public.player_matches
    add constraint player_matches_games_len check (games is null
      or coalesce(array_length(games, 1), 0) <= 3);
exception when duplicate_object then null;
end $$;

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

revoke all on function public.games_do_json(jsonb)        from public, anon;
revoke all on function public.games_invertidos(boolean[]) from public, anon;
grant execute on function public.games_do_json(jsonb)        to authenticated;
grant execute on function public.games_invertidos(boolean[]) to authenticated;

/**
 * matchSync.ts — partidas atreladas à conta.
 *
 * Duas operações e nada mais: subir o que está no aparelho e baixar o que está
 * na conta. Deliberadamente sem apagar dos dois lados.
 *
 * **Por que aditivo.** Apagar uma partida num aparelho não pode esvaziar a
 * conta, e sumir do servidor não pode apagar o histórico local. Sincronização
 * bidirecional com remoção exige registrar lápides e ordenar relógios de
 * aparelhos diferentes; feito pela metade, perde dado. O que existe aqui é
 * cópia de segurança com restauração, que é o que resolve "entrei numa conta
 * existente e quero meu histórico de volta" sem arriscar o que já está salvo.
 *
 * Quem edita a mesma partida em dois aparelhos: vence a última subida. Está
 * documentado por ser uma escolha, não um descuido.
 */

import * as Crypto from 'expo-crypto';
import { getSupabase } from './supabase';
import { Match, Format, Archetype } from '../types';
import { gamesParaServidor, gamesDoServidor } from '../utils/games';

/** Só o dia importa: a hora exata nunca sai do aparelho. */
function playedOn(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Garante o UUID de sincronização, criando na primeira vez. */
export function ensureSyncId(match: Match): string {
  return match.syncId ?? Crypto.randomUUID();
}

function toRow(match: Match): Record<string, unknown> {
  return {
    id: ensureSyncId(match),
    played_on: playedOn(match.date),
    format: match.format,
    my_deck: match.myDeck ?? '',
    opp_deck: match.oppDeck ?? '',
    archetype: match.archetype ?? null,
    on_play: match.onPlay ?? null,
    won: match.won,
    drew: match.drew ?? false,
    games: gamesParaServidor(match.games),
    notes: match.notes ?? '',
    deck_version: match.deckVersion ?? null,
    opponent_id: match.opponentId ?? null,
    opponent_name: match.opponentName ?? '',
    venue_id: match.venueId ?? null,
    venue_name: match.venueName ?? '',
    pair_id: match.pairId ?? null,
  };
}

/**
 * Sobe um lote. Devolve quantas linhas o servidor gravou.
 *
 * `opponent_id` só vai quando é uma conta de verdade: o id local de um
 * oponente sem conta não significa nada do outro lado, e mandá-lo faria o
 * banco recusar a linha inteira por violação de chave estrangeira.
 */
export async function pushMatches(
  matches: Match[],
  linkedPlayerIds: ReadonlySet<string>
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase || matches.length === 0) return 0;

  const rows = matches.map(m => {
    const row = toRow(m);
    if (!row.opponent_id || !linkedPlayerIds.has(String(row.opponent_id))) {
      row.opponent_id = null;
    }
    return row;
  });

  const { data, error } = await supabase.rpc('push_matches', { p_matches: rows });
  if (error) throw error;
  return Number(data ?? 0);
}

export interface RemoteMatch extends Partial<Match> {
  syncId: string;
}

const FORMATS: Format[] = [
  'Commander', 'Modern', 'Standard', 'Pioneer', 'Legacy', 'Pauper', 'Draft', 'Other',
];
const ARCHETYPES: Archetype[] = ['Aggro', 'Midrange', 'Control', 'Combo', 'Stax'];

/** Baixa tudo o que está na conta. */
export async function pullMatches(): Promise<RemoteMatch[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('pull_matches');
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => ({
    syncId: String(r.id),
    // Meio-dia local evita que o fuso empurre a partida para o dia anterior ao
    // exibir: o servidor guarda só a data, sem hora.
    date: new Date(`${String(r.played_on)}T12:00:00`).toISOString(),
    format: FORMATS.includes(r.format as Format) ? (r.format as Format) : 'Other',
    myDeck: String(r.my_deck ?? ''),
    oppDeck: String(r.opp_deck ?? ''),
    archetype: ARCHETYPES.includes(r.archetype as Archetype)
      ? (r.archetype as Archetype) : 'Midrange',
    onPlay: r.on_play === null ? false : Boolean(r.on_play),
    won: Boolean(r.won),
    drew: Boolean(r.drew),
    games: gamesDoServidor(r.games),
    notes: String(r.notes ?? ''),
    deckVersion: (r.deck_version as string) || undefined,
    opponentId: (r.opponent_id as string) || undefined,
    opponentName: (r.opponent_name as string) || undefined,
    venueId: (r.venue_id as string) || undefined,
    venueName: (r.venue_name as string) || undefined,
    pairId: (r.pair_id as string) || undefined,
  }));
}

/**
 * Quantas partidas já existem contra aquela pessoa naquele dia, na conta.
 *
 * Serve para o caso normal de dois jogadores anotando a mesma partida: sem
 * perguntar antes, a base fica com ela duas vezes e o win rate dos dois mente.
 */
export async function matchesSameDay(
  opponentPlayerId: string,
  isoDate: string
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase.rpc('matches_same_day', {
    p_opponent: opponentPlayerId,
    p_day: playedOn(isoDate),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * social.ts — conta, amizades, locais e confirmação de partida. É a única
 * porta do app para o lado social do Supabase.
 *
 * Nada aqui roda sem o usuário criar uma conta explicitamente. A conta é
 * e-mail + apelido + senha, criada no próprio app. O e-mail não é verificado:
 * ele serve para entrar e para o amigo achar você, não como prova de posse —
 * ver o README.
 */

import { getSupabase } from './supabase';
import { Match, TelemetryEvent, VenueKind } from '../types';
import { isoWeek, toEvent } from './telemetry';
import { APP_VERSION } from '../config';

export interface RemotePlayer {
  id: string;
  /** Apelido único, em minúsculas. É a identidade pública. */
  handle: string;
}

export interface FriendRequest {
  id: string;
  direction: 'in' | 'out';
  otherId: string;
  otherHandle: string;
  createdAt: string;
}

export interface Friend {
  id: string;
  handle: string;
  since: string;
}

export interface RemoteVenue {
  id: string;
  name: string;
  kind: VenueKind;
  city: string;
  country: string;
  score?: number;
}

export interface PendingClaim {
  id: string;
  reporter_id: string;
  reporterName: string;
  payload: TelemetryEvent & { venue_id?: string };
  created_at: string;
}

class NotConfiguredError extends Error {
  constructor() {
    super('Este build não tem servidor configurado.');
    this.name = 'NotConfiguredError';
  }
}

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

// ─── Conta ──────────────────────────────────────────────────

/** Devolve o id da conta atual, ou null se ninguém entrou ainda. */
export async function currentPlayerId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Estado da sessão guardada neste aparelho.
 *
 * `unknown` existe e é o ponto todo: sem rede, renovar o token falha, e tratar
 * essa falha como "sua sessão expirou" mandaria a pessoa refazer login por
 * causa de um elevador sem sinal. Só `none` — não há sessão guardada, nem
 * vencida nem nada — é conclusivo o bastante para pedir login.
 */
export type SessionState = 'live' | 'none' | 'unknown';

export async function sessionState(): Promise<SessionState> {
  const supabase = getSupabase();
  if (!supabase) return 'unknown';
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data.session) return 'live';
    return error ? 'unknown' : 'none';
  } catch {
    return 'unknown';
  }
}

/** Regra do apelido, repetida no banco. Aqui existe para avisar antes da ida. */
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/** Erro com causa legível, para a tela escolher a mensagem certa. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind:
      | 'invalid-handle' | 'handle-taken' | 'email-taken'
      | 'bad-credentials' | 'needs-confirmation' | 'weak-password' | 'unknown'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Cria a conta e registra o apelido.
 *
 * As duas coisas são um passo só de propósito: uma conta sem apelido não
 * consegue ser achada nem exibida, e deixar esse estado existir seria criar um
 * usuário quebrado sempre que a segunda chamada falhasse. Se o apelido for
 * recusado, a sessão recém-criada é encerrada — melhor não ter conta do que
 * ter uma que não dá para usar.
 */
export async function signUp(
  email: string,
  handle: string,
  password: string
): Promise<RemotePlayer> {
  const supabase = requireClient();
  const clean = normalizeHandle(handle);

  if (!HANDLE_RE.test(clean)) {
    throw new AuthError('apelido inválido', 'invalid-handle');
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      throw new AuthError(error.message, 'email-taken');
    }
    if (msg.includes('password')) throw new AuthError(error.message, 'weak-password');
    throw new AuthError(error.message, 'unknown');
  }

  // Sessão nula = confirmação de e-mail ligada no projeto. O app não tem para
  // onde ir com isso, então falha dizendo exatamente o que está errado.
  if (!data.session) {
    throw new AuthError('confirmação de e-mail está ligada no projeto', 'needs-confirmation');
  }

  try {
    return await registerHandle(clean);
  } catch (e) {
    await supabase.auth.signOut();
    throw e;
  }
}

export async function signIn(email: string, password: string): Promise<RemotePlayer> {
  const supabase = requireClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new AuthError(error.message, 'bad-credentials');
  return me();
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase?.auth.signOut();
}

/** Grava o apelido. Também é o caminho de trocar de apelido depois. */
export async function registerHandle(handle: string): Promise<RemotePlayer> {
  const supabase = requireClient();
  const clean = normalizeHandle(handle);
  if (!HANDLE_RE.test(clean)) {
    throw new AuthError('apelido inválido', 'invalid-handle');
  }

  const { data, error } = await supabase.rpc('register_player', { p_handle: clean });
  if (error) {
    if (error.code === '23505') throw new AuthError(error.message, 'handle-taken');
    if (error.code === '22023') throw new AuthError(error.message, 'invalid-handle');
    throw new AuthError(error.message, 'unknown');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { id: String(row.id), handle: String(row.handle) };
}

/** Quem está logado. Lança se ninguém estiver. */
export async function me(): Promise<RemotePlayer> {
  const supabase = requireClient();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new AuthError('sem sessão', 'bad-credentials');

  const { data, error } = await supabase
    .from('players')
    .select('id, handle')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError('conta sem apelido', 'invalid-handle');
  return { id: String(data.id), handle: String(data.handle) };
}

/** E-mail da sessão. Só para mostrar na tela de conta. */
export async function currentEmail(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return '';
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? '';
}

// ─── Amizades ───────────────────────────────────────────────

export interface SendResult {
  /** Nulo quando já eram amigos e nada precisou ser criado. */
  requestId: string | null;
  targetId: string;
  targetHandle: string;
  /** Vínculo já existe — por pedido cruzado ou porque já eram amigos. */
  friends: boolean;
}

/** Manda pedido para um apelido ou e-mail exato. */
export async function sendFriendRequest(query: string): Promise<SendResult> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_query: query.trim(),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('não achei ninguém com esse apelido ou e-mail');
  return {
    requestId: row.request_id ? String(row.request_id) : null,
    targetId: String(row.target_id),
    targetHandle: String(row.target_handle),
    friends: Boolean(row.already_friends),
  };
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_friend_requests');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    direction: r.direction === 'out' ? 'out' : 'in',
    otherId: String(r.other_id),
    otherHandle: String(r.other_handle),
    createdAt: String(r.created_at),
  }));
}

export async function resolveFriendRequest(
  id: string,
  accept: boolean
): Promise<RemotePlayer> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc('resolve_friend_request', {
    p_id: id,
    p_accept: accept,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { id: String(row.other_id), handle: String(row.other_handle) };
}

export async function listFriends(): Promise<Friend[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_friends');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    handle: String(r.handle),
    since: String(r.since),
  }));
}

export async function removeFriend(otherId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc('remove_friend', { p_other: otherId });
  if (error) throw error;
}

// ─── Locais ─────────────────────────────────────────────────

/**
 * Busca antes de criar. É a peça que impede a base virar dez "Loja do Zé":
 * a interface só oferece criar depois de mostrar o que já existe.
 */
export async function searchVenues(query: string, city = ''): Promise<RemoteVenue[]> {
  const supabase = getSupabase();
  if (!supabase || !query.trim()) return [];

  const { data, error } = await supabase.rpc('search_venues', {
    p_query: query.trim(),
    p_city: city.trim(),
  });
  if (error) throw error;
  return (data ?? []) as RemoteVenue[];
}

export async function createVenue(input: {
  name: string;
  kind: Exclude<VenueKind, 'casa'>;
  city?: string;
  country?: string;
}): Promise<RemoteVenue> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc('create_venue', {
    p_name: input.name,
    p_kind: input.kind,
    p_city: input.city ?? '',
    p_country: input.country ?? '',
  });
  if (error) throw error;
  return data as RemoteVenue;
}

// ─── Partidas verificadas ───────────────────────────────────

/**
 * Monta o payload da reivindicação: o evento anônimo, o local e o id de
 * sincronização da partida.
 *
 * O `match_id` é o que permite ao servidor irmanar as duas linhas quando o
 * oponente aceitar: sem ele, a partida dele nasceria solta e a correção de
 * deck de um lado nunca chegaria no outro.
 */
export function claimPayload(
  match: Match,
  installId: string,
  venueId?: string
): TelemetryEvent & { venue_id?: string; match_id?: string } {
  const event = toEvent(match, installId);
  return {
    ...event,
    ...(venueId ? { venue_id: venueId } : {}),
    ...(match.syncId ? { match_id: match.syncId } : {}),
  };
}

/**
 * Registra a partida para o oponente confirmar. Devolve o id da
 * reivindicação, que o aparelho guarda junto da partida local.
 */
export async function submitClaim(
  opponentPlayerId: string,
  payload: TelemetryEvent & { venue_id?: string }
): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc('submit_claim', {
    p_opponent: opponentPlayerId,
    p_payload: payload,
  });
  if (error) throw error;
  return String(data);
}

/** Partidas que alguém registrou contra você e estão esperando resposta. */
export async function listPendingClaims(): Promise<PendingClaim[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const me = await currentPlayerId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('match_claims')
    .select('id, reporter_id, payload, created_at, players!match_claims_reporter_id_fkey(handle)')
    .eq('opponent_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    reporter_id: String(row.reporter_id),
    reporterName:
      (row.players as { handle?: string } | null)?.handle || '',
    payload: row.payload as TelemetryEvent & { venue_id?: string },
    created_at: String(row.created_at),
  }));
}

export async function resolveClaim(claimId: string, accept: boolean): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc('resolve_claim', {
    p_claim: claimId,
    p_accept: accept,
  });
  if (error) throw error;
  return String(data);
}

/** Reexportado para a interface montar o resumo de uma reivindicação. */
export { isoWeek, APP_VERSION };

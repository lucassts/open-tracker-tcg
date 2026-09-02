import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Match, Settings, PendingReview, TelemetryEvent, Deck, DeckVersion, Format, Archetype,
  CounterPrefs, CustomCounter, DEFAULT_COUNTER_PREFS,
  SharePrefs, DEFAULT_SHARE_PREFS,
  Opponent, Venue, SocialSettings, DEFAULT_SOCIAL, SyncStatus,
} from '../types';
import { seedMatches } from '../data/seed';
import { flushQueue, newInstallId, toEvent, QUEUE_LIMIT } from '../services/telemetry';
import { claimPayload, submitClaim, sessionState } from '../services/social';
import { pushMatches, pullMatches, ensureSyncId } from '../services/matchSync';
import { shouldSync, SyncOutcome } from '../utils/syncThrottle';
import { defaultDeckVersion, lastUseOfDeck } from '../utils/deckVersion';
import { gamesSupostos, resultadoDosGames } from '../utils/games';
import { ehSessaoVencida } from '../services/erros';
import { getArchetypeForDeck } from '../data/decks';

/** Contador local para ids: `Date.now()` colide quando dois somem no mesmo ms. */
let idCounter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

interface AppState {
  matches: Match[];
  settings: Settings;
  pendingReview: PendingReview | null;
  /** Eventos anônimos aguardando envio. Vazio quando o compartilhamento está desligado. */
  telemetryQueue: TelemetryEvent[];
  decks: Deck[];
  deckVersions: DeckVersion[];
  opponents: Opponent[];
  /** Locais já usados neste aparelho, inclusive os do tipo casa. */
  venues: Venue[];
  /** Como foi a última sincronização. Null antes da primeira. */
  syncStatus: SyncStatus | null;

  // Actions
  addMatch: (match: Omit<Match, 'id' | 'date'>) => void;
  updateMatch: (match: Match) => void;
  /** Apaga uma partida. A confirmação é da tela: aqui já é decisão tomada. */
  deleteMatch: (id: string) => void;
  deleteAllData: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
  setPendingReview: (review: PendingReview | null) => void;
  renameDecks: (oldName: string, newName: string) => void;
  importMatches: (incoming: Match[]) => void;

  // Decks
  addDeck: (input: { name: string; format: Format; archetype?: Archetype }) => Deck | null;
  updateDeck: (id: string, patch: Partial<Pick<Deck, 'name' | 'format' | 'archetype' | 'archived'>>) => void;
  deleteDeck: (id: string) => void;
  addDeckVersion: (deckId: string, label: string, notes?: string, list?: string) => DeckVersion | null;
  updateDeckVersion: (id: string, patch: Partial<Pick<DeckVersion, 'label' | 'notes' | 'list'>>) => void;
  deleteDeckVersion: (id: string) => void;
  setCurrentVersion: (deckId: string, versionId: string | undefined) => void;
  /** Versão atual de um deck pelo nome — usada ao salvar a partida. */
  getCurrentVersionLabel: (deckName: string) => string | undefined;

  // Oponentes
  addOpponent: (nickname: string) => Opponent | null;
  updateOpponent: (id: string, patch: Partial<Omit<Opponent, 'id' | 'createdAt'>>) => void;
  deleteOpponent: (id: string) => void;

  // Locais
  addVenue: (venue: Venue) => Venue;
  deleteVenue: (id: string) => void;

  // Parte social
  setSocial: (partial: Partial<SocialSettings>) => void;
  /** Anota o resultado da confirmação na partida local. */
  setClaim: (matchId: string, claimId: string, status: NonNullable<Match['claimStatus']>) => void;
  /** Envia a partida para o oponente vinculado confirmar. Silencioso ao falhar. */
  claimMatch: (match: Match) => Promise<void>;

  // Contadores
  setCounterPref: (key: keyof Omit<CounterPrefs, 'custom'>, on: boolean) => void;
  /** O que o card de estatísticas leva. */
  setSharePref: (key: keyof SharePrefs, on: boolean) => void;
  addCustomCounter: (name: string) => CustomCounter | null;
  updateCustomCounter: (id: string, patch: Partial<Pick<CustomCounter, 'name' | 'enabled'>>) => void;
  deleteCustomCounter: (id: string) => void;
  /**
   * Sobe as partidas para a conta e traz o que estiver lá.
   *
   * Sem conta, é um no-op. Silencioso ao falhar: é cópia de segurança, não
   * pode virar erro na cara de quem só quis anotar uma partida — mas o
   * resultado volta, para a tela poder mostrar.
   *
   * `force` só para quem não pode esperar o intervalo: ver `syncThrottle`.
   */
  syncMatches: (force?: boolean) => Promise<SyncOutcome>;
  /**
   * Anota que o servidor recusou por falta de sessão. As telas leem isto para
   * pedir login em vez de mostrar um erro que a pessoa não pode resolver.
   */
  markNeedsLogin: () => void;
  /**
   * Confere se a sessão do servidor ainda existe.
   *
   * Roda ao abrir o app porque `social.enabled` fica salvo no aparelho e
   * sobrevive à sessão: sem esta conferência o app se mostra conectado, e só a
   * primeira ação que fala com o servidor descobre que não está.
   */
  checkSession: () => Promise<void>;
  /** Popula o app com partidas fictícias, para explorar as telas sem histórico. */
  loadDemoData: () => void;
  /** Tenta enviar a fila anônima. Silencioso: falha de rede não incomoda o usuário. */
  flushTelemetry: () => Promise<void>;
}

const defaultSettings: Settings = {
  defaultFormat: 'Commander',
  defaultDeck: '',
  shareAnon: true,
  onboarded: false,
  language: 'pt-BR',
  deckRenames: {},
  installId: '',
  counterPrefs: DEFAULT_COUNTER_PREFS,
  sharePrefs: DEFAULT_SHARE_PREFS,
  social: DEFAULT_SOCIAL,
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Começa vazio de propósito. Semear partidas fictícias no primeiro boot
      // contamina as estatísticas de quem instala o app — quem quiser ver as
      // telas povoadas usa "carregar dados de exemplo" em Configurações.
      matches: [],
      settings: defaultSettings,
      pendingReview: null,
      telemetryQueue: [],
      decks: [],
      deckVersions: [],
      opponents: [],
      venues: [],
      syncStatus: null,

      addMatch: (matchData) => {
        const match: Match = {
          id: newId('m'),
          date: new Date().toISOString(),
          // Nasce com o UUID de sincronização. É preciso já aqui porque a
          // reivindicação leva esse id, e é por ele que o servidor irmana as
          // duas linhas quando o oponente aceita.
          syncId: ensureSyncId({} as Match),
          // Carimba a versão em uso do deck, se o usuário mantém versões.
          deckVersion: get().getCurrentVersionLabel(matchData.myDeck),
          ...matchData,
        };

        // Os games mandam no resultado. `won`/`drew` continuam gravados
        // porque estatística, CSV e servidor os leem, mas passam a ser
        // consequência do placar em vez de um segundo lugar onde a verdade
        // mora — dois lugares discordariam mais cedo ou mais tarde.
        const doPlacar = resultadoDosGames(match.games);
        if (doPlacar) {
          match.won = doPlacar.won;
          match.drew = doPlacar.drew;
        }

        set(state => {
          const { settings, telemetryQueue } = state;

          // Só entra na fila se o compartilhamento estiver ligado.
          if (!settings.shareAnon) {
            return { matches: [match, ...state.matches] };
          }

          const installId = settings.installId || newInstallId();
          const queue = [...telemetryQueue, toEvent(match, installId)];

          return {
            matches: [match, ...state.matches],
            telemetryQueue: queue.slice(-QUEUE_LIMIT),
            settings: installId === settings.installId
              ? settings
              : { ...settings, installId },
          };
        });

        // Não bloqueia a UI; se falhar, fica na fila para a próxima vez.
        void get().flushTelemetry();
        // A ordem importa: a partida precisa existir no servidor ANTES da
        // reivindicação, senão o servidor não acha a linha para irmanar e os
        // dois lados ficam soltos.
        void (async () => {
          // O `true` fura o intervalo de um minuto: esperar aqui quebraria o
          // pareamento.
          await get().syncMatches(true);
          await get().claimMatch(match);
        })();
      },

      /**
       * Se o oponente é uma conta vinculada, registra a partida para ele
       * confirmar. Sem vínculo, não há o que confirmar e a partida segue como
       * as outras: local e, se o compartilhamento estiver ligado, anônima.
       */
      claimMatch: async (match) => {
        const { settings, opponents } = get();
        if (!settings.social.enabled || !match.opponentId) return;

        const opponent = opponents.find(o => o.id === match.opponentId);
        if (opponent?.linkState !== 'linked' || !opponent.playerId) return;

        try {
          const payload = claimPayload(match, settings.installId, match.venueId);
          const claimId = await submitClaim(opponent.playerId, payload);
          get().setClaim(match.id, claimId, 'pending');
        } catch (e) {
          // Falhar aqui não pode perder a partida: ela já está salva.
          console.warn('[store] não foi possível registrar a confirmação:', e);
        }
      },

      updateMatch: (updated) => {
        const doPlacar = resultadoDosGames(updated.games);
        const coerente = doPlacar ? { ...updated, ...doPlacar } : updated;
        set(state => ({
          matches: state.matches.map(m => m.id === coerente.id ? coerente : m),
        }));
      },

      /**
       * A partida sai do aparelho. A linha no servidor não é removida aqui:
       * a próxima sincronização não a traz de volta porque o pull só atualiza
       * o que ainda existe localmente, e apagar do lado de lá exigiria decidir
       * também pela cópia do oponente, que é dele.
       */
      deleteMatch: (id) => {
        set(state => ({ matches: state.matches.filter(m => m.id !== id) }));
      },

      deleteAllData: () => {
        // Apagar tudo apaga decks, oponentes, locais e o que não foi enviado.
        set({
          matches: [], telemetryQueue: [], decks: [], deckVersions: [],
          opponents: [], venues: [],
        });
      },

      updateSettings: (partial) => {
        set(state => {
          const settings = { ...state.settings, ...partial };
          // Desligar o compartilhamento descarta imediatamente o que estava
          // na fila. Opt-out não pode deixar resíduo esperando conexão.
          const turnedOff = partial.shareAnon === false;
          return {
            settings,
            telemetryQueue: turnedOff ? [] : state.telemetryQueue,
          };
        });
      },

      setPendingReview: (review) => {
        set({ pendingReview: review });
      },

      /**
       * Ponto único de renome. Precisa varrer histórico, padrão e a entidade
       * deck ao mesmo tempo: se algum ficar para trás, as estatísticas se
       * partem em dois decks com nomes diferentes.
       */
      renameDecks: (oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        set(state => ({
          matches: state.matches.map(m => ({
            ...m,
            myDeck: m.myDeck === oldName ? trimmed : m.myDeck,
            oppDeck: m.oppDeck === oldName ? trimmed : m.oppDeck,
          })),
          decks: state.decks.map(d => d.name === oldName ? { ...d, name: trimmed } : d),
          settings: {
            ...state.settings,
            defaultDeck: state.settings.defaultDeck === oldName ? trimmed : state.settings.defaultDeck,
            deckRenames: { ...state.settings.deckRenames, [oldName]: trimmed },
          },
        }));
      },

      importMatches: (incoming: Match[]) => {
        set(state => {
          const existingIds = new Set(state.matches.map(m => m.id));
          const newMatches = incoming.filter(m => m.id && !existingIds.has(m.id));
          return { matches: [...newMatches, ...state.matches] };
        });
      },

      // ── Decks ──────────────────────────────────────────────

      addDeck: ({ name, format, archetype }) => {
        const trimmed = name.trim();
        if (!trimmed) return null;

        // Nome é a chave que liga deck a partida, então não pode duplicar.
        const existing = get().decks.find(
          d => d.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) return existing;

        const deck: Deck = {
          id: newId('d'),
          name: trimmed,
          format,
          archetype: archetype ?? getArchetypeForDeck(trimmed),
          createdAt: new Date().toISOString(),
        };
        set(state => ({ decks: [...state.decks, deck] }));
        return deck;
      },

      updateDeck: (id, patch) => {
        const deck = get().decks.find(d => d.id === id);
        if (!deck) return;

        const { name, ...rest } = patch;
        const nextName = name?.trim();
        // `renameDecks` já cuida do nome em toda parte, inclusive aqui.
        if (nextName && nextName !== deck.name) get().renameDecks(deck.name, nextName);

        if (Object.keys(rest).length > 0) {
          set(state => ({
            decks: state.decks.map(d => d.id === id ? { ...d, ...rest } : d),
          }));
        }
      },

      deleteDeck: (id) => {
        // Só some da lista de decks: as partidas jogadas com ele continuam,
        // porque apagar histórico não é o que "excluir deck" deveria significar.
        set(state => ({
          decks: state.decks.filter(d => d.id !== id),
          deckVersions: state.deckVersions.filter(v => v.deckId !== id),
        }));
      },

      addDeckVersion: (deckId, label, notes = '', list = '') => {
        const trimmed = label.trim();
        if (!trimmed || !get().decks.some(d => d.id === deckId)) return null;

        const version: DeckVersion = {
          id: newId('v'),
          deckId,
          label: trimmed,
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
          list: list.trim() || undefined,
        };
        set(state => ({
          deckVersions: [...state.deckVersions, version],
          // Versão nova vira a atual: é sempre isso que se quer ao criar uma.
          decks: state.decks.map(d =>
            d.id === deckId ? { ...d, currentVersionId: version.id } : d
          ),
        }));
        return version;
      },

      updateDeckVersion: (id, patch) => {
        set(state => ({
          deckVersions: state.deckVersions.map(v =>
            v.id === id
              ? { ...v, ...patch, label: patch.label?.trim() || v.label }
              : v
          ),
        }));
      },

      deleteDeckVersion: (id) => {
        set(state => ({
          deckVersions: state.deckVersions.filter(v => v.id !== id),
          decks: state.decks.map(d =>
            d.currentVersionId === id ? { ...d, currentVersionId: undefined } : d
          ),
        }));
      },

      setCurrentVersion: (deckId, versionId) => {
        set(state => ({
          decks: state.decks.map(d =>
            d.id === deckId ? { ...d, currentVersionId: versionId } : d
          ),
        }));
      },

      /**
       * A versão que uma partida nova assume quando ninguém escolheu — a mais
       * recente entre a última usada e a última criada. Mesma regra do
       * formulário, e de propósito: o valor gravado não pode discordar do que
       * a tela mostrou.
       */
      getCurrentVersionLabel: (deckName) => {
        if (!deckName) return undefined;
        const { decks, deckVersions, matches } = get();
        const deck = decks.find(
          d => d.name.toLowerCase() === deckName.trim().toLowerCase()
        );
        if (!deck) return undefined;
        return defaultDeckVersion(
          deckVersions.filter(v => v.deckId === deck.id),
          lastUseOfDeck(matches, deckName)
        );
      },

      // ── Oponentes ──────────────────────────────────────────

      addOpponent: (nickname) => {
        const trimmed = nickname.trim().slice(0, 40);
        if (!trimmed) return null;

        const existing = get().opponents.find(
          o => o.nickname.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) return existing;

        const opponent: Opponent = {
          id: newId('o'),
          nickname: trimmed,
          linkState: 'local',
          createdAt: new Date().toISOString(),
        };
        set(state => ({ opponents: [...state.opponents, opponent] }));
        return opponent;
      },

      updateOpponent: (id, patch) => {
        set(state => ({
          opponents: state.opponents.map(o =>
            o.id === id
              ? { ...o, ...patch, nickname: patch.nickname?.trim().slice(0, 40) || o.nickname }
              : o
          ),
        }));
      },

      deleteOpponent: (id) => {
        // As partidas jogadas contra ele continuam no histórico, com o nome
        // que ficou gravado na partida. Excluir o contato não apaga o passado.
        set(state => ({ opponents: state.opponents.filter(o => o.id !== id) }));
      },

      // ── Locais ─────────────────────────────────────────────

      addVenue: (venue) => {
        const existing = get().venues.find(v => v.id === venue.id);
        if (existing) return existing;
        set(state => ({ venues: [...state.venues, venue] }));
        return venue;
      },

      deleteVenue: (id) => {
        set(state => ({ venues: state.venues.filter(v => v.id !== id) }));
      },

      // ── Parte social ───────────────────────────────────────

      markNeedsLogin: () => {
        if (get().settings.social.needsLogin) return;
        set(state => ({
          settings: {
            ...state.settings,
            social: { ...state.settings.social, needsLogin: true },
          },
        }));
      },

      checkSession: async () => {
        const { social } = get().settings;
        if (!social.enabled) return;

        const estado = await sessionState();
        // 'unknown' não decide nada: pode ser só falta de rede. Quem levanta a
        // bandeira nesse caso é o próprio servidor, devolvendo 42501 — e para
        // isso ele precisa ter sido alcançado.
        if (estado === 'unknown') return;

        const precisa = estado === 'none';
        if (precisa === Boolean(social.needsLogin)) return;
        set(state => ({
          settings: {
            ...state.settings,
            social: { ...state.settings.social, needsLogin: precisa },
          },
        }));
      },

      setSocial: (partial) => {
        set(state => {
          const social = { ...state.settings.social, ...partial };
          // Entrar ou sair resolve a pendência de login das duas maneiras: com
          // sessão nova não há o que avisar, e sem conta o aviso não faz
          // sentido.
          if (partial.enabled !== undefined) social.needsLogin = false;
          // Desligar corta o vínculo remoto de todos: sem conta, não há como
          // confirmar nada. Os apelidos ficam, viram oponentes locais.
          const opponents = partial.enabled === false
            ? state.opponents.map(o => ({
                ...o,
                linkState: 'local' as const,
                playerId: undefined,
                inviteCode: undefined,
              }))
            : state.opponents;

          return { settings: { ...state.settings, social }, opponents };
        });
      },

      setClaim: (matchId, claimId, status) => {
        set(state => ({
          matches: state.matches.map(m =>
            m.id === matchId ? { ...m, claimId, claimStatus: status } : m
          ),
        }));
      },

      // ── Preferências de contadores ─────────────────────────

      setCounterPref: (key, on) => {
        set(state => ({
          settings: {
            ...state.settings,
            counterPrefs: { ...state.settings.counterPrefs, [key]: on },
          },
        }));
      },

      setSharePref: (key, on) => {
        set(state => ({
          settings: {
            ...state.settings,
            sharePrefs: { ...state.settings.sharePrefs, [key]: on },
          },
        }));
      },

      addCustomCounter: (name) => {
        const trimmed = name.trim().slice(0, 24);
        if (!trimmed) return null;

        const prefs = get().settings.counterPrefs;
        const existing = prefs.custom.find(
          c => c.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) return existing;

        const counter: CustomCounter = { id: newId('c'), name: trimmed, enabled: true };
        set(state => ({
          settings: {
            ...state.settings,
            counterPrefs: {
              ...state.settings.counterPrefs,
              custom: [...state.settings.counterPrefs.custom, counter],
            },
          },
        }));
        return counter;
      },

      updateCustomCounter: (id, patch) => {
        set(state => ({
          settings: {
            ...state.settings,
            counterPrefs: {
              ...state.settings.counterPrefs,
              custom: state.settings.counterPrefs.custom.map(c =>
                c.id === id
                  ? { ...c, ...patch, name: patch.name?.trim().slice(0, 24) || c.name }
                  : c
              ),
            },
          },
        }));
      },

      deleteCustomCounter: (id) => {
        set(state => ({
          settings: {
            ...state.settings,
            counterPrefs: {
              ...state.settings.counterPrefs,
              custom: state.settings.counterPrefs.custom.filter(c => c.id !== id),
            },
          },
        }));
      },

      syncMatches: async (force = false) => {
        const { settings, matches, opponents, syncStatus } = get();
        if (!settings.social.enabled) return 'off';
        if (!shouldSync(syncStatus?.at, Date.now(), force)) return 'skipped';

        try {
          // Carimba o UUID de quem ainda não tem, e persiste antes de subir:
          // se o envio falhar, o id já existe e o reenvio atualiza a mesma
          // linha em vez de criar outra.
          const comId = matches.map(m => m.syncId ? m : { ...m, syncId: ensureSyncId(m) });
          if (comId.some((m, i) => m !== matches[i])) set({ matches: comId });

          // Só oponente com conta de verdade atravessa: o id local de um
          // apelido sem conta não existe do outro lado.
          const vinculados = new Set(
            opponents.filter(o => o.linkState === 'linked' && o.playerId)
              .map(o => o.playerId as string)
          );

          const enviadas = await pushMatches(comId, vinculados);

          const remotas = await pullMatches();
          set({ syncStatus: { at: new Date().toISOString(), pushed: enviadas, pulled: remotas.length } });
          if (remotas.length === 0) return 'ok';

          set(state => {
            const porSync = new Map(
              state.matches.filter(m => m.syncId).map(m => [m.syncId as string, m])
            );
            const novas: Match[] = [];

            remotas.forEach(r => {
              const local = porSync.get(r.syncId);
              if (!local) {
                // Veio de outro aparelho ou de uma partida que o oponente
                // registrou e esta conta aceitou.
                novas.push({
                  id: newId('m'),
                  archetype: 'Midrange',
                  onPlay: false,
                  won: false,
                  notes: '',
                  myDeck: '',
                  oppDeck: '',
                  format: 'Other',
                  date: new Date().toISOString(),
                  ...r,
                } as Match);
                return;
              }
              // O servidor manda em duas coisas e só nelas: o deck do oponente,
              // que é lido do lado dele, e o par. O resto é do aparelho.
              porSync.set(r.syncId, {
                ...local,
                oppDeck: r.oppDeck ?? local.oppDeck,
                pairId: r.pairId ?? local.pairId,
              });
            });

            const atualizadas = state.matches.map(m =>
              m.syncId ? (porSync.get(m.syncId) ?? m) : m
            );
            return {
              matches: [...novas, ...atualizadas].sort(
                (a, b) => b.date.localeCompare(a.date)
              ),
            };
          });
        } catch (e) {
          // Silencioso para quem só quis anotar uma partida, mas registrado:
          // as telas mostram o motivo em vez de deixar a pessoa achando que
          // subiu. Sessão vencida ganha marca própria: não é falha de rede, é
          // "entre de novo", e a tela precisa saber a diferença para dizer o
          // que fazer.
          const vencida = ehSessaoVencida(e);
          console.warn('[store] sincronização de partidas falhou:', e);
          if (vencida) get().markNeedsLogin();
          set({
            syncStatus: {
              at: new Date().toISOString(),
              pushed: 0,
              pulled: 0,
              error: vencida ? 'session' : 'other',
            },
          });
          return 'error';
        }
        return 'ok';
      },

      loadDemoData: () => {
        // Dados de exemplo nunca são compartilhados — não passam pela fila.
        set(state => {
          const existingIds = new Set(state.matches.map(m => m.id));
          const demo = seedMatches().filter(m => !existingIds.has(m.id));
          return { matches: [...demo, ...state.matches] };
        });
      },

      flushTelemetry: async () => {
        const { settings, telemetryQueue } = get();
        if (!settings.shareAnon || telemetryQueue.length === 0) return;

        const result = await flushQueue(telemetryQueue);
        if (result.sent === 0 && result.remaining.length === telemetryQueue.length) {
          return; // nada mudou, evita uma escrita inútil no AsyncStorage
        }

        set(state => {
          // Enquanto o envio rodava o usuário pode ter salvo outra partida ou
          // desligado o compartilhamento. Preserva a cauda, respeita o opt-out.
          if (!state.settings.shareAnon) return { telemetryQueue: [] };
          const added = state.telemetryQueue.slice(telemetryQueue.length);
          return { telemetryQueue: [...result.remaining, ...added] };
        });
      },
    }),
    {
      name: 'mtg-tracker-storage',
      version: 7,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        matches: state.matches,
        settings: state.settings,
        telemetryQueue: state.telemetryQueue,
        decks: state.decks,
        deckVersions: state.deckVersions,
        opponents: state.opponents,
        venues: state.venues,
        syncStatus: state.syncStatus,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppState>;

        // v0 → v1: instalações antigas nasceram com 48 partidas fictícias e sem
        // installId. Remove o seed e sorteia o id, sem tocar no que for real.
        if (version === 0 && state.matches) {
          const seedIds = new Set(seedMatches().map(m => m.id));
          state.matches = state.matches.filter(m => !seedIds.has(m.id));
        }
        if (state.settings && !state.settings.installId) {
          state.settings = { ...state.settings, installId: newInstallId() };
        }

        // v1 → v2: decks passam a ser entidade. Cria um registro para cada nome
        // que já aparece no histórico, para a tela de decks não nascer vazia
        // para quem já usava o app.
        if (version < 2) {
          state.deckVersions = state.deckVersions ?? [];
          if (!state.decks?.length && state.matches?.length) {
            const seen = new Map<string, Match>();
            state.matches.forEach(m => {
              const key = m.myDeck?.trim();
              if (key && !seen.has(key.toLowerCase())) seen.set(key.toLowerCase(), m);
            });
            state.decks = [...seen.values()].map(m => ({
              id: newId('d'),
              name: m.myDeck.trim(),
              format: m.format,
              archetype: getArchetypeForDeck(m.myDeck.trim()),
              createdAt: m.date,
            }));
          }
          state.decks = state.decks ?? [];
        }

        // v2 → v3: preferências de contadores passam a existir.
        if (version < 3 && state.settings && !state.settings.counterPrefs) {
          state.settings = { ...state.settings, counterPrefs: DEFAULT_COUNTER_PREFS };
        }

        // v3 → v4: oponentes e locais. Nascem vazios e a parte social
        // desligada — ninguém ganha conta por atualizar o app.
        if (version < 4) {
          state.opponents = state.opponents ?? [];
          state.venues = state.venues ?? [];
          if (state.settings && !state.settings.social) {
            state.settings = { ...state.settings, social: DEFAULT_SOCIAL };
          }
        }


        // v4 → v5: o card de compartilhamento passa a ser configurável. Quem
        // já usava recebe o padrão, que é o card como ele sempre foi — mais
        // os blocos novos desligados, porque expõem nome de terceiro.
        if (version < 5 && state.settings && !state.settings.sharePrefs) {
          state.settings = { ...state.settings, sharePrefs: DEFAULT_SHARE_PREFS };
        }

        // v5 → v6: a conta anônima vira conta com e-mail e apelido. Ninguém
        // migra automaticamente: a sessão antiga não tem credencial e não há
        // como transformá-la em login sem pedir e-mail e senha. Volta ao
        // estado desconectado, e os oponentes viram locais — o histórico e os
        // apelidos continuam intactos, é só o vínculo remoto que se perde.
        if (version < 6) {
          const old = state.settings?.social as
            | (Partial<SocialSettings> & { displayName?: string })
            | undefined;
          if (state.settings) {
            state.settings = {
              ...state.settings,
              social: {
                ...DEFAULT_SOCIAL,
                handle: old?.displayName ?? '',
                homeCity: old?.homeCity ?? '',
              },
            };
          }
          state.opponents = (state.opponents ?? []).map(o => ({
            ...o,
            linkState: 'local' as const,
            playerId: undefined,
            remoteName: undefined,
          }));
        }

        // v6 → v7: a partida passa a guardar quem levou cada game. O
        // histórico anterior não tem essa informação, e inventá-la seria
        // mentir; o que a migração faz é declarar a suposição — vitória 2x1,
        // empate 1x1, derrota 1x2 — para a base inteira passar a ter placar
        // sem perder nada do que já estava lá. O resultado gravado não muda:
        // `gamesSupostos` é construído para reproduzi-lo.
        if (version < 7 && state.matches) {
          state.matches = state.matches.map(m =>
            m.games ? m : { ...m, games: gamesSupostos(m.won, m.drew) }
          );
        }

        return state as AppState;
      },
    }
  )
);

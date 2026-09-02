export interface Match {
  id: string;
  date: string; // ISO 8601
  format: Format;
  myDeck: string;
  oppDeck: string;
  archetype: Archetype;
  onPlay: boolean;
  /**
   * Quem levou cada um dos três games.
   *
   * É a fonte do resultado, não um detalhe dele: `won` e `drew` continuam
   * gravados porque estatística, CSV e servidor já os leem, mas quem manda são
   * os games. Partidas anteriores ao campo ganharam um placar suposto na
   * migração — ver `gamesSupostos`.
   */
  games?: import('../utils/games').Games;
  won: boolean;
  /** true = empate/draw. Retrocompat: undefined means loss when won=false */
  drew?: boolean;
  notes: string;
  /**
   * Rótulo da versão do deck no momento em que a partida foi salva.
   * É uma cópia, não uma referência: renomear a versão depois não reescreve o
   * histórico, que é o ponto de comparar versões entre si.
   */
  deckVersion?: string;

  /** Contra quem foi. Referência local; o nome vai em `opponentName`. */
  opponentId?: string;
  opponentName?: string;

  /** Onde foi. `venueName` é cópia, para o histórico não depender do cadastro. */
  venueId?: string;
  venueName?: string;

  /**
   * Estado da confirmação pelo oponente.
   * Ausente = partida sem oponente vinculado, que não passa por confirmação.
   */
  claimStatus?: 'pending' | 'confirmed' | 'disputed';
  claimId?: string;

  /**
   * Identidade da partida no servidor. É um UUID, e não o `id` local, porque
   * o id local é sequencial deste aparelho — dois aparelhos gerariam o mesmo.
   * Nasce na primeira subida e nunca muda: é ele que faz reenviar atualizar em
   * vez de duplicar.
   */
  syncId?: string;

  /**
   * Liga esta partida à linha do oponente que descreve a MESMA partida.
   * Com par, o deck do oponente é lido do lado dele — é o que faz a correção
   * dele aparecer aqui.
   */
  pairId?: string;
}

// ─── Oponentes ──────────────────────────────────────────────

/**
 * `local`     — só um apelido neste aparelho, ninguém do outro lado.
 * `requested` — você mandou pedido de amizade e ninguém respondeu ainda.
 * `linked`    — a outra pessoa aceitou; dá para confirmar partidas.
 */
export type OpponentLink = 'local' | 'requested' | 'linked';

export interface Opponent {
  id: string;
  /** Apelido que VOCÊ deu. Não é o nome que a pessoa escolheu para si. */
  nickname: string;
  linkState: OpponentLink;
  /** Conta remota, quando vinculado. */
  playerId?: string;
  /** O apelido que a pessoa escolheu. Só existe depois do vínculo. */
  remoteName?: string;
  favorite?: boolean;
  createdAt: string;
}

// ─── Locais ─────────────────────────────────────────────────

export type VenueKind = 'loja' | 'evento' | 'casa' | 'online';

export interface Venue {
  id: string;
  name: string;
  kind: VenueKind;
  city?: string;
  country?: string;
  /**
   * Local do tipo `casa` nunca vai para a base compartilhada — é endereço
   * residencial de alguém. Fica só neste aparelho.
   */
  localOnly?: boolean;
}

// ─── Decks e versões ────────────────────────────────────────

export interface Deck {
  id: string;
  name: string;
  format: Format;
  archetype?: Archetype;
  /** Versão em uso. Aponta para `DeckVersion.id`. */
  currentVersionId?: string;
  createdAt: string;
  /** Arquivado some das listas de seleção mas preserva o histórico. */
  archived?: boolean;
}

export interface DeckVersion {
  id: string;
  deckId: string;
  /** Rótulo curto: "v3", "pós-ban", "sideboard novo". */
  label: string;
  notes: string;
  createdAt: string;
  /**
   * Lista de cartas como o jogador colou, no formato do MTGO: uma carta por
   * linha, `<qtd> <nome>`, e o sideboard depois de uma linha em branco.
   *
   * Guardado como texto bruto, não como estrutura. A contagem se recalcula em
   * qualquer momento, mas o texto original é o que o jogador reconhece — e é o
   * que ele vai querer copiar de volta para o MTGO ou para o Arena.
   */
  list?: string;
}

/** Uma linha de lista de deck já interpretada. */
export interface DeckCard {
  qty: number;
  name: string;
}

export interface ParsedDecklist {
  main: DeckCard[];
  side: DeckCard[];
  mainCount: number;
  sideCount: number;
  /** Linhas que não casaram com `<qtd> <nome>`. Não impedem salvar. */
  ignored: string[];
}

export type Language = 'en-US' | 'pt-BR' | 'ja-JP';

export interface Settings {
  defaultFormat: Format;
  defaultDeck: string;
  /** Compartilhamento anônimo de resultados. Ligado por padrão, desligável em Config. */
  shareAnon: boolean;
  onboarded: boolean;
  language: Language;
  deckRenames: Record<string, string>;
  /** UUID sorteado na instalação. Identifica o aparelho, nunca a pessoa. */
  installId: string;
  /** O que a aba de contadores mostra. */
  counterPrefs: CounterPrefs;
  /** O que o card de compartilhamento das estatísticas mostra. */
  sharePrefs: SharePrefs;
  /** Parte social: conta anônima, oponentes vinculados, locais compartilhados. */
  social: SocialSettings;
}

/**
 * Resultado da última sincronização, para a tela de conta poder mostrar.
 *
 * Existe porque a sincronização falhava em silêncio: um `console.warn` que
 * ninguém lê. Quando o servidor ainda não tinha o esquema, o app parecia estar
 * funcionando e não estava — e não havia onde olhar para descobrir.
 */
export interface SyncStatus {
  at: string;
  pushed: number;
  pulled: number;
  error?: string;
}

export interface SocialSettings {
  /** Há uma conta conectada neste aparelho. Nunca é ligado sem cadastro. */
  enabled: boolean;
  /** Id da conta. */
  playerId?: string;
  /**
   * Apelido único, em minúsculas. É a identidade pública: o que o oponente vê
   * e por onde ele acha você. O e-mail serve para o mesmo, mas não é exibido.
   */
  handle: string;
  /** E-mail da conta. Guardado só para preencher a tela de login. */
  email: string;
  /** Cidade padrão nas buscas de local. Fica no aparelho, não é enviada. */
  homeCity: string;
  /**
   * A sessão do servidor acabou, mas a conta segue salva aqui.
   *
   * Existe porque `enabled` sozinho mente: ele diz que há conta neste
   * aparelho, não que o servidor ainda aceita as chamadas. Sem separar as duas
   * coisas o app continua se mostrando conectado enquanto tudo falha com
   * "permission denied", e a pessoa não tem como saber que precisa entrar de
   * novo.
   */
  needsLogin?: boolean;
}

export const DEFAULT_SOCIAL: SocialSettings = {
  enabled: false,
  handle: '',
  email: '',
  homeCity: '',
};

export interface Filters {
  format: string;     // 'All' | format name
  deck: string[];     // [] = todos; pode ter vários decks selecionados
  oppDeck: string[];  // [] = todos; pode ter vários decks do oponente
  period: string;     // '1d'|'7d'|'30d'|'90d'|'All'
  result: string;     // 'All'|'Wins'|'Losses'|'Draws'
  /**
   * Rótulos de versão do deck. `[]` = todas, que é o estado inicial.
   * String vazia é a opção "sem versão": partidas salvas antes de o deck
   * passar a ser versionado.
   */
  version: string[];
  /**
   * Locais. `[]` = todos. String vazia é "sem local": partida anotada sem
   * dizer onde foi, que é a maioria de quem joga em casa.
   */
  venue: string[];
}

export type Format =
  | 'Commander'
  | 'Modern'
  | 'Standard'
  | 'Pioneer'
  | 'Legacy'
  | 'Pauper'
  | 'Draft'
  | 'Other';

export type Archetype = 'Aggro' | 'Midrange' | 'Control' | 'Combo' | 'Stax';

export type ConfidenceLevel = 'high' | 'low' | 'missing' | 'default';

export interface MatchConfidence {
  won?: ConfidenceLevel;
  format?: ConfidenceLevel;
  myDeck?: ConfidenceLevel;
  oppDeck?: ConfidenceLevel;
  archetype?: ConfidenceLevel;
  onPlay?: ConfidenceLevel;
}

/** Linha de aproveitamento: usada para deck, pessoa e local. */
export interface RecordRow {
  l: string;
  wins: number;
  losses: number;
  wr: number;
}

export interface ComputedStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  wr: number;
  streak: number;
  streakType: boolean | null;
  onPlayWR: number;
  onDrawWR: number;
  evolution: number[];
  decks: RecordRow[];
  /** Decks que você enfrentou, por volume. */
  opponents: { l: string; v: number }[];
  /** Aproveitamento contra cada pessoa. Só entra quem tem nome na partida. */
  oppPlayers: RecordRow[];
  /** Aproveitamento por local. Só entra partida com local registrado. */
  venues: RecordRow[];
  archetypes: { l: string; v: number; n: number }[];
}

export interface PendingReview {
  transcript: string;
  duration: number;
  confidence: MatchConfidence;
  extracted: Partial<Match>;
}

/**
 * Formato bruto devolvido pelo extrator on-device (llama.rn).
 * Todo campo é opcional: o modelo devolve apenas o que conseguiu identificar.
 */
export interface ExtractedMatch {
  won: boolean;
  drew: boolean;
  myDeck: string;
  oppDeck: string;
  format: Format;
  onPlay: boolean;
  archetype: Archetype;
  /** Nome da pessoa, já encaixado num oponente cadastrado quando reconhecido. */
  opponent: string;
  /** Nome do local, idem contra os locais já usados. */
  venue: string;
  notes: string;
}

// ─── Contadores da mesa (aba Vida) ──────────────────────────

export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export type ManaColor = (typeof MANA_COLORS)[number];
export type ManaPool = Record<ManaColor, number>;

export interface PlayerCounters {
  mana: ManaPool;
  poison: number;
  energy: number;
  experience: number;
  /** Dano de comandante recebido, indexado pelo índice do jogador que causou. */
  cmdDamage: Record<number, number>;
  /** Contadores criados pelo usuário, indexados por `CustomCounter.id`. */
  custom: Record<string, number>;
}

export interface TableCounters {
  /** Mágicas lançadas no turno — zera a cada novo turno. Vale para a mesa toda. */
  storm: number;
}

/** Contador inventado pelo usuário em Configurações → Contadores. */
export interface CustomCounter {
  id: string;
  name: string;
  enabled: boolean;
}

/** Quais contadores aparecem na tela. Mana e storm estão sempre visíveis. */
export interface CounterPrefs {
  poison: boolean;
  energy: boolean;
  experience: boolean;
  commanderDamage: boolean;
  custom: CustomCounter[];
}

// ─── O que entra no card de compartilhamento ────────────────

/**
 * Blocos opcionais do card gerado na aba Estatísticas. O anel de win rate e o
 * rodapé não estão aqui de propósito: sem eles não sobra card, sobra imagem.
 *
 * `venues` e `oppPlayers` nascem desligados porque expõem terceiros — o nome
 * da loja e o apelido do oponente. Ligar é decisão de quem publica.
 */
export interface SharePrefs {
  context: boolean;
  record: boolean;
  streak: boolean;
  playDraw: boolean;
  decks: boolean;
  oppDecks: boolean;
  oppPlayers: boolean;
  venues: boolean;
}

export const DEFAULT_SHARE_PREFS: SharePrefs = {
  context: true,
  record: true,
  streak: true,
  playDraw: true,
  decks: true,
  oppDecks: false,
  oppPlayers: false,
  venues: false,
};

export const DEFAULT_COUNTER_PREFS: CounterPrefs = {
  poison: true,
  energy: false,
  experience: false,
  commanderDamage: true,
  custom: [],
};

// ─── Telemetria anônima ─────────────────────────────────────

/**
 * O que sai do aparelho quando o compartilhamento anônimo está ligado.
 * Sem nome de jogador, sem notas, sem áudio, sem localização, sem data exata.
 */
export interface TelemetryEvent {
  /** UUID sorteado na instalação. Não é o usuário, é o aparelho. */
  install_id: string;
  /** Chave local para deduplicar reenvios. Nunca é o id da partida no aparelho. */
  event_id: string;
  format: Format;
  archetype: Archetype;
  my_deck: string;
  opp_deck: string;
  on_play: boolean;
  won: boolean;
  drew: boolean;
  /** Semana ISO da partida (AAAA-Www). Granularidade proposital: não é a data. */
  played_week: string;
  app_version: string;
}

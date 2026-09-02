import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Match, Settings, MatchConfidence, ConfidenceLevel } from '../types';
import { colors } from '../theme/colors';
import { SegmentedControl } from './SegmentedControl';
import { DeckSelector } from './DeckSelector';
import { Icon } from './Icon';
import { DatePickerModal } from './DatePickerModal';
import { OpponentPicker } from './OpponentPicker';
import { VenuePicker } from './VenuePicker';
import { useT } from '../i18n/useT';
import { matchesSameDay } from '../services/matchSync';
import { getArchetypeForDeck } from '../data/decks';
import { useStore } from '../store/useStore';
import { defaultDeckVersion, lastUseOfDeck } from '../utils/deckVersion';
import { useKeyboardAware } from '../hooks/useKeyboardAware';
import {
  Games, GAMES_VAZIOS, contar, placarTexto, resultadoDosGames,
} from '../utils/games';

interface MatchFormProps {
  initial?: Partial<Match>;
  settings: Settings;
  recentDecks?: string[];
  onSave: (match: Partial<Match>) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  conf?: MatchConfidence;
}

function ConfBadge({ level }: { level?: ConfidenceLevel }) {
  if (!level || level === 'high') return null;
  const map: Record<string, { label: string; color: string; bg: string }> = {
    default: { label: 'DEFAULT', color: colors.ink3, bg: colors.bg2 },
    low: { label: 'LOW CONF', color: '#b45309', bg: '#fef3c7' },
    missing: { label: 'MISSING', color: colors.bad, bg: colors.badSoft },
  };
  const m = map[level];
  if (!m) return null;
  return (
    <View style={[styles.confBadge, { backgroundColor: m.bg }]}>
      <Text style={[styles.confText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

function Field({ label, confKey, conf, children }: {
  label: string; confKey?: keyof MatchConfidence;
  conf?: MatchConfidence; children: React.ReactNode;
}) {
  const level = confKey && conf ? conf[confKey] : undefined;
  const highlight = level === 'low' || level === 'missing';
  return (
    <View style={[styles.field, highlight && styles.fieldHighlight]}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {confKey && <ConfBadge level={level} />}
      </View>
      {children}
    </View>
  );
}


export function MatchForm({
  initial,
  settings,
  recentDecks = [],
  onSave,
  onCancel,
  title,
  subtitle,
  conf = {},
}: MatchFormProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const mf = t.matchForm;
  const resolvedTitle = title ?? mf.defaultTitle;
  const resolvedSubtitle = subtitle ?? mf.defaultSubtitle;
  const [match, setMatch] = React.useState<Partial<Match>>({
    won: true,
    drew: false,
    format: settings.defaultFormat,
    myDeck: settings.defaultDeck || '',
    oppDeck: '',
    archetype: 'Midrange',
    onPlay: false,
    notes: '',
    date: new Date().toISOString(),
    ...initial,
  });

  const [showDatePicker, setShowDatePicker] = React.useState(false);

  const set = (k: keyof Match, v: any) => setMatch(m => ({ ...m, [k]: v }));

  const opponents = useStore(s => s.opponents);
  const socialOn = useStore(s => s.settings.social.enabled);
  const { scrollProps, subirCampo, folga } = useKeyboardAware();

  /**
   * Quem levou cada game. O resultado é consequência, e por isso não existe
   * botão de "vitória": marcar o game é a única coisa que se faz aqui.
   *
   * Tocar de novo no lado já marcado desmarca — é como se corrige um toque
   * errado sem ter um terceiro botão só para isso.
   */
  const games: Games = match.games ?? GAMES_VAZIOS;

  const marcarGame = (i: number, quem: 'me' | 'opp' | null) => {
    const proximos = [...games] as Games;
    proximos[i] = proximos[i] === quem ? null : quem;
    const resultado = resultadoDosGames(proximos);
    setMatch(m => ({
      ...m,
      games: proximos,
      won: resultado?.won ?? false,
      drew: resultado?.drew ?? false,
    }));
  };

  const handle = useStore(st => st.settings.social.handle);
  const temConta = useStore(st => st.settings.social.enabled);
  /** O nome de cada lado nas três linhas. Sem conta e sem oponente, os papéis. */
  const euLabel = temConta && handle ? `@${handle}` : mf.me;
  const eleLabel = match.opponentName?.trim() || mf.them;

  const placar = contar(games);
  const nomeDoResultado = (won: boolean, drew: boolean) =>
    drew ? mf.drew : won ? mf.win : mf.loss;

  /**
   * A linha embaixo dos games.
   *
   * Com placar, mostra placar e conclusão. Sem placar, mostra o resultado que
   * já veio de outro lugar — a IA ouve "ganhei" e sabe o resultado sem saber
   * os games, e deixar a linha só com "marque quem levou cada game" faria
   * parecer que o que ela entendeu se perdeu. Nada é inventado: o placar
   * continua vazio até alguém marcar.
   */
  const resumoDoPlacar = placar.me + placar.opp > 0
    ? `${placarTexto(games)} · ${nomeDoResultado(placar.me > placar.opp, placar.me === placar.opp)}`
    : initial && (initial.won !== undefined || initial.drew)
      ? `${nomeDoResultado(Boolean(match.won), Boolean(match.drew))} · ${mf.gamesHint}`
      : mf.gamesHint;

  /**
   * Pergunta antes de gravar a segunda partida contra a mesma pessoa no mesmo
   * dia.
   *
   * O caso não é distração: os dois jogadores anotam a mesma partida, cada um
   * no próprio aparelho, e as duas viram registros separados. A checagem é no
   * servidor porque é lá que as duas contas se encontram — o aparelho sozinho
   * só enxerga o que ele mesmo digitou.
   *
   * Duas partidas contra a mesma pessoa no mesmo dia são normais (uma sessão
   * tem várias), então isto pergunta, não bloqueia.
   */
  const trySave = async () => {
    const opponent = opponents.find(o => o.id === match.opponentId);
    const linked = socialOn && opponent?.linkState === 'linked' && opponent.playerId;

    if (linked && !initial?.id) {
      try {
        const n = await matchesSameDay(opponent.playerId!, match.date ?? new Date().toISOString());
        if (n > 0) {
          Alert.alert(mf.dupTitle, mf.dupBody(opponent.nickname, n), [
            { text: mf.dupCancel, style: 'cancel' },
            { text: mf.dupConfirm, onPress: () => onSave(match) },
          ]);
          return;
        }
      } catch {
        // Sem rede não dá para perguntar ao servidor. Gravar é melhor do que
        // travar quem está no meio de um torneio.
      }
    }
    onSave(match);
  };

  const venues = useStore(s => s.venues);
  const selectedVenue = venues.find(v => v.id === match.venueId);

  // Versões do deck escolhido, se ele for um deck cadastrado.
  const decks = useStore(s => s.decks);
  const allVersions = useStore(s => s.deckVersions);
  const matches = useStore(s => s.matches);
  const deckVersions = React.useMemo(() => {
    const name = (match.myDeck || '').trim().toLowerCase();
    if (!name) return [];
    const deck = decks.find(d => d.name.toLowerCase() === name);
    if (!deck) return [];
    return allVersions
      .filter(v => v.deckId === deck.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [decks, allVersions, match.myDeck]);

  /**
   * Marca sozinho a versão provável ao escolher o deck — a mais recente entre
   * a última usada e a última criada.
   *
   * Só age enquanto o jogador não mexeu no campo: a partir do primeiro toque a
   * escolha é dele, inclusive a de jogar sem versão, e trocar de deck depois
   * disso não deve desfazer o que ele decidiu. Partida sendo editada também
   * não entra — ali o valor gravado é a verdade.
   */
  const versaoTocada = React.useRef(false);
  const editando = Boolean(initial?.id);

  React.useEffect(() => {
    if (editando || versaoTocada.current) return;
    const sugerida = defaultDeckVersion(
      deckVersions,
      lastUseOfDeck(matches, match.myDeck || '')
    );
    setMatch(m => (m.deckVersion === sugerida ? m : { ...m, deckVersion: sugerida }));
  }, [deckVersions, matches, match.myDeck, editando]);

  const escolherVersao = (label?: string) => {
    versaoTocada.current = true;
    set('deckVersion', label);
  };

  // Auto-preenche arquétipo a partir da database quando oppDeck muda
  React.useEffect(() => {
    if (match.oppDeck) {
      const archetype = getArchetypeForDeck(match.oppDeck);
      if (archetype) setMatch(m => ({ ...m, archetype }));
    }
  }, [match.oppDeck]);

  const currentDate = match.date ? new Date(match.date) : new Date();
  const locale = settings.language === 'ja-JP' ? 'ja-JP' : settings.language === 'en-US' ? 'en-US' : 'pt-BR';
  const formattedDate = currentDate.toLocaleDateString(locale, {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const lowCount = Object.values(conf).filter(c => c === 'low' || c === 'missing').length;

  return (
    <View style={styles.container}>
      <ScrollView {...scrollProps} style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{resolvedTitle}</Text>
          <Text style={styles.subtitle}>
            {lowCount > 0
              ? `${mf.needsAttention(lowCount)}${resolvedSubtitle}`
              : resolvedSubtitle}
          </Text>
        </View>

        {/* Date */}
        <Field label={mf.date} confKey={undefined} conf={conf}>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.datePressable}>
            <Icon name="list" size={16} stroke={colors.ink3} />
            <Text style={styles.dateText}>{formattedDate}</Text>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Pressable>
          <DatePickerModal
            visible={showDatePicker}
            value={currentDate}
            onChange={(date) => set('date', date.toISOString())}
            onClose={() => setShowDatePicker(false)}
          />
        </Field>

        {/* Games — o resultado sai daqui, não é digitado */}
        <Field label={mf.result} confKey="won" conf={conf}>
          <View style={styles.games}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.gameRow}>
                <Text style={styles.gameLabel}>{mf.game(i + 1)}</Text>
                <View style={{ flex: 1 }}>
                  <SegmentedControl
                    options={[
                      { label: euLabel, value: 'me' },
                      { label: eleLabel, value: 'opp' },
                    ]}
                    value={games[i] ?? ''}
                    onChange={v => marcarGame(i, v as 'me' | 'opp')}
                    fontSize={11}
                  />
                </View>
                {games[i] && (
                  <Pressable onPress={() => marcarGame(i, null)} hitSlop={8}>
                    <Icon name="x" size={14} stroke={colors.ink4} />
                  </Pressable>
                )}
              </View>
            ))}
            <Text style={styles.gamesResumo}>{resumoDoPlacar}</Text>
          </View>
        </Field>

        {/* Format */}
        <Field label={mf.format} confKey="format" conf={conf}>
          <SegmentedControl
            options={['Commander', 'Modern', 'Standard', 'Pioneer', 'Legacy', 'Other']}
            value={match.format || 'Commander'}
            onChange={v => set('format', v as any)}
            fontSize={10}
          />
        </Field>

        {/* My deck */}
        <Field label={mf.myDeck} confKey="myDeck" conf={conf}>
          <DeckSelector
            value={match.myDeck || ''}
            onChange={v => set('myDeck', v)}
            format={match.format as any}
            recentDecks={recentDecks}
            onFocus={subirCampo}
          />
        </Field>

        {/* Versão do deck — só aparece quando o deck escolhido tem versões */}
        {deckVersions.length > 0 && (
          <Field label={mf.deckVersion} conf={conf}>
            <View style={styles.versionRow}>
              <Pressable
                onPress={() => escolherVersao(undefined)}
                style={[styles.versionChip, !match.deckVersion && styles.versionChipOn]}
              >
                <Text style={[
                  styles.versionChipText,
                  !match.deckVersion && styles.versionChipTextOn,
                ]}>
                  {mf.noVersion}
                </Text>
              </Pressable>
              {deckVersions.map(v => (
                <Pressable
                  key={v.id}
                  onPress={() => escolherVersao(v.label)}
                  style={[
                    styles.versionChip,
                    match.deckVersion === v.label && styles.versionChipOn,
                  ]}
                >
                  <Text style={[
                    styles.versionChipText,
                    match.deckVersion === v.label && styles.versionChipTextOn,
                  ]}>
                    {v.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        {/* Opponent deck */}
        <Field label={mf.oppDeck} confKey="oppDeck" conf={conf}>
          <DeckSelector
            value={match.oppDeck || ''}
            onChange={v => set('oppDeck', v)}
            format={match.format as any}
            recentDecks={recentDecks}
            placeholder={mf.oppDeckPlaceholder}
            onFocus={subirCampo}
          />
        </Field>

        {/* Quem era o oponente */}
        <Field label={mf.opponent} conf={conf}>
          <OpponentPicker
            valueId={match.opponentId}
            valueName={match.opponentName}
            onChange={(id, name) => {
              setMatch(m => ({ ...m, opponentId: id, opponentName: name }));
            }}
            onFocus={subirCampo}
          />
        </Field>

        {/* Onde foi */}
        <Field label={mf.venue} conf={conf}>
          <VenuePicker
            value={selectedVenue}
            onChange={venue => {
              setMatch(m => ({
                ...m,
                venueId: venue?.id,
                venueName: venue?.name,
              }));
            }}
            onFocus={subirCampo}
          />
        </Field>

        {/* Play / Draw */}
        <Field label={mf.playDraw} confKey="onPlay" conf={conf}>
          <SegmentedControl
            options={[{ label: mf.play, value: 'true' }, { label: mf.draw, value: 'false' }]}
            value={String(match.onPlay)}
            onChange={v => set('onPlay', v === 'true')}
          />
        </Field>

        {/* Notes */}
        <Field label={mf.notes} conf={conf}>
          <TextInput
            value={match.notes || ''}
            onChangeText={v => set('notes', v)}
            placeholder={mf.notesPlaceholder}
            placeholderTextColor={colors.ink4}
            multiline
            style={styles.textarea}
            onFocus={subirCampo}
          />
        </Field>

        <View style={{ height: 20 }} />
        <View style={{ height: folga }} />
      </ScrollView>

      {/* Folga da barra do Android: o formulário abre em modal, fora da tab bar. */}
      <View style={[styles.actions, { paddingBottom: insets.bottom }]}>
        <Pressable style={styles.btnCancel} onPress={onCancel}>
          <Text style={styles.btnCancelText}>{mf.cancel}</Text>
        </Pressable>
        <Pressable style={styles.btnSave} onPress={() => { void trySave(); }}>
          <Icon name="check" size={16} stroke="#fff" />
          <Text style={styles.btnSaveText}>{mf.save}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: { marginBottom: 14 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: colors.ink3,
    marginTop: 4,
    fontFamily: 'Inter',
  },
  field: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  fieldHighlight: { backgroundColor: '#fffbf0' },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  games: { gap: 8 },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameLabel: {
    width: 52,
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  gamesResumo: {
    fontSize: 11,
    fontFamily: 'Inter',
    color: colors.ink3,
    marginTop: 2,
    marginLeft: 60,
  },
  confBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  confText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.5,
  },
  datePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  dateText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: '500',
    color: colors.ink,
  },
  textarea: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
    fontFamily: 'Inter',
    color: colors.ink,
    height: 64,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  versionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  versionChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  versionChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  versionChipText: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: '500',
    color: colors.ink3,
  },
  versionChipTextOn: { color: '#fff' },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '500',
    color: colors.ink2,
  },
  btnSave: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSaveText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: '#fff',
  },
});

import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { Match } from '../types';
import { Icon } from '../components/Icon';
import { MatchForm } from '../components/MatchForm';
import { useStore } from '../store/useStore';
import { useRecentDecks } from '../store/selectors';
import { useT } from '../i18n/useT';
import { useTabReset } from '../hooks/useTabReset';
import { secondsUntilNext } from '../utils/syncThrottle';
import { Filters } from '../types';
import { applyFilters } from '../utils/stats';
import { placarTexto } from '../utils/games';
import { FilterRow, FilterPickerButton } from '../components/FilterControls';
import { FilterPickerModal } from '../components/FilterPickerModal';

const semFiltro: Filters = {
  format: 'All',
  deck: [],
  oppDeck: [],
  period: 'All',
  result: 'All',
  version: [],
  venue: [],
};

function groupByDate(matches: Match[], locale: string) {
  const g: Record<string, Match[]> = {};
  matches.forEach(m => {
    const d = new Date(m.date);
    const key = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    if (!g[key]) g[key] = [];
    g[key].push(m);
  });
  return g;
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const h = t.history;
  const matches = useStore(s => s.matches);
  const settings = useStore(s => s.settings);
  const recentDecks = useRecentDecks();
  const updateMatch = useStore(s => s.updateMatch);
  const [editMatch, setEditMatch] = React.useState<Match | null>(null);

  // Tocar em "Partidas" fecha a edição aberta e volta para a lista.
  useTabReset(React.useCallback(() => setEditMatch(null), []));

  const socialOn = useStore(s => s.settings.social.enabled);
  const syncStatus = useStore(s => s.syncStatus);
  const syncMatches = useStore(s => s.syncMatches);
  const [syncing, setSyncing] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const opponents = useStore(s => s.opponents);
  const [filtros, setFiltros] = React.useState<Filters>(semFiltro);
  const [painelAberto, setPainelAberto] = React.useState(false);
  const [modal, setModal] = React.useState<null | 'deck' | 'oppDeck'>(null);

  /**
   * Como chamar o oponente na lista. O apelido é o que a pessoa reconhece;
   * sem ele, vale o `@apelido` da conta vinculada. O e-mail nunca aparece
   * aqui porque o app não guarda o e-mail de ninguém além do dono da conta —
   * ele serve para achar alguém, não para ser exibido.
   */
  const nomeDoOponente = React.useCallback((m: Match) => {
    if (m.opponentName?.trim()) return m.opponentName.trim();
    const op = m.opponentId ? opponents.find(o => o.id === m.opponentId) : undefined;
    if (op?.nickname?.trim()) return op.nickname.trim();
    if (op?.remoteName) return `@${op.remoteName}`;
    return null;
  }, [opponents]);

  /**
   * Atualizar à mão, com o resultado dito por extenso.
   *
   * Todo caminho termina em aviso — inclusive o que deu certo e não trouxe
   * nada. Antes, "não foi possível sincronizar" era a única frase possível, e
   * ela cobria tanto "nada mudou" quanto "sua sessão acabou": quem lia não
   * tinha como saber se havia problema nem o que fazer a respeito.
   *
   * O intervalo de um minuto continua valendo: apertar dez vezes seguidas não
   * vira dez idas ao servidor.
   */
  /**
   * Apagar pergunta antes. Não é desfazível e a partida some das
   * estatísticas junto — o tipo de coisa que ninguém quer descobrir por um
   * toque errado.
   */
  const deleteMatch = useStore(s => s.deleteMatch);
  const confirmarExclusao = (m: Match) => {
    Alert.alert(t.matchForm.deleteTitle, t.matchForm.deleteBody, [
      { text: t.matchForm.cancel, style: 'cancel' },
      {
        text: t.matchForm.deleteConfirm,
        style: 'destructive',
        onPress: () => { deleteMatch(m.id); setEditMatch(null); },
      },
    ]);
  };

  const atualizar = () => {
    setSyncing(true);
    setAviso(null);
    void syncMatches().then(resultado => {
      if (resultado === 'skipped') {
        setAviso(h.syncSkipped(secondsUntilNext(syncStatus?.at, Date.now())));
      } else if (resultado === 'error') {
        const st = useStore.getState().syncStatus;
        setAviso(st?.error === 'session' ? h.syncExpired : h.syncError);
      } else if (resultado === 'ok') {
        const st = useStore.getState().syncStatus;
        const mexeu = (st?.pushed ?? 0) + (st?.pulled ?? 0);
        setAviso(mexeu > 0 ? h.syncDone(st?.pushed ?? 0, st?.pulled ?? 0) : h.syncUpToDate);
      }
      setTimeout(() => setAviso(null), 5000);
    }).finally(() => setSyncing(false));
  };

  const locale = settings.language === 'ja-JP' ? 'ja-JP' : settings.language === 'en-US' ? 'en-US' : 'pt-BR';
  const visiveis = React.useMemo(() => applyFilters(matches, filtros), [matches, filtros]);
  const grouped = React.useMemo(() => groupByDate(visiveis, locale), [visiveis, locale]);

  const ativos = [
    filtros.format !== 'All',
    filtros.deck.length > 0,
    filtros.oppDeck.length > 0,
    filtros.period !== 'All',
    filtros.result !== 'All',
  ].filter(Boolean).length;

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFiltros(f => ({ ...f, [k]: v }));

  /** Opções vindas do próprio histórico: filtrar por deck que nunca jogou não serve. */
  const opcoes = React.useMemo(() => {
    const meus = new Set<string>();
    const deles = new Set<string>();
    matches.forEach(m => {
      if (m.myDeck) meus.add(m.myDeck);
      if (m.oppDeck) deles.add(m.oppDeck);
    });
    const paraLista = (set: Set<string>) =>
      [...set].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
    return { meus: paraLista(meus), deles: paraLista(deles) };
  }, [matches]);

  if (editMatch) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.editHeader}>
          <Pressable style={styles.backBtn} onPress={() => setEditMatch(null)}>
            <Icon name="back" size={16} stroke={colors.ink} />
            <Text style={styles.backText}>{h.back}</Text>
          </Pressable>
          <View style={styles.editHeaderRight}>
            <Text style={styles.editDate}>
              {new Date(editMatch.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
            </Text>
            <Pressable onPress={() => confirmarExclusao(editMatch)} hitSlop={8} style={styles.deleteBtn}>
              <Icon name="trash" size={16} stroke={colors.bad} />
            </Pressable>
          </View>
        </View>
        <View style={styles.formWrap}>
          <MatchForm
            initial={editMatch}
            settings={settings}
            recentDecks={recentDecks}
            onSave={(updated) => {
              updateMatch({ ...editMatch, ...updated } as Match);
              setEditMatch(null);
            }}
            onCancel={() => setEditMatch(null)}
            title={h.editTitle}
            subtitle={h.editSubtitle}
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{h.title}</Text>
          <Text style={styles.subtitle}>
            {ativos > 0 ? h.totalFiltered(visiveis.length, matches.length) : h.total(matches.length)}
            {aviso ? ` · ${aviso}` : ''}
          </Text>
        </View>

        <Pressable
          onPress={() => setPainelAberto(v => !v)}
          style={[styles.iconBtn, (painelAberto || ativos > 0) && styles.iconBtnOn]}
          hitSlop={8}
        >
          <Icon
            name="filter"
            size={18}
            stroke={ativos > 0 ? colors.accent : colors.ink3}
            strokeWidth={1.8}
          />
          {ativos > 0 && <Text style={styles.filterCount}>{ativos}</Text>}
        </Pressable>

        {/* Só aparece com conta: sem ela não há servidor com que falar. */}
        {socialOn && (
          <Pressable onPress={atualizar} disabled={syncing} style={styles.refreshBtn} hitSlop={8}>
            {syncing
              ? <ActivityIndicator size="small" color={colors.ink3} />
              : <Icon name="rotate" size={18} stroke={colors.ink3} strokeWidth={1.8} />}
          </Pressable>
        )}
      </View>

      {painelAberto && (
        <View style={styles.filtersCard}>
          <FilterRow
            label={t.stats.filterFormat}
            value={filtros.format}
            options={[
              { value: 'All', label: t.stats.all },
              ...['Commander', 'Modern', 'Standard', 'Pioneer', 'Legacy', 'Pauper', 'Draft', 'Other']
                .map(f => ({ value: f, label: f })),
            ]}
            onChange={v => setF('format', v)}
          />
          <FilterRow
            label={t.stats.filterResult}
            value={filtros.result}
            options={[
              { value: 'All', label: t.stats.all },
              { value: 'Wins', label: t.stats.wins2 },
              { value: 'Losses', label: t.stats.losses2 },
              { value: 'Draws', label: t.stats.draws2 },
            ]}
            onChange={v => setF('result', v)}
          />
          <FilterRow
            label={t.stats.filterPeriod}
            value={filtros.period}
            options={[
              { value: 'All', label: t.stats.all },
              { value: '1d', label: t.stats.today },
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: '90d', label: '90d' },
            ]}
            onChange={v => setF('period', v)}
          />
          <FilterPickerButton
            label={t.stats.filterDeck}
            value={filtros.deck}
            displayValue={
              filtros.deck.length === 0 ? t.stats.all
                : filtros.deck.length === 1 ? filtros.deck[0]
                  : t.stats.deckCount(filtros.deck.length)
            }
            onPress={() => setModal('deck')}
          />
          <FilterPickerButton
            label={t.stats.filterOpp}
            value={filtros.oppDeck}
            displayValue={
              filtros.oppDeck.length === 0 ? t.stats.all
                : filtros.oppDeck.length === 1 ? filtros.oppDeck[0]
                  : t.stats.deckCount(filtros.oppDeck.length)
            }
            onPress={() => setModal('oppDeck')}
          />
          {ativos > 0 && (
            <Pressable onPress={() => setFiltros(semFiltro)} style={styles.clearBtn}>
              <Text style={styles.clearText}>{h.filterClear}</Text>
            </Pressable>
          )}
        </View>
      )}

      {Object.entries(grouped).map(([day, ms]) => (
        <View key={day}>
          <Text style={styles.dateLabel}>{day}</Text>
          <View style={styles.card}>
            {ms.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => setEditMatch(m)}
                style={[
                  styles.row,
                  i < ms.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={[
                  styles.badge,
                  { backgroundColor: m.drew ? colors.line : m.won ? colors.goodSoft : colors.badSoft },
                ]}>
                  <Text style={[
                    styles.badgeText,
                    { color: m.drew ? colors.ink3 : m.won ? colors.good : colors.bad },
                  ]}>
                    {m.drew ? t.stats.drawn : m.won ? t.stats.wins : t.stats.losses}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {h.vs} {nomeDoOponente(m) ?? (m.oppDeck || '—')}
                    {placarTexto(m.games) ? `  ${placarTexto(m.games)}` : ''}
                  </Text>
                  <Text style={styles.rowSub}>
                    {/* O deck do oponente só entra na segunda linha quando o
                        nome dele tomou o lugar dele na primeira. Vazio, sai
                        fora: um traço solto no começo da linha não informa
                        nada e ainda parece defeito. */}
                    {nomeDoOponente(m) && m.oppDeck ? `${m.oppDeck} · ` : ''}
                    {[m.myDeck, m.format, m.onPlay ? h.play : h.draw]
                      .filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Icon name="edit" size={14} stroke={colors.ink4} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {visiveis.length === 0 && (
        <View style={[styles.card, { padding: 24, alignItems: 'center' }]}>
          <Text style={styles.emptyTitle}>{matches.length === 0 ? h.empty : h.emptyFiltered}</Text>
          <Text style={styles.emptySub}>
            {matches.length === 0 ? h.emptySub : h.emptyFilteredSub}
          </Text>
        </View>
      )}

      <View style={{ height: 20 }} />

      <FilterPickerModal
        visible={modal === 'deck'}
        title={t.stats.filterDeck}
        options={opcoes.meus}
        value={filtros.deck}
        onChange={v => setF('deck', v)}
        onClose={() => setModal(null)}
        allLabel={t.stats.all}
        applyLabel={t.stats.filterDeck}
        searchPlaceholder={t.manageDecks.search}
      />
      <FilterPickerModal
        visible={modal === 'oppDeck'}
        title={t.stats.filterOpp}
        options={opcoes.deles}
        value={filtros.oppDeck}
        onChange={v => setF('oppDeck', v)}
        onClose={() => setModal(null)}
        allLabel={t.stats.all}
        applyLabel={t.stats.filterDeck}
        searchPlaceholder={t.manageDecks.search}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  iconBtn: {
    marginTop: 6,
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  iconBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  filterCount: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 15,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 15,
    fontFamily: 'JetBrainsMono',
    color: '#fff',
    backgroundColor: colors.accent,
    borderRadius: 999,
    overflow: 'hidden',
  },
  filtersCard: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8 },
  clearText: {
    fontSize: 10.5,
    fontFamily: 'Inter',
    color: colors.accent,
    fontWeight: '600',
  },
  refreshBtn: {
    marginTop: 6,
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 6,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line2 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },
  rowTitle: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter', color: colors.ink },
  rowSub: { fontSize: 11, fontFamily: 'Inter', color: colors.ink3, marginTop: 2 },
  editHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  backText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '500', color: colors.ink },
  editDate: { fontSize: 9.5, fontFamily: 'JetBrainsMono', color: colors.ink3 },
  editHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  formWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  emptyTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter', color: colors.ink },
  emptySub: { fontSize: 12, fontFamily: 'Inter', color: colors.ink3, marginTop: 4, textAlign: 'center' },
});

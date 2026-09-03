import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useStore } from '../store/useStore';
import { applyFilters, computeStats } from '../utils/stats';
import { Filters } from '../types';
import { ChartDonut } from '../components/charts/ChartDonut';
import { ChartLine } from '../components/charts/ChartLine';
import { ChartSplit } from '../components/charts/ChartSplit';
import { ChartBars } from '../components/charts/ChartBars';
import { DeckList } from '../components/charts/DeckList';
import { FilterPickerModal } from '../components/FilterPickerModal';
import { StatsShareModal } from '../components/StatsShareModal';
import { Icon } from '../components/Icon';
import { Chip, FilterRow, FilterPickerButton } from '../components/FilterControls';
import { useT } from '../i18n/useT';

const defaultFilters: Filters = {
  format: 'All',
  deck: [],
  oppDeck: [],
  period: 'All',
  result: 'All',
  version: [],
  venue: [],
};

// ─── ChartCard ─────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.chart}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        {subtitle && <Text style={styles.chartSub}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

// ─── StatsScreen ───────────────────────────────────────────────────────────

export function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const t = useT();
  const s = t.stats;
  // page padding 20×2 + card padding 12×2 = 64px
  const chartW = screenWidth - 64;
  const matches = useStore(st => st.matches);
  const sharePrefs = useStore(st => st.settings.sharePrefs);
  const social = useStore(st => st.settings.social);
  const [filters, setFilters] = React.useState<Filters>(defaultFilters);

  // Qual modal está aberto
  const [openModal, setOpenModal] =
    React.useState<null | 'deck' | 'oppDeck' | 'version' | 'venue' | 'share'>(null);

  const filtered = React.useMemo(() => applyFilters(matches, filters), [matches, filters]);
  const stats = React.useMemo(() => computeStats(filtered), [filtered]);

  /**
   * Versões disponíveis para os decks escolhidos.
   *
   * Sai do histórico, não do cadastro: uma versão apagada em Decks continua
   * carimbada nas partidas dela, e sumir do filtro esconderia esse passado.
   * A opção de rótulo vazio ("sem versão") só aparece quando existe partida
   * antiga assim — senão seria uma linha morta.
   */
  const versionOptions = React.useMemo(() => {
    if (filters.deck.length === 0) return [];
    const decked = matches.filter(m => filters.deck.includes(m.myDeck));
    const labels = new Set(decked.map(m => m.deckVersion || ''));
    if (labels.size <= 1 && !labels.has('')) return [];
    if (labels.size === 1 && labels.has('')) return [];
    return [...labels]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
      .map(v => ({ value: v, label: v || s.noVersion }));
  }, [matches, filters.deck, s.noVersion]);

  /**
   * Locais que aparecem no histórico. A opção "sem local" só entra quando há
   * partida sem local — para quem sempre anota onde jogou, ela seria uma
   * linha morta.
   */
  const venueOptions = React.useMemo(() => {
    const nomes = new Set(matches.map(m => m.venueName || ''));
    if (nomes.size === 1 && nomes.has('')) return [];
    return [...nomes]
      .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(v => ({ value: v, label: v || s.noVenue }));
  }, [matches, s.noVenue]);

  // Trocar de deck invalida a seleção de versão que era daquele outro deck.
  React.useEffect(() => {
    setFilters(f => {
      if (f.version.length === 0) return f;
      const valid = new Set(versionOptions.map(o => o.value));
      const kept = f.version.filter(v => valid.has(v));
      return kept.length === f.version.length ? f : { ...f, version: kept };
    });
  }, [versionOptions]);

  // Options — chips (format, period, result)
  const allOpt = { value: 'All', label: s.all };
  const formats = [allOpt, ...Array.from(new Set(matches.map(m => m.format))).map(f => ({ value: f, label: f }))];
  // Opções de deck SEM o "Todos" (o modal multi-select gera o "Todos" internamente)
  const deckOptions = Array.from(new Set(matches.map(m => m.myDeck).filter(Boolean))).sort().map(d => ({ value: d, label: d }));
  const oppDeckOptions = Array.from(new Set(matches.map(m => m.oppDeck).filter(Boolean))).sort().map(d => ({ value: d, label: d }));
  const periods = [
    allOpt,
    { value: '1d', label: s.today },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
  ];
  const results = [
    allOpt,
    { value: 'Wins', label: s.wins2 },
    { value: 'Losses', label: s.losses2 },
    { value: 'Draws', label: s.draws2 },
  ];

  const activeCount = [
    filters.format !== 'All',
    filters.deck.length > 0,
    filters.oppDeck.length > 0,
    filters.version.length > 0,
    filters.venue.length > 0,
    filters.period !== 'All',
    filters.result !== 'All',
  ].filter(Boolean).length;

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(f => ({ ...f, [k]: v }));

  // Display value dos botões de deck
  const deckDisplay = filters.deck.length === 0
    ? s.all
    : filters.deck.length === 1
      ? filters.deck[0]
      : s.deckCount(filters.deck.length);
  const oppDeckDisplay = filters.oppDeck.length === 0
    ? s.all
    : filters.oppDeck.length === 1
      ? filters.oppDeck[0]
      : s.deckCount(filters.oppDeck.length);
  const venueDisplay = filters.venue.length === 0
    ? s.all
    : filters.venue.length === 1
      ? (filters.venue[0] || s.noVenue)
      : s.venueCount(filters.venue.length);
  const versionDisplay = filters.version.length === 0
    ? s.all
    : filters.version.length === 1
      ? (filters.version[0] || s.noVersion)
      : s.versionCount(filters.version.length);

  // Quem assina o card: o apelido da conta, se houver uma conectada.
  const autor = social.enabled && social.handle ? `@${social.handle}` : 'OPEN-TRACKER-TCG';

  // Label do período para o share card
  const periodLabelMap: Record<string, string> = {
    '1d': s.today, '7d': '7d', '30d': '30d', '90d': '90d', 'All': s.all,
  };
  const periodLabel = periodLabelMap[filters.period] ?? filters.period;

  return (
    <>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.pageTitle}>{s.title}</Text>
            <Text style={styles.subtitle}>
              {stats.total} · {stats.wins}{s.wins}–{stats.losses}{s.losses}{stats.draws > 0 ? `–${stats.draws}${s.drawn}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => setOpenModal('share')}
            style={styles.shareBtn}
            hitSlop={10}
          >
            <Icon name="share" size={18} stroke={colors.ink3} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Filters */}
        <View style={styles.filtersCard}>
          <View style={styles.filtersHeader}>
            <Text style={styles.sectionLabel}>{s.filterFormat} · {s.filterDeck} · {s.filterOpp}</Text>
            <Text style={styles.activeCount}>{activeCount}</Text>
          </View>

          <FilterRow label={s.filterFormat} value={filters.format} options={formats} onChange={v => setF('format', v)} />

          {/* Deck — botão que abre modal */}
          <FilterPickerButton
            label={s.filterDeck}
            value={filters.deck}
            displayValue={deckDisplay}
            onPress={() => setOpenModal('deck')}
          />

          {/* Versão — só existe quando o deck escolhido é versionado */}
          {versionOptions.length > 0 && (
            <FilterPickerButton
              label={s.filterVersion}
              value={filters.version}
              displayValue={versionDisplay}
              onPress={() => setOpenModal('version')}
            />
          )}

          {venueOptions.length > 0 && (
            <FilterPickerButton
              label={s.filterVenue}
              value={filters.venue}
              displayValue={venueDisplay}
              onPress={() => setOpenModal('venue')}
            />
          )}

          {/* Oponente — botão que abre modal */}
          <FilterPickerButton
            label={s.filterOpp}
            value={filters.oppDeck}
            displayValue={oppDeckDisplay}
            onPress={() => setOpenModal('oppDeck')}
          />

          <FilterRow label={s.filterPeriod} value={filters.period} options={periods} onChange={v => setF('period', v)} />
          <FilterRow label={s.filterResult} value={filters.result} options={results} onChange={v => setF('result', v)} />
        </View>

        {stats.total === 0 ? (
          <View style={[styles.chart, { padding: 24, alignItems: 'center' }]}>
            <Text style={styles.emptyTitle}>{s.noData}</Text>
          </View>
        ) : (
          <>
            {/* Summary strip */}
            <View style={styles.summary}>
              <ChartDonut value={stats.wr} size={90} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sectionLabel}>{s.winRate}</Text>
                <Text style={styles.bigNum}>{stats.total}</Text>
                <Text style={styles.sectionLabel}>
                  {stats.wins}{s.wins} · {stats.losses}{s.losses}{stats.draws > 0 ? ` · ${stats.draws}${s.drawn}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sectionLabel}>{s.streak}</Text>
                <Text style={[styles.bigNum, { color: stats.streakType ? colors.good : colors.bad }]}>
                  {stats.streakType ? '+' : ''}{stats.streak}
                </Text>
                <Text style={styles.sectionLabel}>{stats.streakType ? s.wins2 : s.losses2}</Text>
              </View>
            </View>

            {/* Win rate over time */}
            <ChartCard title={s.evolution}>
              <ChartLine points={stats.evolution} w={chartW} h={90} />
            </ChartCard>

            {/* On play / draw */}
            <ChartCard title={s.onPlayTitle}>
              <ChartSplit
                left={stats.onPlayWR}
                right={stats.onDrawWR}
                leftLabel={s.onPlay}
                rightLabel={s.onDraw}
                w={chartW}
              />
            </ChartCard>

            {/* Per deck */}
            {stats.decks.length > 0 && (
              <ChartCard title={s.myDecks}>
                <DeckList rows={stats.decks} />
              </ChartCard>
            )}

            {/* Opponents */}
            {stats.opponents.length > 0 && (
              <ChartCard title={s.opponents}>
                <ChartBars data={stats.opponents} w={chartW} />
              </ChartCard>
            )}

            {/* Contra quem — só aparece para quem registra oponente */}
            {stats.oppPlayers.length > 0 && (
              <ChartCard title={s.oppPlayers}>
                <DeckList rows={stats.oppPlayers} />
              </ChartCard>
            )}

            {/* Onde — idem, depende de o local ter sido registrado */}
            {stats.venues.length > 0 && (
              <ChartCard title={s.venues}>
                <DeckList rows={stats.venues} />
              </ChartCard>
            )}

            {/* Archetypes */}
            {stats.archetypes.length > 0 && (
              <ChartCard title={s.archetypes}>
                <ChartBars data={stats.archetypes.map(a => ({ ...a, suffix: '%' }))} w={chartW} colorize />
              </ChartCard>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Modal — Deck (multi-select) */}
      <FilterPickerModal
        visible={openModal === 'deck'}
        title={s.filterDeck}
        options={deckOptions}
        value={filters.deck}
        onChange={v => setF('deck', v as Filters['deck'])}
        onClose={() => setOpenModal(null)}
        searchPlaceholder={t.manageDecks.search}
        allLabel={s.all}
        applyLabel={s.filterDeck}
      />

      {/* Modal — Oponente (multi-select) */}
      <FilterPickerModal
        visible={openModal === 'oppDeck'}
        title={s.filterOpp}
        options={oppDeckOptions}
        value={filters.oppDeck}
        onChange={v => setF('oppDeck', v as Filters['oppDeck'])}
        onClose={() => setOpenModal(null)}
        searchPlaceholder={t.manageDecks.search}
        allLabel={s.all}
        applyLabel={s.filterOpp}
      />

      {/* Modal — Versão do deck (multi-select, tudo marcado = todas) */}
      <FilterPickerModal
        visible={openModal === 'version'}
        title={s.filterVersion}
        options={versionOptions}
        value={filters.version}
        onChange={v => setF('version', v as Filters['version'])}
        onClose={() => setOpenModal(null)}
        searchPlaceholder={s.searchVersion}
        allLabel={s.all}
        applyLabel={s.filterVersion}
      />

      {/* Modal — Local (multi-select) */}
      <FilterPickerModal
        visible={openModal === 'venue'}
        title={s.filterVenue}
        options={venueOptions}
        value={filters.venue}
        onChange={v => setF('venue', v as Filters['venue'])}
        onClose={() => setOpenModal(null)}
        searchPlaceholder={s.searchVenue}
        allLabel={s.all}
        applyLabel={s.filterVenue}
      />

      {/* Modal — Share */}
      <StatsShareModal
        visible={openModal === 'share'}
        onClose={() => setOpenModal(null)}
        stats={stats}
        filters={filters}
        prefs={sharePrefs}
        periodLabel={periodLabel}
        winLabel={s.wins}
        lossLabel={s.losses}
        author={autor}
        labels={{
          onPlay: s.onPlay,
          onDraw: s.onDraw,
          decks: s.myDecks,
          oppDecks: s.opponents,
          oppPlayers: s.oppPlayers,
          venues: s.venues,
          noVersion: s.noVersion,
          noVenue: s.noVenue,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shareBtn: {
    marginTop: 6,
    padding: 6,
    borderRadius: 8,
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
  sectionLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  filtersCard: {
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 6,
  },
  filtersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  activeCount: {
    fontSize: 9,
    fontFamily: 'JetBrainsMono',
    color: colors.ink3,
  },
  // ─── Charts ─────────────────────────────────────────────────
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  bigNum: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: colors.ink,
    lineHeight: 28,
  },
  chart: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 8,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: colors.ink,
  },
  chartSub: {
    fontSize: 10,
    fontFamily: 'JetBrainsMono',
    color: colors.ink3,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter', color: colors.ink },
  emptySub: { fontSize: 12, fontFamily: 'Inter', color: colors.ink3, marginTop: 4 },
});

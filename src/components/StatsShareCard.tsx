/**
 * StatsShareCard
 * Card visual capturado como imagem para compartilhamento em redes sociais.
 * Tamanho fixo: 360 × 460 lógicos (→ ~1080×1380 a 3× DPR).
 * Deve ser renderizado dentro de um View mensurável para captureRef funcionar.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ComputedStats, Filters, RecordRow, SharePrefs } from '../types';

/** Títulos dos blocos, já traduzidos — o card não conhece o i18n. */
export interface ShareCardLabels {
  onPlay: string;
  onDraw: string;
  decks: string;
  oppDecks: string;
  oppPlayers: string;
  venues: string;
  noVersion: string;
}

interface Props {
  stats: ComputedStats;
  filters: Filters;
  /** Quais blocos entram. Vem de Configurações → Compartilhamento. */
  prefs: SharePrefs;
  /** Rótulo traduzido do período atual (ex: "Últimos 30 dias") */
  periodLabel: string;
  /** Rótulo traduzido de vitória (ex: "V") */
  winLabel: string;
  /** Rótulo traduzido de derrota (ex: "D") */
  lossLabel: string;
  labels: ShareCardLabels;
  /**
   * Quem está compartilhando — o `@apelido` da conta, ou o nome do app para
   * quem não tem conta. Chega por prop porque o card não conhece store nem
   * i18n: ele desenha o que recebe.
   */
  author: string;
}

// ── Mini donut ring ──────────────────────────────────────────────────────────
function MiniRing({ value, size = 80 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (value / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={6} fill="none" />
      {/* Fill */}
      <Circle
        cx={cx} cy={cy} r={r}
        stroke="#d45f3c"
        strokeWidth={6}
        fill="none"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        rotation={-90}
        origin={`${cx}, ${cy}`}
      />
    </Svg>
  );
}

// ── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <View style={chipStyles.wrap}>
      <Text style={[chipStyles.value, accent && chipStyles.valueAccent]}>{value}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    minWidth: 72,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: '#fff',
    lineHeight: 26,
  },
  valueAccent: { color: '#d45f3c' },
  label: {
    fontSize: 8,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
});

// ── Barra de win rate ────────────────────────────────────────────────────────

/**
 * Uma linha por situação — começar e sacar são dois win rates independentes,
 * não duas metades de um todo. A barra compartilhada dizia o contrário: com
 * 60% e 40% ela ficava meio a meio, sugerindo uma proporção que não existe.
 * Agora cada uma preenche a própria trilha na medida do próprio percentual.
 */
function WrBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={barStyles.wrap}>
      <Text style={barStyles.side}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { flex: Math.max(value, 0) / 100 }]} />
        <View style={{ flex: 1 - Math.max(value, 0) / 100 }} />
      </View>
      <Text style={barStyles.pct}>{value}%</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  side: {
    fontSize: 8,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    width: 52,
  },
  pct: {
    fontSize: 11,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    width: 32,
    textAlign: 'right',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: '#d45f3c',
    borderRadius: 2,
  },
});

// ── Main card ────────────────────────────────────────────────────────────────

export const SHARE_CARD_WIDTH = 360;
/** Altura só do card mínimo. Blocos ligados fazem o card crescer a partir daí. */
export const SHARE_CARD_HEIGHT = 460;

/** Quantas linhas cada lista leva. Além disso vira relatório, não card. */
const ROWS = 3;

function RecordSection({ label, rows, winShort, lossShort }: {
  label: string;
  rows: RecordRow[];
  winShort: string;
  lossShort: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      {/* Maiúscula em JS, não por textTransform: o Android mede o texto antes
          de aplicar a transformação e corta a última letra. */}
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      <View style={styles.deckRows}>
        {rows.slice(0, ROWS).map(d => (
          <View key={d.l} style={styles.deckRow}>
            <Text style={styles.deckName} numberOfLines={1}>{d.l}</Text>
            <Text style={[styles.deckWr, { color: d.wr >= 50 ? '#2d8a5e' : '#c0422a' }]}>
              {d.wr}%
            </Text>
            <Text style={styles.deckRecord}>{d.wins}{winShort}·{d.losses}{lossShort}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StatsShareCard({
  stats, filters, prefs, periodLabel, winLabel, lossLabel, labels, author,
}: Props) {
  const streakSign = stats.streakType ? '+' : '';

  // Contexto de filtro para mostrar no card
  const contextParts: string[] = [];
  if (filters.format && filters.format !== 'All') contextParts.push(filters.format);
  if (filters.deck.length === 1) contextParts.push(filters.deck[0]);
  else if (filters.deck.length > 1) contextParts.push(`${filters.deck.length} decks`);
  if (filters.version.length === 1) contextParts.push(filters.version[0] || labels.noVersion);
  else if (filters.version.length > 1) contextParts.push(`${filters.version.length} v.`);
  if (filters.oppDeck.length === 1) contextParts.push(`vs ${filters.oppDeck[0]}`);
  else if (filters.oppDeck.length > 1) contextParts.push(`vs ${filters.oppDeck.length} decks`);
  contextParts.push(periodLabel);
  const contextLine = contextParts.join('  ·  ');

  return (
    <View style={styles.card}>
      {/* Gradient-like dark overlay strips */}
      <View style={styles.stripTop} />
      <View style={styles.stripBottom} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appName}>{author}</Text>
          {prefs.context && (
            <Text style={styles.context} numberOfLines={2}>{contextLine}</Text>
          )}
        </View>
        {/* Accent dot */}
        <View style={styles.accentDot} />
      </View>

      {/* ── Win Rate Hero ── */}
      <View style={styles.hero}>
        <View style={styles.ringWrap}>
          <MiniRing value={stats.wr} size={96} />
          <View style={styles.ringCenter}>
            <Text style={styles.wrNum}>{stats.wr}</Text>
            <Text style={styles.wrPct}>%</Text>
          </View>
        </View>
        <Text style={styles.wrLabel}>WIN RATE</Text>
      </View>

      {/* ── Stats chips ── */}
      {(prefs.record || prefs.streak) && (
        <View style={styles.chips}>
          {prefs.record && <StatChip value={stats.wins} label={winLabel} />}
          {prefs.record && <StatChip value={stats.losses} label={lossLabel} />}
          {prefs.record && <StatChip value={stats.total} label="TOTAL" />}
          {prefs.streak && (
            <StatChip
              value={`${streakSign}${stats.streak}`}
              label="STREAK"
              accent={stats.streak > 0}
            />
          )}
        </View>
      )}

      {/* ── Começa / Saca — uma linha para cada ── */}
      {prefs.playDraw && (
        <View style={styles.section}>
          <WrBar label={labels.onPlay.toUpperCase()} value={stats.onPlayWR} />
          <WrBar label={labels.onDraw.toUpperCase()} value={stats.onDrawWR} />
        </View>
      )}

      {prefs.decks && (
        <RecordSection
          label={labels.decks}
          rows={stats.decks}
          winShort={winLabel}
          lossShort={lossLabel}
        />
      )}

      {prefs.oppDecks && stats.opponents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{labels.oppDecks.toUpperCase()}</Text>
          <View style={styles.deckRows}>
            {stats.opponents.slice(0, ROWS).map(o => (
              <View key={o.l} style={styles.deckRow}>
                <Text style={styles.deckName} numberOfLines={1}>{o.l}</Text>
                <Text style={styles.deckRecord}>{o.v}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {prefs.oppPlayers && (
        <RecordSection
          label={labels.oppPlayers}
          rows={stats.oppPlayers}
          winShort={winLabel}
          lossShort={lossLabel}
        />
      )}

      {prefs.venues && (
        <RecordSection
          label={labels.venues}
          rows={stats.venues}
          winShort={winLabel}
          lossShort={lossLabel}
        />
      )}

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <View style={styles.accentDotSmall} />
        <Text style={styles.footerText}>mtg-tracker · on-device · no cloud</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    // Sem altura fixa: o card cresce com os blocos ligados em Configurações.
    // Quem mede é o modal, por onLayout, para escalar o preview.
    minHeight: SHARE_CARD_HEIGHT,
    backgroundColor: '#16150f',
    borderRadius: 0, // capturado sem bordas para visual limpo
    padding: 24,
    gap: 16,
    // Com poucos blocos o conteúdo se espalha até a altura mínima; com muitos,
    // ele empilha e o card cresce. Os dois casos ficam certos.
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  // Decorações de fundo
  stripTop: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(212, 95, 60, 0.07)',
  },
  stripBottom: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(212, 95, 60, 0.05)',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  appName: {
    fontSize: 11,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 2,
    color: '#d45f3c',
    fontWeight: '700',
  },
  context: {
    fontSize: 9,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
    maxWidth: 280,
    lineHeight: 14,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d45f3c',
    marginTop: 2,
  },
  // Win rate hero
  hero: {
    alignItems: 'center',
    gap: 4,
  },
  ringWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wrNum: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: 'Inter',
    color: '#fff',
    letterSpacing: -1,
  },
  wrPct: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: '#d45f3c',
    marginLeft: 1,
  },
  wrLabel: {
    fontSize: 9,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.35)',
  },
  // Chips
  chips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  // Section
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.3)',
  },
  // Deck rows
  deckRows: { gap: 4 },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deckName: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Inter',
    color: 'rgba(255,255,255,0.7)',
  },
  deckWr: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter',
    width: 34,
    textAlign: 'right',
  },
  deckRecord: {
    fontSize: 9,
    fontFamily: 'JetBrainsMono',
    color: 'rgba(255,255,255,0.3)',
    width: 44,
    textAlign: 'right',
  },
  // Footer
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d45f3c',
  },
  footerText: {
    fontSize: 8,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.2)',
  },
});

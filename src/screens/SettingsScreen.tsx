import React from 'react';
import {
  View, Text, Pressable, ScrollView, Alert, StyleSheet, TextInput, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../theme/colors';
import { Icon } from '../components/Icon';
import { Toggle } from '../components/Toggle';
import { Badge } from '../components/Badge';
import { DeckSelector } from '../components/DeckSelector';
import { useStore } from '../store/useStore';
import { useRecentDecks } from '../store/selectors';
import { parseCSV } from '../utils/csv';
import { exportCSV } from '../utils/exportCsv';
import { readTextFile } from '../utils/readTextFile';
import { Language } from '../types';
import { useT } from '../i18n/useT';
import { useTabReset } from '../hooks/useTabReset';
import { useKeyboardAware } from '../hooks/useKeyboardAware';
import { TELEMETRY_CONFIGURED } from '../config';
import { deleteModel, getModelSize } from '../services/llamaExtractor';
import { DecksScreen } from './DecksScreen';
import { CountersSettingsScreen } from './CountersSettingsScreen';
import { ShareSettingsScreen } from './ShareSettingsScreen';
import { OpponentsScreen } from './OpponentsScreen';
import { AccountScreen } from './AccountScreen';
import { ClaimsScreen } from './ClaimsScreen';

/** MB inteiros, que é a unidade em que a pessoa pensa espaço no celular. */
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/** Página de doações do autor. */
const KOFI_URL = 'https://ko-fi.com/cathar1no';

// ─── Helpers ────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Row({ children, onPress, style }: {
  children: React.ReactNode; onPress?: () => void; style?: object;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[styles.row, style]}>
      {children}
    </Wrapper>
  );
}

// ─── SettingsScreen ─────────────────────────────────────────

const LANGUAGES: { code: Language; label: string; sub: string }[] = [
  { code: 'en-US', label: 'English', sub: 'English (US)' },
  { code: 'pt-BR', label: 'Português', sub: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語', sub: 'Japanese' },
];

const ALL_FORMATS = ['Commander', 'Modern', 'Standard', 'Pioneer', 'Legacy', 'Pauper', 'Draft', 'Other'];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const s = t.settings;
  const { scrollProps, subirCampo, folga } = useKeyboardAware();
  const settings = useStore(st => st.settings);
  const matches = useStore(st => st.matches);
  const recentDecks = useRecentDecks();
  const updateSettings = useStore(st => st.updateSettings);
  const deleteAllData = useStore(st => st.deleteAllData);
  const importMatches = useStore(st => st.importMatches);
  const loadDemoData = useStore(st => st.loadDemoData);
  const pendingCount = useStore(st => st.telemetryQueue.length);

  const [showDecks, setShowDecks] = React.useState(false);
  const [showCounters, setShowCounters] = React.useState(false);
  const [showShare, setShowShare] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [showOpponents, setShowOpponents] = React.useState(false);
  const [showClaims, setShowClaims] = React.useState(false);
  const socialOn = useStore(st => st.settings.social.enabled);
  const [importStatus, setImportStatus] = React.useState<null | 'ok' | 'err'>(null);
  const [importCount, setImportCount] = React.useState(0);

  /** Bytes do modelo no aparelho. 0 = não baixado. */
  const [modelBytes, setModelBytes] = React.useState(0);
  React.useEffect(() => {
    void getModelSize().then(setModelBytes).catch(() => setModelBytes(0));
  }, []);

  // Tocar em "Config" volta para a raiz, venha de onde vier.
  useTabReset(React.useCallback(() => {
    setShowDecks(false);
    setShowCounters(false);
    setShowShare(false);
    setShowAccount(false);
    setShowOpponents(false);
    setShowClaims(false);
  }, []));

  const set = (k: any, v: any) => updateSettings({ [k]: v });

  const handleExport = async () => {
    try {
      await exportCSV(matches);
    } catch {
      Alert.alert('Erro', 'Não foi possível exportar as partidas.');
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const picked = result.assets[0];
      const text = await readTextFile(picked.uri);
      const parsed = parseCSV(text);

      if (parsed.length === 0) {
        setImportStatus('err');
        setTimeout(() => setImportStatus(null), 3500);
        return;
      }

      importMatches(parsed);
      setImportCount(parsed.length);
      setImportStatus('ok');
      setTimeout(() => setImportStatus(null), 3500);
    } catch {
      setImportStatus('err');
      setTimeout(() => setImportStatus(null), 3500);
    }
  };

  /**
   * Remover o modelo é sobre espaço: são ~350 MB parados para quem só usa o
   * formulário. Nada se perde — a próxima gravação oferece baixar de novo.
   */
  const handleDeleteModel = () => {
    Alert.alert(s.modelDeleteTitle, s.modelDeleteBody(mb(modelBytes)), [
      { text: s.deleteConfirmCancel, style: 'cancel' },
      {
        text: s.modelRemove,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteModel();
            } finally {
              setModelBytes(await getModelSize());
            }
          })();
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      s.deleteConfirmTitle,
      s.deleteConfirmBody,
      [
        { text: s.deleteConfirmCancel, style: 'cancel' },
        { text: s.deleteConfirmOk, style: 'destructive', onPress: deleteAllData },
      ]
    );
  };

  if (showDecks) return <DecksScreen onBack={() => setShowDecks(false)} />;
  if (showCounters) return <CountersSettingsScreen onBack={() => setShowCounters(false)} />;
  if (showShare) return <ShareSettingsScreen onBack={() => setShowShare(false)} />;
  if (showAccount) return <AccountScreen onBack={() => setShowAccount(false)} />;
  if (showOpponents) {
    return (
      <OpponentsScreen
        onBack={() => setShowOpponents(false)}
        onOpenAccount={() => { setShowOpponents(false); setShowAccount(true); }}
      />
    );
  }
  if (showClaims) return <ClaimsScreen onBack={() => setShowClaims(false)} />;

  const currentLang = settings.language || 'pt-BR';

  return (
    <ScrollView {...scrollProps} style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>{s.title}</Text>

      {/* Defaults */}
      <View>
        <SectionLabel label={s.defaults} />
        <Card>
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <View>
              <Text style={styles.rowTitle}>{s.defaultFormat}</Text>
              <Text style={styles.rowSub}>{s.defaultFormatSub}</Text>
            </View>
            <View style={styles.formatPicker}>
              {ALL_FORMATS.map(f => (
                <Pressable
                  key={f}
                  onPress={() => set('defaultFormat', f)}
                  style={[styles.formatChip, settings.defaultFormat === f && styles.formatChipActive]}
                >
                  <Text style={[styles.formatChipText, settings.defaultFormat === f && styles.formatChipTextActive]}>
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Row>
          <View style={styles.rowDivider} />
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <View>
              <Text style={styles.rowTitle}>{s.defaultDeck}</Text>
              <Text style={styles.rowSub}>{s.defaultDeckSub}</Text>
            </View>
            <DeckSelector
              value={settings.defaultDeck}
              onChange={v => set('defaultDeck', v)}
              format={settings.defaultFormat}
              recentDecks={recentDecks}
              placeholder={s.defaultDeckPlaceholder}
              onFocus={subirCampo}
            />
          </Row>
        </Card>
      </View>

      {/* Language */}
      <View>
        <SectionLabel label={s.language} />
        <Card>
          {LANGUAGES.map((lang, i) => (
            <Row
              key={lang.code}
              onPress={() => set('language', lang.code)}
              style={[i < LANGUAGES.length - 1 && styles.rowBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{lang.label}</Text>
                <Text style={styles.rowSub}>{lang.sub}</Text>
              </View>
              {currentLang === lang.code && (
                <Icon name="check" size={16} stroke={colors.ink} />
              )}
            </Row>
          ))}
        </Card>
      </View>

      {/* Data */}
      <View>
        <SectionLabel label={s.data} />
        <Card>
          {/* Ordem por frequência de uso: decks é rotina, CSV é ocasional. */}
          <Row onPress={() => setShowDecks(true)}>
            <Icon name="list" size={18} stroke={colors.ink3} />
            <Text style={[styles.rowTitle, { flex: 1 }]}>{s.manageDecks}</Text>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={() => setShowCounters(true)}>
            <Icon name="counters" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.counters}</Text>
              <Text style={styles.rowSub}>{s.countersSub}</Text>
            </View>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={() => setShowShare(true)}>
            <Icon name="share" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.shareCard}</Text>
              <Text style={styles.rowSub}>{s.shareCardSub}</Text>
            </View>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={() => setShowAccount(true)}>
            <Icon name="shield" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.account}</Text>
              <Text style={styles.rowSub}>
                {socialOn ? `@${settings.social.handle}` : s.accountSub}
              </Text>
            </View>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={() => setShowOpponents(true)}>
            <Icon name="users" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.opponents}</Text>
              <Text style={styles.rowSub}>{s.opponentsSub}</Text>
            </View>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          {socialOn && (
            <>
              <View style={styles.rowDivider} />
              <Row onPress={() => setShowClaims(true)}>
                <Icon name="check" size={18} stroke={colors.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.claims}</Text>
                  <Text style={styles.rowSub}>{s.claimsSub}</Text>
                </View>
                <Icon name="chev" size={14} stroke={colors.ink4} />
              </Row>
            </>
          )}
          {matches.length === 0 && (
            <>
              <View style={styles.rowDivider} />
              <Row onPress={loadDemoData}>
                <Icon name="stats" size={18} stroke={colors.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.loadDemo}</Text>
                  <Text style={styles.rowSub}>{s.loadDemoSub}</Text>
                </View>
                <Icon name="chev" size={14} stroke={colors.ink4} />
              </Row>
            </>
          )}
          <View style={styles.rowDivider} />
          <Row onPress={handleExport}>
            <Icon name="share" size={18} stroke={colors.ink3} />
            <Text style={[styles.rowTitle, { flex: 1 }]}>{s.export}</Text>
            <Icon name="chev" size={14} stroke={colors.ink4} />
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={handleImport}>
            <Icon name="list" size={18} stroke={colors.ink3} />
            <Text style={[styles.rowTitle, { flex: 1 }]}>{s.import}</Text>
            {importStatus === 'ok' && (
              <Text style={styles.importOk}>{s.importOk(importCount)}</Text>
            )}
            {importStatus === 'err' && (
              <Text style={styles.importErr}>{s.importErr}</Text>
            )}
            {!importStatus && <Icon name="chev" size={14} stroke={colors.ink4} />}
          </Row>
          <View style={styles.rowDivider} />
          {/* Modelo de IA — só oferece remover quando há o que remover. */}
          <Row onPress={modelBytes > 0 ? handleDeleteModel : undefined}>
            <Icon name="mic" size={18} stroke={modelBytes > 0 ? colors.ink3 : colors.ink4} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.model}</Text>
              <Text style={styles.rowSub}>
                {modelBytes > 0 ? s.modelPresent(mb(modelBytes)) : s.modelAbsent}
              </Text>
            </View>
            {modelBytes > 0 && (
              <Text style={styles.modelAction}>{s.modelRemove}</Text>
            )}
          </Row>
          <View style={styles.rowDivider} />
          <Row onPress={handleDelete}>
            <Icon name="trash" size={18} stroke={colors.bad} />
            <Text style={[styles.rowTitle, { flex: 1, color: colors.bad }]}>{s.deleteAll}</Text>
            <Icon name="chev" size={14} stroke={colors.bad} />
          </Row>
        </Card>
      </View>

      {/* Apoio */}
      <Pressable
        style={styles.kofi}
        onPress={() => { void Linking.openURL(KOFI_URL); }}
      >
        <Icon name="coffee" size={20} stroke={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.kofiTitle}>{s.kofi}</Text>
          <Text style={styles.kofiSub}>{s.kofiSub}</Text>
        </View>
        <Icon name="chev" size={14} stroke={colors.accent} />
      </Pressable>

      {/* Privacy */}
      <View>
        <SectionLabel label={s.privacy} />
        <Card>
          <Row>
            <Icon name="shield" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.onDevice}</Text>
              <Text style={styles.rowSub}>{s.onDeviceSub}</Text>
            </View>
            <Badge label={s.alwaysOn} />
          </Row>
          <View style={styles.rowDivider} />
          <Row>
            <Icon name="share" size={18} stroke={colors.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.shareAnon}</Text>
              <Text style={styles.rowSub}>{s.shareAnonSub}</Text>
            </View>
            <Toggle value={settings.shareAnon} onValueChange={v => set('shareAnon', v)} />
          </Row>

          {settings.shareAnon && (
            <>
              <View style={styles.rowDivider} />
              <View style={styles.shareDetail}>
                <Text style={styles.shareLabel}>{s.shareWhatLabel}</Text>
                <Text style={styles.shareMono}>{s.shareWhat}</Text>
                <Text style={styles.shareStatus}>
                  {!TELEMETRY_CONFIGURED
                    ? s.shareNotConfigured
                    : pendingCount > 0
                      ? s.sharePending(pendingCount)
                      : s.shareUpToDate}
                </Text>
              </View>
            </>
          )}
        </Card>
      </View>

      <Text style={styles.version}>{s.version}</Text>
      <View style={{ height: 20 }} />
      <View style={{ height: folga }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Inter',
    color: colors.ink,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line2 },
  rowDivider: { height: 1, backgroundColor: colors.line2 },
  rowTitle: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter', color: colors.ink },
  modelAction: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: colors.bad,
  },
  rowSub: {
    fontSize: 11,
    fontFamily: 'Inter',
    color: colors.ink3,
    marginTop: 2,
  },
  // Format picker chips
  formatPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  formatChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  formatChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  formatChipText: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: '500',
    color: colors.ink3,
  },
  formatChipTextActive: { color: '#fff' },
  // Import/export
  importOk: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: colors.good,
  },
  importErr: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: colors.bad,
  },
  wrText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '700', marginRight: 8 },
  // Detalhe do compartilhamento anônimo
  shareDetail: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    backgroundColor: colors.surface2,
  },
  shareLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  shareMono: {
    fontFamily: 'JetBrainsMono',
    fontSize: 10,
    lineHeight: 17,
    color: colors.ink2,
  },
  shareStatus: {
    fontSize: 11,
    fontFamily: 'Inter',
    color: colors.ink3,
    marginTop: 2,
  },
  kofi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,95,60,0.35)',
    backgroundColor: colors.accentSoft,
    marginTop: 4,
  },
  kofiTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter', color: colors.accent },
  kofiSub: { fontSize: 11, fontFamily: 'Inter', color: colors.ink3, marginTop: 2 },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.ink4,
    fontFamily: 'JetBrainsMono',
    paddingVertical: 12,
  },
  // ManageDecks
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
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
  searchInput: {
    fontSize: 13,
    fontFamily: 'Inter',
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  emptyText: { fontSize: 12, fontFamily: 'Inter', color: colors.ink4 },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter',
    color: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  editSaveBtn: {
    backgroundColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editSaveText: { color: '#fff', fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },
  editCancelBtn: {
    backgroundColor: colors.bg2,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editCancelText: { color: colors.ink3, fontSize: 12, fontFamily: 'Inter' },
});

import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';
import { useT } from '../i18n/useT';
import { useKeyboardAware } from '../hooks/useKeyboardAware';
import { SOCIAL_AVAILABLE } from '../services/supabase';
import {
  signUp, signIn, signOut, registerHandle, currentEmail,
  AuthError, HANDLE_RE, normalizeHandle,
} from '../services/social';

type Mode = 'in' | 'up';

const MIN_PASSWORD = 8;

/**
 * Conta do jogador: e-mail, apelido e senha, tudo criado aqui mesmo.
 *
 * O e-mail não é verificado. Ele existe para entrar e para o amigo achar
 * você — não como prova de que o endereço é seu. É uma escolha deliberada de
 * produto, e está escrita na tela para ninguém supor o contrário.
 */
export function AccountScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const a = t.account;
  const { scrollProps, subirCampo, folga } = useKeyboardAware();

  const social = useStore(s => s.settings.social);
  const setSocial = useStore(s => s.setSocial);
  const syncMatches = useStore(s => s.syncMatches);
  const syncStatus = useStore(s => s.syncStatus);
  const opponents = useStore(s => s.opponents);
  const updateOpponent = useStore(s => s.updateOpponent);

  const [mode, setMode] = React.useState<Mode>('up');
  const [email, setEmail] = React.useState(social.email);
  const [handle, setHandle] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = React.useState(social.email);
  const [editHandle, setEditHandle] = React.useState(social.handle);

  React.useEffect(() => {
    if (!social.enabled) return;
    void currentEmail().then(e => { if (e) setSessionEmail(e); });
  }, [social.enabled]);

  const cleanHandle = normalizeHandle(handle);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = mode === 'in'
    ? emailOk && password.length > 0
    : emailOk && HANDLE_RE.test(cleanHandle) && password.length >= MIN_PASSWORD;

  const message = (e: unknown): string => {
    if (e instanceof AuthError) {
      const map: Record<string, string> = {
        'invalid-handle': a.errInvalidHandle,
        'handle-taken': a.errHandleTaken,
        'email-taken': a.errEmailTaken,
        'bad-credentials': a.errCredentials,
        'needs-confirmation': a.errConfirmation,
        'weak-password': a.errWeakPassword,
      };
      return map[e.kind] ?? e.message;
    }
    return e instanceof Error ? e.message : String(e);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const player = mode === 'up'
        ? await signUp(email, cleanHandle, password)
        : await signIn(email, password);
      setSocial({
        enabled: true,
        playerId: player.id,
        handle: player.handle,
        email: email.trim().toLowerCase(),
      });
      setEditHandle(player.handle);
      setPassword('');
      // Entrar numa conta existente traz o historico de volta, sem esperar
      // o intervalo.
      void syncMatches(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Sair derruba o vínculo remoto de todos os oponentes. O apelido local e o
   * histórico ficam: quem some é a conta do outro lado, que sem sessão não dá
   * para consultar nem para receber confirmação.
   */
  const doSignOut = () => {
    Alert.alert(a.signOutTitle, a.signOutBody, [
      { text: a.cancel, style: 'cancel' },
      {
        text: a.signOut,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await signOut();
              opponents
                .filter(o => o.linkState !== 'local')
                .forEach(o => updateOpponent(o.id, {
                  linkState: 'local', playerId: undefined, remoteName: undefined,
                }));
              setSocial({ enabled: false, playerId: undefined, handle: '' });
              setPassword('');
              setMode('in');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const saveHandle = () => {
    const next = normalizeHandle(editHandle);
    if (next === social.handle) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const player = await registerHandle(next);
        setSocial({ handle: player.handle });
        setEditHandle(player.handle);
      } catch (e) {
        setError(message(e));
        setEditHandle(social.handle);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <ScrollView
      {...scrollProps}
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Icon name="back" size={16} stroke={colors.ink} />
        <Text style={styles.backText}>{a.back}</Text>
      </Pressable>

      <Text style={styles.pageTitle}>{a.title}</Text>

      {!SOCIAL_AVAILABLE ? (
        <View style={styles.card}>
          <View style={styles.rowCol}>
            <Text style={styles.body}>{a.notConfigured}</Text>
          </View>
        </View>
      ) : social.enabled ? (
        <>
          <Text style={styles.intro}>{a.signedInIntro}</Text>

          <View style={styles.card}>
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{a.email}</Text>
              <Text style={styles.readonly}>{sessionEmail || social.email}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{a.handle}</Text>
              <View style={styles.handleRow}>
                <Text style={styles.at}>@</Text>
                <TextInput
                  value={editHandle}
                  onChangeText={v => setEditHandle(normalizeHandle(v))}
                  onBlur={saveHandle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  style={[styles.input, styles.handleInput]}
                  onFocus={subirCampo}
                />
              </View>
              <Text style={styles.fieldHint}>{a.handleHint}</Text>
            </View>
          </View>

          {/* Estado da sincronização. Existe porque ela falhava calada: quem
              atualizava o app achava que tinha subido, e não tinha. */}
          <View style={styles.card}>
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{a.syncLabel}</Text>
              {syncStatus ? (
                syncStatus.error ? (
                  <Text style={styles.syncError}>
                    {syncStatus.error === 'session' ? a.syncExpired : a.syncFailed}
                  </Text>
                ) : (
                  <Text style={styles.readonly}>
                    {a.syncOk(syncStatus.pushed, syncStatus.pulled)}
                  </Text>
                )
              ) : (
                <Text style={styles.fieldHint}>{a.syncNever}</Text>
              )}
              <Pressable
                onPress={() => { setBusy(true); void syncMatches().finally(() => setBusy(false)); }}
                disabled={busy}
              >
                <Text style={styles.syncNow}>{busy ? a.syncing : a.syncNow}</Text>
              </Pressable>
            </View>
          </View>

          {!!error && (
            <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
          )}

          <Pressable onPress={doSignOut} disabled={busy} style={styles.signOutBtn}>
            {busy
              ? <ActivityIndicator size="small" color={colors.bad} />
              : <Text style={styles.signOutText}>{a.signOut}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.intro}>{a.signedOutIntro}</Text>

          <View style={styles.tabs}>
            {(['up', 'in'] as Mode[]).map(m => (
              <Pressable
                key={m}
                onPress={() => { setMode(m); setError(null); }}
                style={[styles.tab, mode === m && styles.tabOn]}
              >
                <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>
                  {m === 'up' ? a.signUp : a.signIn}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{a.email}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={a.emailPlaceholder}
                placeholderTextColor={colors.ink4}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                onFocus={subirCampo}
              />
            </View>

            {mode === 'up' && (
              <>
                <View style={styles.divider} />
                <View style={styles.rowCol}>
                  <Text style={styles.fieldLabel}>{a.handle}</Text>
                  <View style={styles.handleRow}>
                    <Text style={styles.at}>@</Text>
                    <TextInput
                      value={handle}
                      onChangeText={v => setHandle(normalizeHandle(v))}
                      placeholder={a.handlePlaceholder}
                      placeholderTextColor={colors.ink4}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={20}
                      style={[styles.input, styles.handleInput]}
                      onFocus={subirCampo}
                    />
                  </View>
                  <Text style={styles.fieldHint}>{a.handleHint}</Text>
                </View>
              </>
            )}

            <View style={styles.divider} />
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{a.password}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'up' ? a.passwordPlaceholder : ''}
                placeholderTextColor={colors.ink4}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={mode === 'up' ? 'newPassword' : 'password'}
                style={styles.input}
                onFocus={subirCampo}
                onSubmitEditing={() => { if (canSubmit) void submit(); }}
                returnKeyType="go"
              />
              {mode === 'up' && <Text style={styles.fieldHint}>{a.passwordHint}</Text>}
            </View>
          </View>

          {!!error && (
            <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
          )}

          <Pressable
            onPress={() => { void submit(); }}
            disabled={!canSubmit || busy}
            style={[styles.primaryBtn, (!canSubmit || busy) && styles.btnOff]}
          >
            {busy
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.primaryBtnText}>{mode === 'up' ? a.signUp : a.signIn}</Text>}
          </Pressable>

          <Text style={styles.footnote}>{a.noVerification}</Text>
        </>
      )}

      <View style={{ height: 28 }} />
      <View style={{ height: folga }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '500', color: colors.ink },
  pageTitle: {
    fontSize: 26, fontWeight: '700', fontFamily: 'Inter',
    color: colors.ink, letterSpacing: -0.5,
  },
  intro: {
    fontSize: 12, fontFamily: 'Inter', color: colors.ink3,
    lineHeight: 18, marginTop: -6,
  },
  body: { fontSize: 12, fontFamily: 'Inter', color: colors.ink3, lineHeight: 18 },

  tabs: {
    flexDirection: 'row', gap: 6, padding: 4,
    borderRadius: 12, backgroundColor: colors.bg2,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '500', color: colors.ink3 },
  tabTextOn: { color: colors.ink, fontWeight: '600' },

  card: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, overflow: 'hidden',
  },
  rowCol: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  divider: { height: 1, backgroundColor: colors.line2 },
  fieldLabel: {
    fontSize: 9.5, fontFamily: 'JetBrainsMono', letterSpacing: 0.6,
    textTransform: 'uppercase', color: colors.ink3,
  },
  fieldHint: { fontSize: 11, fontFamily: 'Inter', color: colors.ink4, lineHeight: 16 },
  readonly: { fontSize: 14, fontFamily: 'Inter', color: colors.ink },
  input: {
    flex: 1, fontSize: 14, fontFamily: 'Inter', color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 8,
    backgroundColor: colors.bg,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  at: { fontSize: 16, fontFamily: 'JetBrainsMono', color: colors.ink4 },
  handleInput: { fontFamily: 'JetBrainsMono' },

  primaryBtn: {
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.ink, alignItems: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', fontFamily: 'Inter', color: '#fff' },
  btnOff: { opacity: 0.35 },

  signOutBtn: { paddingVertical: 12, alignItems: 'center' },
  syncNow: { fontSize: 12, fontFamily: 'Inter', fontWeight: '600', color: colors.accent, marginTop: 4 },
  syncError: { fontSize: 12, fontFamily: 'Inter', color: colors.bad, lineHeight: 17 },
  signOutText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '600', color: colors.bad },

  errorBox: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(192,66,42,0.4)',
    backgroundColor: colors.badSoft, padding: 12,
  },
  errorText: { fontSize: 12, fontFamily: 'Inter', color: colors.bad, lineHeight: 17 },
  footnote: {
    fontSize: 11, fontFamily: 'Inter', color: colors.ink4,
    lineHeight: 16, paddingHorizontal: 8,
  },
});

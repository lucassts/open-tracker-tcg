import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { DeckSelector } from '../components/DeckSelector';
import { Toggle } from '../components/Toggle';
import { Badge } from '../components/Badge';
import { Format } from '../types';
import { useStore } from '../store/useStore';
import { useT } from '../i18n/useT';
import { useKeyboardAware } from '../hooks/useKeyboardAware';
import { LANGUAGES } from '../i18n/languages';
import { Icon } from '../components/Icon';
import { SOCIAL_AVAILABLE } from '../services/supabase';
import { signUp, signIn, AuthError, HANDLE_RE, normalizeHandle } from '../services/social';

const FORMATS = [
  { l: 'Commander', s: 'EDH · 4p' },
  { l: 'Modern', s: '1v1' },
  { l: 'Standard', s: '1v1' },
  { l: 'Pioneer', s: '1v1' },
  { l: 'Legacy', s: '1v1' },
  { l: 'Pauper', s: '1v1' },
  { l: 'Draft', s: 'Limited' },
  { l: 'Other', s: '—' },
];

function Dots({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => i + 1).map(i => (
        <View
          key={i}
          style={[
            styles.dot,
            i === step ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

const MIN_PASSWORD = 8;

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const o = t.onboarding;
  const a = t.account;
  const { scrollProps, subirCampo, folga } = useKeyboardAware();
  const [step, setStep] = React.useState(0);
  const [fmt, setFmt] = React.useState<Format>('Commander');
  const [deck, setDeck] = React.useState('');
  const [share, setShare] = React.useState(true);
  const updateSettings = useStore(s => s.updateSettings);
  const idioma = useStore(s => s.settings.language);
  const setSocial = useStore(s => s.setSocial);
  const syncMatches = useStore(s => s.syncMatches);

  // A conta é o último passo, e só existe quando há servidor: num build sem
  // Supabase configurado o passo seria uma tela que não faz nada.
  const LAST = SOCIAL_AVAILABLE ? 5 : 4;
  /** Com o idioma na frente, são LAST+1 telas, e o passo 0 é a primeira. */
  const TOTAL = LAST + 1;

  /**
   * Criar OU entrar. Quem reinstala o app precisa recuperar o historico aqui
   * mesmo: mandar essa pessoa pular o passo e cavar em Configuracoes e o
   * caminho mais rapido para ela achar que perdeu tudo.
   */
  const [mode, setMode] = React.useState<'up' | 'in'>('up');
  const [email, setEmail] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cleanHandle = normalizeHandle(handle);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canCreate = mode === 'in'
    ? emailOk && password.length > 0
    : emailOk && HANDLE_RE.test(cleanHandle) && password.length >= MIN_PASSWORD;

  const finish = () => {
    updateSettings({
      defaultFormat: fmt,
      defaultDeck: deck,
      shareAnon: share,
      onboarded: true,
    });
  };

  /** Cria a conta e entra no app. Falhar aqui não pode prender ninguém. */
  const createAccount = async () => {
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
      // Entrar numa conta existente traz o historico de volta antes de sair
      // do onboarding.
      if (mode === 'in') await syncMatches(true);
      finish();
    } catch (e) {
      const map: Record<string, string> = {
        'invalid-handle': a.errInvalidHandle,
        'handle-taken': a.errHandleTaken,
        'email-taken': a.errEmailTaken,
        'bad-credentials': a.errCredentials,
        'needs-confirmation': a.errConfirmation,
        'weak-password': a.errWeakPassword,
      };
      setError(
        e instanceof AuthError
          ? (map[e.kind] ?? e.message)
          : e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step < LAST) {
      setStep(step + 1);
    } else if (step === 5) {
      void createAccount();
    } else {
      finish();
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        {...scrollProps}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <>
            {/* Antes de qualquer outra coisa: não adianta explicar o app numa
                língua que a pessoa não lê. */}
            <Text style={styles.h1}>{o.languageTitle}</Text>
            <Text style={styles.body}>{o.languageBody}</Text>
            <View style={styles.card}>
              {LANGUAGES.map((lang, i) => (
                <Pressable
                  key={lang.code}
                  onPress={() => updateSettings({ language: lang.code })}
                  style={[styles.langRow, i > 0 && styles.langDivider]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langLabel}>{lang.label}</Text>
                    <Text style={styles.langSub}>{lang.sub}</Text>
                  </View>
                  {idioma === lang.code && (
                    <Icon name="check" size={16} stroke={colors.ink} />
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Badge label={o.badge} />
            <Text style={styles.h1}>{o.step1Title}</Text>
            <Text style={styles.body}>{o.step1Body}</Text>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{o.step1HowLabel}</Text>
              <Text style={styles.cardBody}>{o.step1How}</Text>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.stepLabel}>{o.stepLabel(3, TOTAL)}</Text>
            <Text style={styles.h2}>{o.step2Title}</Text>
            <Text style={styles.body2}>{o.step2Body}</Text>
            <View style={styles.formatGrid}>
              {FORMATS.map(f => (
                <Pressable
                  key={f.l}
                  onPress={() => setFmt(f.l as Format)}
                  style={[
                    styles.formatBtn,
                    fmt === f.l && styles.formatBtnActive,
                  ]}
                >
                  <Text style={[styles.formatLabel, fmt === f.l && styles.formatLabelActive]}>
                    {f.l}
                  </Text>
                  <Text style={styles.formatSub}>{f.s}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.stepLabel}>{o.stepLabel(4, TOTAL)}</Text>
            <Text style={styles.h2}>{o.step3Title}</Text>
            <Text style={styles.body2}>{o.step3Body}</Text>
            <DeckSelector
              value={deck}
              onChange={setDeck}
              format={fmt}
              recentDecks={[]}
              placeholder={t.settings.defaultDeckPlaceholder}
              onFocus={subirCampo}
            />
            <View style={[styles.card, { backgroundColor: colors.surface2 }]}>
              <Text style={styles.cardBody}>
                <Text style={{ fontWeight: '700' }}>Dica — </Text>
                {o.step3Tip}
              </Text>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.stepLabel}>{o.stepLabel(5, TOTAL)}</Text>
            <Text style={styles.h2}>{o.step4Title}</Text>
            <Text style={styles.body2}>{o.step4Body}</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>{o.step4ToggleTitle}</Text>
                  <Text style={[styles.body2, { marginTop: 4 }]}>{o.step4ToggleBody}</Text>
                </View>
                <Toggle value={share} onValueChange={setShare} />
              </View>
            </View>
            <View style={[styles.card, { backgroundColor: colors.surface2 }]}>
              <Text style={styles.sectionLabel}>{o.step4WhatLabel}</Text>
              <Text style={styles.monoText}>{o.step4What}</Text>
            </View>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.stepLabel}>{o.stepLabel(6, TOTAL)}</Text>
            <Text style={styles.h2}>{o.step5Title}</Text>
            <Text style={styles.body2}>{o.step5Body}</Text>

            <View style={styles.tabs}>
              {(['up', 'in'] as const).map(m => (
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
              <Text style={styles.sectionLabel}>{a.email}</Text>
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

              {/* Apelido só existe ao criar: quem entra já tem o dele. */}
              {mode === 'up' && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>{a.handle}</Text>
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
                  <Text style={styles.hint}>{a.handleHint}</Text>
                </>
              )}

              <Text style={[styles.sectionLabel, { marginTop: 14 }]}>{a.password}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={a.passwordPlaceholder}
                placeholderTextColor={colors.ink4}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={mode === 'up' ? 'newPassword' : 'password'}
                style={styles.input}
                onFocus={subirCampo}
              />
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.hint}>{a.noVerification}</Text>
          </>
        )}
        <View style={{ height: folga }} />
      </ScrollView>

      {/*
        O app desenha por baixo das barras do sistema (edge-to-edge, padrão da
        SDK 54). Sem a folga de baixo, o botão fica atrás dos botões do Android.
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Dots step={step + 1} total={TOTAL} />
        <Pressable
          style={[styles.cta, step === 5 && (!canCreate || busy) && styles.ctaOff]}
          onPress={next}
          disabled={step === 5 && (!canCreate || busy)}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {step === LAST ? (step === 5 ? (mode === 'up' ? a.signUp : a.signIn) : o.start) : o.continue}
            </Text>
          )}
        </Pressable>

        {/* Sair sem conta é um caminho de primeira classe: o app inteiro
            funciona sem ela, e prender alguém num cadastro na primeira tela é
            a forma mais rápida de fazer a pessoa desinstalar. */}
        {step === 5 && (
          <Pressable onPress={finish} disabled={busy} style={styles.skipBtn}>
            <Text style={styles.skipText}>{o.step5Skip}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  langRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  langDivider: { borderTopWidth: 1, borderTopColor: colors.line2 },
  langLabel: { fontSize: 15, fontFamily: 'Inter', fontWeight: '500', color: colors.ink },
  langSub: { fontSize: 12, fontFamily: 'Inter', color: colors.ink3, marginTop: 2 },
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingTop: 28,
    gap: 16,
  },
  h1: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'Inter',
    letterSpacing: -0.5,
    lineHeight: 34,
    color: colors.ink,
    marginVertical: 4,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter',
    letterSpacing: -0.3,
    lineHeight: 28,
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    color: colors.ink2,
    lineHeight: 22,
    fontFamily: 'Inter',
  },
  body2: {
    fontSize: 12,
    color: colors.ink3,
    lineHeight: 18,
    fontFamily: 'Inter',
  },
  stepLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 8,
  },
  cardBody: {
    fontSize: 12,
    color: colors.ink2,
    lineHeight: 22,
    fontFamily: 'Inter',
  },
  sectionLabel: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  monoText: {
    fontFamily: 'JetBrainsMono',
    fontSize: 10,
    color: colors.ink2,
    lineHeight: 18,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatBtn: {
    width: '47%',
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  formatBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  formatLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Inter',
    color: colors.ink,
  },
  formatLabelActive: { fontWeight: '600' },
  formatSub: {
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: colors.ink,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.bg2,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '500', color: colors.ink3 },
  tabTextOn: { color: colors.ink, fontWeight: '600' },
  input: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.bg,
    marginTop: 6,
    flex: 1,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  at: { fontSize: 16, fontFamily: 'JetBrainsMono', color: colors.ink4, marginTop: 6 },
  handleInput: { fontFamily: 'JetBrainsMono' },
  hint: { fontSize: 11, fontFamily: 'Inter', color: colors.ink4, lineHeight: 16, marginTop: 6 },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(192,66,42,0.4)',
    backgroundColor: colors.badSoft,
    padding: 12,
  },
  errorText: { fontSize: 12, fontFamily: 'Inter', color: colors.bad, lineHeight: 17 },
  ctaOff: { opacity: 0.35 },
  skipBtn: { paddingVertical: 12, alignItems: 'center' },
  skipText: { fontSize: 13, fontFamily: 'Inter', fontWeight: '500', color: colors.ink3 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  dot: {
    height: 6,
    borderRadius: 999,
  },
  dotActive: { width: 20, backgroundColor: colors.ink },
  dotInactive: { width: 6, backgroundColor: colors.ink5 },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: '#fff',
  },
});

import React from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { Icon } from '../components/Icon';
import { useStore } from '../store/useStore';
import { Opponent } from '../types';
import { useT } from '../i18n/useT';
import { useKeyboardAware } from '../hooks/useKeyboardAware';
import { SOCIAL_AVAILABLE } from '../services/supabase';
import { mensagemDeErro, ehSessaoVencida } from '../services/erros';
import {
  sendFriendRequest, listFriendRequests, resolveFriendRequest,
  listFriends, removeFriend, FriendRequest,
} from '../services/social';

export function OpponentsScreen({
  onBack, onOpenAccount,
}: {
  onBack: () => void;
  onOpenAccount: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const o = t.opponents;
  const { scrollProps, subirCampo, folga } = useKeyboardAware();

  const social = useStore(s => s.settings.social);
  const opponents = useStore(s => s.opponents);
  const matches = useStore(s => s.matches);
  const addOpponent = useStore(s => s.addOpponent);
  const updateOpponent = useStore(s => s.updateOpponent);
  const deleteOpponent = useStore(s => s.deleteOpponent);

  const [nickname, setNickname] = React.useState('');
  const [friendQuery, setFriendQuery] = React.useState('');
  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [linkQuery, setLinkQuery] = React.useState('');
  const [requests, setRequests] = React.useState<FriendRequest[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  /** Quantas partidas contra cada oponente, para ordenar por convivência. */
  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    matches.forEach(m => {
      if (m.opponentId) map.set(m.opponentId, (map.get(m.opponentId) ?? 0) + 1);
    });
    return map;
  }, [matches]);

  const sorted = React.useMemo(
    () => [...opponents].sort((a, b) =>
      (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
      || a.nickname.localeCompare(b.nickname)
    ),
    [opponents, counts]
  );

  /**
   * Sincroniza com o servidor: quem já é amigo vira oponente vinculado, e
   * quem aceitou um pedido meu sai de "aguardando".
   *
   * É por consulta, e não por aviso, porque aceitar acontece no aparelho da
   * outra pessoa — sem perguntar, o vínculo existiria no banco e este app
   * nunca saberia. Roda ao abrir a tela, que é quando importa.
   */
  const sync = React.useCallback(async () => {
    if (!social.enabled) return;
    const [reqs, friends] = await Promise.all([listFriendRequests(), listFriends()]);

    setRequests(reqs);

    friends.forEach(friend => {
      const existing = useStore.getState().opponents.find(op => op.playerId === friend.id);
      if (existing) {
        if (existing.linkState !== 'linked' || existing.remoteName !== friend.handle) {
          updateOpponent(existing.id, { linkState: 'linked', remoteName: friend.handle });
        }
        return;
      }
      // Amigo sem oponente correspondente: cria um, porque foi exatamente
      // isso que a pessoa pediu ao aceitar — passar a registrar partidas dela.
      const created = addOpponent(friend.handle);
      if (created) {
        updateOpponent(created.id, {
          linkState: 'linked', playerId: friend.id, remoteName: friend.handle,
        });
      }
    });

    // Amizade desfeita do outro lado: volta a ser oponente local.
    const friendIds = new Set(friends.map(f => f.id));
    useStore.getState().opponents.forEach(op => {
      if (op.linkState === 'linked' && op.playerId && !friendIds.has(op.playerId)) {
        updateOpponent(op.id, { linkState: 'local', playerId: undefined, remoteName: undefined });
      }
    });
  }, [social.enabled, addOpponent, updateOpponent]);

  React.useEffect(() => {
    void sync().catch(() => { /* sem rede: a tela funciona como estava */ });
    // Só ao abrir e ao entrar/sair da conta. Depender de `opponents` criaria um
    // laço, já que o efeito escreve nessa mesma lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social.enabled]);

  /**
   * Roda uma ação e conta o que aconteceu, dando certo ou errado.
   *
   * O `String(e)` que estava aqui devolvia "[object Object]": o PostgREST não
   * rejeita com `Error`, rejeita com um objeto simples. A caixa vermelha
   * aparecia sem dizer nada, e o pedido de amizade que falhava era
   * indistinguível do que dava certo.
   */
  const markNeedsLogin = useStore(st => st.markNeedsLogin);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (ehSessaoVencida(e)) markNeedsLogin();
      setError(mensagemDeErro(e, {
        sessaoVencida: o.sessionExpired,
        naoAchei: o.errNotFound,
        voceMesmo: o.errYourself,
        semRede: o.errNetwork,
        generico: o.errGeneric,
      }));
    } finally {
      setBusy(null);
    }
  };

  /** Manda pedido e, se quiser, amarra o resultado a um oponente já existente. */
  const invite = (query: string, opponentId?: string) =>
    run(opponentId ?? 'add', async () => {
      const result = await sendFriendRequest(query);

      const target = opponentId
        ? opponents.find(x => x.id === opponentId)
        : opponents.find(x => x.remoteName === result.targetHandle)
          ?? addOpponent(result.targetHandle);

      if (target) {
        updateOpponent(target.id, {
          linkState: result.friends ? 'linked' : 'requested',
          playerId: result.targetId,
          remoteName: result.targetHandle,
        });
      }

      setNotice(result.friends ? o.nowFriends(result.targetHandle) : o.requestSent(result.targetHandle));
      setFriendQuery('');
      setLinkQuery('');
      setLinkingId(null);
      await sync();
    });

  const answer = (request: FriendRequest, accept: boolean) =>
    run(request.id, async () => {
      await resolveFriendRequest(request.id, accept);
      await sync();
    });

  const confirmDelete = (opponent: Opponent) => {
    Alert.alert(o.deleteTitle, o.deleteBody(opponent.nickname), [
      { text: o.cancel, style: 'cancel' },
      {
        text: o.delete,
        style: 'destructive',
        onPress: () => {
          if (opponent.linkState === 'linked' && opponent.playerId) {
            void removeFriend(opponent.playerId).catch(() => {});
          }
          deleteOpponent(opponent.id);
        },
      },
    ]);
  };

  const incoming = requests.filter(r => r.direction === 'in');
  const outgoing = requests.filter(r => r.direction === 'out');

  return (
    <ScrollView
      {...scrollProps}
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Icon name="back" size={16} stroke={colors.ink} />
        <Text style={styles.backText}>{o.back}</Text>
      </Pressable>

      <Text style={styles.pageTitle}>{o.title}</Text>
      <Text style={styles.intro}>{o.intro}</Text>

      {/* A conta está salva aqui, mas o servidor não aceita mais as chamadas. */}
      {social.enabled && social.needsLogin && (
        <Pressable style={styles.expiredBox} onPress={onOpenAccount}>
          <Icon name="shield" size={16} stroke={colors.bad} />
          <Text style={styles.expiredText}>{o.sessionExpired}</Text>
          <Icon name="chev" size={14} stroke={colors.bad} />
        </Pressable>
      )}

      {/* Adicionar oponente local — funciona sem conta */}
      <View style={styles.card}>
        <View style={styles.rowCol}>
          <Text style={styles.fieldLabel}>{o.newOpponent}</Text>
          <View style={styles.inlineRow}>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder={o.newOpponentPlaceholder}
              placeholderTextColor={colors.ink4}
              style={styles.input}
              maxLength={40}
              onFocus={subirCampo}
              onSubmitEditing={() => { addOpponent(nickname); setNickname(''); }}
              returnKeyType="done"
            />
            <Pressable
              onPress={() => { addOpponent(nickname); setNickname(''); }}
              disabled={!nickname.trim()}
              style={[styles.primaryBtn, !nickname.trim() && styles.btnOff]}
            >
              <Icon name="plus" size={14} stroke="#fff" />
              <Text style={styles.primaryBtnText}>{o.add}</Text>
            </Pressable>
          </View>
          <Text style={styles.fieldHint}>{o.newOpponentHint}</Text>
        </View>
      </View>

      {/* Amigos — precisa de conta */}
      <View>
        <Text style={styles.sectionLabel}>{o.friendsLabel}</Text>

        {!SOCIAL_AVAILABLE ? (
          <View style={styles.card}>
            <View style={styles.rowCol}>
              <Text style={styles.warnText}>{o.notConfigured}</Text>
            </View>
          </View>
        ) : !social.enabled ? (
          <Pressable style={styles.card} onPress={onOpenAccount}>
            <View style={styles.row}>
              <Icon name="users" size={18} stroke={colors.ink3} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{o.needAccount}</Text>
                <Text style={styles.rowSub}>{o.needAccountSub}</Text>
              </View>
              <Icon name="chev" size={14} stroke={colors.ink4} />
            </View>
          </Pressable>
        ) : (
          <View style={styles.card}>
            <View style={styles.rowCol}>
              <Text style={styles.fieldLabel}>{o.addFriend}</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  value={friendQuery}
                  onChangeText={setFriendQuery}
                  placeholder={o.addFriendPlaceholder}
                  placeholderTextColor={colors.ink4}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  onFocus={subirCampo}
                  onSubmitEditing={() => { if (friendQuery.trim()) void invite(friendQuery); }}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={() => { if (friendQuery.trim()) void invite(friendQuery); }}
                  disabled={!friendQuery.trim() || busy === 'add'}
                  style={[styles.primaryBtn, !friendQuery.trim() && styles.btnOff]}
                >
                  {busy === 'add'
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.primaryBtnText}>{o.send}</Text>}
                </Pressable>
              </View>
              <Text style={styles.fieldHint}>{o.addFriendHint(social.handle)}</Text>
            </View>
          </View>
        )}
      </View>

      {!!notice && (
        <View style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View>
      )}
      {!!error && (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      )}

      {/* Pedidos recebidos */}
      {incoming.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>{o.incomingLabel}</Text>
          {incoming.map(r => (
            <View key={r.id} style={styles.requestCard}>
              <Text style={styles.requestName}>@{r.otherHandle}</Text>
              <View style={styles.requestActions}>
                {busy === r.id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Pressable onPress={() => void answer(r, false)} hitSlop={8}>
                      <Text style={[styles.linkAction, { color: colors.ink3 }]}>{o.decline}</Text>
                    </Pressable>
                    <Pressable onPress={() => void answer(r, true)} hitSlop={8}>
                      <Text style={styles.linkAction}>{o.accept}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Pedidos enviados */}
      {outgoing.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>{o.outgoingLabel}</Text>
          {outgoing.map(r => (
            <View key={r.id} style={styles.requestCard}>
              <Text style={styles.requestName}>@{r.otherHandle}</Text>
              <Text style={styles.waitingText}>{o.waiting}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Lista */}
      <View>
        <Text style={styles.sectionLabel}>{o.listLabel}</Text>

        {sorted.length === 0 && (
          <View style={styles.card}>
            <View style={[styles.rowCol, { alignItems: 'center', gap: 4 }]}>
              <Text style={styles.emptyTitle}>{o.empty}</Text>
              <Text style={styles.emptyBody}>{o.emptyBody}</Text>
            </View>
          </View>
        )}

        {sorted.map(opponent => (
          <View key={opponent.id} style={styles.opponentCard}>
            <View style={styles.opponentHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.opponentName}>{opponent.nickname}</Text>
                <Text style={styles.opponentMeta}>
                  {o.matchCount(counts.get(opponent.id) ?? 0)}
                  {opponent.remoteName ? ` · @${opponent.remoteName}` : ''}
                </Text>
              </View>

              <View style={[
                styles.tag,
                opponent.linkState === 'linked' && styles.tagLinked,
                opponent.linkState === 'requested' && styles.tagInvited,
              ]}>
                <Text style={[
                  styles.tagText,
                  opponent.linkState === 'linked' && styles.tagTextLinked,
                  opponent.linkState === 'requested' && styles.tagTextInvited,
                ]}>
                  {o.state[opponent.linkState]}
                </Text>
              </View>
            </View>

            {linkingId === opponent.id ? (
              <View style={styles.inlineRow}>
                <TextInput
                  autoFocus
                  value={linkQuery}
                  onChangeText={setLinkQuery}
                  placeholder={o.addFriendPlaceholder}
                  placeholderTextColor={colors.ink4}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                  onFocus={subirCampo}
                  onSubmitEditing={() => { if (linkQuery.trim()) void invite(linkQuery, opponent.id); }}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={() => { if (linkQuery.trim()) void invite(linkQuery, opponent.id); }}
                  disabled={!linkQuery.trim() || busy === opponent.id}
                  style={[styles.primaryBtn, !linkQuery.trim() && styles.btnOff]}
                >
                  {busy === opponent.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.primaryBtnText}>{o.send}</Text>}
                </Pressable>
              </View>
            ) : (
              <View style={styles.opponentActions}>
                {social.enabled && opponent.linkState === 'local' && (
                  <Pressable
                    onPress={() => { setLinkingId(opponent.id); setLinkQuery(''); }}
                    hitSlop={8}
                  >
                    <Text style={styles.linkAction}>{o.link}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => confirmDelete(opponent)} hitSlop={8}>
                  <Text style={[styles.linkAction, { color: colors.bad }]}>{o.delete}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </View>

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
  sectionLabel: {
    fontSize: 9.5, fontFamily: 'JetBrainsMono', letterSpacing: 0.6,
    textTransform: 'uppercase', color: colors.ink3,
    paddingHorizontal: 8, paddingBottom: 6,
  },
  card: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  rowCol: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowTitle: { fontSize: 13, fontWeight: '500', fontFamily: 'Inter', color: colors.ink },
  rowSub: { fontSize: 11, fontFamily: 'Inter', color: colors.ink3, marginTop: 2, lineHeight: 16 },
  fieldLabel: {
    fontSize: 9.5, fontFamily: 'JetBrainsMono', letterSpacing: 0.6,
    textTransform: 'uppercase', color: colors.ink3,
  },
  fieldHint: { fontSize: 11, fontFamily: 'Inter', color: colors.ink4, lineHeight: 16 },
  warnText: { fontSize: 12, fontFamily: 'Inter', color: colors.ink3, lineHeight: 17 },
  input: {
    flex: 1, fontSize: 14, fontFamily: 'Inter', color: colors.ink,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 8,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 8, backgroundColor: colors.accent,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter', color: '#fff' },
  btnOff: { opacity: 0.4 },

  expiredBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bad,
    backgroundColor: colors.badSoft,
  },
  expiredText: { flex: 1, fontSize: 12, fontFamily: 'Inter', color: colors.bad, lineHeight: 17 },
  noticeBox: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(45,138,94,0.4)',
    backgroundColor: colors.goodSoft, padding: 12,
  },
  noticeText: { fontSize: 12, fontFamily: 'Inter', color: colors.good, lineHeight: 17 },
  errorBox: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(192,66,42,0.4)',
    backgroundColor: colors.badSoft, padding: 12,
  },
  errorText: { fontSize: 12, fontFamily: 'Inter', color: colors.bad, lineHeight: 17 },

  requestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  requestName: {
    flex: 1, fontSize: 14, fontWeight: '600',
    fontFamily: 'JetBrainsMono', color: colors.ink,
  },
  requestActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  waitingText: {
    fontSize: 10, fontFamily: 'JetBrainsMono', letterSpacing: 0.5,
    textTransform: 'uppercase', color: colors.ink4,
  },

  opponentCard: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface, padding: 14, gap: 10, marginBottom: 8,
  },
  opponentHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  opponentName: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter', color: colors.ink },
  opponentMeta: { fontSize: 11, fontFamily: 'Inter', color: colors.ink3, marginTop: 3 },
  opponentActions: { flexDirection: 'row', gap: 16 },
  linkAction: { fontSize: 12, fontFamily: 'Inter', fontWeight: '600', color: colors.accent },

  tag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.bg2,
  },
  tagInvited: { backgroundColor: colors.accentSoft },
  tagLinked: { backgroundColor: colors.goodSoft },
  tagText: {
    fontSize: 9, fontFamily: 'JetBrainsMono', letterSpacing: 0.5,
    textTransform: 'uppercase', color: colors.ink3,
  },
  tagTextInvited: { color: colors.accent },
  tagTextLinked: { color: colors.good },

  emptyTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter', color: colors.ink2 },
  emptyBody: {
    fontSize: 12, fontFamily: 'Inter', color: colors.ink4,
    textAlign: 'center', lineHeight: 18,
  },
});

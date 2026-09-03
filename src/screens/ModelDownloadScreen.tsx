import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { downloadModel, MODEL_LABEL, MODEL_SIZE_MB } from '../services/llamaExtractor';
import { useT } from '../i18n/useT';

type Phase = 'prompt' | 'downloading' | 'done' | 'error';

interface Props {
  onReady: () => void;
  /** Quando presente, mostra um botão de voltar — o app funciona sem o modelo. */
  onCancel?: () => void;
}

export function ModelDownloadScreen({ onReady, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const m = t.modelDownload;
  const [phase, setPhase] = React.useState<Phase>('prompt');
  const [progress, setProgress] = React.useState(0);       // 0–1
  const [mbWritten, setMbWritten] = React.useState(0);
  const [mbTotal, setMbTotal] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState('');
  const barWidth = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const startDownload = async () => {
    setPhase('downloading');
    try {
      await downloadModel((written, total) => {
        setMbWritten(written / 1e6);
        setMbTotal(total / 1e6);
        setProgress(total > 0 ? written / total : 0);
      });
      setProgress(1);
      setPhase('done');
      setTimeout(onReady, 800);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Erro desconhecido');
      setPhase('error');
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      {/* Logo area */}
      <View style={styles.top}>
        <Text style={styles.logo}>🎴</Text>
        <Text style={styles.title}>Open-Tracker-TCG</Text>
        <Text style={styles.subtitle}>{m.subtitle}</Text>
      </View>

      <View style={styles.card}>
        {phase === 'prompt' && (
          <>
            <Text style={styles.cardTitle}>{m.promptTitle}</Text>
            <Text style={styles.cardBody}>{m.promptBody(MODEL_SIZE_MB)}</Text>
            <View style={styles.row}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{m.pillPrivate}</Text>
              </View>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{m.pillOffline}</Text>
              </View>
            </View>
            <Pressable style={styles.btn} onPress={startDownload}>
              <Text style={styles.btnText}>{m.download(MODEL_SIZE_MB)}</Text>
            </Pressable>
            {onCancel && (
              <Pressable style={styles.btnGhost} onPress={onCancel}>
                <Text style={styles.btnGhostText}>{m.later}</Text>
              </Pressable>
            )}
          </>
        )}

        {phase === 'downloading' && (
          <>
            <Text style={styles.cardTitle}>{m.downloading}</Text>
            <Text style={styles.cardBody}>
              {mbTotal > 0 ? m.progress(mbWritten, mbTotal) : m.connecting}
            </Text>
            <View style={styles.barBg}>
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width: barWidth.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.pct}>{Math.round(progress * 100)}%</Text>
          </>
        )}

        {phase === 'done' && (
          <>
            <Text style={styles.cardTitle}>{m.doneTitle}</Text>
            <Text style={styles.cardBody}>{m.doneBody}</Text>
          </>
        )}

        {phase === 'error' && (
          <>
            <Text style={styles.cardTitle}>{m.errorTitle}</Text>
            <Text style={[styles.cardBody, { color: colors.bad }]}>{errorMsg}</Text>
            <Pressable style={styles.btn} onPress={startDownload}>
              <Text style={styles.btnText}>{m.retry}</Text>
            </Pressable>
            {onCancel && (
              <Pressable style={styles.btnGhost} onPress={onCancel}>
                <Text style={styles.btnGhostText}>{m.later}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <Text style={styles.footer}>{m.footer(MODEL_LABEL)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  top: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 56 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 14, color: colors.ink3 },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardBody: { fontSize: 14, color: colors.ink2, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillText: { fontSize: 11, color: colors.ink3 },
  btn: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnGhost: { paddingVertical: 10, alignItems: 'center' },
  btnGhostText: { color: colors.ink3, fontWeight: '500', fontSize: 13 },
  barBg: {
    height: 8,
    backgroundColor: colors.line,
    borderRadius: 99,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.ink,
    borderRadius: 99,
  },
  pct: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.ink3,
    marginTop: -8,
  },
  footer: {
    fontSize: 11,
    color: colors.ink4,
    letterSpacing: 0.5,
  },
});

/**
 * StatsShareModal
 * Mostra o card de preview e dispara o compartilhamento.
 * Usa react-native-view-shot para capturar + expo-sharing para compartilhar.
 */
import React from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors } from '../theme/colors';
import { Icon } from './Icon';
import {
  StatsShareCard, ShareCardLabels, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT,
} from './StatsShareCard';
import { ComputedStats, Filters, SharePrefs } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  stats: ComputedStats;
  filters: Filters;
  prefs: SharePrefs;
  periodLabel: string;
  winLabel: string;
  lossLabel: string;
  labels: ShareCardLabels;
  author: string;
}

export function StatsShareModal({
  visible, onClose, stats, filters, prefs, periodLabel, winLabel, lossLabel, labels, author,
}: Props) {
  const cardRef = React.useRef<View>(null);
  const [loading, setLoading] = React.useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  /**
   * O card não tem mais altura fixa — ela depende de quantos blocos estão
   * ligados em Configurações. Medimos o que foi renderizado em vez de supor.
   */
  const [cardHeight, setCardHeight] = React.useState(SHARE_CARD_HEIGHT);

  // Escala o card para caber no modal (padding 20px de cada lado + 2×16 de padding do sheet)
  const availableWidth = Math.min(screenWidth - 40, 400) - 32;
  // O preview também não pode passar de metade da tela, senão os botões saem.
  const availableHeight = screenHeight * 0.5;
  const cardScale = Math.min(
    1,
    availableWidth / SHARE_CARD_WIDTH,
    availableHeight / cardHeight
  );
  const scaledHeight = cardHeight * cardScale;

  const handleShare = async () => {
    if (!cardRef.current) return;
    setLoading(true);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        // Força pixel ratio 3 para imagem de alta resolução
        result: 'tmpfile',
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Compartilhar estatísticas',
        });
      }
    } catch (e) {
      console.warn('Share error:', e);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header do modal */}
          <View style={styles.header}>
            <Text style={styles.title}>Preview</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Icon name="x" size={16} stroke={colors.ink3} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Card capturável — escalado para preview, capturado em tamanho real */}
          {/* O transform em RN aplica escala a partir do centro → ajustamos margem */}
          <View style={[styles.cardWrap, { height: scaledHeight + 16 }]}>
            <View style={{
              width: SHARE_CARD_WIDTH,
              transform: [{ scale: cardScale }],
              // Corrige o offset vertical do scale (RN escala a partir do centro)
              marginTop: -(cardHeight * (1 - cardScale)) / 2,
              marginBottom: -(cardHeight * (1 - cardScale)) / 2,
            }}>
              <View
                ref={cardRef}
                collapsable={false}
                style={{ width: SHARE_CARD_WIDTH }}
                onLayout={e => setCardHeight(e.nativeEvent.layout.height)}
              >
                <StatsShareCard
                  stats={stats}
                  filters={filters}
                  prefs={prefs}
                  periodLabel={periodLabel}
                  winLabel={winLabel}
                  lossLabel={lossLabel}
                  labels={labels}
                  author={author}
                />
              </View>
            </View>
          </View>

          {/* Nota explicativa */}
          <Text style={styles.note}>
            Imagem gerada no dispositivo com os filtros atuais.
          </Text>

          {/* Botão de compartilhar */}
          <View style={styles.actions}>
            <Pressable style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.btnShare, loading && styles.btnShareLoading]}
              onPress={handleShare}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="share" size={16} stroke="#fff" strokeWidth={1.8} />
                  <Text style={styles.btnShareText}>Compartilhar</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line2,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter',
    color: colors.ink,
  },
  closeBtn: { padding: 4 },
  cardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: colors.bg2,
    overflow: 'hidden',
  },
  note: {
    fontSize: 11,
    fontFamily: 'Inter',
    color: colors.ink4,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
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
  btnShare: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnShareLoading: { opacity: 0.6 },
  btnShareText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: '600',
    color: '#fff',
  },
});

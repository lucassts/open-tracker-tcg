import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { Icon } from './Icon';

/**
 * As peças de filtro, compartilhadas entre Estatísticas e Partidas.
 *
 * Vieram de dentro da tela de Estatísticas quando Partidas ganhou filtro. Duas
 * cópias do mesmo controle divergem na primeira vez que alguém ajusta um
 * espaçamento em uma só, e filtro que muda de aparência entre telas parece
 * outro filtro.
 */

export function Chip({ label, active, onPress }: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Uma linha de opções exclusivas: formato, período, resultado. */
export function FilterRow({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map(opt => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={value === opt.value}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Abre a lista de seleção múltipla — deck, deck do oponente, versão. */
export function FilterPickerButton({ label, value, displayValue, onPress }: {
  label: string;
  value: string[];
  displayValue: string;
  onPress: () => void;
}) {
  const isFiltered = value.length > 0;
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable onPress={onPress} style={[styles.pickerBtn, isFiltered && styles.pickerBtnActive]}>
        <Text
          style={[styles.pickerBtnText, isFiltered && styles.pickerBtnTextActive]}
          numberOfLines={1}
        >
          {displayValue}
        </Text>
        <Icon
          name="chev"
          size={12}
          stroke={isFiltered ? colors.accent : colors.ink3}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterLabel: {
    width: 62,
    fontSize: 9.5,
    fontFamily: 'JetBrainsMono',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontSize: 10.5,
    fontFamily: 'Inter',
    color: colors.ink,
  },
  chipTextActive: { color: '#fff' },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 6,
  },
  pickerBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: 'Inter',
    color: colors.ink,
  },
  pickerBtnTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});

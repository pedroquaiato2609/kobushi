import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NotifyChannel } from '../api/types';
import { CHANNEL_LABEL } from '../lib/labels';
import { colors, spacing } from '../theme';

/** Canais extras do aviso. A caixa de entrada do app (sino) recebe sempre. */
export function ChannelChecks({ value, onChange }: { value: NotifyChannel[]; onChange: (v: NotifyChannel[]) => void }) {
  const toggle = (c: NotifyChannel) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <View style={styles.row}>
      <View style={styles.staticChip}><Text style={styles.staticText}>🔔 Sino do app (sempre)</Text></View>
      {(Object.keys(CHANNEL_LABEL) as NotifyChannel[]).map((c) => (
        <TouchableOpacity key={c} style={[styles.chip, value.includes(c) && styles.chipOn]} onPress={() => toggle(c)}>
          <Text style={[styles.chipText, value.includes(c) && styles.chipTextOn]}>{CHANNEL_LABEL[c]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  staticChip: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface2 },
  staticText: { fontSize: 12, color: colors.inkSoft },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
});

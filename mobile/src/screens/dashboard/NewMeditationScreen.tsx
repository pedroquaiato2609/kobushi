import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import { todayISO } from '../../lib/dates';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'NewMeditation'>;
const SCORES: [string, string][] = [
  ['attention', 'Atenção'], ['spatial', 'Reconstrução espacial'], ['sound', 'Localização sonora'], ['imagery', 'Imagética'], ['afterState', 'Estado após'],
];

export function NewMeditationScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [duration, setDuration] = useState('15');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!Number(duration)) return setErr('Informe a duração em minutos.');
    setErr(null); setBusy(true);
    try {
      const payload: Record<string, unknown> = { date, durationMin: Number(duration), note };
      for (const [key] of SCORES) payload[key] = scores[key] === undefined || scores[key] === '' ? null : Number(scores[key]);
      await api.post('/meditations', payload);
      await qc.invalidateQueries({ queryKey: ['stats'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui registrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Data (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-10-04" />
      <Text style={styles.label}>Duração (min)</Text>
      <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" />

      <Text style={styles.hint}>Notas de 0 a 10 para a própria prática — opcionais. Deixe em branco o que não quiser medir.</Text>
      {SCORES.map(([key, label]) => (
        <View key={key}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input} value={scores[key] ?? ''} keyboardType="number-pad" placeholder="0–10"
            onChangeText={(v) => setScores((p) => ({ ...p, [key]: v }))}
          />
        </View>
      ))}

      <Text style={styles.label}>Observação</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} />

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, (busy || !Number(duration)) && styles.submitDisabled]} disabled={busy || !Number(duration)} onPress={() => void save()}>
        <Text style={styles.submitText}>{busy ? 'Registrando…' : 'Registrar sessão'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  hint: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

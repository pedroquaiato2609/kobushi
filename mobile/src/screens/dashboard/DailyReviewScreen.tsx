import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { DailyReview } from '../../api/types';
import { dayHeading } from '../../lib/dates';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'DailyReview'>;
const FIELDS: { key: keyof Omit<DailyReview, 'date'>; label: string }[] = [
  { key: 'responsibilities', label: 'Cumpri minhas responsabilidades?' },
  { key: 'goals', label: 'Mantive meus objetivos?' },
  { key: 'state', label: 'Como estavam meu estado mental, físico e espiritual?' },
  { key: 'learned', label: 'O que aprendi sobre mim hoje?' },
];

export function DailyReviewScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['review', date], queryFn: () => api.get<{ date: string; review: DailyReview | null }>(`/reviews/${date}`) });
  const [f, setF] = useState({ responsibilities: '', goals: '', state: '', learned: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (q.data?.review) setF({ responsibilities: q.data.review.responsibilities, goals: q.data.review.goals, state: q.data.review.state, learned: q.data.review.learned });
  }, [q.data]);

  async function save() {
    setErr(null); setOk(false); setBusy(true);
    try {
      await api.put(`/reviews/${date}`, f);
      setOk(true);
      await qc.invalidateQueries({ queryKey: ['review', date] });
      await qc.invalidateQueries({ queryKey: ['reviews'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.dateTitle}>{dayHeading(date)}</Text>
      {FIELDS.map((f2) => (
        <View key={f2.key} style={{ gap: spacing.xs }}>
          <Text style={styles.label}>{f2.label}</Text>
          <TextInput
            style={[styles.input, styles.textarea]} value={f[f2.key]} multiline numberOfLines={2}
            onChangeText={(v) => setF((p) => ({ ...p, [f2.key]: v }))}
          />
        </View>
      ))}
      {err && <Text style={styles.error}>{err}</Text>}
      {ok && <Text style={styles.ok}>Salva.</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void save()}>
        <Text style={styles.submitText}>{busy ? 'Salvando…' : 'Salvar revisão'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}><Text style={styles.ghostBtnText}>Voltar</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  dateTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13 },
  ok: { color: colors.ideal, fontSize: 13 },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ghostBtn: { alignItems: 'center', paddingVertical: 12 },
  ghostBtnText: { color: colors.inkSoft, fontWeight: '600' },
});

import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { BookOverview } from '../../api/types';
import { dm, todayISO } from '../../lib/dates';
import { progressPct, STATUS_LABEL } from '../../lib/reading';
import { colors, radius, spacing } from '../../theme';
import type { ReadingStackParamList } from '../../navigation/ReadingStack';

type Props = NativeStackScreenProps<ReadingStackParamList, 'BookDetail'>;

export function BookDetailScreen({ route }: Props) {
  const { bookId } = route.params;
  const qc = useQueryClient();
  const book = useQuery({ queryKey: ['book', bookId], queryFn: () => api.get<BookOverview>(`/reading/books/${bookId}`) });
  const [pages, setPages] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (book.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (book.error || !book.data) return <View style={styles.center}><Text style={styles.errorTitle}>Não consegui abrir este livro</Text></View>;

  const b = book.data;
  const pct = progressPct(b);

  async function logSession() {
    const p = pages.trim() === '' ? null : Number(pages.replace(',', '.'));
    const m = minutes.trim() === '' ? null : Number(minutes.replace(',', '.'));
    if ((p === null || !Number.isFinite(p) || p <= 0) && (m === null || !Number.isFinite(m) || m <= 0)) {
      setErr('Informe páginas e/ou minutos lidos.');
      return;
    }
    setErr(null); setBusy(true);
    try {
      await api.post(`/reading/books/${bookId}/sessions`, { date: todayISO(), pages: p, minutes: m });
      setPages(''); setMinutes('');
      await qc.invalidateQueries({ queryKey: ['book', bookId] });
      await qc.invalidateQueries({ queryKey: ['reading-overview'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui registrar a sessão.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{b.title}</Text>
      <Text style={styles.author}>{b.author || 'Autor desconhecido'}</Text>
      <View style={styles.statusChip}><Text style={styles.statusChipText}>{STATUS_LABEL[b.status]}</Text></View>

      {pct !== null && (
        <View style={styles.panel}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>{b.currentPage} de {b.totalPages} páginas</Text>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
          {b.daysToFinish !== null && <Text style={styles.daysToFinish}>No ritmo atual, termina em ~{b.daysToFinish} dia(s)</Text>}
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Registrar sessão de hoje</Text>
        <View style={styles.formRow}>
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Páginas lidas</Text>
            <TextInput style={styles.input} value={pages} onChangeText={setPages} keyboardType="number-pad" placeholder="0" />
          </View>
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Minutos</Text>
            <TextInput style={styles.input} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="0" />
          </View>
        </View>
        {err && <Text style={styles.error}>{err}</Text>}
        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={() => void logSession()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar</Text>}
        </TouchableOpacity>
      </View>

      {b.recentSessions.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Sessões recentes</Text>
          {b.recentSessions.map((s) => (
            <View key={s.id} style={styles.sessionRow}>
              <Text style={styles.sessionDate}>{dm(s.date)}</Text>
              <Text style={styles.sessionInfo}>
                {s.pages ? `${s.pages} págs` : ''}{s.pages && s.minutes ? ' · ' : ''}{s.minutes ? `${s.minutes} min` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  author: { fontSize: 14, color: colors.inkSoft, marginTop: 2 },
  statusChip: { alignSelf: 'flex-start', backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm, marginTop: spacing.xs },
  statusChipText: { fontSize: 12, fontWeight: '700', color: colors.accent },
  panel: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 13, color: colors.inkSoft },
  progressPct: { fontSize: 13, fontWeight: '700', color: colors.accent },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: colors.sunken, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.accent },
  daysToFinish: { fontSize: 12, color: colors.inkSoft },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formField: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 12, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface2 },
  error: { color: colors.danger, fontSize: 13 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sessionRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  sessionDate: { fontSize: 12, color: colors.inkSoft, width: 40 },
  sessionInfo: { fontSize: 13, color: colors.ink },
});

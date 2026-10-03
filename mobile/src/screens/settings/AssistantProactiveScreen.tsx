import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { AssistantProactiveSettings, SuggestionType } from '../../api/types';
import { QueryError } from '../../components/QueryError';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'AssistantProactive'>;
const LEVELS = [
  { id: 'off', name: 'Desligada', hint: 'O assistente só responde ao que você pedir.' },
  { id: 'low', name: 'Discreta', hint: 'Só o que merece atenção (prazos, conflitos, gastos fora do padrão). Até 2 sugestões abertas.' },
  { id: 'normal', name: 'Normal', hint: 'Também sugere melhorias e resumos úteis. Até 5 sugestões abertas.' },
] as const;
const TYPES: { id: SuggestionType; name: string; hint: string }[] = [
  { id: 'agenda', name: 'Agenda e prazos', hint: 'Conflitos, agenda concentrada, cards atrasados.' },
  { id: 'routine', name: 'Rotina', hint: 'Lembretes que faltam, objetivos adiados vários dias.' },
  { id: 'review', name: 'Revisões', hint: 'Lembrar da revisão do dia.' },
  { id: 'finance', name: 'Finanças', hint: 'Gastos fora do padrão, cobranças ausentes, orçamento em risco.' },
];
const MAX_OPTIONS = [1, 2, 3, 5, 8];

export function AssistantProactiveScreen(_: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['assistant-settings'], queryFn: () => api.get<AssistantProactiveSettings>('/assistant/settings') });
  const [err, setErr] = useState<string | null>(null);

  async function patch(p: Partial<AssistantProactiveSettings>) {
    setErr(null);
    try {
      await api.put('/assistant/settings', p);
      await qc.invalidateQueries({ queryKey: ['assistant-settings'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    }
  }

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (q.error) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  if (!s) return null;

  const toggleType = (t: SuggestionType) => void patch({ types: s.types.includes(t) ? s.types.filter((x) => x !== t) : [...s.types, t] });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Sugestões proativas</Text>
        <Text style={styles.hint}>O assistente só sugere algo quando há um sinal real e sempre explica o motivo. Nunca executa nada sozinho: ações financeiras e irreversíveis sempre pedem sua confirmação.</Text>
        {LEVELS.map((l) => (
          <TouchableOpacity key={l.id} style={[styles.radioCard, s.proactivity === l.id && styles.radioCardOn]} onPress={() => void patch({ proactivity: l.id })}>
            <Text style={[styles.radioName, s.proactivity === l.id && styles.radioNameOn]}>{l.name}</Text>
            <Text style={styles.radioHint}>{l.hint}</Text>
          </TouchableOpacity>
        ))}
        {err && <Text style={styles.error}>{err}</Text>}
      </View>

      <View style={[styles.block, s.proactivity === 'off' && { opacity: 0.5 }]}>
        <Text style={styles.blockTitle}>O que posso sugerir</Text>
        {TYPES.map((t) => (
          <TouchableOpacity key={t.id} style={styles.checkRow} disabled={s.proactivity === 'off'} onPress={() => toggleType(t.id)}>
            <View style={[styles.checkbox, s.types.includes(t.id) && styles.checkboxOn]} />
            <View style={{ flex: 1 }}><Text style={styles.checkTitle}>{t.name}</Text><Text style={styles.hint}>{t.hint}</Text></View>
          </TouchableOpacity>
        ))}
        <Text style={styles.label}>No máximo por dia</Text>
        <View style={styles.chipRow}>
          {MAX_OPTIONS.map((n) => (
            <TouchableOpacity key={n} style={[styles.chip, s.maxPerDay === n && styles.chipOn]} onPress={() => void patch({ maxPerDay: n })}>
              <Text style={[styles.chipText, s.maxPerDay === n && styles.chipTextOn]}>{n} nova(s)</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Silêncio a partir de</Text>
            <TextInput style={styles.input} value={s.quietStart} onChangeText={(v) => void patch({ quietStart: v })} placeholder="22:00" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Até</Text>
            <TextInput style={styles.input} value={s.quietEnd} onChangeText={(v) => void patch({ quietEnd: v })} placeholder="07:00" />
          </View>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Revisões</Text>
        <Text style={styles.hint}>Um aviso no sino (e nos canais que você ativou) para não esquecer da revisão.</Text>
        <TouchableOpacity style={styles.checkRow} onPress={() => void patch({ dailyReviewTime: s.dailyReviewTime === null ? '21:00' : null })}>
          <View style={[styles.checkbox, s.dailyReviewTime !== null && styles.checkboxOn]} />
          <Text style={styles.checkTitle}>Revisão do dia{s.dailyReviewTime ? ` · ${s.dailyReviewTime}` : ''}</Text>
        </TouchableOpacity>
        {s.dailyReviewTime !== null && <TextInput style={styles.input} value={s.dailyReviewTime} onChangeText={(v) => void patch({ dailyReviewTime: v })} placeholder="21:00" />}
        <TouchableOpacity style={styles.checkRow} onPress={() => void patch({ weeklyReviewTime: s.weeklyReviewTime === null ? '18:00' : null })}>
          <View style={[styles.checkbox, s.weeklyReviewTime !== null && styles.checkboxOn]} />
          <Text style={styles.checkTitle}>Revisão da semana (domingo){s.weeklyReviewTime ? ` · ${s.weeklyReviewTime}` : ''}</Text>
        </TouchableOpacity>
        {s.weeklyReviewTime !== null && <TextInput style={styles.input} value={s.weeklyReviewTime} onChangeText={(v) => void patch({ weeklyReviewTime: v })} placeholder="18:00" />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: 12 },
  radioCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.sm, marginTop: spacing.xs },
  radioCardOn: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  radioName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  radioNameOn: { color: colors.accent },
  radioHint: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkTitle: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 11, color: colors.inkSoft, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  row2: { flexDirection: 'row', gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.paper, marginTop: 4 },
});

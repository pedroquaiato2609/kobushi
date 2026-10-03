import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { Level } from '../../api/types';
import { Icon } from '../../components/Icon';
import { fmtDuration, fmtVolume } from '../../lib/gym';
import { LEVEL_LABEL, LEVELS } from '../../lib/labels';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'FinishWorkout'>;

/** Popup de resumo ao finalizar o treino — mesmo conteúdo do app web (duração, séries, volume, recordes,
 * exercícios feitos, nível geral do treino e observações), só que como tela própria em vez de modal inline. */
export function FinishWorkoutScreen({ navigation, route }: Props) {
  const { active } = route.params;
  const qc = useQueryClient();
  const [level, setLevel] = useState<Level | null>(active.suggestedLevel);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function finish() {
    if (active.totalSets === 0) return setErr('Registre pelo menos uma série ou volte e descarte o treino.');
    setErr(null); setBusy(true);
    try {
      await api.post(`/gym/sessions/${active.session.id}/finish`, { level, note: note.trim() || undefined });
      // sem isso, a lista de treinos (WorkoutsScreen) continua mostrando "treino em andamento" com dados
      // velhos do cache, mesmo o servidor já tendo finalizado — só descobri isso testando de verdade.
      await qc.invalidateQueries({ queryKey: ['gym-active'] });
      navigation.popToTop(); // fecha o popup E a tela de treino ativo, volta pra lista de treinos
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui finalizar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{fmtDuration(active.durationSeconds)}</Text><Text style={styles.summaryLabel}>duração</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{active.totalSets}</Text><Text style={styles.summaryLabel}>séries</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{fmtVolume(active.volume)}</Text><Text style={styles.summaryLabel}>volume</Text></View>
        <View style={styles.summaryItem}><Text style={styles.summaryValue}>{active.prs}</Text><Text style={styles.summaryLabel}>recordes</Text></View>
      </View>

      {active.exercises.length > 0 && (
        <View style={styles.block}>
          {active.exercises.map((e) => (
            <View key={e.exercise.id} style={styles.exRow}>
              <Text style={styles.exName}>{e.exercise.name}</Text>
              <Text style={styles.exMeta}>{e.sets.length} {e.sets.length === 1 ? 'série' : 'séries'}{e.levelReached ? ` · ${LEVEL_LABEL[e.levelReached]}` : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.fieldLegend}>Como foi o treino? (mesmo princípio mínimo · ideal · máximo)</Text>
      <View style={styles.levelRow}>
        {([null, ...LEVELS] as (Level | null)[]).map((l) => (
          <TouchableOpacity key={l ?? 'none'} style={[styles.levelChip, level === l && styles.levelChipOn]} onPress={() => setLevel(l)}>
            <Text style={[styles.levelChipText, level === l && styles.levelChipTextOn]}>{l ? LEVEL_LABEL[l] : 'Sem nível'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {active.suggestedLevel && <Text style={styles.hint}>Sugerido pelas séries: <Text style={{ fontWeight: '700' }}>{LEVEL_LABEL[active.suggestedLevel]}</Text>. Se houver uma atividade "Academia" na sua rotina, o nível é registrado nela hoje.</Text>}

      <Text style={styles.fieldLegend}>Observações</Text>
      <TextInput style={[styles.input, styles.textarea]} value={note} onChangeText={setNote} multiline numberOfLines={3} placeholder="Como se sentiu, dores, ajustes para a próxima…" />

      {active.totalSets === 0 && <Text style={styles.error}>Registre pelo menos uma série ou descarte o treino.</Text>}
      {err && <Text style={styles.error}>{err}</Text>}

      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.ghostBtnText}>Continuar treinando</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.submit, (busy || active.totalSets === 0) && styles.submitDisabled]} disabled={busy || active.totalSets === 0} onPress={() => void finish()}>
        <Icon name="check" size={16} color="#fff" /><Text style={styles.submitText}>{busy ? 'Finalizando…' : 'Finalizar'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  summaryItem: { alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  summaryLabel: { fontSize: 11, color: colors.inkSoft },
  block: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  exRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exName: { fontSize: 13, color: colors.ink, flex: 1 },
  exMeta: { fontSize: 12, color: colors.inkSoft },
  fieldLegend: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: spacing.md },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  levelChip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  levelChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  levelChipText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  levelChipTextOn: { color: '#fff' },
  hint: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.ink, backgroundColor: colors.surface, marginTop: spacing.xs },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
  ghostBtn: { alignItems: 'center', paddingVertical: 12, marginTop: spacing.lg },
  ghostBtnText: { color: colors.inkSoft, fontWeight: '600' },
  submit: { flexDirection: 'row', gap: 8, backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

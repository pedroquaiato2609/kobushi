import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { StudyPlan } from '../../api/types';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'StudyPlanDetail'>;

export function StudyPlanDetailScreen({ navigation, route }: Props) {
  const planRef = route.params.plan;
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ['study', 'plan', planRef.id], queryFn: () => api.get<StudyPlan>(`/study/plans/${planRef.id}`), initialData: planRef });
  const [newLesson, setNewLesson] = useState('');

  async function toggleLesson(lessonId: string, done: boolean) {
    await api.patch(`/study/plans/${planRef.id}/lessons/${lessonId}`, { done });
    await qc.invalidateQueries({ queryKey: ['study', 'plan', planRef.id] });
    await qc.invalidateQueries({ queryKey: ['study', 'plans'] });
  }
  async function addLesson() {
    if (!newLesson.trim() || !plan.data) return;
    const lessons = [...plan.data.lessons, { id: `l${plan.data.lessons.length}-${Date.now()}`, title: newLesson.trim(), description: '', done: false }];
    await api.patch(`/study/plans/${planRef.id}`, { lessons });
    setNewLesson('');
    await qc.invalidateQueries({ queryKey: ['study', 'plan', planRef.id] });
    await qc.invalidateQueries({ queryKey: ['study', 'plans'] });
  }
  function confirmDelete() {
    Alert.alert('Apagar plano?', `Apagar "${planRef.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void (async () => { await api.del(`/study/plans/${planRef.id}`); await qc.invalidateQueries({ queryKey: ['study', 'plans'] }); navigation.goBack(); })() },
    ]);
  }

  if (!plan.data) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  const p = plan.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.subject}>{p.subject}</Text>
      <Text style={styles.title}>{p.title}</Text>
      <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${p.progressPct}%` }]} /></View>
      <Text style={styles.progressText}>{p.lessons.filter((l) => l.done).length}/{p.lessons.length} aulas concluídas</Text>

      {p.lessons.map((l) => (
        <TouchableOpacity key={l.id} style={styles.lesson} onPress={() => void toggleLesson(l.id, !l.done)}>
          <Icon name={l.done ? 'check' : 'x'} size={16} color={l.done ? colors.ideal : colors.inkSoft} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.lessonTitle, l.done && styles.lessonTitleDone]}>{l.title}</Text>
            {!!l.description && <Text style={styles.lessonDesc}>{l.description}</Text>}
          </View>
        </TouchableOpacity>
      ))}

      <View style={styles.inlineRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={newLesson} onChangeText={setNewLesson} placeholder="Nova aula" onSubmitEditing={() => void addLesson()} />
        <TouchableOpacity style={styles.smallBtn} onPress={() => void addLesson()}><Icon name="plus" size={16} color="#fff" /></TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
        <Icon name="trash" size={14} color={colors.danger} /><Text style={styles.deleteText}>Apagar plano</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  subject: { fontSize: 12, color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden', marginTop: spacing.xs },
  progressFill: { height: 6, backgroundColor: colors.accent },
  progressText: { fontSize: 12, color: colors.inkSoft },
  lesson: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.sm },
  lessonTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  lessonTitleDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  lessonDesc: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  inlineRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg, paddingVertical: 10 },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});

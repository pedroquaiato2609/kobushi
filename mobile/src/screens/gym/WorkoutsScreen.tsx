import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { GymActive, GymWorkout } from '../../api/types';
import { Icon } from '../../components/Icon';
import { WEEKDAYS } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'WorkoutsHome'>;

export function WorkoutsScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ['gym-active'], queryFn: () => api.get<GymActive | null>('/gym/sessions/active') });
  const workouts = useQuery({ queryKey: ['gym-workouts'], queryFn: () => api.get<GymWorkout[]>('/gym/workouts'), enabled: active.data === null });
  const [starting, setStarting] = useState<string | 'free' | null>(null);

  async function start(workoutId?: string) {
    setStarting(workoutId ?? 'free');
    try {
      await api.post('/gym/sessions', workoutId ? { workoutId } : {});
      await qc.invalidateQueries({ queryKey: ['gym-active'] });
      navigation.navigate('ActiveWorkout');
    } finally {
      setStarting(null);
    }
  }

  if (active.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView
      style={styles.screen} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={active.isFetching || workouts.isFetching} onRefresh={() => { void active.refetch(); void workouts.refetch(); }} tintColor={colors.accent} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>Academia</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewExercise')}>
          <Icon name="plus" size={13} color="#fff" /><Text style={styles.newBtnText}>Exercício</Text>
        </TouchableOpacity>
      </View>

      {active.data && (
        <TouchableOpacity style={styles.activeCard} onPress={() => navigation.navigate('ActiveWorkout')}>
          <Text style={styles.activeTitle}>Treino em andamento</Text>
          <Text style={styles.activeSub}>{active.data.session.name} · {active.data.totalSets} série(s)</Text>
          <View style={styles.activeCtaRow}><Text style={styles.activeCta}>Continuar</Text><Icon name="right" size={14} color="#fff" /></View>
        </TouchableOpacity>
      )}

      {!active.data && (
        <>
          <TouchableOpacity style={styles.freeBtn} disabled={starting !== null} onPress={() => void start()}>
            {starting === 'free' ? <ActivityIndicator color={colors.accent} /> : <View style={styles.freeBtnRow}><Icon name="plus" size={15} color={colors.accent} /><Text style={styles.freeBtnText}>Começar treino livre</Text></View>}
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Seus treinos</Text>
          {workouts.isLoading ? <ActivityIndicator color={colors.accent} /> : (workouts.data ?? []).length === 0 ? (
            <Text style={styles.empty}>Nenhum treino cadastrado ainda. Use "Começar treino livre" ou crie um treino no app web.</Text>
          ) : (
            (workouts.data ?? []).filter((w) => !w.archived).map((w) => (
              <View key={w.id} style={styles.workoutCard}>
                <View style={styles.workoutMain}>
                  <Text style={styles.workoutName}>{w.name}</Text>
                  <Text style={styles.workoutSub}>
                    {w.items.length} exercício(s){w.weekdays.length > 0 ? ` · ${w.weekdays.map((d) => WEEKDAYS[d]).join(', ')}` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={styles.startBtn} disabled={starting !== null} onPress={() => void start(w.id)}>
                  {starting === w.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>Iniciar</Text>}
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  center: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  header: { fontSize: 24, fontWeight: '700', color: colors.ink },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 6, paddingHorizontal: spacing.sm },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  activeCard: { backgroundColor: colors.accent, borderRadius: radius, padding: spacing.lg, gap: 4 },
  activeTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  activeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  activeCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  activeCta: { color: '#fff', fontWeight: '700', fontSize: 13 },
  freeBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, borderRadius: radius, padding: spacing.md, alignItems: 'center' },
  freeBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  freeBtnText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  empty: { fontSize: 13, color: colors.inkSoft },
  workoutCard: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  workoutMain: { flex: 1, gap: 2 },
  workoutName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  workoutSub: { fontSize: 12, color: colors.inkSoft },
  startBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.md, minWidth: 80, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

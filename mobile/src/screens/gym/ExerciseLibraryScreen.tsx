import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { GymExercise } from '../../api/types';
import { QueryError } from '../../components/QueryError';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'ExerciseLibrary'>;

export function ExerciseLibraryScreen({ navigation }: Props) {
  const [q, setQ] = useState('');
  const exercises = useQuery({ queryKey: ['gym-exercises'], queryFn: () => api.get<GymExercise[]>('/gym/exercises') });

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (exercises.data ?? []).filter((e) => !e.archived && (!n || e.name.toLowerCase().includes(n)));
  }, [exercises.data, q]);

  return (
    <View style={styles.screen}>
      <TextInput style={styles.search} value={q} onChangeText={setQ} placeholder="Buscar exercício" />
      {exercises.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : exercises.error ? (
        <QueryError error={exercises.error} onRetry={() => void exercises.refetch()} />
      ) : (
        <FlatList
          data={list} keyExtractor={(e) => e.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum exercício encontrado.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('NewExercise', { exercise: item })}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[item.equipment]}</Text>
              </View>
              {item.isCustom && <Text style={styles.customTag}>seu</Text>}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  search: {
    margin: spacing.lg, marginBottom: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface,
  },
  empty: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.inkSoft },
  customTag: { fontSize: 10, fontWeight: '700', color: colors.accent, backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
});

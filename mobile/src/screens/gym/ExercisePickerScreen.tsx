import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { GymExercise } from '../../api/types';
import { Icon } from '../../components/Icon';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'ExercisePicker'>;

export function ExercisePickerScreen({ route, navigation }: Props) {
  const { exclude, onPick } = route.params;
  const [q, setQ] = useState('');
  const exercises = useQuery({ queryKey: ['gym-exercises'], queryFn: () => api.get<GymExercise[]>('/gym/exercises') });

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (exercises.data ?? []).filter((e) => !e.archived && !exclude.includes(e.id) && (!n || e.name.toLowerCase().includes(n)));
  }, [exercises.data, q, exclude]);

  return (
    <View style={styles.screen}>
      <TextInput style={styles.search} value={q} onChangeText={setQ} placeholder="Buscar exercício" autoFocus />
      {exercises.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={list} keyExtractor={(e) => e.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum exercício encontrado.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => { onPick(item); navigation.goBack(); }}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[item.equipment]}</Text>
              </View>
              <Icon name="plus" size={18} color={colors.accent} />
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
});

import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../api/client';
import type { GymExercise } from '../../api/types';
import { Icon } from '../../components/Icon';
import { EQUIPMENT_LABEL, MUSCLE_LABEL, WEEKDAYS } from '../../lib/gym';
import { colors, radius, spacing } from '../../theme';
import type { GymStackParamList } from '../../navigation/GymStack';

type Props = NativeStackScreenProps<GymStackParamList, 'NewWorkout'>;

interface Item { exercise: GymExercise; restSeconds: string; sets: string; reps: string; weight: string; minutes: string; km: string }
const newItem = (exercise: GymExercise): Item => ({ exercise, restSeconds: exercise.kind === 'cardio' ? '60' : '90', sets: '3', reps: '10', weight: '0', minutes: '20', km: '' });

// Cadastra um treino com os exercícios e uma meta "ideal" por exercício (o app web também deixa
// configurar mínimo/máximo separados — aqui, por enquanto, só o ideal, pra cobrir o essencial).
export function NewWorkoutScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }
  function updateItem(id: string, patch: Partial<Item>) {
    setItems((cur) => cur.map((it) => (it.exercise.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems((cur) => cur.filter((it) => it.exercise.id !== id));
  }

  async function submit() {
    if (!name.trim()) return setErr('Dê um nome ao treino.');
    if (items.length === 0) return setErr('Adicione ao menos um exercício.');
    setErr(null); setBusy(true);
    try {
      const body = {
        name: name.trim(), weekdays,
        items: items.map((it) => ({
          exerciseId: it.exercise.id, restSeconds: Number(it.restSeconds) || 90,
          targets: it.exercise.kind === 'cardio'
            ? { ideal: { durationMin: Number(it.minutes) || null, distanceKm: it.km.trim() ? Number(it.km.replace(',', '.')) : null, speedKmh: null } }
            : { ideal: { sets: Number(it.sets) || 1, reps: Number(it.reps) || 1, weight: Number(it.weight.replace(',', '.')) || 0 } },
        })),
      };
      await api.post('/gym/workouts', body);
      await qc.invalidateQueries({ queryKey: ['gym-workouts'] });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Nome do treino</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex.: Treino A — Peito e Tríceps" autoFocus />

      <Text style={styles.label}>Dias da semana (opcional)</Text>
      <View style={styles.chipRow}>
        {WEEKDAYS.map((d, i) => (
          <TouchableOpacity key={i} style={[styles.dayChip, weekdays.includes(i) && styles.chipOn]} onPress={() => toggleDay(i)}>
            <Text style={[styles.chipText, weekdays.includes(i) && styles.chipTextOn]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Exercícios</Text>
      {items.map((it) => (
        <View key={it.exercise.id} style={styles.itemCard}>
          <View style={styles.itemHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{it.exercise.name}</Text>
              <Text style={styles.itemSub}>{it.exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[it.exercise.equipment]}</Text>
            </View>
            <TouchableOpacity onPress={() => removeItem(it.exercise.id)} style={styles.removeBtn}><Icon name="x" size={14} color={colors.inkSoft} /></TouchableOpacity>
          </View>
          {it.exercise.kind === 'cardio' ? (
            <View style={styles.itemFields}>
              <View style={styles.itemField}><Text style={styles.fieldLabel}>Minutos</Text><TextInput style={styles.smallInput} value={it.minutes} onChangeText={(v) => updateItem(it.exercise.id, { minutes: v })} keyboardType="number-pad" /></View>
              <View style={styles.itemField}><Text style={styles.fieldLabel}>Km (opc.)</Text><TextInput style={styles.smallInput} value={it.km} onChangeText={(v) => updateItem(it.exercise.id, { km: v })} keyboardType="decimal-pad" /></View>
            </View>
          ) : (
            <View style={styles.itemFields}>
              <View style={styles.itemField}><Text style={styles.fieldLabel}>Séries</Text><TextInput style={styles.smallInput} value={it.sets} onChangeText={(v) => updateItem(it.exercise.id, { sets: v })} keyboardType="number-pad" /></View>
              <View style={styles.itemField}><Text style={styles.fieldLabel}>Reps</Text><TextInput style={styles.smallInput} value={it.reps} onChangeText={(v) => updateItem(it.exercise.id, { reps: v })} keyboardType="number-pad" /></View>
              <View style={styles.itemField}><Text style={styles.fieldLabel}>Carga (kg)</Text><TextInput style={styles.smallInput} value={it.weight} onChangeText={(v) => updateItem(it.exercise.id, { weight: v })} keyboardType="decimal-pad" /></View>
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('ExercisePicker', { exclude: items.map((i) => i.exercise.id), onPick: (e) => setItems((cur) => [...cur, newItem(e)]) })}
      >
        <Icon name="plus" size={15} color={colors.accent} /><Text style={styles.addBtnText}>Adicionar exercício</Text>
      </TouchableOpacity>

      {err && <Text style={styles.error}>{err}</Text>}
      <TouchableOpacity style={[styles.submit, busy && styles.submitDisabled]} disabled={busy} onPress={() => void submit()}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Criar treino</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 12, color: colors.inkSoft, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dayChip: { width: 42, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 999, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextOn: { color: colors.accent, fontWeight: '700' },
  itemCard: { backgroundColor: colors.surface, borderRadius: radius, padding: spacing.md, borderWidth: 1, borderColor: colors.line, gap: spacing.sm },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  removeBtn: { padding: 4 },
  itemFields: { flexDirection: 'row', gap: spacing.sm },
  itemField: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 11, color: colors.inkSoft },
  smallInput: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.surface2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.accent, borderRadius: radius, padding: spacing.md },
  addBtnText: { color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  submit: { backgroundColor: colors.accent, borderRadius: radius, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
